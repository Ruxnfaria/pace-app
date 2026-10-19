import type { NutritionFoodAlias, NutritionFoodCatalogEntry, NutritionFoodPortion } from "./domain";
import { normalizeFoodQuery } from "./normalization";

function fixture(
  id: string,
  canonicalName: string,
  preparationState: string,
  nutrients: NutritionFoodCatalogEntry["nutrientsPer100g"],
  overrides: Partial<NutritionFoodCatalogEntry> = {},
): NutritionFoodCatalogEntry {
  return {
    id,
    canonicalName,
    normalizedName: normalizeFoodQuery(canonicalName),
    source: "MANUAL_CURATED",
    sourceFoodId: `TEST-${id}`,
    sourceVersion: "test-fixture-v1",
    sourceReference: "TEST_ONLY: synthetic fixture; never production nutrition data",
    foodGroup: "cereals",
    preparationState,
    nutrientsPer100g: nutrients,
    nutrientCompleteness: Object.values(nutrients).every((value) => value !== null) ? "COMPLETE" : "PARTIAL",
    ediblePortion: 1,
    densityGPerMl: null,
    dataQuality: "ATTRIBUTED",
    catalogScope: "TEST_ONLY",
    dietaryTags: ["vegan", "vegetarian"],
    allergenTags: [],
    allergenDataComplete: true,
    foodRole: "carb",
    budgetTier: "economical",
    preparationComplexity: "low",
    sourceMetadata: { fixture: true },
    isActive: true,
    ...overrides,
  };
}

export const TEST_ONLY_FOOD_CATALOG: NutritionFoodCatalogEntry[] = [
  fixture("00000000-0000-4000-8000-000000000001", "Alimento teste cereal, cozido", "cooked", { calories: 130, proteinG: 2.5, carbsG: 28, fatG: 0.3, fiberG: 1.6 }),
  fixture("00000000-0000-4000-8000-000000000002", "Alimento teste cereal, cru", "raw", { calories: 360, proteinG: 7, carbsG: 79, fatG: 0.8, fiberG: 2.2 }),
  fixture("00000000-0000-4000-8000-000000000003", "Alimento teste líquido", "ready_to_drink", { calories: 50, proteinG: 3, carbsG: 5, fatG: 2, fiberG: null }, { densityGPerMl: 1.03, nutrientCompleteness: "PARTIAL" }),
];

export const TEST_ONLY_FOOD_ALIASES: NutritionFoodAlias[] = [
  { id: "a1", foodId: TEST_ONLY_FOOD_CATALOG[0].id, alias: "cereal cozido", normalizedAlias: "cereal cozido", locale: "pt-BR", source: "MANUAL_CURATED", confidence: "CURATED" },
  { id: "a2", foodId: TEST_ONLY_FOOD_CATALOG[0].id, alias: "alimento base", normalizedAlias: "alimento base", locale: "pt-BR", source: "MANUAL_CURATED", confidence: "CURATED" },
  { id: "a3", foodId: TEST_ONLY_FOOD_CATALOG[1].id, alias: "alimento base", normalizedAlias: "alimento base", locale: "pt-BR", source: "MANUAL_CURATED", confidence: "CURATED" },
];

export const TEST_ONLY_FOOD_PORTIONS: NutritionFoodPortion[] = [
  { id: "p1", foodId: TEST_ONLY_FOOD_CATALOG[0].id, label: "unidade teste", grams: 75, locale: "pt-BR", source: "MANUAL_CURATED", sourceReference: "TEST_ONLY" },
];
