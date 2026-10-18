import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type {
  CompleteOnboardingV2Payload,
  CompleteOnboardingV2Result,
} from '@/app/onboarding/lib/onboarding-v2-types';
import { isCompleteOnboardingV2Result } from '@/app/onboarding/lib/onboarding-v2-contract';
import { getBrazilDate } from '@/lib/dates/brazilDate';
import { buildAtomicNutritionOnboardingRpcArgs } from './target-writer-contract';

function createNutritionWriterClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase server credentials are not configured.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function completeOnboardingWithNutritionTarget(
  userId: string,
  payload: CompleteOnboardingV2Payload,
  now = new Date(),
): Promise<CompleteOnboardingV2Result> {
  const args = buildAtomicNutritionOnboardingRpcArgs(userId, payload, getBrazilDate(now));
  const writer = createNutritionWriterClient();
  const { data, error } = await writer.rpc(
    'complete_onboarding_v2_with_nutrition_target',
    args,
  );

  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  if (!isCompleteOnboardingV2Result(result)) {
    throw new Error('The atomic onboarding writer returned an unexpected result.');
  }

  return result;
}
