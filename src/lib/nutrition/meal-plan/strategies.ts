import {
  NUTRITION_GOAL_STRATEGY_VERSION,
  type NutritionGoalStrategy,
  type SupportedNutritionGoal,
} from "./domain";

export const NUTRITION_GOAL_STRATEGIES: Readonly<Record<SupportedNutritionGoal, NutritionGoalStrategy>> = {
  fat_loss: {
    goal: "fat_loss",
    version: NUTRITION_GOAL_STRATEGY_VERSION,
    energyIntent: "honor_authoritative_deficit",
    proteinPolicy: "preserve_lean_mass",
    fatPolicy: "balanced_within_target",
    carbPriority: "flexible",
    fiberPolicy: "satiety_distributed",
    mealDistributionPolicy: "satiety_and_adherence",
    preWorkoutPolicy: "optional_digestible",
    postWorkoutPolicy: "balanced_recovery",
    satietyPriority: "high",
    digestionPriority: "moderate",
  },
  hypertrophy: {
    goal: "hypertrophy",
    version: NUTRITION_GOAL_STRATEGY_VERSION,
    energyIntent: "support_surplus",
    proteinPolicy: "distribute_for_growth",
    fatPolicy: "avoid_surplus_concentration",
    carbPriority: "training_support",
    fiberPolicy: "distributed",
    mealDistributionPolicy: "protein_and_training",
    preWorkoutPolicy: "carb_support_when_useful",
    postWorkoutPolicy: "protein_carb_recovery",
    satietyPriority: "moderate",
    digestionPriority: "moderate",
  },
  conditioning: {
    goal: "conditioning",
    version: NUTRITION_GOAL_STRATEGY_VERSION,
    energyIntent: "support_performance",
    proteinPolicy: "support_recovery",
    fatPolicy: "moderate_for_digestibility",
    carbPriority: "performance_priority",
    fiberPolicy: "distributed_away_from_training",
    mealDistributionPolicy: "performance_and_recovery",
    preWorkoutPolicy: "digestible_carb_priority",
    postWorkoutPolicy: "protein_carb_recovery",
    satietyPriority: "moderate",
    digestionPriority: "high",
  },
};

export function getNutritionGoalStrategy(goal: SupportedNutritionGoal): NutritionGoalStrategy {
  return NUTRITION_GOAL_STRATEGIES[goal];
}
