import { createClient } from '@/lib/supabase/client';
import type {
  CompleteOnboardingV2Payload,
  CompleteOnboardingV2Result,
} from './onboarding-v2-types';
import {
  assertOnboardingV2SubmissionPreflight,
  isCompleteOnboardingV2Result,
} from './onboarding-v2-contract';

export {
  assertOnboardingV2SubmissionPreflight,
  isCompleteOnboardingV2Result,
  OnboardingV2PreflightError,
} from './onboarding-v2-contract';

export type CompleteOnboardingV2Outcome =
  | { status: 'success'; data: CompleteOnboardingV2Result }
  | { status: 'unauthenticated' }
  | { status: 'backend_error'; message: string; code?: string }
  | { status: 'unexpected_error'; error: unknown };

export async function completeOnboardingV2(
  payload: CompleteOnboardingV2Payload,
): Promise<CompleteOnboardingV2Outcome> {
  assertOnboardingV2SubmissionPreflight(payload);

  try {
    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return { status: 'unauthenticated' };

    const { data, error } = await supabase.rpc('complete_onboarding_v2', {
      p_payload: payload,
    });

    if (error) {
      return {
        status: 'backend_error',
        message: error.message,
        code: error.code,
      };
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!isCompleteOnboardingV2Result(result)) {
      return { status: 'unexpected_error', error: new Error('Resposta inesperada da RPC.') };
    }

    return { status: 'success', data: result };
  } catch (error) {
    return { status: 'unexpected_error', error };
  }
}
