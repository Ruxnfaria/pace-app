import { ONBOARDING_V2_STEPS } from './onboarding-v2-steps.ts';
import type { OnboardingV2State } from './onboarding-v2-types.ts';

export const ONBOARDING_V2_DRAFT_VERSION = 5;

export interface OnboardingV2DraftEnvelope {
  version: typeof ONBOARDING_V2_DRAFT_VERSION;
  state: OnboardingV2State;
  scopeComplete?: boolean;
}

interface LegacyDraftEnvelope {
  version: 2 | 3 | 4;
  state: OnboardingV2State;
  scopeComplete?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasSafeDraftShape(value: unknown): value is OnboardingV2State {
  if (!isRecord(value) || typeof value.currentStepId !== 'string' || !isRecord(value.form)) {
    return false;
  }

  const { form } = value;
  if (!isRecord(form.health) || !isRecord(form.training) || !isRecord(form.nutrition)) {
    return false;
  }

  const nutritionListsAreSafe = [
    form.nutrition.restrictions,
    form.nutrition.dislikedFoods,
    form.nutrition.preferredFoods,
    form.nutrition.supplements,
  ].every((items) => Array.isArray(items) && items.every(isRecord));

  return (
    Array.isArray(form.training.priorityMuscles) &&
    Array.isArray(form.training.availableWeekdays) &&
    Array.isArray(form.training.availableEquipment) &&
    Array.isArray(form.training.painAreas) &&
    nutritionListsAreSafe
  );
}

export function parseOnboardingV2Draft(serialized: string): OnboardingV2State | null {
  return parseOnboardingV2DraftEnvelope(serialized)?.state ?? null;
}

export function parseOnboardingV2DraftEnvelope(
  serialized: string,
): OnboardingV2DraftEnvelope | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (
      !isRecord(value) ||
      (value.version !== ONBOARDING_V2_DRAFT_VERSION &&
        value.version !== 4 &&
        value.version !== 3 &&
        value.version !== 2) ||
      !hasSafeDraftShape(value.state)
    ) {
      return null;
    }

    const legacy = value as unknown as LegacyDraftEnvelope;
    const migratedState = value.version === 2
      ? {
          ...legacy.state,
          form: {
            ...legacy.state.form,
            health: { ...legacy.state.form.health, activityLevel: undefined },
            nutrition: { ...legacy.state.form.nutrition, preferredMealsPerDay: null },
          },
        }
      : legacy.state;
    const mergedStep: Record<string, OnboardingV2State['currentStepId']> = {
      'training-break': 'training-experience',
      'exercise-confidence': 'training-experience',
      'training-weekdays': 'training-frequency',
      'session-duration': 'training-frequency',
      equipment: 'training-location',
      'pain-areas': 'pain',
      'meal-training-routine': 'meal-schedule-flexibility',
      'preferred-meals-per-day': 'meal-schedule-flexibility',
      'preparation-style': 'meal-schedule-flexibility',
      'budget-style': 'meal-schedule-flexibility',
    };
    const currentStepId = ONBOARDING_V2_STEPS.some(({ id }) => id === migratedState.currentStepId)
      ? migratedState.currentStepId
      : mergedStep[migratedState.currentStepId] ?? 'goal';

    const savedRoutine: Record<string, unknown> = isRecord(migratedState.form.routine)
      ? migratedState.form.routine
      : {};

    return {
      version: ONBOARDING_V2_DRAFT_VERSION,
      state: {
        ...migratedState,
        currentStepId,
        form: {
          ...migratedState.form,
          nutrition: {
            ...migratedState.form.nutrition,
            preferredMealsPerDay: migratedState.form.nutrition.preferredMealsPerDay ?? null,
          },
          routine: {
            wakeTime: typeof savedRoutine.wakeTime === 'string' ? savedRoutine.wakeTime : undefined,
            sleepTime: typeof savedRoutine.sleepTime === 'string' ? savedRoutine.sleepTime : undefined,
            routinePredictability:
              savedRoutine.routinePredictability === 'predictable' ||
              savedRoutine.routinePredictability === 'variable'
                ? savedRoutine.routinePredictability
                : undefined,
            mealBreakAvailability:
              savedRoutine.mealBreakAvailability === 'flexible' ||
              savedRoutine.mealBreakAvailability === 'limited' ||
              savedRoutine.mealBreakAvailability === 'difficult'
                ? savedRoutine.mealBreakAvailability
                : undefined,
            preferredTrainingPeriod:
              savedRoutine.preferredTrainingPeriod === 'morning' ||
              savedRoutine.preferredTrainingPeriod === 'afternoon' ||
              savedRoutine.preferredTrainingPeriod === 'evening' ||
              savedRoutine.preferredTrainingPeriod === 'variable'
                ? savedRoutine.preferredTrainingPeriod
                : undefined,
          },
        },
      },
      scopeComplete: value.scopeComplete === true,
    };
  } catch {
    return null;
  }
}
