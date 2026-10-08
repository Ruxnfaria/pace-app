import 'server-only';

import { createClient } from '@supabase/supabase-js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StreakActivityResult = {
  user_id: string;
  current_streak: number;
  effective_streak: number;
  longest_streak: number;
  last_active_date: string;
};

export async function recordStreakActivity(
  userIdInput: string
): Promise<StreakActivityResult> {
  const userId = userIdInput.trim();

  if (!UUID_PATTERN.test(userId)) {
    throw new Error('userId must be a valid UUID');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase server credentials are not configured');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.rpc(
    'record_user_streak_activity',
    { p_user_id: userId }
  );

  if (error) {
    throw error;
  }

  const streak = data?.[0] as StreakActivityResult | undefined;

  if (!streak) {
    throw new Error('Streak activity was recorded without a returned state');
  }

  return streak;
}
