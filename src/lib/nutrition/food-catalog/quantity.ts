import type { NutritionFoodCatalogEntry, NutritionFoodPortion } from "./domain";

export type FoodQuantityUnit = "g" | "kg" | "ml" | "known_portion";

export class FoodQuantityError extends Error {
  constructor(readonly code: "INVALID_QUANTITY" | "MISSING_DENSITY" | "UNKNOWN_PORTION" | "IMPOSSIBLE_PORTION", message: string) {
    super(message);
    this.name = "FoodQuantityError";
  }
}

export function normalizeFoodQuantity(
  food: NutritionFoodCatalogEntry,
  quantity: number,
  unit: FoodQuantityUnit,
  portion?: NutritionFoodPortion,
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new FoodQuantityError("INVALID_QUANTITY", "Quantity must be positive and finite");
  }
  let grams: number;
  if (unit === "g") grams = quantity;
  else if (unit === "kg") grams = quantity * 1000;
  else if (unit === "ml") {
    if (food.densityGPerMl === null || food.densityGPerMl <= 0) {
      throw new FoodQuantityError("MISSING_DENSITY", "Milliliters require a curated density conversion");
    }
    grams = quantity * food.densityGPerMl;
  } else {
    if (!portion || portion.foodId !== food.id || !Number.isFinite(portion.grams) || portion.grams <= 0) {
      throw new FoodQuantityError("UNKNOWN_PORTION", "Known portion requires a valid curated gram conversion");
    }
    grams = quantity * portion.grams;
  }
  if (grams > 5000) throw new FoodQuantityError("IMPOSSIBLE_PORTION", "Quantity exceeds the supported automatic range");
  return Number(grams.toFixed(3));
}
