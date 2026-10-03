import {
  ONBOARDING_V2_STEPS,
  getNextOnboardingV2Step,
  getPreviousOnboardingV2Step,
} from './onboarding-v2-steps';
import type {
  OnboardingV2DeclaredFoodForm,
  OnboardingV2FormState,
  OnboardingV2HealthForm,
  OnboardingV2NutritionForm,
  OnboardingV2RestrictionForm,
  OnboardingV2State,
  OnboardingV2StepId,
  OnboardingV2SupplementForm,
  OnboardingV2TrainingForm,
} from './onboarding-v2-types';
import { PRIMARY_GOALS } from './onboarding-v2-types';

export function createInitialOnboardingV2Form(): OnboardingV2FormState {
  return {
    health: {
      primaryGoal: undefined,
      birthDate: undefined,
      biologicalSex: undefined,
      heightCm: undefined,
      weightKg: undefined,
      targetWeightKg: undefined,
    },
    training: {
      trainingExperience: undefined,
      recentTrainingBreak: undefined,
      exerciseConfidence: undefined,
      priorityMuscles: [],
      trainingDaysPerWeek: undefined,
      availableWeekdays: [],
      sessionDurationMin: undefined,
      trainingLocation: undefined,
      otherLocationLabel: null,
      availableEquipment: [],
      otherEquipmentLabel: null,
      hasPainOrLimitation: undefined,
      painAreas: [],
    },
    nutrition: {
      mealScheduleFlexibility: undefined,
      preparationStyle: undefined,
      budgetStyle: undefined,
      dietaryPattern: undefined,
      dietaryPatternOtherLabel: null,
      hasDietaryRestrictions: undefined,
      restrictions: [],
      dislikedFoods: [],
      preferredFoods: [],
      usesSupplements: undefined,
      supplements: [],
    },
  };
}

export function createInitialOnboardingV2State(): OnboardingV2State {
  return { currentStepId: ONBOARDING_V2_STEPS[0].id, form: createInitialOnboardingV2Form() };
}

export const initialOnboardingV2State = createInitialOnboardingV2State();

export type OnboardingV2Action =
  | { type: 'update-health'; changes: Partial<OnboardingV2HealthForm> }
  | { type: 'update-training'; changes: Partial<OnboardingV2TrainingForm> }
  | { type: 'update-nutrition'; changes: Partial<OnboardingV2NutritionForm> }
  | { type: 'add-restriction'; item: OnboardingV2RestrictionForm }
  | { type: 'remove-restriction'; index: number }
  | { type: 'add-disliked-food'; item: OnboardingV2DeclaredFoodForm }
  | { type: 'remove-disliked-food'; index: number }
  | { type: 'add-preferred-food'; item: OnboardingV2DeclaredFoodForm }
  | { type: 'remove-preferred-food'; index: number }
  | { type: 'add-supplement'; item: OnboardingV2SupplementForm }
  | { type: 'remove-supplement'; index: number }
  | { type: 'go-to-step'; stepId: OnboardingV2StepId }
  | { type: 'next-step' }
  | { type: 'previous-step' }
  | { type: 'hydrate'; state: OnboardingV2State }
  | { type: 'reset' };

function normalizeTraining(training: OnboardingV2TrainingForm): OnboardingV2TrainingForm {
  const experience = training.trainingExperience;
  const recentTrainingBreak =
    experience === 'none'
      ? null
      : training.recentTrainingBreak === null
        ? undefined
        : training.recentTrainingBreak;

  return {
    ...training,
    priorityMuscles: [],
    recentTrainingBreak,
    otherLocationLabel:
      training.trainingLocation === 'other' ? training.otherLocationLabel : null,
    availableEquipment:
      training.trainingLocation === 'full_gym' ? [] : training.availableEquipment,
    otherEquipmentLabel:
      training.trainingLocation !== 'full_gym' && training.availableEquipment.includes('other')
        ? training.otherEquipmentLabel
        : null,
    painAreas: training.hasPainOrLimitation === false ? [] : training.painAreas,
  };
}

