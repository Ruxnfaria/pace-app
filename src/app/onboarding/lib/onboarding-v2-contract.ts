import {
  MEAL_SCHEDULE_FLEXIBILITIES,
  PRIMARY_GOALS,
  type CompleteOnboardingV2Payload,
  type CompleteOnboardingV2Result,
} from './onboarding-v2-types.ts';

export class OnboardingV2PreflightError extends Error {
  readonly reasons: string[];

  constructor(reasons: string[]) {
    super('O payload do Onboarding V2.1 falhou no preflight local.');
    this.name = 'OnboardingV2PreflightError';
    this.reasons = reasons;
  }
}

export function isCompleteOnboardingV2Result(value: unknown): value is CompleteOnboardingV2Result {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return (
    (result.result === 'completed' || result.result === 'replay') &&
    result.onboarding_version === 2 &&
    typeof result.completed_at === 'string'
  );
}

export function assertOnboardingV2SubmissionPreflight(
  payload: CompleteOnboardingV2Payload,
): void {
  const reasons: string[] = [];
  const nutrition = payload.nutrition as CompleteOnboardingV2Payload['nutrition'] &
    Record<string, unknown>;

  if (payload.payload_schema_version !== 2) reasons.push('payload_schema_version precisa ser 2');
  if (!PRIMARY_GOALS.some((goal) => goal === payload.health.primary_goal)) {
    reasons.push('primary_goal inválido');
  }
  if (payload.training.priority_muscles.length !== 0) reasons.push('priority_muscles precisa ser vazio');
  if (payload.training.activities.length !== 0) reasons.push('activities precisa ser vazio');
  if (!MEAL_SCHEDULE_FLEXIBILITIES.includes(payload.nutrition.meal_schedule_flexibility)) {
    reasons.push('meal_schedule_flexibility ausente ou inválido');
  }
  if ('meals_per_day' in nutrition || 'accepts_eggs' in nutrition || 'accepts_dairy' in nutrition) {
    reasons.push('o payload contém campos removidos');
  }
  if (
    payload.training.training_location === 'full_gym' &&
    (payload.training.available_equipment.length !== 0 ||
      payload.training.other_equipment_label !== null)
  ) {
    reasons.push('full_gym precisa usar equipamentos vazios e label nulo');
  }

  if (reasons.length > 0) throw new OnboardingV2PreflightError(reasons);
}
