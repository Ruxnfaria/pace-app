export const GOALS = [
  'hypertrophy',
  'fat_loss',
  'body_recomposition',
  'strength',
  'conditioning',
  'health',
] as const;

export const ONBOARDING_SCHEMA_VERSION = 5 as const;

// Keep the complete backend contract above, while limiting the initial V2.1
// question to the three product-facing intentions currently offered.
export const PRIMARY_GOALS = ['fat_loss', 'hypertrophy', 'conditioning'] as const;

export const BIOLOGICAL_SEXES = ['male', 'female', 'not_specified'] as const;
export const TRAINING_EXPERIENCES = [
  'none',
  'under_6_months',
  '6_to_12_months',
  '1_to_2_years',
  'over_2_years',
] as const;
export const EXERCISE_CONFIDENCES = [
  'needs_guidance',
  'basic_independent',
  'confident_independent',
] as const;
export const RECENT_TRAINING_BREAKS = [
  'no_significant_break',
  'under_1_month',
  '1_to_3_months',
  'over_3_months',
] as const;
export const MUSCLES = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'core',
] as const;
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const TRAINING_DAYS_PER_WEEK = [2, 3, 4, 5, 6] as const;
export const SESSION_DURATIONS = [30, 45, 60, 75, 90] as const;
export const TRAINING_LOCATIONS = ['full_gym', 'home', 'outdoor', 'other'] as const;
export const EQUIPMENT = [
  'bodyweight',
  'dumbbells',
  'barbell',
  'weight_plates',
  'bench',
  'rack',
  'cable_machine',
  'selectorized_machines',
  'smith_machine',
  'leg_press',
  'resistance_bands',
  'pull_up_bar',
  'kettlebell',
  'other',
] as const;
export const BODY_AREAS = [
  'neck',
  'shoulder',
  'elbow',
  'wrist_hand',
  'upper_back',
  'lower_back',
  'hip',
  'knee',
  'ankle_foot',
  'other',
  'unspecified',
] as const;
export const ACTIVITY_CODES = [
  'running',
  'football',
  'cycling',
  'combat_sports',
  'swimming',
  'other',
] as const;
export const ACTIVITY_SCHEDULE_TYPES = ['fixed_weekdays', 'variable'] as const;
export const MEAL_SCHEDULE_FLEXIBILITIES = ['limited', 'moderate', 'flexible'] as const;
export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'high'] as const;
export const ROUTINE_PREDICTABILITIES = ['predictable', 'variable'] as const;
export const MEAL_BREAK_AVAILABILITIES = ['flexible', 'limited', 'difficult'] as const;
export const PREFERRED_TRAINING_PERIODS = [
  'morning',
  'afternoon',
  'evening',
  'variable',
] as const;
export const PREFERRED_MEALS_PER_DAY = [2, 3, 4, 5, 6] as const;
export const FOOD_PREPARATION_STYLES = [
  'very_quick',
  'cook_some',
  'meal_prep',
  'flexible',
] as const;
export const FOOD_BUDGET_STYLES = ['economic', 'balanced', 'varied'] as const;
export const DIETARY_PATTERNS = [
  'omnivore',
  'vegetarian',
  'vegan',
  'pescatarian',
  'other',
] as const;
export const RESTRICTION_TYPES = [
  'allergy',
  'intolerance',
  'dietary_restriction',
  'other',
] as const;
export const RESTRICTION_CODES = [
  'lactose',
  'gluten',
  'milk',
  'egg',
  'peanut',
  'tree_nuts',
  'soy',
  'fish',
  'shellfish',
] as const;
export const SUPPLEMENT_CODES = [
  'whey_protein',
  'creatine',
  'mass_gainer',
  'protein_powder_other',
  'multivitamin',
] as const;

