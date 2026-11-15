import assert from "node:assert/strict";
import test from "node:test";
import { allRealMealTemplates } from "../real-meal-templates/registry";
import { officialTestCatalog } from "../test-helpers";
import { auditRecipeFeasibility } from "./feasibility";
import { CULINARY_LIBRARY_VERSION } from "./domain";
import { buildCulinaryLibrary, PRODUCTION_LIQUID_MEASUREMENT_AUTHORITIES_V1,
  tacoContainsAuthorizedWhey } from "./registry";
import { defaultRecipeSelection, recipeSupportsIntent, validateRecipeSelection } from "./validator";

test("golden registry is small, deterministic, TACO-backed, and separate from RealMealTemplate", () => {
  const catalog = officialTestCatalog();
  const first = buildCulinaryLibrary(catalog.entries);
  const second = buildCulinaryLibrary(catalog.entries);
  assert.equal(first.version, CULINARY_LIBRARY_VERSION);
  assert.equal(first.recipes.length, 18);
  assert.deepEqual(first.recipes, second.recipes);
  assert.ok(first.recipes.every((recipe) => recipe.version === CULINARY_LIBRARY_VERSION
    && recipe.compatibleRealMealTemplateIds.length > 0));
  const realTemplateIds = new Set(allRealMealTemplates().map((value) => value.id));
  assert.ok(first.recipes.filter((recipe) => recipe.status === "ACTIVE")
    .every((recipe) => recipe.compatibleRealMealTemplateIds.some((id) => realTemplateIds.has(id))));
  assert.equal(tacoContainsAuthorizedWhey(catalog.entries), false);
});

test("all active Golden Recipes are feasible and recognized with their reference portions", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const reports = library.recipes.map((recipe) => auditRecipeFeasibility(library, recipe));
  assert.equal(reports.filter((report) => report.status === "FEASIBLE").length, 17);
  assert.equal(reports.filter((report) => report.status === "BLOCKED_MISSING_AUTHORITY").length, 1);
  for (const recipe of library.recipes.filter((value) => value.status === "ACTIVE")) {
    const selection = defaultRecipeSelection(library, recipe.id);
    assert.ok(selection);
    const report = validateRecipeSelection(library, selection);
    assert.equal(report.valid, true, `${recipe.id}: ${JSON.stringify(report.issues)}`);
    assert.equal(report.recognized, true);
  }
});

test("whey shake remains fail-closed without supplement label authority", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const shake = library.recipes.find((recipe) => recipe.id === "SHAKE_WHEY_BANANA_OATS_MILK")!;
  assert.equal(shake.status, "BLOCKED_MISSING_SUPPLEMENT_AUTHORITY");
  assert.equal(shake.ingredients.find((ingredient) => ingredient.componentId === "PROTEIN_SUPPLEMENT")
    ?.nutritionAuthority, "SUPPLEMENT_LABEL");
  assert.equal(auditRecipeFeasibility(library, shake).status, "BLOCKED_MISSING_AUTHORITY");
});

test("the same concrete recipe may be used by multiple meal intents without becoming a Meal", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const recipe = library.recipes.find((value) => value.id === "FRENCH_BREAD_BOILED_EGGS_BANANA")!;
  assert.ok(recipe.allowedMealIntents.includes("BREAKFAST"));
  assert.ok(recipe.allowedMealIntents.includes("PRE_WORKOUT_SNACK"));
  assert.equal(recipe.allowedMealIntents.includes("MAIN_MEAL"), false);
});

test("recipe role matrix distinguishes culinary recognition from meal-intent suitability", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const main = library.recipes.find((recipe) => recipe.id === "RICE_BEANS_CHICKEN_BROCCOLI")!;
  assert.equal(recipeSupportsIntent(main, "BREAKFAST"), false);
  assert.equal(recipeSupportsIntent(main, "SNACK"), false);
  assert.equal(recipeSupportsIntent(main, "PRE_WORKOUT_SNACK"), false);
  assert.equal(recipeSupportsIntent(main, "POST_WORKOUT_MAIN"), true);
  assert.equal(recipeSupportsIntent(main, "MAIN_MEAL"), true);
  assert.equal(recipeSupportsIntent(main, "EVENING_MAIN"), true);

  const yogurt = library.recipes.find((recipe) => recipe.id === "YOGURT_OATS_BANANA")!;
  for (const intent of ["BREAKFAST", "SNACK", "PRE_WORKOUT_SNACK", "EVENING_SNACK"] as const) {
    assert.equal(recipeSupportsIntent(yogurt, intent), true);
  }
  const breadCheese = library.recipes.find((recipe) => recipe.id === "FRENCH_BREAD_MINAS_CHEESE_BANANA")!;
  for (const intent of ["BREAKFAST", "SNACK", "PRE_WORKOUT_SNACK"] as const) {
    assert.equal(recipeSupportsIntent(breadCheese, intent), true);
  }
});

test("reference portions are distinct from solver bounds", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const oats = library.recipes.find((recipe) => recipe.id === "YOGURT_OATS_BANANA")!
    .ingredients.find((ingredient) => ingredient.componentId === "OATS")!;
  assert.equal(oats.referenceQuantity, 40);
  assert.equal(oats.minimumQuantity, 20);
  assert.equal(oats.maximumQuantity, 100);

  const chicken = library.recipes.find((recipe) => recipe.id === "FRENCH_BREAD_GRILLED_CHICKEN")!
    .ingredients.find((ingredient) => ingredient.componentId === "PROTEIN")!;
  assert.equal(chicken.referenceQuantity, 90);
  assert.equal(chicken.maximumQuantity, 220);
});

test("production liquid ml registry remains empty until conversion authority exists", () => {
  assert.equal(PRODUCTION_LIQUID_MEASUREMENT_AUTHORITIES_V1.length, 0);
});

test("blocked shake keeps its four culinary components", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const shake = library.recipes.find((recipe) => recipe.id === "SHAKE_WHEY_BANANA_OATS_MILK")!;
  assert.deepEqual(shake.ingredients.map((ingredient) => ingredient.componentId),
    ["LIQUID_BASE", "PROTEIN_SUPPLEMENT", "FRUIT", "CARB_COMPLEMENT"]);
});
