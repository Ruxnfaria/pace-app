import 'server-only';

import { createClient } from '@supabase/supabase-js';
import {
  getBrazilMonthRangeFromDate,
  getBrazilWeekRangeFromDate,
} from '@/lib/dates/brazilDate';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

type GrantChestInput = {
  userId: string;
  chestSlug: string;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
};

const LOGICAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type GrantedChest = {
  id: string;
  user_id: string;
  chest_definition_id: string;
  status: 'granted' | 'opened';
  source_type: string;
  source_id: string | null;
  idempotency_key: string;
  granted_at: string;
  opened_at: string | null;
  metadata: Record<string, unknown>;
};

function requireValue(value: string, field: string, maximumLength: number) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${field} is required`);
  }

  if (normalized.length > maximumLength) {
    throw new Error(`${field} is too long`);
  }

  return normalized;
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase server credentials are not configured');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function findExistingGrant(
  supabase: ReturnType<typeof createAdminClient>,
  input: GrantChestInput,
  chestDefinitionId?: string
) {
  const byIdempotency = await supabase
    .from('user_chests')
    .select('*')
    .eq('user_id', input.userId)
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();

  if (byIdempotency.error) {
    throw byIdempotency.error;
  }

  if (byIdempotency.data) {
    return byIdempotency.data as GrantedChest;
  }

  if (!chestDefinitionId) {
    return null;
  }

  const bySource = await supabase
    .from('user_chests')
    .select('*')
    .eq('user_id', input.userId)
    .eq('chest_definition_id', chestDefinitionId)
    .eq('source_type', input.sourceType)
    .eq('source_id', input.sourceId)
    .maybeSingle();

  if (bySource.error) {
    throw bySource.error;
  }

  return (bySource.data as GrantedChest | null) ?? null;
}

export async function grantChest(input: GrantChestInput): Promise<GrantedChest> {
  const userId = requireValue(input.userId, 'userId', 36);
  const chestSlug = requireValue(input.chestSlug, 'chestSlug', 100);
  const sourceType = requireValue(input.sourceType, 'sourceType', 100);
  const sourceId = requireValue(input.sourceId, 'sourceId', 255);
  const idempotencyKey = requireValue(
    input.idempotencyKey,
    'idempotencyKey',
    255
  );

  if (!UUID_PATTERN.test(userId)) {
    throw new Error('userId must be a valid UUID');
  }

  if (!SLUG_PATTERN.test(chestSlug)) {
    throw new Error('chestSlug is invalid');
  }

  const normalizedInput = {
    userId,
    chestSlug,
    sourceType,
    sourceId,
    idempotencyKey,
  };
  const supabase = createAdminClient();
  const existingGrant = await findExistingGrant(supabase, normalizedInput);

  if (existingGrant) {
    return existingGrant;
  }

  const { data: chestDefinition, error: definitionError } = await supabase
    .from('chest_definitions')
    .select('id')
    .eq('slug', chestSlug)
    .eq('active', true)
    .maybeSingle();

  if (definitionError) {
    throw definitionError;
  }

  if (!chestDefinition) {
    throw new Error('Active chest definition not found');
  }

  const { data: grantedChest, error: grantError } = await supabase
    .from('user_chests')
    .insert({
      user_id: userId,
      chest_definition_id: chestDefinition.id,
      status: 'granted',
      source_type: sourceType,
      source_id: sourceId,
      idempotency_key: idempotencyKey,
    })
    .select('*')
    .single();

  if (!grantError && grantedChest) {
    return grantedChest as GrantedChest;
  }

  if (grantError?.code === '23505') {
    const concurrentGrant = await findExistingGrant(
      supabase,
      normalizedInput,
      chestDefinition.id
    );

    if (concurrentGrant) {
      return concurrentGrant;
    }
  }

  throw grantError ?? new Error('Unable to grant chest');
}

export type DailyMissionChestSyncResult = {
  completedMissions: number;
  commonChest: GrantedChest | null;
  rareChest: GrantedChest | null;
};

export async function syncDailyMissionChests(
  userIdInput: string,
  logicalDateInput: string
): Promise<DailyMissionChestSyncResult> {
  const userId = requireValue(userIdInput, 'userId', 36);
  const logicalDate = requireValue(logicalDateInput, 'logicalDate', 10);

  if (!UUID_PATTERN.test(userId)) {
    throw new Error('userId must be a valid UUID');
  }

  if (!LOGICAL_DATE_PATTERN.test(logicalDate)) {
    throw new Error('logicalDate must use YYYY-MM-DD');
  }

  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from('daily_missions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('for_date', logicalDate)
    .eq('completed', true);

  if (error) {
    throw error;
  }

  const completedMissions = count ?? 0;
  let commonChest: GrantedChest | null = null;
  let rareChest: GrantedChest | null = null;

  if (completedMissions >= 2) {
    commonChest = await grantChest({
      userId,
      chestSlug: 'common_chest',
      sourceType: 'daily_mission_milestone',
      sourceId: `daily-common:${logicalDate}`,
      idempotencyKey: `daily-common:${userId}:${logicalDate}`,
    });
  }

  if (completedMissions >= 3) {
    rareChest = await grantChest({
      userId,
      chestSlug: 'rare_chest',
      sourceType: 'daily_mission_milestone',
      sourceId: `daily-rare:${logicalDate}`,
      idempotencyKey: `daily-rare:${userId}:${logicalDate}`,
    });
  }

  return {
    completedMissions,
    commonChest,
    rareChest,
  };
}

export type WeeklyMissionChestSyncResult = {
  completedMissions: number;
  progress: number;
  weekStart: string;
  weekEnd: string;
  rareChest: GrantedChest | null;
};

export async function syncWeeklyMissionChest(
  userIdInput: string,
  logicalDateInput: string
): Promise<WeeklyMissionChestSyncResult> {
  const userId = requireValue(userIdInput, 'userId', 36);
  const logicalDate = requireValue(logicalDateInput, 'logicalDate', 10);

  if (!UUID_PATTERN.test(userId)) {
    throw new Error('userId must be a valid UUID');
  }

  if (!LOGICAL_DATE_PATTERN.test(logicalDate)) {
    throw new Error('logicalDate must use YYYY-MM-DD');
  }

  const week = getBrazilWeekRangeFromDate(logicalDate);
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from('daily_missions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('completed', true)
    .gte('for_date', week.startDate)
    .lte('for_date', week.endDate);

  if (error) {
    throw error;
  }

  const completedMissions = count ?? 0;
  const rareChest = completedMissions >= 15
    ? await grantChest({
        userId,
        chestSlug: 'rare_chest',
        sourceType: 'weekly_mission',
        sourceId: `weekly:${week.weekId}`,
        idempotencyKey: `weekly-rare:${userId}:${week.weekId}`,
      })
    : null;

  return {
    completedMissions,
    progress: Math.min(completedMissions, 15),
    weekStart: week.startDate,
    weekEnd: week.endDate,
    rareChest,
  };
}

export type MonthlyMissionChestSyncResult = {
  activeDays: number;
  progress: number;
  monthStart: string;
  monthEnd: string;
  epicChest: GrantedChest | null;
};

export async function syncMonthlyMissionChest(
  userIdInput: string,
  logicalDateInput: string
): Promise<MonthlyMissionChestSyncResult> {
  const userId = requireValue(userIdInput, 'userId', 36);
  const logicalDate = requireValue(logicalDateInput, 'logicalDate', 10);

  if (!UUID_PATTERN.test(userId)) {
    throw new Error('userId must be a valid UUID');
  }

  if (!LOGICAL_DATE_PATTERN.test(logicalDate)) {
    throw new Error('logicalDate must use YYYY-MM-DD');
  }

  const month = getBrazilMonthRangeFromDate(logicalDate);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('daily_missions')
    .select('for_date')
    .eq('user_id', userId)
    .eq('completed', true)
    .gte('for_date', month.startDate)
    .lte('for_date', logicalDate);

  if (error) {
    throw error;
  }

  const activeDays = new Set(
    (data ?? []).map((mission) => mission.for_date)
  ).size;
  const progress = Math.min(activeDays, 20);
  const epicChest = activeDays >= 20
    ? await grantChest({
        userId,
        chestSlug: 'epic_chest',
        sourceType: 'monthly_mission',
        sourceId: `monthly:${month.monthId}`,
        idempotencyKey: `monthly-epic:${userId}:${month.monthId}`,
      })
    : null;

  return {
    activeDays,
    progress,
    monthStart: month.startDate,
    monthEnd: month.endDate,
    epicChest,
  };
}