function normalizeNutrition(nutrition: OnboardingV2NutritionForm): OnboardingV2NutritionForm {
  return {
    ...nutrition,
    dietaryPatternOtherLabel:
      nutrition.dietaryPattern === 'other' ? nutrition.dietaryPatternOtherLabel : null,
    restrictions: nutrition.hasDietaryRestrictions === false ? [] : nutrition.restrictions,
    supplements: nutrition.usesSupplements === false ? [] : nutrition.supplements,
  };
}

function normalizeState(state: OnboardingV2State): OnboardingV2State {
  const primaryGoal = PRIMARY_GOALS.find((goal) => goal === state.form.health.primaryGoal);

  return {
    ...state,
    currentStepId: primaryGoal ? state.currentStepId : 'goal',
    form: {
      ...state.form,
      health: {
        ...state.form.health,
        primaryGoal,
      },
      training: normalizeTraining(state.form.training),
      nutrition: normalizeNutrition(state.form.nutrition),
    },
  };
}

function removeAt<T>(items: T[], index: number): T[] {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

function withNutrition(
  state: OnboardingV2State,
  nutrition: OnboardingV2NutritionForm,
): OnboardingV2State {
  return { ...state, form: { ...state.form, nutrition: normalizeNutrition(nutrition) } };
}

export function onboardingV2Reducer(
  state: OnboardingV2State,
  action: OnboardingV2Action,
): OnboardingV2State {
  switch (action.type) {
    case 'update-health':
      return {
        ...state,
        form: { ...state.form, health: { ...state.form.health, ...action.changes } },
      };
    case 'update-training':
      return {
        ...state,
        form: {
          ...state.form,
          training: normalizeTraining({ ...state.form.training, ...action.changes }),
        },
      };
    case 'update-nutrition':
      return withNutrition(state, { ...state.form.nutrition, ...action.changes });
    case 'add-restriction':
      return withNutrition(state, {
        ...state.form.nutrition,
        restrictions: [...state.form.nutrition.restrictions, action.item],
      });
    case 'remove-restriction':
      return withNutrition(state, {
        ...state.form.nutrition,
        restrictions: removeAt(state.form.nutrition.restrictions, action.index),
      });
    case 'add-disliked-food':
      return withNutrition(state, {
        ...state.form.nutrition,
        dislikedFoods: [...state.form.nutrition.dislikedFoods, action.item],
      });
    case 'remove-disliked-food':
      return withNutrition(state, {
        ...state.form.nutrition,
        dislikedFoods: removeAt(state.form.nutrition.dislikedFoods, action.index),
      });
    case 'add-preferred-food':
      return withNutrition(state, {
        ...state.form.nutrition,
        preferredFoods: [...state.form.nutrition.preferredFoods, action.item],
      });
    case 'remove-preferred-food':
      return withNutrition(state, {
        ...state.form.nutrition,
        preferredFoods: removeAt(state.form.nutrition.preferredFoods, action.index),
      });
    case 'add-supplement':
      return withNutrition(state, {
        ...state.form.nutrition,
        supplements: [...state.form.nutrition.supplements, action.item],
      });
    case 'remove-supplement':
      return withNutrition(state, {
        ...state.form.nutrition,
        supplements: removeAt(state.form.nutrition.supplements, action.index),
      });
    case 'go-to-step':
      return { ...state, currentStepId: action.stepId };
    case 'next-step': {
      const next = getNextOnboardingV2Step(
        state.form,
        state.currentStepId,
      );
      return next ? { ...state, currentStepId: next.id } : state;
    }
    case 'previous-step': {
      const previous = getPreviousOnboardingV2Step(
        state.form,
        state.currentStepId,
      );
      return previous ? { ...state, currentStepId: previous.id } : state;
    }
    case 'hydrate':
      return normalizeState(action.state);
    case 'reset':
      return createInitialOnboardingV2State();
  }
}
