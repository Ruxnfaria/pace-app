import { createClient } from '@/lib/supabase/client';
import { buildOnboardingV22Payload, type CompleteOnboardingV22Payload, type CompleteOnboardingV22Result } from './onboarding-v22-contract';
import { isCompleteOnboardingV22Result } from './onboarding-v22-rpc-result';

export type CompleteOnboardingV22Outcome =
  | { status: 'success'; data: CompleteOnboardingV22Result }
  | { status: 'unauthenticated' }
  | { status: 'backend_error'; message: string; code?: string }
  | { status: 'unexpected_error' };

/** Isolated client for a future activation. It is intentionally not imported by the active onboarding route. */
export async function completeOnboardingV22(payload: CompleteOnboardingV22Payload): Promise<CompleteOnboardingV22Outcome> {
  const safePayload = buildOnboardingV22Payload(payload);
  try {
    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return { status: 'unauthenticated' };
    const { data, error } = await supabase.rpc('complete_onboarding_v22', { p_payload: safePayload });
    if (error) return { status: 'backend_error', message: error.message, code: error.code };
    const result = Array.isArray(data) ? data[0] : data;
    return isCompleteOnboardingV22Result(result) ? { status: 'success', data: result } : { status: 'unexpected_error' };
  } catch { return { status: 'unexpected_error' }; }
}
