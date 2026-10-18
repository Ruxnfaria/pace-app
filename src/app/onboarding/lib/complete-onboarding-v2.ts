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
    const response = await fetch('/api/onboarding/complete-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) return { status: 'unauthenticated' };

    const data: unknown = await response.json();
    if (!response.ok) {
      const failure = typeof data === 'object' && data !== null
        ? data as Record<string, unknown>
        : {};
      return {
        status: 'backend_error',
        message: typeof failure.error === 'string'
          ? failure.error
          : 'Não foi possível concluir o onboarding.',
        code: typeof failure.code === 'string' ? failure.code : undefined,
      };
    }

    if (!isCompleteOnboardingV2Result(data)) {
      return { status: 'unexpected_error', error: new Error('Resposta inesperada da RPC.') };
    }

    return { status: 'success', data };
  } catch (error) {
    return { status: 'unexpected_error', error };
  }
}
