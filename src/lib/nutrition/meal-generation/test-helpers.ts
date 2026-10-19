import fixture from "../food-catalog/taco/official-test-fixture.json" with { type: "json" };
import { FOOD_COVERAGE_CATEGORIES, type NutritionFoodAlias, type NutritionFoodCatalogEntry } from "../food-catalog/domain";
import { normalizeFoodQuery } from "../food-catalog/normalization";
import { TACO_SOURCE_REFERENCE, TACO_SOURCE_VERSION } from "../food-catalog/taco/constants";
import type { AiMealPlanCandidate, MealPlanGenerationContext } from "./domain";

export function officialTestCatalog(): { entries: NutritionFoodCatalogEntry[]; aliases: NutritionFoodAlias[] } {
  const entries: NutritionFoodCatalogEntry[] = fixture.foods.map((food, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    canonicalName: food.canonicalName, normalizedName: normalizeFoodQuery(food.canonicalName), source: "TACO",
    sourceFoodId: food.sourceFoodId, sourceVersion: TACO_SOURCE_VERSION, sourceReference: TACO_SOURCE_REFERENCE,
    foodGroup: index === 0 ? "cereals" : index === 1 ? "legumes" : index === 2 ? "poultry" : index === 3 ? "eggs" : index === 4 ? "fruits" : "dairy",
    preparationState: "as_described",
    nutrientsPer100g: { calories: food.calories, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG, fiberG: food.fiberG },
    nutrientCompleteness: food.fiberG === null ? "PARTIAL" : "COMPLETE", ediblePortion: null, densityGPerMl: null,
    dataQuality: "IMPORTED", catalogScope: "PRODUCTION", dietaryTags: [], allergenTags: [], allergenDataComplete: false,
    foodRole: null, budgetTier: null, preparationComplexity: null,
    sourceMetadata: { coverageCategories: [index === 0 ? "cereals" : index === 1 ? "legumes" : index === 2 ? "poultry" : index === 3 ? "eggs" : index === 4 ? "fruits" : "dairy"] }, isActive: true,
  }));
  for (const category of FOOD_COVERAGE_CATEGORIES) {
    if (entries.some((entry) => (entry.sourceMetadata.coverageCategories as string[]).includes(category))) continue;
    const base = entries[0];
    entries.push({ ...base, id: `coverage-${category}`, sourceFoodId: `coverage-${category}`,
      canonicalName: `Coverage ${category}`, normalizedName: `coverage ${category}`, foodGroup: category,
      sourceMetadata: { coverageCategories: [category] } });
  }
  return { entries, aliases: [] };
}

export function balancedCandidate(roles: MealPlanGenerationContext["mealRoles"]): AiMealPlanCandidate {
  return { meals: roles.map((role, index) => ({ role, label: `Refeição ${index + 1}`, items: [
    { foodQuery: "Arroz, tipo 1, cozido", quantityValue: 100, quantityUnit: "g" },
    { foodQuery: "Feijão, carioca, cozido", quantityValue: 100, quantityUnit: "g" },
    { foodQuery: "Banana, prata, crua", quantityValue: 100, quantityUnit: "g" },
    { foodQuery: "Leite, de vaca, achocolatado", quantityValue: 100, quantityUnit: "g" },
  ] })) };
}

const PER_MEAL = { calories: 385.75, proteinG: 10.67, carbsG: 81.77, fatG: 3.01, fiberG: 12.76 };

export function generationContext(goal: MealPlanGenerationContext["goal"] = "fat_loss", roles: MealPlanGenerationContext["mealRoles"] = ["BREAKFAST", "MAIN_MEAL", "EVENING_MEAL"]): MealPlanGenerationContext {
  const count = roles.length;
  return {
    userId: "user-test", targetSnapshotId: "target-test", goal,
    target: { status: "active", calories: PER_MEAL.calories * count, proteinG: PER_MEAL.proteinG * count,
      carbsG: PER_MEAL.carbsG * count, fatG: PER_MEAL.fatG * count, fiberG: PER_MEAL.fiberG * count },
    strategyVersion: "praxe-nutrition-goal-strategy-v1", mealDistributionVersion: "praxe-meal-distribution-v1",
    mealCount: count, mealRoles: roles,
    mealWindows: roles.map((_, index) => ({ position: index + 1, start: `${String(7 + index * 5).padStart(2, "0")}:00`, end: `${String(8 + index * 5).padStart(2, "0")}:00`, startDayOffset: 0, endDayOffset: 0 })),
    mealMacroTargets: roles.map((role, index) => ({ position: index + 1, role, ...PER_MEAL })),
    catalogReadiness: "CATALOG_BASE_NUTRITION_READY", dietaryPattern: "omnivore", allergenRestrictions: [],
    hasFoodRestriction: false, restrictionSafetyKnown: true, preferredFoods: ["Banana, prata, crua"], dislikedFoods: [],
    preparationStyle: "cook_some", budget: "balanced", routinePredictability: "predictable",
    mealBreakAvailability: "flexible", trainingPeriod: "afternoon", supplements: [],
  };
}
