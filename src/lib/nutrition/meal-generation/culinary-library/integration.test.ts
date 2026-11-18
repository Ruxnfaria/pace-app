import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assessTrustedNutritionCatalog } from "../../food-catalog/capabilities";
import { validateDailyMealQuality } from "../../meal-quality/daily-quality";
import { validatePortionRealism } from "../../meal-quality/portion-realism";
import { buildMealPlanPromptContext, generateValidatedMealPlan } from "../generator";
import { InMemoryNutritionFoodCatalogRepository } from "../repository";
import { generationContext, officialTestCatalog } from "../test-helpers";
import { validateMealPlanCandidate } from "../validator";
import { humanReadableMealPlan } from "../real-meal-templates/presentation";
import type { AiMealPlanCandidate, CatalogSnapshot, MealPlanGenerationContext } from "../domain";
import { CULINARY_LIBRARY_VERSION } from "./domain";
import { buildCulinaryLibrary } from "./registry";
import { assessDailyCulinaryVariety } from "./daily-variety";
import { resolveRecommendedMealStructure } from "../../meal-plan/engine";
import { getNutritionGoalStrategy } from "../../meal-plan/strategies";

function exact2500Fixture() {
  const base = officialTestCatalog();
  const catalog: CatalogSnapshot = { ...base, portions: [],
    readiness: assessTrustedNutritionCatalog(base.entries).level };
  const roles = ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"] as const;
  const context: MealPlanGenerationContext = generationContext("hypertrophy", [...roles]);
  context.trainingPeriod = "evening";
  context.target = { status: "active", calories: 2500, proteinG: 110, carbsG: 359.75, fatG: 69, fiberG: 35 };
  context.mealMacroTargets = roles.map((role, index) => ({ position: index + 1, role,
    calories: 625, proteinG: 27.5, carbsG: 89.9375, fatG: 17.25, fiberG: 8.75 }));
  const prompt = buildMealPlanPromptContext(context, catalog);
  const recipeIds = ["FRENCH_BREAD_BOILED_EGGS_BANANA", "FRENCH_BREAD_MINAS_CHEESE_BANANA",
    "RICE_BEANS_BEEF_BROCCOLI", "YOGURT_OATS_BANANA"];
  const candidate: AiMealPlanCandidate = { meals: prompt.recipeSlots.map((slot, index) => {
    const recipe = slot.options.find((option) => option.recipeId === recipeIds[index])!;
    return {
      role: slot.role,
      templateId: recipe.templateId,
      variantId: recipe.templateVariantId,
      recipeId: recipe.recipeId,
      recipeVersion: recipe.recipeVersion,
      recipeFamilyId: recipe.recipeFamilyId,
      recipeVariantId: recipe.recipeVariantId,
      label: recipe.recipeDisplayName,
      items: recipe.components.filter((component) => component.required).map((component) => ({
        componentId: component.componentId,
        slot: component.slot,
        catalogEntryId: component.catalogEntryIds[0],
        quantityGrams: component.referenceGrams,
        ...(component.preparationNote ? { preparationNote: component.preparationNote } : {}),
      })),
    };
  }) };
  return { base, catalog, context, prompt, candidate };
}

function humanBalanced2500Candidate(prompt: ReturnType<typeof buildMealPlanPromptContext>): AiMealPlanCandidate {
  const recipeIds = ["FRENCH_BREAD_MINAS_CHEESE_APPLE", "COUSCOUS_BOILED_EGGS",
    "RICE_BEANS_BEEF_CARROT", "YOGURT_OATS_BANANA"];
  return { meals: prompt.recipeSlots.map((slot, index) => {
    const recipe = slot.options.find((option) => option.recipeId === recipeIds[index])!;
    return {
      role: slot.role, templateId: recipe.templateId, variantId: recipe.templateVariantId,
      recipeId: recipe.recipeId, recipeVersion: recipe.recipeVersion, recipeFamilyId: recipe.recipeFamilyId,
      recipeVariantId: recipe.recipeVariantId, label: recipe.recipeDisplayName,
      items: recipe.components.filter((component) => component.required || component.componentId === "COOKING_FAT")
        .map((component) => ({
          componentId: component.componentId, slot: component.slot, catalogEntryId: component.catalogEntryIds[0],
          quantityGrams: component.componentId === "COOKING_FAT" ? 10 : component.referenceGrams,
          ...(component.preparationNote ? { preparationNote: component.preparationNote } : {}),
        })),
    };
  }) };
}

