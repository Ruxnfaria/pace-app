import { ONBOARDING_V22_STEPS } from './onboarding-v22-steps.ts';
import { createInitialOnboardingV22State } from './onboarding-v22-state.ts';
import type { OnboardingV22State } from './onboarding-v22-types.ts';
import { ACTIVITY_INTENSITIES, AEROBIC_PRACTICE_FREQUENCIES, CURRENT_EATING_ROUTINES, DURATION_RANGES, FOOD_PREPARATION_AVAILABILITIES, INITIAL_TRAINING_LEVELS, MEAL_MOMENTS, V22_ACTIVITY_CODES, V22_TRAINING_LOCATIONS } from './onboarding-v22-contract.ts';
import { BIOLOGICAL_SEXES, DIETARY_PATTERNS, EQUIPMENT, PRIMARY_GOALS, RESTRICTION_CODES, RESTRICTION_TYPES, SUPPLEMENT_CODES } from './onboarding-v2-types.ts';

export const ONBOARDING_V22_DRAFT_VERSION = 3 as const;
const PREFIX = 'praxe:onboarding-v22:draft:v3';
interface DraftEnvelope { version: 3; userScope: string; state: OnboardingV22State }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const oneOf = (values: readonly unknown[], value: unknown) => values.includes(value);
const optional = (values: readonly unknown[], value: unknown) => value === undefined || oneOf(values, value);
const nullable = (values: readonly unknown[], value: unknown) => value === null || oneOf(values, value);
const arrayOf = (value: unknown, predicate: (item: unknown) => boolean) => Array.isArray(value) && value.every(predicate);

function isState(value: unknown): value is OnboardingV22State {
  if (!record(value) || typeof value.currentStepId !== 'string' || !ONBOARDING_V22_STEPS.some(({ id }) => id === value.currentStepId) || !record(value.form)) return false;
  const { identity, health, training, nutrition } = value.form;
  if (!record(identity) || typeof identity.name !== 'string' || !record(health) || !record(training) || !record(nutrition)) return false;
  if ((health.birthDate !== undefined && typeof health.birthDate !== 'string') || !optional(BIOLOGICAL_SEXES, health.biologicalSex) ||
      (health.heightCm !== undefined && typeof health.heightCm !== 'number') || (health.weightKg !== undefined && typeof health.weightKg !== 'number') || !optional(PRIMARY_GOALS, health.primaryGoal)) return false;
  if (!optional(INITIAL_TRAINING_LEVELS, training.initialTrainingLevel) || !optional([2, 3, 4, 5, 6], training.trainingDaysPerWeek) ||
      !arrayOf(training.preferredWeekdays, (day) => oneOf([1, 2, 3, 4, 5, 6, 7], day)) || !optional(DURATION_RANGES, training.sessionDurationRange) ||
      !optional(V22_TRAINING_LOCATIONS, training.trainingLocation) || !(training.otherLocationLabel === null || typeof training.otherLocationLabel === 'string') ||
      !arrayOf(training.availableEquipment, (item) => oneOf(EQUIPMENT, item)) || !(training.otherEquipmentLabel === null || typeof training.otherEquipmentLabel === 'string') ||
      !optional(AEROBIC_PRACTICE_FREQUENCIES, training.aerobicPracticeFrequency) || !(training.aerobicSafetyLimitation === undefined || typeof training.aerobicSafetyLimitation === 'boolean') ||
      !arrayOf(training.activities, (item) => record(item) && oneOf(V22_ACTIVITY_CODES, item.activityCode) && (item.otherActivityLabel === null || typeof item.otherActivityLabel === 'string') &&
        (item.weekdays === null || arrayOf(item.weekdays, (day) => oneOf([1, 2, 3, 4, 5, 6, 7], day))) && (item.sessionsPerWeek === null || typeof item.sessionsPerWeek === 'number') &&
        nullable(DURATION_RANGES, item.durationRange) && nullable(ACTIVITY_INTENSITIES, item.intensity))) return false;
  if (!optional(CURRENT_EATING_ROUTINES, nutrition.currentEatingRoutine) || !arrayOf(nutrition.availableMealMoments, (item) => oneOf(MEAL_MOMENTS, item)) ||
      !optional(FOOD_PREPARATION_AVAILABILITIES, nutrition.foodPreparationAvailability) || !optional(DIETARY_PATTERNS, nutrition.dietaryPattern) ||
      !(nutrition.dietaryPatternOtherLabel === null || typeof nutrition.dietaryPatternOtherLabel === 'string') ||
      !arrayOf(nutrition.restrictions, (item) => record(item) && oneOf(RESTRICTION_TYPES, item.restriction_type) && nullable(RESTRICTION_CODES, item.restriction_code) && typeof item.declared_label === 'string') ||
      !Array.isArray(nutrition.dislikedFoods) || !nutrition.dislikedFoods.every((item) => typeof item === 'string') ||
      !Array.isArray(nutrition.preferredFoods) || !nutrition.preferredFoods.every((item) => typeof item === 'string') ||
      !arrayOf(nutrition.supplements, (item) => record(item) && nullable(SUPPLEMENT_CODES, item.supplement_code) && typeof item.declared_label === 'string')) return false;
  return true;
}

export function getOnboardingV22DraftKey(userScope: string) { return `${PREFIX}:${encodeURIComponent(userScope)}`; }
export function serializeOnboardingV22Draft(userScope: string, state: OnboardingV22State) {
  return JSON.stringify({ version: ONBOARDING_V22_DRAFT_VERSION, userScope, state } satisfies DraftEnvelope);
}
export function parseOnboardingV22Draft(serialized: string, expectedUserScope: string): OnboardingV22State | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (!record(value) || value.version !== ONBOARDING_V22_DRAFT_VERSION || value.userScope !== expectedUserScope || !isState(value.state)) return null;
    const base = createInitialOnboardingV22State(value.state.form.identity.name);
    return {
      currentStepId: value.state.currentStepId,
      form: {
        identity: { ...base.form.identity, ...value.state.form.identity },
        health: { ...base.form.health, ...value.state.form.health },
        training: { ...base.form.training, ...value.state.form.training },
        nutrition: { ...base.form.nutrition, ...value.state.form.nutrition },
      },
    };
  } catch { return null; }
}
