import type { OnboardingV22FormState, OnboardingV22StepId } from './onboarding-v22-types.ts';

export interface OnboardingV22StepDefinition {
  id: OnboardingV22StepId;
  section: 'intro' | 'you' | 'training' | 'routine' | 'nutrition' | 'review';
  visible?: (form: OnboardingV22FormState) => boolean;
}

export const ONBOARDING_V22_STEPS: readonly OnboardingV22StepDefinition[] = [
  { id: 'welcome', section: 'intro' },
  { id: 'personal', section: 'you' },
  { id: 'goal', section: 'you' },
  { id: 'experience', section: 'training' },
  { id: 'location', section: 'training' },
  { id: 'frequency', section: 'training' },
  { id: 'preferred-days', section: 'training' },
  { id: 'duration', section: 'training' },
  { id: 'activities', section: 'routine' },
  { id: 'cardio', section: 'routine' },
  { id: 'eating-routine', section: 'nutrition' },
  { id: 'meal-moments', section: 'nutrition' },
  { id: 'food-preparation', section: 'nutrition' },
  { id: 'restrictions', section: 'nutrition' },
  { id: 'disliked-foods', section: 'nutrition' },
  { id: 'preferred-foods', section: 'nutrition' },
  { id: 'supplements', section: 'nutrition' },
  { id: 'review', section: 'review' },
] as const;

export function getVisibleOnboardingV22Steps(form: OnboardingV22FormState) {
  return ONBOARDING_V22_STEPS.filter((step) => step.visible?.(form) ?? true);
}

export function getAdjacentOnboardingV22Step(
  form: OnboardingV22FormState,
  current: OnboardingV22StepId,
  direction: 1 | -1,
) {
  const steps = getVisibleOnboardingV22Steps(form);
  const index = steps.findIndex(({ id }) => id === current);
  return steps[index + direction];
}

export function getOnboardingV22Progress(form: OnboardingV22FormState, current: OnboardingV22StepId) {
  const steps = getVisibleOnboardingV22Steps(form);
  const index = Math.max(0, steps.findIndex(({ id }) => id === current));
  return { current: index + 1, total: steps.length, ratio: (index + 1) / steps.length };
}
