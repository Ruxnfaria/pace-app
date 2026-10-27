import type { MealRole } from "../meal-plan/domain";
import type { MealFuelLevel, NutritionQualityGoal } from "./domain";

export function deriveMealFuelLevel(input: {
  goal: NutritionQualityGoal;
  role: MealRole;
  targetCarbsG: number;
}): MealFuelLevel {
  const trainingBoost = input.role === "PRE_WORKOUT" || input.role === "POST_WORKOUT";
  const performanceGoal = ["hypertrophy", "strength", "conditioning"].includes(input.goal);
  const score = input.targetCarbsG + (trainingBoost ? 8 : 0) + (performanceGoal ? 5 : 0)
    - (input.goal === "fat_loss" ? 5 : 0);
  if (score < 30) return "LOW";
  if (score < 65) return "MODERATE";
  return "HIGH";
}

export function fuelCarbohydratePortionRange(level: MealFuelLevel): { minimumGrams: number; maximumGrams: number } {
  if (level === "LOW") return { minimumGrams: 40, maximumGrams: 140 };
  if (level === "MODERATE") return { minimumGrams: 70, maximumGrams: 240 };
  return { minimumGrams: 110, maximumGrams: 360 };
}
