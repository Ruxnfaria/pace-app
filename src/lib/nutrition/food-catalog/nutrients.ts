import type { NutritionFoodCatalogEntry, NutrientsPer100g } from "./domain";

export interface CalculatedFoodNutrients extends NutrientsPer100g {
  grams: number;
  macroDerivedEnergy: number | null;
  qualityWarnings: string[];
}

function scale(value: number | null, grams: number): number | null {
  return value === null ? null : Number((value * grams / 100).toFixed(2));
}

export function calculateFoodNutrients(entry: NutritionFoodCatalogEntry, grams: number): CalculatedFoodNutrients {
  if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) throw new Error("Invalid grams for nutrient calculation");
  const calories = scale(entry.nutrientsPer100g.calories, grams);
  const proteinG = scale(entry.nutrientsPer100g.proteinG, grams);
  const carbsG = scale(entry.nutrientsPer100g.carbsG, grams);
  const fatG = scale(entry.nutrientsPer100g.fatG, grams);
  const fiberG = scale(entry.nutrientsPer100g.fiberG, grams);
  const macroDerivedEnergy = proteinG === null || carbsG === null || fatG === null
    ? null
    : Number((proteinG * 4 + carbsG * 4 + fatG * 9).toFixed(2));
  const qualityWarnings: string[] = [];
  if (calories !== null && macroDerivedEnergy !== null) {
    const threshold = Math.max(50 * grams / 100, calories * 0.2);
    if (Math.abs(calories - macroDerivedEnergy) > threshold) qualityWarnings.push("EXTREME_ENERGY_DISCREPANCY");
  }
  if (Object.values({ calories, proteinG, carbsG, fatG, fiberG }).some((value) => value === null)) {
    qualityWarnings.push("INCOMPLETE_NUTRIENTS");
  }
  return { grams, calories, proteinG, carbsG, fatG, fiberG, macroDerivedEnergy, qualityWarnings };
}

function sumKnown(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  return Number((values as number[]).reduce((total, value) => total + value, 0).toFixed(2));
}

export function sumMealNutrients(items: readonly CalculatedFoodNutrients[]): CalculatedFoodNutrients {
  const calories = sumKnown(items.map((item) => item.calories));
  const proteinG = sumKnown(items.map((item) => item.proteinG));
  const carbsG = sumKnown(items.map((item) => item.carbsG));
  const fatG = sumKnown(items.map((item) => item.fatG));
  const fiberG = sumKnown(items.map((item) => item.fiberG));
  const macroDerivedEnergy = sumKnown(items.map((item) => item.macroDerivedEnergy));
  return {
    grams: Number(items.reduce((total, item) => total + item.grams, 0).toFixed(3)),
    calories, proteinG, carbsG, fatG, fiberG, macroDerivedEnergy,
    qualityWarnings: [...new Set(items.flatMap((item) => item.qualityWarnings))],
  };
}

export function sumPlanNutrients(meals: readonly (readonly CalculatedFoodNutrients[])[]): CalculatedFoodNutrients {
  return sumMealNutrients(meals.map((meal) => sumMealNutrients(meal)));
}
