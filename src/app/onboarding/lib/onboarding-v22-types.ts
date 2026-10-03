import type {
  CompleteOnboardingV22Payload,
  OnboardingV22Activity,
} from './onboarding-v22-contract.ts';

type Health = CompleteOnboardingV22Payload['health'];
type Training = CompleteOnboardingV22Payload['training'];
type Nutrition = CompleteOnboardingV22Payload['nutrition'];

export type V22BiologicalSex = Health['biological_sex'];
export type V22PrimaryGoal = Health['primary_goal'];
export type V22TrainingLevel = Training['initial_training_level'];
export type V22TrainingDays = Training['training_days_per_week'];
export type V22Weekday = Training['preferred_weekdays'][number];
export type V22DurationRange = Training['session_duration_range'];
export type V22TrainingLocation = Training['training_location'];
export type V22Equipment = Training['available_equipment'][number];
export type V22AerobicFrequency = Training['aerobic_practice_frequency'];
export type V22ActivityCode = OnboardingV22Activity['activity_code'];
export type V22ActivityIntensity = NonNullable<OnboardingV22Activity['intensity']>;
export type V22MealMoment = Nutrition['available_meal_moments'][number];
export type V22FoodPreparationAvailability = Nutrition['food_preparation_availability'];
export type V22CurrentEatingRoutine = Nutrition['current_eating_routine'];
export type V22DietaryPattern = Nutrition['dietary_pattern'];
export type V22Restriction = Nutrition['restrictions'][number];
export type V22Supplement = Nutrition['supplements'][number];

export interface OnboardingV22ActivityForm {
  activityCode: V22ActivityCode;
  otherActivityLabel: string | null;
  weekdays: V22Weekday[] | null;
  sessionsPerWeek: number | null;
  durationRange: V22DurationRange | null;
  intensity: V22ActivityIntensity | null;
}

export interface OnboardingV22FormState {
  identity: { name: string };
  health: {
    birthDate: string | undefined;
    biologicalSex: V22BiologicalSex | undefined;
    heightCm: number | undefined;
    weightKg: number | undefined;
    primaryGoal: V22PrimaryGoal | undefined;
  };
  training: {
    initialTrainingLevel: V22TrainingLevel | undefined;
    trainingDaysPerWeek: V22TrainingDays | undefined;
    preferredWeekdays: V22Weekday[];
    sessionDurationRange: V22DurationRange | undefined;
    trainingLocation: V22TrainingLocation | undefined;
    otherLocationLabel: string | null;
    availableEquipment: V22Equipment[];
    otherEquipmentLabel: string | null;
    activities: OnboardingV22ActivityForm[];
    aerobicPracticeFrequency: V22AerobicFrequency | undefined;
    aerobicSafetyLimitation: boolean | undefined;
  };
  nutrition: {
    currentEatingRoutine: V22CurrentEatingRoutine | undefined;
    availableMealMoments: V22MealMoment[];
    foodPreparationAvailability: V22FoodPreparationAvailability | undefined;
    dietaryPattern: V22DietaryPattern | undefined;
    dietaryPatternOtherLabel: string | null;
    restrictions: V22Restriction[];
    dislikedFoods: string[];
    preferredFoods: string[];
    supplements: V22Supplement[];
  };
}

export type OnboardingV22StepId =
  | 'welcome' | 'personal' | 'goal' | 'experience' | 'location' | 'frequency'
  | 'preferred-days' | 'duration' | 'activities' | 'cardio' | 'eating-routine'
  | 'meal-moments' | 'food-preparation' | 'restrictions' | 'disliked-foods'
  | 'preferred-foods' | 'supplements' | 'review';

export interface OnboardingV22State {
  currentStepId: OnboardingV22StepId;
  form: OnboardingV22FormState;
}
