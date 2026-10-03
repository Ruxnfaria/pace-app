import type {
  OnboardingV2FormState,
  OnboardingV2Section,
  OnboardingV2StepId,
} from './onboarding-v2-types';

export interface OnboardingV2StepDefinition {
  id: OnboardingV2StepId;
  section: OnboardingV2Section;
  isVisible?: (form: OnboardingV2FormState) => boolean;
}

export type { OnboardingV2StepId } from './onboarding-v2-types';

export const ONBOARDING_V2_STEPS: readonly OnboardingV2StepDefinition[] = [
  { id: 'goal', section: 'health' },
  { id: 'birth-date', section: 'health' },
  { id: 'biological-sex', section: 'health' },
  { id: 'measurements', section: 'health' },
  { id: 'training-experience', section: 'training' },
  {
    id: 'training-break',
    section: 'training',
    isVisible: ({ training }) =>
      training.trainingExperience !== undefined && training.trainingExperience !== 'none',
  },
  { id: 'exercise-confidence', section: 'training' },
  { id: 'training-frequency', section: 'training' },
  { id: 'training-weekdays', section: 'training' },
  { id: 'session-duration', section: 'training' },
  { id: 'training-location', section: 'training' },
  {
    id: 'equipment',
    section: 'training',
    isVisible: ({ training }) =>
      training.trainingLocation !== undefined && training.trainingLocation !== 'full_gym',
  },
  { id: 'pain', section: 'training' },
  {
    id: 'pain-areas',
    section: 'training',
    isVisible: ({ training }) => training.hasPainOrLimitation === true,
  },
  { id: 'meal-schedule-flexibility', section: 'nutrition' },
  { id: 'preparation-style', section: 'nutrition' },
  { id: 'budget-style', section: 'nutrition' },
  { id: 'dietary-pattern', section: 'nutrition' },
  { id: 'restrictions', section: 'nutrition' },
  { id: 'food-preferences', section: 'nutrition' },
  { id: 'supplements', section: 'nutrition' },
  { id: 'review', section: 'review' },
] as const;

export function getVisibleOnboardingV2Steps(
  form: OnboardingV2FormState,
): OnboardingV2StepDefinition[] {
  return ONBOARDING_V2_STEPS.filter((step) => step.isVisible?.(form) ?? true);
}

export function getNextOnboardingV2Step(
  form: OnboardingV2FormState,
  currentStepId: OnboardingV2StepId,
): OnboardingV2StepDefinition | undefined {
  const currentIndex = ONBOARDING_V2_STEPS.findIndex(({ id }) => id === currentStepId);
  return ONBOARDING_V2_STEPS.slice(currentIndex + 1).find(
    (step) => step.isVisible?.(form) ?? true,
  );
}

export function getPreviousOnboardingV2Step(
  form: OnboardingV2FormState,
  currentStepId: OnboardingV2StepId,
): OnboardingV2StepDefinition | undefined {
  const currentIndex = ONBOARDING_V2_STEPS.findIndex(({ id }) => id === currentStepId);
  return ONBOARDING_V2_STEPS.slice(0, currentIndex)
    .reverse()
    .find((step) => step.isVisible?.(form) ?? true);
}

export function getOnboardingV2Progress(
  form: OnboardingV2FormState,
  currentStepId: OnboardingV2StepId,
): { current: number; total: number; ratio: number } {
  const steps = getVisibleOnboardingV2Steps(form);
  const index = steps.findIndex(({ id }) => id === currentStepId);
  const current = index < 0 ? 1 : index + 1;

  return { current, total: steps.length, ratio: current / steps.length };
}
