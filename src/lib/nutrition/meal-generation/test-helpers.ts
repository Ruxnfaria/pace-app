import fixture from "../food-catalog/taco/official-test-fixture.json" with { type: "json" };
import { FOOD_COVERAGE_CATEGORIES, type NutritionFoodAlias, type NutritionFoodCatalogEntry } from "../food-catalog/domain";
import { normalizeFoodQuery } from "../food-catalog/normalization";
import { TACO_SOURCE_REFERENCE, TACO_SOURCE_VERSION } from "../food-catalog/taco/constants";
import type { AiMealPlanCandidate, MealPlanGenerationContext } from "./domain";

export function officialTestCatalog(): { entries: NutritionFoodCatalogEntry[]; aliases: NutritionFoodAlias[] } {
  const groups: Record<string, string> = {
    "3": "cereals", "561": "legumes", "410": "poultry", "488": "eggs", "182": "fruits",
    "455": "dairy", "350": "meats", "15": "oils_fats", "122": "vegetables", "53": "bread",
    "589": "nuts_seeds", "542": "pasta",
  };
  const entries: NutritionFoodCatalogEntry[] = fixture.foods.map((food, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    canonicalName: food.canonicalName, normalizedName: normalizeFoodQuery(food.canonicalName), source: "TACO",
    sourceFoodId: food.sourceFoodId, sourceVersion: TACO_SOURCE_VERSION, sourceReference: TACO_SOURCE_REFERENCE,
    foodGroup: groups[food.sourceFoodId],
    preparationState: "as_described",
    nutrientsPer100g: { calories: food.calories, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG, fiberG: food.fiberG },
    nutrientCompleteness: food.fiberG === null ? "PARTIAL" : "COMPLETE", ediblePortion: null, densityGPerMl: null,
    dataQuality: "IMPORTED", catalogScope: "PRODUCTION", dietaryTags: [], allergenTags: [], allergenDataComplete: false,
    foodRole: null, budgetTier: null, preparationComplexity: null,
    sourceMetadata: {
      coverageCategories: [groups[food.sourceFoodId]],
      valueMarkers: { fiber: food.fiberG === null ? "NOT_APPLICABLE" : null },
    }, isActive: true,
  }));
  const supplemental = [
    { sourceFoodId: "53", canonicalName: "Pão, trigo, francês", foodGroup: "bread",
      calories: 299.81, proteinG: 7.954, carbsG: 58.646, fatG: 3.103, fiberG: 2.307, preparationState: "as_described" },
    { sourceFoodId: "589", canonicalName: "Castanha-do-Brasil, crua", foodGroup: "nuts_seeds",
      calories: 642.963, proteinG: 14.536, carbsG: 15.079, fatG: 63.459, fiberG: 7.931, preparationState: "raw" },
    { sourceFoodId: "542", canonicalName: "Macarrão, molho bolognesa", foodGroup: "pasta",
      calories: 119.532, proteinG: 4.934, carbsG: 22.522, fatG: 0.89, fiberG: 0.777, preparationState: "as_described" },
  ] as const;
  supplemental.forEach((food, index) => entries.push({
    ...entries[0],
    id: `00000000-0000-4000-9000-${String(index + 1).padStart(12, "0")}`,
    sourceFoodId: food.sourceFoodId,
    canonicalName: food.canonicalName,
    normalizedName: normalizeFoodQuery(food.canonicalName),
    foodGroup: food.foodGroup,
    preparationState: food.preparationState,
    nutrientsPer100g: { calories: food.calories, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG, fiberG: food.fiberG },
    nutrientCompleteness: "COMPLETE",
    sourceMetadata: { coverageCategories: [food.foodGroup], valueMarkers: { fiber: null } },
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
  const byName = new Map(officialTestCatalog().entries.map((entry) => [entry.canonicalName, entry.id]));
  const id = (name: string) => byName.get(name)!;
  const itemsFor = (role: MealPlanGenerationContext["mealRoles"][number]) => {
    if (role === "BREAKFAST" || role === "SNACK") return [
      { catalogEntryId: id("Ovo, de galinha, inteiro, cozido/10minutos"), slot: "PROTEIN_ANCHOR" as const, quantityGrams: 100 },
      { catalogEntryId: id("Pão, trigo, francês"), slot: "CARB_ANCHOR" as const, quantityGrams: 50 },
      { catalogEntryId: id("Banana, prata, crua"), slot: "PRODUCE_FIBER" as const, quantityGrams: 100 },
    ];
    if (role === "PRE_WORKOUT") return [
      { catalogEntryId: id("Frango, peito, sem pele, grelhado"), slot: "PROTEIN_ANCHOR" as const, quantityGrams: 100 },
      { catalogEntryId: id("Pão, trigo, francês"), slot: "CARB_ANCHOR" as const, quantityGrams: 50 },
      { catalogEntryId: id("Banana, prata, crua"), slot: "PRODUCE_FIBER" as const, quantityGrams: 100 },
    ];
    if (role === "POST_WORKOUT") return [
      { catalogEntryId: id("Frango, peito, sem pele, grelhado"), slot: "PROTEIN_ANCHOR" as const, quantityGrams: 100 },
      { catalogEntryId: id("Arroz, tipo 1, cozido"), slot: "CARB_ANCHOR" as const, quantityGrams: 100 },
      { catalogEntryId: id("Brócolis, cozido"), slot: "PRODUCE_FIBER" as const, quantityGrams: 100 },
    ];
    if (role === "EVENING_MEAL") return [
      { catalogEntryId: id("Carne bovina, patinho, sem gordura, grelhado"), slot: "PROTEIN_ANCHOR" as const, quantityGrams: 100 },
      { catalogEntryId: id("Arroz, tipo 1, cozido"), slot: "CARB_ANCHOR" as const, quantityGrams: 100 },
      { catalogEntryId: id("Feijão, carioca, cozido"), slot: "LEGUME_ANCHOR" as const, quantityGrams: 100 },
      { catalogEntryId: id("Brócolis, cozido"), slot: "PRODUCE_FIBER" as const, quantityGrams: 100 },
      { catalogEntryId: id("Azeite, de oliva, extra virgem"), slot: "FAT_ANCHOR" as const, quantityGrams: 10, preparationNote: "usar no preparo" },
    ];
    return [
      { catalogEntryId: id("Frango, peito, sem pele, grelhado"), slot: "PROTEIN_ANCHOR" as const, quantityGrams: 100 },
      { catalogEntryId: id("Arroz, tipo 1, cozido"), slot: "CARB_ANCHOR" as const, quantityGrams: 100 },
      { catalogEntryId: id("Feijão, carioca, cozido"), slot: "LEGUME_ANCHOR" as const, quantityGrams: 100 },
      { catalogEntryId: id("Brócolis, cozido"), slot: "PRODUCE_FIBER" as const, quantityGrams: 100 },
      { catalogEntryId: id("Azeite, de oliva, extra virgem"), slot: "FAT_ANCHOR" as const, quantityGrams: 10, preparationNote: "usar no preparo" },
    ];
  };
  return { meals: roles.map((role, index) => ({ role, label: `Refeição ${index + 1}`, items: itemsFor(role) })) };
}

interface TestMealTarget { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number }
const ROLE_TARGETS: Record<MealPlanGenerationContext["mealRoles"][number], TestMealTarget> = {
  BREAKFAST: { calories: 393.86, proteinG: 18.54, carbsG: 55.89, fatG: 11.09, fiberG: 3.2 },
  PRE_WORKOUT: { calories: 407.34, proteinG: 37.28, carbsG: 55.28, fatG: 4.1, fiberG: 3.2 },
  SNACK: { calories: 393.86, proteinG: 18.54, carbsG: 55.89, fatG: 11.09, fiberG: 3.2 },
  POST_WORKOUT: { calories: 312.46, proteinG: 36.65, carbsG: 32.46, fatG: 3.21, fiberG: 4.96 },
  MAIN_MEAL: { calories: 477.27, proteinG: 41.43, carbsG: 46.05, fatG: 13.75, fiberG: 13.47 },
  EVENING_MEAL: { calories: 537.08, proteinG: 45.3, carbsG: 46.05, fatG: 18.58, fiberG: 13.47 },
};

export function generationContext(goal: MealPlanGenerationContext["goal"] = "fat_loss", roles: MealPlanGenerationContext["mealRoles"] = ["BREAKFAST", "MAIN_MEAL", "EVENING_MEAL"]): MealPlanGenerationContext {
  const targets = roles.map((role) => ROLE_TARGETS[role]);
  const sum = (key: keyof TestMealTarget) => Number(targets.reduce((total, target) => total + target[key], 0).toFixed(2));
  return {
    userId: "user-test", targetSnapshotId: "target-test", goal,
    target: { status: "active", calories: sum("calories"), proteinG: sum("proteinG"),
      carbsG: sum("carbsG"), fatG: sum("fatG"), fiberG: sum("fiberG") },
    strategyVersion: "praxe-nutrition-goal-strategy-v1", mealDistributionVersion: "praxe-meal-distribution-v1",
    mealCount: roles.length, mealRoles: roles,
    mealWindows: roles.map((_, index) => ({ position: index + 1, start: `${String(7 + index * 5).padStart(2, "0")}:00`, end: `${String(8 + index * 5).padStart(2, "0")}:00`, startDayOffset: 0, endDayOffset: 0 })),
    mealMacroTargets: roles.map((role, index) => ({ position: index + 1, role, ...targets[index] })),
    catalogReadiness: "CATALOG_BASE_NUTRITION_READY", dietaryPattern: "omnivore", allergenRestrictions: [],
    hasFoodRestriction: false, restrictionSafetyKnown: true, preferredFoods: ["Frango, peito, sem pele, grelhado"], dislikedFoods: [],
    preparationStyle: "cook_some", budget: "balanced", routinePredictability: "predictable",
    mealBreakAvailability: "flexible", trainingPeriod: "afternoon", supplements: [],
  };
}
