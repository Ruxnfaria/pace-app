import type { CompleteOnboardingV22Result } from './onboarding-v22-contract.ts';

export function isCompleteOnboardingV22Result(value: unknown): value is CompleteOnboardingV22Result {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (result.result === 'completed' || result.result === 'replay') && result.onboarding_version === 2 && typeof result.completed_at === 'string';
}
