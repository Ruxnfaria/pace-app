import type { NutritionFoodSource } from "./domain";

// The legacy /api/nutrition/analyze route is an estimation feature. Its AI
// output must never enter this authority boundary or meal-plan validation.
export type AuthoritativeNutrientSource = NutritionFoodSource;

export function isAuthoritativeNutrientSource(value: string): value is AuthoritativeNutrientSource {
  return value === "TBCA" || value === "TACO" || value === "MANUAL_CURATED" || value === "FUTURE_PROVIDER";
}
