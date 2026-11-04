import fixture from "../food-catalog/taco/official-test-fixture.json" with { type: "json" };
import { FOOD_COVERAGE_CATEGORIES, type NutritionFoodAlias, type NutritionFoodCatalogEntry } from "../food-catalog/domain";
import { normalizeFoodQuery } from "../food-catalog/normalization";
import { TACO_SOURCE_REFERENCE, TACO_SOURCE_VERSION } from "../food-catalog/taco/constants";
import type { AiMealPlanCandidate, MealPlanGenerationContext } from "./domain";

export function officialTestCatalog(): { entries: NutritionFoodCatalogEntry[]; aliases: NutritionFoodAlias[] } {
  const groups: Record<string, string> = {
    "3": "cereals", "561": "legumes", "410": "poultry", "488": "eggs", "182": "fruits",
    "455": "dairy", "377": "meats", "260": "oils_fats", "100": "vegetables", "53": "bread",
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
    { sourceFoodId: "52", canonicalName: "Pão, trigo, forma, integral", foodGroup: "bread",
      calories: 253.194, proteinG: 9.425, carbsG: 49.942, fatG: 3.653, fiberG: 6.883, preparationState: "as_described" },
    { sourceFoodId: "7", canonicalName: "Aveia, flocos, crua", foodGroup: "cereals",
      calories: 393.823, proteinG: 13.921, carbsG: 66.636, fatG: 8.497, fiberG: 9.13, preparationState: "raw" },
    { sourceFoodId: "448", canonicalName: "Iogurte, natural", foodGroup: "dairy",
      calories: 51.49, proteinG: 4.063, carbsG: 1.917, fatG: 3.04, fiberG: null, preparationState: "as_described" },
    { sourceFoodId: "449", canonicalName: "Iogurte, natural, desnatado", foodGroup: "dairy",
      calories: 41.493, proteinG: 3.834, carbsG: 5.774, fatG: 0.316, fiberG: null, preparationState: "as_described" },
    { sourceFoodId: "471", canonicalName: "Café, infusão 10%", foodGroup: "beverages",
      calories: 9.071, proteinG: 0.713, carbsG: 1.479, fatG: 0.069, fiberG: null, preparationState: "as_described" },
    { sourceFoodId: "1", canonicalName: "Arroz, integral, cozido", foodGroup: "cereals",
      calories: 123.535, proteinG: 2.588, carbsG: 25.81, fatG: 1, fiberG: 2.749, preparationState: "cooked" },
    { sourceFoodId: "567", canonicalName: "Feijão, preto, cozido", foodGroup: "legumes",
      calories: 77.027, proteinG: 4.479, carbsG: 14.005, fatG: 0.536, fiberG: 8.402, preparationState: "cooked" },
    { sourceFoodId: "577", canonicalName: "Lentilha, cozida", foodGroup: "legumes",
      calories: 92.639, proteinG: 6.31, carbsG: 16.302, fatG: 0.525, fiberG: 7.862, preparationState: "cooked" },
    { sourceFoodId: "88", canonicalName: "Batata, doce, cozida", foodGroup: "roots_tubers",
      calories: 76.76, proteinG: 0.642, carbsG: 18.422, fatG: 0.088, fiberG: 2.212, preparationState: "cooked" },
    { sourceFoodId: "129", canonicalName: "Mandioca, cozida", foodGroup: "roots_tubers",
      calories: 125.358, proteinG: 0.575, carbsG: 30.09, fatG: 0.298, fiberG: 1.557, preparationState: "cooked" },
    { sourceFoodId: "109", canonicalName: "Cenoura, cozida", foodGroup: "vegetables",
      calories: 29.862, proteinG: 0.848, carbsG: 6.687, fatG: 0.218, fiberG: 2.629, preparationState: "cooked" },
    { sourceFoodId: "70", canonicalName: "Abobrinha, italiana, cozida", foodGroup: "vegetables",
      calories: 15.039, proteinG: 1.125, carbsG: 2.977, fatG: 0.199, fiberG: 1.588, preparationState: "cooked" },
    { sourceFoodId: "225", canonicalName: "Mamão, Formosa, cru", foodGroup: "fruits",
      calories: 45.341, proteinG: 0.815, carbsG: 11.555, fatG: 0.12, fiberG: 1.813, preparationState: "raw" },
    { sourceFoodId: "226", canonicalName: "Mamão, Papaia, cru", foodGroup: "fruits",
      calories: 40.157, proteinG: 0.456, carbsG: 10.44, fatG: 0.124, fiberG: 1.043, preparationState: "raw" },
    { sourceFoodId: "221", canonicalName: "Maçã, Argentina, com casca, crua", foodGroup: "fruits",
      calories: 62.532, proteinG: 0.225, carbsG: 16.588, fatG: 0.246, fiberG: 2.026, preparationState: "raw" },
    { sourceFoodId: "461", canonicalName: "Queijo, minas, frescal", foodGroup: "dairy",
      calories: 264.273, proteinG: 17.411, carbsG: 3.24, fatG: 20.181, fiberG: null, preparationState: "as_described" },
    { sourceFoodId: "468", canonicalName: "Queijo, requeijão, cremoso", foodGroup: "dairy",
      calories: 256.578, proteinG: 9.63, carbsG: 2.432, fatG: 23.441, fiberG: null, preparationState: "as_described" },
    { sourceFoodId: "533", canonicalName: "Cuscuz, de milho, cozido com sal", foodGroup: "cereals",
      calories: 113.459, proteinG: 2.156, carbsG: 25.281, fatG: 0.68, fiberG: 2.053, preparationState: "cooked" },
    { sourceFoodId: "163", canonicalName: "Abacate, cru", foodGroup: "fruits",
      calories: 96.155, proteinG: 1.239, carbsG: 6.031, fatG: 8.397, fiberG: 6.313, preparationState: "raw" },
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
    nutrientCompleteness: food.fiberG === null ? "PARTIAL" : "COMPLETE",
    sourceMetadata: { coverageCategories: [food.foodGroup], valueMarkers: { fiber: food.fiberG === null ? "NOT_APPLICABLE" : null } },
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
      { componentId: "EGGS", catalogEntryId: id("Ovo, de galinha, inteiro, cozido/10minutos"), slot: "PROTEIN_ANCHOR" as const, quantityGrams: 100 },
      { componentId: "BREAD", catalogEntryId: id("Pão, trigo, francês"), slot: "CARB_ANCHOR" as const, quantityGrams: 50 },
      { componentId: "FRUIT", catalogEntryId: id("Banana, prata, crua"), slot: "PRODUCE_FIBER" as const, quantityGrams: 100 },
    ];
    if (role === "PRE_WORKOUT") return [
      { componentId: "PROTEIN", catalogEntryId: id("Frango, peito, sem pele, grelhado"), slot: "PROTEIN_ANCHOR" as const, quantityGrams: 100 },
      { componentId: "BREAD", catalogEntryId: id("Pão, trigo, francês"), slot: "CARB_ANCHOR" as const, quantityGrams: 50 },
      { componentId: "FRUIT", catalogEntryId: id("Banana, prata, crua"), slot: "PRODUCE_FIBER" as const, quantityGrams: 100 },
    ];
    if (role === "POST_WORKOUT") return [
      { componentId: "PROTEIN", catalogEntryId: id("Frango, peito, sem pele, grelhado"), slot: "PROTEIN_ANCHOR" as const, quantityGrams: 100 },
      { componentId: "RICE", catalogEntryId: id("Arroz, tipo 1, cozido"), slot: "CARB_ANCHOR" as const, quantityGrams: 100 },
      { componentId: "VEGETABLES", catalogEntryId: id("Brócolis, cozido"), slot: "PRODUCE_FIBER" as const, quantityGrams: 100 },
    ];
    if (role === "EVENING_MEAL" && roles.length > 3) return [
      { componentId: "BREAD", catalogEntryId: id("Pão, trigo, forma, integral"), slot: "CARB_ANCHOR" as const, quantityGrams: 100 },
      { componentId: "EGGS", catalogEntryId: id("Ovo, de galinha, inteiro, cozido/10minutos"), slot: "PROTEIN_ANCHOR" as const, quantityGrams: 100 },
      { componentId: "FRUIT", catalogEntryId: id("Mamão, Formosa, cru"), slot: "PRODUCE_FIBER" as const, quantityGrams: 100 },
    ];
    return [
      { componentId: "PROTEIN", catalogEntryId: id("Frango, peito, sem pele, grelhado"), slot: "PROTEIN_ANCHOR" as const, quantityGrams: 100 },
      { componentId: "RICE", catalogEntryId: id("Arroz, tipo 1, cozido"), slot: "CARB_ANCHOR" as const, quantityGrams: 100 },
      { componentId: "BEANS", catalogEntryId: id("Feijão, carioca, cozido"), slot: "LEGUME_ANCHOR" as const, quantityGrams: 100 },
      { componentId: "VEGETABLES", catalogEntryId: id("Brócolis, cozido"), slot: "PRODUCE_FIBER" as const, quantityGrams: 100 },
      { componentId: "COOKING_FAT", catalogEntryId: id("Azeite, de oliva, extra virgem"), slot: "FAT_ANCHOR" as const, quantityGrams: 10, preparationNote: "usar no preparo" },
    ];
  };
  return { meals: roles.map((role) => {
    if (role === "BREAKFAST" || role === "SNACK") return { role, templateId: "BREAKFAST_BREAD_EGGS_COFFEE_FRUIT",
      variantId: "BREAD_EGGS_FRENCH_BANANA", label: "Pão francês, ovos e banana", items: itemsFor(role) };
    if (role === "PRE_WORKOUT") return { role, templateId: "PRE_BREAD_CHICKEN_FRUIT",
      variantId: "PRE_FRENCH_BREAD_CHICKEN_BANANA", label: "Pão francês com frango e banana", items: itemsFor(role) };
    if (role === "EVENING_MEAL" && roles.length > 3) return { role, templateId: "EVENING_BREAD_EGGS_FRUIT",
      variantId: "EVENING_WHOLE_BREAD_EGGS", label: "Pão integral com ovos e mamão", items: itemsFor(role) };
    if (role === "POST_WORKOUT") return { role, templateId: "POST_RICE_CHICKEN_VEGETABLES",
      variantId: "POST_WHITE_RICE_CHICKEN_BROCCOLI", label: "Arroz, frango e brócolis", items: itemsFor(role) };
    return { role, templateId: "MAIN_RICE_BEANS_CHICKEN_VEGETABLES",
      variantId: "WHITE_CARIOCA_CHICKEN_BROCCOLI", label: "Arroz, feijão carioca, frango e brócolis", items: itemsFor(role) };
  }) };
}

interface TestMealTarget { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number }
const ROLE_TARGETS: Record<MealPlanGenerationContext["mealRoles"][number], TestMealTarget> = {
  BREAKFAST: { calories: 393.86, proteinG: 18.54, carbsG: 55.89, fatG: 11.09, fiberG: 3.2 },
  PRE_WORKOUT: { calories: 407.34, proteinG: 37.28, carbsG: 55.28, fatG: 4.1, fiberG: 3.2 },
  SNACK: { calories: 393.86, proteinG: 18.54, carbsG: 55.89, fatG: 11.09, fiberG: 3.2 },
  POST_WORKOUT: { calories: 312.46, proteinG: 36.65, carbsG: 32.46, fatG: 3.21, fiberG: 4.96 },
  MAIN_MEAL: { calories: 477.27, proteinG: 41.43, carbsG: 46.05, fatG: 13.75, fiberG: 13.47 },
  EVENING_MEAL: { calories: 477.27, proteinG: 41.43, carbsG: 46.05, fatG: 13.75, fiberG: 13.47 },
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
