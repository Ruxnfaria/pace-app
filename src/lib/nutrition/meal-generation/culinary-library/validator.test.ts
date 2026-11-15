import assert from "node:assert/strict";
import test from "node:test";
import { officialTestCatalog } from "../test-helpers";
import type { CulinaryLibrary, RecipeSelection } from "./domain";
import { adjustRecipeQuantities } from "./quantity-adjustment";
import { buildCulinaryLibrary } from "./registry";
import { defaultRecipeSelection, recipeAllowsFatCompletion, recipeAllowsIngredient,
  validateRecipeSelection } from "./validator";

const setup = () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const selection = defaultRecipeSelection(library, "RICE_BEANS_CHICKEN_BROCCOLI")!;
  return { library, selection };
};

const codes = (library: CulinaryLibrary, selection: RecipeSelection) =>
  validateRecipeSelection(library, selection).issues.map((issue) => issue.code);

test("unknown recipe and arbitrary food composition are not Golden Recipes", () => {
  const { library, selection } = setup();
  const arbitrary = { ...selection, recipeId: "ARBITRARY_MACRO_COMPOSITION" };
  const report = validateRecipeSelection(library, arbitrary);
  assert.equal(report.valid, false);
  assert.equal(report.recognized, false);
  assert.deepEqual(report.issues.map((issue) => issue.code), ["UNKNOWN_RECIPE"]);
});

test("a server-defined recipe cannot be relabeled as an unknown variant", () => {
  const { library, selection } = setup();
  const report = validateRecipeSelection(library, { ...selection, variantId: "INVENTED_VARIANT" });
  assert.equal(report.valid, false);
  assert.equal(report.recognized, false);
  assert.ok(report.issues.some((issue) => issue.code === "UNKNOWN_VARIANT"));
});

test("unknown component and food outside the component allowlist are rejected", () => {
  const { library, selection } = setup();
  const unknownComponent = structuredClone(selection);
  unknownComponent.ingredients.push({ componentId: "WHEY", catalogEntryId: "global-food", nutritionQuantityGrams: 30 });
  assert.ok(codes(library, unknownComponent).includes("UNKNOWN_COMPONENT"));

  const wrongFood = structuredClone(selection);
  wrongFood.ingredients[0].catalogEntryId = selection.ingredients[1].catalogEntryId;
  assert.ok(codes(library, wrongFood).includes("FOOD_NOT_ALLOWED_FOR_COMPONENT"));
});

test("required ingredients and recipe quantity boundaries are enforced", () => {
  const { library, selection } = setup();
  const missing = structuredClone(selection);
  missing.ingredients = missing.ingredients.filter((item) => item.componentId !== "PROTEIN");
  assert.ok(codes(library, missing).includes("REQUIRED_INGREDIENT_MISSING"));

  const low = structuredClone(selection);
  low.ingredients[0].nutritionQuantityGrams = 0;
  assert.ok(codes(library, low).includes("QUANTITY_BELOW_MINIMUM"));

  const high = structuredClone(selection);
  high.ingredients[0].nutritionQuantityGrams = 999;
  assert.ok(codes(library, high).includes("QUANTITY_ABOVE_MAXIMUM"));

  const offIncrement = structuredClone(selection);
  offIncrement.ingredients[0].nutritionQuantityGrams += 1;
  assert.ok(codes(library, offIncrement).includes("QUANTITY_INCREMENT_INVALID"));
});

test("authoritative preparation state cannot be changed by a recipe", () => {
  const { library, selection } = setup();
  const altered = structuredClone(library);
  altered.recipes.find((recipe) => recipe.id === selection.recipeId)!
    .ingredients.find((ingredient) => ingredient.componentId === "PROTEIN")!.preparationState = "RAW";
  assert.ok(codes(altered, selection).includes("PREPARATION_STATE_MISMATCH"));
});

test("quantity solver adjusts only existing ingredients and never changes recipe identity", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const selection = defaultRecipeSelection(library, "FRENCH_BREAD_BOILED_EGGS_BANANA")!;
  const adjusted = adjustRecipeQuantities(library, selection, { BREAD: 80 });
  assert.ok(adjusted);
  assert.equal(adjusted.recipeId, selection.recipeId);
  assert.equal(adjusted.variantId, selection.variantId);
  assert.deepEqual(adjusted.ingredients.map((item) => [item.componentId, item.catalogEntryId]),
    selection.ingredients.map((item) => [item.componentId, item.catalogEntryId]));
  assert.equal(adjustRecipeQuantities(library, selection, { ARBITRARY_INGREDIENT: 30 }), null);
});

test("optional ingredients are recipe-scoped and fat completion cannot use a global food", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const sandwich = library.recipes.find((recipe) => recipe.id === "FRENCH_BREAD_GRILLED_CHICKEN")!;
  const spread = sandwich.ingredients.find((ingredient) => ingredient.componentId === "SPREAD")!;
  assert.equal(spread.required, false);
  assert.equal(recipeAllowsIngredient(sandwich, "SPREAD", spread.allowedCatalogEntryIds[0]), true);
  assert.equal(recipeAllowsFatCompletion(sandwich, "SPREAD", spread.allowedCatalogEntryIds[0]), true);

  const breadEggs = library.recipes.find((recipe) => recipe.id === "FRENCH_BREAD_BOILED_EGGS_BANANA")!;
  assert.equal(recipeAllowsIngredient(breadEggs, "SPREAD", spread.allowedCatalogEntryIds[0]), false);
  assert.equal(recipeAllowsFatCompletion(breadEggs, "SPREAD", spread.allowedCatalogEntryIds[0]), false);
  assert.equal(recipeAllowsFatCompletion(sandwich, "SPREAD", "GLOBAL_FAT_FOOD"), false);
});
