export const NUTRITION_GOAL_STRATEGY_VERSION = "praxe-nutrition-goal-strategy-v1" as const;
export const MEAL_DISTRIBUTION_VERSION = "praxe-meal-distribution-v1" as const;

export type SupportedNutritionGoal = "fat_loss" | "hypertrophy" | "conditioning";
export type MealRole =
  | "BREAKFAST"
  | "MAIN_MEAL"
  | "PRE_WORKOUT"
  | "POST_WORKOUT"
  | "SNACK"
  | "EVENING_MEAL";

export type TrainingPeriod = "morning" | "afternoon" | "evening" | "variable";
export type MealBreakAvailability = "flexible" | "limited" | "difficult";
export type RoutinePredictability = "predictable" | "variable";
export type FoodPreparationStyle = "very_quick" | "cook_some" | "meal_prep" | "flexible";

export interface NutritionGoalStrategy {
  readonly goal: SupportedNutritionGoal;
  readonly version: typeof NUTRITION_GOAL_STRATEGY_VERSION;
  readonly energyIntent: "honor_authoritative_deficit" | "support_surplus" | "support_performance";
  readonly proteinPolicy: "preserve_lean_mass" | "distribute_for_growth" | "support_recovery";
  readonly fatPolicy: "balanced_within_target" | "avoid_surplus_concentration" | "moderate_for_digestibility";
  readonly carbPriority: "flexible" | "training_support" | "performance_priority";
  readonly fiberPolicy: "satiety_distributed" | "distributed" | "distributed_away_from_training";
  readonly mealDistributionPolicy: "satiety_and_adherence" | "protein_and_training" | "performance_and_recovery";
  readonly preWorkoutPolicy: "optional_digestible" | "carb_support_when_useful" | "digestible_carb_priority";
  readonly postWorkoutPolicy: "balanced_recovery" | "protein_carb_recovery";
  readonly satietyPriority: "high" | "moderate";
  readonly digestionPriority: "moderate" | "high";
}

export interface MealPlanContext {
  wakeTime: string;
  sleepTime: string;
  routinePredictability: RoutinePredictability;
  mealBreakAvailability: MealBreakAvailability;
  preferredTrainingPeriod: TrainingPeriod;
  preparationStyle: FoodPreparationStyle;
  goal: SupportedNutritionGoal;
}

export interface AuthoritativeNutritionTarget {
  status: "active" | "requires_review";
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface NormalizedAwakeWindow {
  wakeMinute: number;
  sleepMinute: number;
  durationMinutes: number;
  crossesMidnight: boolean;
}

export interface MealWindow {
  position: number;
  start: string;
  end: string;
  startDayOffset: 0 | 1;
  endDayOffset: 0 | 1;
}

export interface MealMacroTarget {
  position: number;
  role: MealRole;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface MacroReconciliation {
  caloriesDelta: number;
  proteinGDelta: number;
  carbsGDelta: number;
  fatGDelta: number;
  fiberGDelta: number;
}

export interface RecommendedMealStructure {
  strategyVersion: typeof NUTRITION_GOAL_STRATEGY_VERSION;
  mealDistributionVersion: typeof MEAL_DISTRIBUTION_VERSION;
  recommendedMealsPerDay: number;
  mealWindows: MealWindow[];
  mealRoles: MealRole[];
  macroDistribution: MealMacroTarget[];
  reconciliation: MacroReconciliation;
  rationale: string[];
}

export class MealPlanResolutionError extends Error {
  constructor(
    readonly code: "INVALID_CONTEXT" | "INVALID_TARGET" | "TARGET_REQUIRES_REVIEW" | "GOAL_STRATEGY_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "MealPlanResolutionError";
  }
}