export type Goal = (typeof GOALS)[number];
export type PrimaryGoal = (typeof PRIMARY_GOALS)[number];
export type BiologicalSex = (typeof BIOLOGICAL_SEXES)[number];
export type TrainingExperience = (typeof TRAINING_EXPERIENCES)[number];
export type ExerciseConfidence = (typeof EXERCISE_CONFIDENCES)[number];
export type RecentTrainingBreak = (typeof RECENT_TRAINING_BREAKS)[number];
export type Muscle = (typeof MUSCLES)[number];
export type Weekday = (typeof WEEKDAYS)[number];
export type TrainingDaysPerWeek = (typeof TRAINING_DAYS_PER_WEEK)[number];
export type SessionDuration = (typeof SESSION_DURATIONS)[number];
export type TrainingLocation = (typeof TRAINING_LOCATIONS)[number];
export type Equipment = (typeof EQUIPMENT)[number];
export type BodyArea = (typeof BODY_AREAS)[number];
export type ActivityCode = (typeof ACTIVITY_CODES)[number];
export type ActivityScheduleType = (typeof ACTIVITY_SCHEDULE_TYPES)[number];
export type MealScheduleFlexibility = (typeof MEAL_SCHEDULE_FLEXIBILITIES)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type RoutinePredictability = (typeof ROUTINE_PREDICTABILITIES)[number];
export type MealBreakAvailability = (typeof MEAL_BREAK_AVAILABILITIES)[number];
export type PreferredTrainingPeriod = (typeof PREFERRED_TRAINING_PERIODS)[number];
export type PreferredMealsPerDay = (typeof PREFERRED_MEALS_PER_DAY)[number];
export type FoodPreparationStyle = (typeof FOOD_PREPARATION_STYLES)[number];
export type FoodBudgetStyle = (typeof FOOD_BUDGET_STYLES)[number];
export type DietaryPattern = (typeof DIETARY_PATTERNS)[number];
export type RestrictionType = (typeof RESTRICTION_TYPES)[number];
export type RestrictionCode = (typeof RESTRICTION_CODES)[number];
export type SupplementCode = (typeof SUPPLEMENT_CODES)[number];

// Form state deliberately keeps unanswered values distinct from valid answers.
export interface OnboardingV2ActivityForm {
  activityCode: ActivityCode;
  otherActivityLabel: string | null;
  scheduleType: ActivityScheduleType | undefined;
  availableWeekdays: Weekday[];
  sessionsPerWeek: number | undefined;
}

export interface OnboardingV2RestrictionForm {
  restrictionType: RestrictionType;
  restrictionCode: RestrictionCode | null;
  declaredLabel: string;
}

export interface OnboardingV2DeclaredFoodForm {
  declaredLabel: string;
}

export interface OnboardingV2SupplementForm {
  supplementCode: SupplementCode | null;
  declaredLabel: string;
}

export interface OnboardingV2HealthForm {
  primaryGoal: Goal | undefined;
  birthDate: string | undefined;
  biologicalSex: BiologicalSex | undefined;
  heightCm: number | undefined;
  weightKg: number | undefined;
  targetWeightKg: number | null | undefined;
  activityLevel: ActivityLevel | undefined;
}

export interface OnboardingV2TrainingForm {
  trainingExperience: TrainingExperience | undefined;
  recentTrainingBreak: RecentTrainingBreak | null | undefined;
  exerciseConfidence: ExerciseConfidence | undefined;
  priorityMuscles: Muscle[];
  trainingDaysPerWeek: TrainingDaysPerWeek | undefined;
  availableWeekdays: Weekday[];
  sessionDurationMin: SessionDuration | undefined;
  trainingLocation: TrainingLocation | undefined;
  otherLocationLabel: string | null;
  availableEquipment: Equipment[];
  otherEquipmentLabel: string | null;
  hasPainOrLimitation: boolean | undefined;
  painAreas: BodyArea[];
}

export interface OnboardingV2NutritionForm {
  mealScheduleFlexibility: MealScheduleFlexibility | undefined;
  preferredMealsPerDay: PreferredMealsPerDay | null | undefined;
  preparationStyle: FoodPreparationStyle | undefined;
  budgetStyle: FoodBudgetStyle | undefined;
  dietaryPattern: DietaryPattern | undefined;
  dietaryPatternOtherLabel: string | null;
  hasDietaryRestrictions: boolean | undefined;
  restrictions: OnboardingV2RestrictionForm[];
  dislikedFoods: OnboardingV2DeclaredFoodForm[];
  preferredFoods: OnboardingV2DeclaredFoodForm[];
  usesSupplements: boolean | undefined;
  supplements: OnboardingV2SupplementForm[];
}

