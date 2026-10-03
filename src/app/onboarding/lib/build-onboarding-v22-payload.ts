import { buildOnboardingV22Payload as enforceOnboardingV22Contract, type CompleteOnboardingV22Payload } from './onboarding-v22-contract.ts';
import type { OnboardingV22FormState } from './onboarding-v22-types.ts';
import { validateOnboardingV22, type OnboardingV22ValidationIssue, type OnboardingV22ValidationOptions } from './onboarding-v22-validation.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class OnboardingV22PayloadBuildError extends Error {
  readonly issues: OnboardingV22ValidationIssue[];
  constructor(issues: OnboardingV22ValidationIssue[]) {
    super('O estado do Onboarding V2.2 não pode ser serializado.');
    this.name = 'OnboardingV22PayloadBuildError';
    this.issues = issues;
  }
}
function required<T>(value: T | undefined): T { if (value === undefined) throw new Error('Invariant after V2.2 validation.'); return value; }

export function buildOnboardingV22PayloadFromState(
  form: OnboardingV22FormState,
  idempotencyKey: string,
  options: OnboardingV22ValidationOptions = {},
): CompleteOnboardingV22Payload {
  const validation = validateOnboardingV22(form, options);
  if (!validation.valid) throw new OnboardingV22PayloadBuildError(validation.issues);
  if (!UUID.test(idempotencyKey)) throw new OnboardingV22PayloadBuildError([{ stepId: 'review', field: 'idempotencyKey', message: 'A tentativa precisa de uma chave válida.' }]);
  const raw: CompleteOnboardingV22Payload = {
    payload_schema_version: 3,
    idempotency_key: idempotencyKey,
    identity: { name: form.identity.name },
    health: {
      birth_date: required(form.health.birthDate), biological_sex: required(form.health.biologicalSex),
      height_cm: required(form.health.heightCm), weight_kg: required(form.health.weightKg),
      primary_goal: required(form.health.primaryGoal),
    },
    training: {
      initial_training_level: required(form.training.initialTrainingLevel),
      training_days_per_week: required(form.training.trainingDaysPerWeek),
      preferred_weekdays: [...form.training.preferredWeekdays],
      session_duration_range: required(form.training.sessionDurationRange),
      training_location: required(form.training.trainingLocation),
      other_location_label: form.training.trainingLocation === 'other' ? form.training.otherLocationLabel : null,
      available_equipment: form.training.trainingLocation === 'full_gym' ? [] : [...form.training.availableEquipment],
      other_equipment_label: form.training.availableEquipment.includes('other') ? form.training.otherEquipmentLabel : null,
      aerobic_practice_frequency: required(form.training.aerobicPracticeFrequency),
      aerobic_safety_limitation: required(form.training.aerobicSafetyLimitation),
      activities: form.training.activities.map((activity) => ({
        activity_code: activity.activityCode,
        other_activity_label: activity.activityCode === 'other' ? activity.otherActivityLabel : null,
        weekdays: activity.weekdays === null ? null : [...activity.weekdays],
        sessions_per_week: activity.sessionsPerWeek,
        duration_range: activity.durationRange,
        intensity: activity.intensity,
      })),
    },
    nutrition: {
      available_meal_moments: [...form.nutrition.availableMealMoments],
      food_preparation_availability: required(form.nutrition.foodPreparationAvailability),
      current_eating_routine: required(form.nutrition.currentEatingRoutine),
      dietary_pattern: required(form.nutrition.dietaryPattern),
      dietary_pattern_other_label: form.nutrition.dietaryPattern === 'other' ? form.nutrition.dietaryPatternOtherLabel : null,
      restrictions: form.nutrition.restrictions.map((item) => ({ ...item })),
      disliked_foods: form.nutrition.dislikedFoods.map((declared_label) => ({ declared_label })),
      preferred_foods: form.nutrition.preferredFoods.map((declared_label) => ({ declared_label })),
      supplements: form.nutrition.supplements.map((item) => ({ ...item })),
    },
  };
  return enforceOnboardingV22Contract(raw, options.today);
}
