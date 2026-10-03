import { getAdjacentOnboardingV22Step, ONBOARDING_V22_STEPS } from './onboarding-v22-steps.ts';
import type {
  OnboardingV22ActivityForm, OnboardingV22FormState, OnboardingV22State,
  OnboardingV22StepId, V22ActivityCode,
} from './onboarding-v22-types.ts';

export function createInitialOnboardingV22Form(initialName = ''): OnboardingV22FormState {
  return {
    identity: { name: initialName },
    health: { birthDate: undefined, biologicalSex: undefined, heightCm: undefined, weightKg: undefined, primaryGoal: undefined },
    training: {
      initialTrainingLevel: undefined, trainingDaysPerWeek: undefined, preferredWeekdays: [],
      sessionDurationRange: undefined, trainingLocation: undefined, otherLocationLabel: null,
      availableEquipment: [], otherEquipmentLabel: null, activities: [],
      aerobicPracticeFrequency: undefined, aerobicSafetyLimitation: undefined,
    },
    nutrition: {
      currentEatingRoutine: undefined, availableMealMoments: [], foodPreparationAvailability: undefined,
      dietaryPattern: undefined, dietaryPatternOtherLabel: null, restrictions: [], dislikedFoods: [],
      preferredFoods: [], supplements: [],
    },
  };
}

export function createInitialOnboardingV22State(initialName = ''): OnboardingV22State {
  return { currentStepId: ONBOARDING_V22_STEPS[0].id, form: createInitialOnboardingV22Form(initialName) };
}

export type OnboardingV22Action =
  | { type: 'patch-form'; section: keyof OnboardingV22FormState; changes: Record<string, unknown> }
  | { type: 'set-activities'; activities: OnboardingV22ActivityForm[] }
  | { type: 'toggle-activity'; activityCode: V22ActivityCode }
  | { type: 'go-to'; stepId: OnboardingV22StepId }
  | { type: 'move'; direction: 1 | -1 }
  | { type: 'hydrate'; state: OnboardingV22State }
  | { type: 'reset'; initialName?: string };

export function normalizeOnboardingV22State(state: OnboardingV22State): OnboardingV22State {
  const form = structuredClone(state.form);
  const training = form.training;
  if (training.trainingLocation !== 'other') training.otherLocationLabel = null;
  if (training.trainingLocation === 'full_gym') {
    training.availableEquipment = [];
    training.otherEquipmentLabel = null;
  } else if (!training.availableEquipment.includes('other')) training.otherEquipmentLabel = null;
  form.training.activities = training.activities.map((activity) => ({
    ...activity,
    otherActivityLabel: activity.activityCode === 'other' ? activity.otherActivityLabel : null,
  }));
  if (form.nutrition.dietaryPattern !== 'other') form.nutrition.dietaryPatternOtherLabel = null;
  return { ...state, form };
}

export function onboardingV22Reducer(state: OnboardingV22State, action: OnboardingV22Action): OnboardingV22State {
  switch (action.type) {
    case 'patch-form':
      return normalizeOnboardingV22State({
        ...state,
        form: { ...state.form, [action.section]: { ...state.form[action.section], ...action.changes } },
      });
    case 'set-activities':
      return normalizeOnboardingV22State({ ...state, form: { ...state.form, training: { ...state.form.training, activities: action.activities } } });
    case 'toggle-activity': {
      const current = state.form.training.activities;
      const exists = current.some(({ activityCode }) => activityCode === action.activityCode);
      const activities = exists ? current.filter(({ activityCode }) => activityCode !== action.activityCode) : [
        ...current,
        { activityCode: action.activityCode, otherActivityLabel: null, weekdays: null, sessionsPerWeek: null, durationRange: null, intensity: null },
      ];
      return onboardingV22Reducer(state, { type: 'set-activities', activities });
    }
    case 'go-to': return { ...state, currentStepId: action.stepId };
    case 'move': return { ...state, currentStepId: getAdjacentOnboardingV22Step(state.form, state.currentStepId, action.direction)?.id ?? state.currentStepId };
    case 'hydrate': return normalizeOnboardingV22State(action.state);
    case 'reset': return createInitialOnboardingV22State(action.initialName);
  }
}