// Daily-routine context informs a future meal-plan recommendation. These are
// declared constraints, never nutrition recommendations or meal-count targets.
export interface OnboardingV2RoutineForm {
  wakeTime: string | undefined;
  sleepTime: string | undefined;
  routinePredictability: RoutinePredictability | undefined;
  mealBreakAvailability: MealBreakAvailability | undefined;
  preferredTrainingPeriod: PreferredTrainingPeriod | undefined;
}

export interface OnboardingV2FormState {
  health: OnboardingV2HealthForm;
  training: OnboardingV2TrainingForm;
  nutrition: OnboardingV2NutritionForm;
  routine: OnboardingV2RoutineForm;
}

export type OnboardingV2Section = 'health' | 'training' | 'nutrition' | 'review';

export type OnboardingV2StepId =
  | 'goal'
  | 'birth-date'
  | 'biological-sex'
  | 'measurements'
  | 'activity-level'
  | 'daily-routine'
  | 'training-experience'
  | 'training-frequency'
  | 'training-location'
  | 'pain'
  | 'meal-schedule-flexibility'
  | 'dietary-pattern'
  | 'restrictions'
  | 'food-preferences'
  | 'supplements'
  | 'review';

export interface OnboardingV2State {
  currentStepId: OnboardingV2StepId;
  form: OnboardingV2FormState;
}

// RPC payload types mirror complete_onboarding_v2(jsonb) exactly.
export interface OnboardingV2ActivityPayload {
  activity_code: ActivityCode;
  other_activity_label: string | null;
  schedule_type: ActivityScheduleType;
  available_weekdays: Weekday[] | null;
  sessions_per_week: number | null;
}

export interface OnboardingV2RestrictionPayload {
  restriction_type: RestrictionType;
  restriction_code: RestrictionCode | null;
  declared_label: string;
}

export interface OnboardingV2DeclaredFoodPayload {
  declared_label: string;
}

export interface OnboardingV2SupplementPayload {
  supplement_code: SupplementCode | null;
  declared_label: string;
}

export interface CompleteOnboardingV2Payload {
  idempotency_key: string;
  payload_schema_version: 4 | 5;
  health: {
    birth_date: string;
    biological_sex: BiologicalSex;
    height_cm: number;
    weight_kg: number;
    target_weight_kg: number | null;
    primary_goal: Goal;
    activity_level: ActivityLevel;
  };
  training: {
    primary_goal: Goal;
    priority_muscles: Muscle[];
    training_experience: TrainingExperience;
    exercise_confidence: ExerciseConfidence;
    recent_training_break: RecentTrainingBreak | null;
    training_days_per_week: TrainingDaysPerWeek;
    available_weekdays: Weekday[];
    session_duration_min: SessionDuration;
    session_duration_is_plus: boolean;
    training_location: TrainingLocation;
    other_location_label: string | null;
    available_equipment: Equipment[];
    other_equipment_label: string | null;
    pain_or_limitation: boolean;
    affected_body_areas: BodyArea[];
    activities: OnboardingV2ActivityPayload[];
  };
  nutrition: {
    meal_schedule_flexibility: MealScheduleFlexibility;
    preferred_meals_per_day: PreferredMealsPerDay | null;
    food_preparation_style: FoodPreparationStyle;
    food_budget_style: FoodBudgetStyle;
    dietary_pattern: DietaryPattern;
    dietary_pattern_other_label: string | null;
    has_food_restrictions: boolean;
    uses_supplements: boolean;
    restrictions: OnboardingV2RestrictionPayload[];
    disliked_foods: OnboardingV2DeclaredFoodPayload[];
    preferred_foods: OnboardingV2DeclaredFoodPayload[];
    supplements: OnboardingV2SupplementPayload[];
  };
  routine?: {
    wake_time: string;
    sleep_time: string;
    routine_predictability: RoutinePredictability;
    meal_break_availability: MealBreakAvailability;
    preferred_training_period: PreferredTrainingPeriod;
  };
}

export interface CompleteOnboardingV2Result {
  result: 'completed' | 'replay';
  onboarding_version: 2;
  completed_at: string;
}