test("runtime exposes only feasible recipe/template/intent associations and keeps whey blocked", () => {
  const { prompt } = exact2500Fixture();
  assert.ok(prompt.recipeSlots.every((slot) => slot.options.length > 0));
  assert.ok(prompt.recipeSlots.every((slot) => slot.options.every((option) => option.mealRole === slot.role
    && option.mealIntent === slot.intent && option.recipeVersion === CULINARY_LIBRARY_VERSION)));
  assert.equal(prompt.recipeSlots.some((slot) => slot.options.some((option) => option.recipeId.includes("SHAKE_WHEY"))), false);
  assert.ok(prompt.recipeSlots.every((slot) => slot.options.every((option) => option.components.every((component) =>
    component.catalogEntryIds.length > 0 && component.minimumGrams <= component.referenceGrams
      && component.referenceGrams <= component.maximumGrams))));
});

test("runtime compatibility audit accounts for all 19 active recipes with strict mappings", () => {
  const base = officialTestCatalog();
  const catalog: CatalogSnapshot = { ...base, portions: [], readiness: assessTrustedNutritionCatalog(base.entries).level };
  const runtimeIds = new Set<string>();
  const goals: MealPlanGenerationContext["goal"][] = ["hypertrophy", "fat_loss", "conditioning"];
  const roleSets: MealPlanGenerationContext["mealRoles"][] = [
    ["BREAKFAST", "MAIN_MEAL", "EVENING_MEAL"],
    ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"],
    ["BREAKFAST", "SNACK", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"],
  ];
  for (const goal of goals) for (const roles of roleSets) {
    const context = generationContext(goal, roles);
    for (const period of ["morning", "afternoon", "evening", "variable"] as const) {
      context.trainingPeriod = period;
      buildMealPlanPromptContext(context, catalog).recipeSlots.forEach((slot) => slot.options
        .forEach((option) => runtimeIds.add(option.recipeId)));
    }
  }
  const preMealContext = generationContext("hypertrophy", ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"]);
  preMealContext.mealMacroTargets[1] = { ...preMealContext.mealMacroTargets[1], calories: 1_000 };
  buildMealPlanPromptContext(preMealContext, catalog).recipeSlots.forEach((slot) => slot.options
    .forEach((option) => runtimeIds.add(option.recipeId)));
  assert.equal(runtimeIds.size, 19);
  const activeIds = buildCulinaryLibrary(base.entries).recipes.filter((recipe) => recipe.status === "ACTIVE")
    .map((recipe) => recipe.id);
  assert.deepEqual(activeIds.filter((id) => !runtimeIds.has(id)).sort(), []);
});

test("PRE_WORKOUT_MEAL offers only the two dedicated vegetable-free curated recipes", () => {
  const base = officialTestCatalog();
  const catalog: CatalogSnapshot = { ...base, portions: [], readiness: assessTrustedNutritionCatalog(base.entries).level };
  const context = generationContext("hypertrophy", ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"]);
  context.mealMacroTargets[1] = { ...context.mealMacroTargets[1], calories: 1_000 };
  const prompt = buildMealPlanPromptContext(context, catalog);
  assert.equal(prompt.recipeSlots[1].intent, "PRE_WORKOUT_MEAL");
  assert.deepEqual(prompt.recipeSlots[1].options.map((option) => option.recipeId).sort(),
    ["PRE_SWEET_POTATO_GRILLED_CHICKEN", "PRE_WHITE_RICE_GRILLED_CHICKEN"]);
  assert.ok(prompt.recipeSlots[1].options.every((option) => option.mealIntent === "PRE_WORKOUT_MEAL"
    && option.components.every((component) => component.componentId !== "VEGETABLES")));
  const library = buildCulinaryLibrary(base.entries);
  for (const recipeId of ["RICE_CHICKEN_BROCCOLI", "SWEET_POTATO_CHICKEN_BROCCOLI"]) {
    const recipe = library.recipes.find((value) => value.id === recipeId)!;
    assert.ok(recipe.ingredients.some((ingredient) => ingredient.componentId === "VEGETABLES" && ingredient.required));
  }
});

test("the seven previously incompatible recipes now use exact component and source-food mappings", () => {
  const { prompt } = exact2500Fixture();
  const contexts = [prompt, (() => {
    const base = officialTestCatalog();
    const catalog: CatalogSnapshot = { ...base, portions: [], readiness: assessTrustedNutritionCatalog(base.entries).level };
    const context = generationContext("hypertrophy", ["BREAKFAST", "SNACK", "POST_WORKOUT", "EVENING_MEAL"]);
    return buildMealPlanPromptContext(context, catalog);
  })()];
  const options = contexts.flatMap((value) => value.recipeSlots.flatMap((slot) => slot.options));
  for (const recipeId of ["COUSCOUS_BOILED_EGGS", "FRENCH_BREAD_GRILLED_CHICKEN",
    "FRENCH_BREAD_MINAS_CHEESE_APPLE", "RICE_BEANS_BEEF_CARROT", "RICE_BEANS_CHICKEN_CARROT",
    "RICE_BEEF_BROCCOLI", "RICE_CHICKEN_CARROT"]) {
    const matches = options.filter((option) => option.recipeId === recipeId);
    assert.ok(matches.length > 0, recipeId);
    assert.ok(matches.every((option) => option.components.every((component) => component.catalogEntryIds.length > 0)));
  }
});

test("recipe identity, ingredients and portion bounds fail closed", () => {
  const { catalog, context, prompt, candidate } = exact2500Fixture();
  const invalidIdentity = structuredClone(candidate);
  invalidIdentity.meals[0].recipeId = "AI_INVENTED_RECIPE";
  const identityReport = validateMealPlanCandidate(context, invalidIdentity, catalog, prompt.candidates,
    prompt.templateSlots, prompt.recipeSlots);
  assert.ok(identityReport.issues.some((issue) => issue.code === "VALID_RECIPE_ID"));

  const invalidIngredient = structuredClone(candidate);
  invalidIngredient.meals[0].items[0].catalogEntryId = prompt.candidates
    .find((entry) => !candidate.meals[0].items.some((item) => item.catalogEntryId === entry.catalogEntryId))!.catalogEntryId;
  const ingredientReport = validateMealPlanCandidate(context, invalidIngredient, catalog, prompt.candidates,
    prompt.templateSlots, prompt.recipeSlots);
  assert.ok(ingredientReport.issues.some((issue) => issue.code === "RECIPE_INGREDIENT_AUTHORIZED"));

  const invalidPortion = structuredClone(candidate);
  invalidPortion.meals[0].items[0].quantityGrams = 999;
  const portionReport = validateMealPlanCandidate(context, invalidPortion, catalog, prompt.candidates,
    prompt.templateSlots, prompt.recipeSlots);
  assert.ok(portionReport.issues.some((issue) => issue.code === "RECIPE_PORTION_RANGE"));
});

test("daily variety never restores a disliked food that catalog filtering removed", () => {
  const base = officialTestCatalog();
  const catalog: CatalogSnapshot = { ...base, portions: [], readiness: assessTrustedNutritionCatalog(base.entries).level };
  const context = generationContext("hypertrophy", ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"]);
  context.dislikedFoods = ["Banana, prata, crua"];
  const bananaId = base.entries.find((entry) => entry.canonicalName === "Banana, prata, crua")!.id;
  const prompt = buildMealPlanPromptContext(context, catalog);
  assert.ok(prompt.recipeSlots.every((slot) => slot.options.every((option) => option.components.every((component) =>
    !component.catalogEntryIds.includes(bananaId)))));
});

test("local exact-2500 generation remains recipe-bound and yields a recognizable validated day", async (t) => {
  const { base, context, prompt, candidate } = exact2500Fixture();
  const balancedRepair = humanBalanced2500Candidate(prompt);
  let repairCalls = 0;
  const result = await generateValidatedMealPlan({
    context,
    catalogRepository: new InMemoryNutritionFoodCatalogRepository(base.entries),
    candidateGenerator: {
      generate: async () => structuredClone(candidate),
      repair: async (_context, _previous, issues) => {
        repairCalls += 1;
        assert.ok(issues.some((issue) => issue.code === "HUMAN_PORTION_BALANCE"));
        return structuredClone(balancedRepair);
      },
    },
  });
  assert.equal(result.status, "ACTIVE", JSON.stringify(result.report.issues));
  assert.equal(repairCalls, 1);
  if (result.status !== "ACTIVE") return;
  assert.ok(result.plan.meals.every((meal) => meal.recipeId && meal.recipeVersion === CULINARY_LIBRARY_VERSION));
  assert.equal(result.report.coherence?.valid, true);
  assert.equal(validateDailyMealQuality(result.plan).valid, true);
  assert.equal(validatePortionRealism(result.plan).valid, true);
  const variety = assessDailyCulinaryVariety(result.plan, prompt.recipeSlots, prompt.templateSlots);
  assert.equal(variety.repeatedRecipeFamilies.length, 0);
  assert.equal(variety.repeatedCatalogEntryIds.length, 0);
  assert.ok(result.plan.meals.flatMap((meal) => meal.items).every((item) => item.quantityUnit === "g"
    && item.preparationState));
  t.diagnostic(`FINAL_TOTALS=${JSON.stringify(result.plan.totals)}`);
  t.diagnostic(`FINAL_MEALS=${JSON.stringify(result.plan.meals.map((meal) => ({
    role: meal.role, intent: prompt.recipeSlots[meal.position - 1].intent, recipeId: meal.recipeId,
    displayName: meal.recipeDisplayName, totals: meal.totals,
  })))}`);
  t.diagnostic(`DAILY_VARIETY=${JSON.stringify(variety)}`);
  t.diagnostic(`HUMAN_READABLE_DAY=\n${humanReadableMealPlan(result.plan)}`);
});

test("Brazilian four-meal exact-2500 routine keeps breakfast, lunch, afternoon snack and dinner", async (t) => {
  const base = officialTestCatalog();
  const target = { status: "active" as const, calories: 2500, proteinG: 110, carbsG: 359.75, fatG: 69, fiberG: 35 };
  const structure = resolveRecommendedMealStructure({
    wakeTime: "07:00", sleepTime: "23:00", routinePredictability: "predictable",
    mealBreakAvailability: "flexible", preferredTrainingPeriod: "evening",
    preparationStyle: "cook_some", goal: "hypertrophy",
  }, target, getNutritionGoalStrategy("hypertrophy"));
  const context = generationContext("hypertrophy", structure.mealRoles);
  context.target = target;
  context.mealCount = structure.recommendedMealsPerDay;
  context.mealWindows = structure.mealWindows;
  context.mealMacroTargets = structure.macroDistribution;
  context.trainingPeriod = "evening";
  const catalog: CatalogSnapshot = { ...base, portions: [], readiness: assessTrustedNutritionCatalog(base.entries).level };
  const prompt = buildMealPlanPromptContext(context, catalog);
  const recipeIds = ["FRENCH_BREAD_BOILED_EGGS_BANANA", "RICE_BEANS_CHICKEN_BROCCOLI",
    "FRENCH_BREAD_MINAS_CHEESE_APPLE", "RICE_BEANS_BEEF_CARROT"];
  const candidate: AiMealPlanCandidate = { meals: prompt.recipeSlots.map((slot, index) => {
    const recipe = slot.options.find((option) => option.recipeId === recipeIds[index])!;
    assert.ok(recipe, `${slot.intent}:${recipeIds[index]}`);
    return {
      role: slot.role, templateId: recipe.templateId, variantId: recipe.templateVariantId,
      recipeId: recipe.recipeId, recipeVersion: recipe.recipeVersion, recipeFamilyId: recipe.recipeFamilyId,
      recipeVariantId: recipe.recipeVariantId, label: recipe.recipeDisplayName,
      items: recipe.components.filter((component) => component.required || component.componentId === "COOKING_FAT")
        .map((component) => ({ componentId: component.componentId, slot: component.slot,
          catalogEntryId: component.catalogEntryIds[0],
          quantityGrams: component.componentId === "COOKING_FAT" ? 10 : component.referenceGrams })),
    };
  }) };
  const result = await generateValidatedMealPlan({
    context, catalogRepository: new InMemoryNutritionFoodCatalogRepository(base.entries),
    candidateGenerator: { generate: async () => structuredClone(candidate), repair: async () => structuredClone(candidate) },
  });
  assert.equal(result.status, "ACTIVE", JSON.stringify(result.report.issues));
  if (result.status !== "ACTIVE") return;
  assert.deepEqual(prompt.dailyBlueprint.mealIntents.map((meal) => meal.mealDisplayType),
    ["BREAKFAST", "LUNCH", "AFTERNOON_SNACK", "DINNER"]);
  assert.equal(result.report.coherence?.valid, true);
  assert.equal(validateDailyMealQuality(result.plan).valid, true);
  assert.equal(validatePortionRealism(result.plan).valid, true);
  for (const meal of [result.plan.meals[1], result.plan.meals[3]]) {
    const rice = meal.items.find((item) => item.componentId === "RICE")!.quantityGrams;
    const beans = meal.items.find((item) => item.componentId === "BEANS")!.quantityGrams;
    assert.ok(rice / beans <= 2.25, JSON.stringify({ position: meal.position, rice, beans }));
  }
  t.diagnostic(`BRAZILIAN_FOUR_MEAL_TOTALS=${JSON.stringify(result.plan.totals)}`);
  t.diagnostic(`BRAZILIAN_FOUR_MEAL_MACROS=${JSON.stringify(result.plan.meals.map((meal, index) => ({
    mealDisplayType: prompt.dailyBlueprint.mealIntents[index].mealDisplayType,
    trainingRelation: prompt.dailyBlueprint.mealIntents[index].trainingRelation,
    totals: meal.totals,
  })))}`);
  t.diagnostic(`BRAZILIAN_FOUR_MEAL_DAY=\n${humanReadableMealPlan(result.plan)}`);
});

test("activation persistence keeps recipe and presentation identity in item metadata without a migration", () => {
  const source = readFileSync(new URL("../database-activation.ts", import.meta.url), "utf8");
  for (const field of ["recipeId", "recipeVersion", "recipeFamilyId", "recipeVariantId", "recipeDisplayName",
    "preparationState", "presentationDisplayName", "presentationDisplayUnit"]) {
    assert.match(source, new RegExp(`${field}:`));
  }
});
