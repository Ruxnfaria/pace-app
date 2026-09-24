import type {
  CompleteOnboardingV2Payload,
  OnboardingV2FormState,
} from './onboarding-v2-types';
import {
  validateOnboardingV2,
  type OnboardingV2ValidationIssue,
  type OnboardingV2ValidationOptions,
} from './onboarding-v2-validation';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class OnboardingV2PayloadBuildError extends Error {
  constructor(public readonly issues: OnboardingV2ValidationIssue[]) {
    super('O estado do Onboarding V2 não pode ser serializado.');
    this.name = 'OnboardingV2PayloadBuildError';
  }
}

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new Error(`Invariant violation after validation: ${field} is undefined.`);
  }
  return value;
}

export function buildOnboardingV2Payload(
  form: OnboardingV2FormState,
  idempotencyKey: string,
  validationOptions: OnboardingV2ValidationOptions = {},
): CompleteOnboardingV2Payload {
  const validation = validateOnboardingV2(form, validationOptions);
  if (!validation.valid) throw new OnboardingV2PayloadBuildError(validation.issues);

  if (!UUID_PATTERN.test(idempotencyKey)) {
    throw new OnboardingV2PayloadBuildError([
      {
        stepId: 'review',
        field: 'idempotencyKey',
        message: 'A chave de idempotência deve ser um UUID válido.',
      },
    ]);
  }

  const { health, training, nutrition } = form;
  const primaryGoal = required(health.primaryGoal, 'health.primaryGoal');
  const trainingExperience = required(
    training.trainingExperience,
    'training.trainingExperience',
  );

  return {
    idempotency_key: idempotencyKey,
    payload_schema_version: 2,
    health: {
      birth_date: required(health.birthDate, 'health.birthDate'),
      biological_sex: required(health.biologicalSex, 'health.biologicalSex'),
      height_cm: required(health.heightCm, 'health.heightCm'),
      weight_kg: required(health.weightKg, 'health.weightKg'),
      target_weight_kg: health.targetWeightKg ?? null,
      primary_goal: primaryGoal,
    },
    training: {
      primary_goal: primaryGoal,
      priority_muscles: [],
      training_experience: trainingExperience,
      exercise_confidence: required(training.exerciseConfidence, 'training.exerciseConfidence'),
      recent_training_break:
        trainingExperience === 'none'
          ? null
          : required(training.recentTrainingBreak ?? undefined, 'training.recentTrainingBreak'),
      training_days_per_week: required(
        training.trainingDaysPerWeek,
        'training.trainingDaysPerWeek',
      ),
      available_weekdays: [...training.availableWeekdays],
      session_duration_min: required(
        training.sessionDurationMin,
        'training.sessionDurationMin',
      ),
      session_duration_is_plus: training.sessionDurationMin === 90,
      training_location: required(training.trainingLocation, 'training.trainingLocation'),
      other_location_label:
        training.trainingLocation === 'other'
          ? required(training.otherLocationLabel ?? undefined, 'training.otherLocationLabel').trim()
          : null,
      available_equipment:
        training.trainingLocation === 'full_gym' ? [] : [...training.availableEquipment],
      other_equipment_label:
        training.trainingLocation !== 'full_gym' && training.availableEquipment.includes('other')
        ? required(training.otherEquipmentLabel ?? undefined, 'training.otherEquipmentLabel').trim()
        : null,
      pain_or_limitation: required(
        training.hasPainOrLimitation,
        'training.hasPainOrLimitation',
      ),
      affected_body_areas: training.hasPainOrLimitation ? [...training.painAreas] : [],
      activities: [],
    },
    nutrition: {
      meal_schedule_flexibility: required(
        nutrition.mealScheduleFlexibility,
        'nutrition.mealScheduleFlexibility',
      ),
      food_preparation_style: required(
        nutrition.preparationStyle,
        'nutrition.preparationStyle',
      ),
      food_budget_style: required(nutrition.budgetStyle, 'nutrition.budgetStyle'),
      dietary_pattern: required(nutrition.dietaryPattern, 'nutrition.dietaryPattern'),
      dietary_pattern_other_label:
        nutrition.dietaryPattern === 'other'
          ? required(
              nutrition.dietaryPatternOtherLabel ?? undefined,
              'nutrition.dietaryPatternOtherLabel',
            ).trim()
          : null,
      has_food_restrictions: required(
        nutrition.hasDietaryRestrictions,
        'nutrition.hasDietaryRestrictions',
      ),
      uses_supplements: required(nutrition.usesSupplements, 'nutrition.usesSupplements'),
      restrictions: nutrition.restrictions.map((restriction) => ({
        restriction_type: restriction.restrictionType,
        restriction_code: restriction.restrictionCode,
        declared_label: restriction.declaredLabel.trim(),
      })),
      disliked_foods: nutrition.dislikedFoods.map((food) => ({
        declared_label: food.declaredLabel.trim(),
      })),
      preferred_foods: nutrition.preferredFoods.map((food) => ({
        declared_label: food.declaredLabel.trim(),
      })),
      supplements: nutrition.supplements.map((supplement) => ({
        supplement_code: supplement.supplementCode,
        declared_label: supplement.declaredLabel.trim(),
      })),
    },
  };
}
