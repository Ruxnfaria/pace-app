import {
  ACTIVITY_LEVELS,
  MEAL_BREAK_AVAILABILITIES,
  MEAL_SCHEDULE_FLEXIBILITIES,
  PREFERRED_MEALS_PER_DAY,
  PRIMARY_GOALS,
  PREFERRED_TRAINING_PERIODS,
  REPRODUCTIVE_STATUSES,
  ROUTINE_PREDICTABILITIES,
  type CompleteOnboardingV2Payload,
  type CompleteOnboardingV2Result,
} from './onboarding-v2-types.ts';

export class OnboardingV2PreflightError extends Error {
  readonly reasons: string[];

  constructor(reasons: string[]) {
    super('O payload do Onboarding V2 com Nutrição V1 falhou no preflight local.');
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

  if (payload.payload_schema_version !== 4 && payload.payload_schema_version !== 5) {
    reasons.push('payload_schema_version precisa ser 4 ou 5');
  }
  if (!PRIMARY_GOALS.some((goal) => goal === payload.health.primary_goal)) {
    reasons.push('primary_goal inválido');
  }
  if (!ACTIVITY_LEVELS.includes(payload.health.activity_level)) {
    reasons.push('activity_level ausente ou inválido');
  }
  if (payload.training.priority_muscles.length !== 0) reasons.push('priority_muscles precisa ser vazio');
  if (payload.training.activities.length !== 0) reasons.push('activities precisa ser vazio');
  if (!MEAL_SCHEDULE_FLEXIBILITIES.includes(payload.nutrition.meal_schedule_flexibility)) {
    reasons.push('meal_schedule_flexibility ausente ou inválido');
  }
  if (
    payload.nutrition.preferred_meals_per_day !== undefined &&
    payload.nutrition.preferred_meals_per_day !== null &&
    !PREFERRED_MEALS_PER_DAY.includes(payload.nutrition.preferred_meals_per_day)
  ) {
    reasons.push('preferred_meals_per_day inválido');
  }
  if ('meals_per_day' in nutrition || 'accepts_eggs' in nutrition || 'accepts_dairy' in nutrition) {
    reasons.push('o payload contém campos removidos');
  }
  if (payload.payload_schema_version === 5) {
    const isApplicableReproductiveStatus = (value: unknown) =>
      value !== 'not_applicable' && REPRODUCTIVE_STATUSES.some((status) => status === value);
    if (payload.health.biological_sex === 'female') {
      if (!isApplicableReproductiveStatus(payload.health.pregnancy_status)) {
        reasons.push('pregnancy_status ausente ou inválido');
      }
      if (!isApplicableReproductiveStatus(payload.health.lactation_status)) {
        reasons.push('lactation_status ausente ou inválido');
      }
    } else if (
      payload.health.pregnancy_status !== 'not_applicable' ||
      payload.health.lactation_status !== 'not_applicable'
    ) {
      reasons.push('contexto reprodutivo não aplicável precisa ser explícito');
    }
    const routine = payload.routine;
    const localTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (!routine || !localTimePattern.test(routine.wake_time)) {
      reasons.push('wake_time ausente ou inválido');
    }
    if (!routine || !localTimePattern.test(routine.sleep_time)) {
      reasons.push('sleep_time ausente ou inválido');
    }
    if (routine && routine.wake_time === routine.sleep_time) {
      reasons.push('wake_time e sleep_time precisam ser diferentes');
    }
    if (!routine || !ROUTINE_PREDICTABILITIES.includes(routine.routine_predictability)) {
      reasons.push('routine_predictability ausente ou inválido');
    }
    if (!routine || !MEAL_BREAK_AVAILABILITIES.includes(routine.meal_break_availability)) {
      reasons.push('meal_break_availability ausente ou inválido');
    }
    if (!routine || !PREFERRED_TRAINING_PERIODS.includes(routine.preferred_training_period)) {
      reasons.push('preferred_training_period ausente ou inválido');
    }
  } else if (payload.routine !== undefined) {
    reasons.push('routine pertence ao schema 5');
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
