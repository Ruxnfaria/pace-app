import { MEAL_VALIDATION_POLICY_VERSION } from "./domain";

export const MEAL_VALIDATION_POLICY = {
  version: MEAL_VALIDATION_POLICY_VERSION,
  daily: {
    calories: { relative: 0.05, absoluteKcal: 100 },
    protein: { minimumRatio: 0.95, maximumRatio: 1.1 },
    carbs: { toleranceRatio: 0.1 },
    fat: { toleranceRatio: 0.1 },
    fiber: { minimumRatio: 0.9 },
  },
  portions: { maximumItemGrams: 1000, maximumOilFatGrams: 150, maximumMealGrams: 1800 },
  distribution: { maximumMealCalorieShare: 0.55, minimumHypertrophyMealProteinTargetRatio: 0.55, maximumFatCalorieShare: 0.5 },
} as const;
