import assert from "node:assert/strict";
import test from "node:test";
import { officialTestCatalog } from "../test-helpers";
import type { CulinaryLibrary, LiquidMeasurementAuthority, RecipeSelection } from "./domain";
import { presentRecipe } from "./presentation";
import { buildCulinaryLibrary } from "./registry";
import { defaultRecipeSelection } from "./validator";

test("solid foods preserve authoritative grams and prepared-state names", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const selection = defaultRecipeSelection(library, "RICE_BEANS_CHICKEN_BROCCOLI")!;
  const presentation = presentRecipe(library, selection)!;
  assert.ok(presentation.ingredients.every((ingredient) => ingredient.displayUnit === "g"
    && ingredient.displayQuantity === ingredient.nutritionQuantityGrams));
  assert.equal(presentation.ingredients.find((ingredient) => ingredient.componentId === "RICE")?.displayName,
    "Arroz branco cozido");
  assert.equal(presentation.ingredients.find((ingredient) => ingredient.componentId === "PROTEIN")?.preparationState,
    "GRILLED");
});

test("liquid stays in grams without explicit conversion authority", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const selection = defaultRecipeSelection(library, "YOGURT_OATS_BANANA")!;
  const yogurt = presentRecipe(library, selection)!.ingredients.find((item) => item.componentId === "YOGURT")!;
  assert.equal(yogurt.displayUnit, "g");
  assert.equal(yogurt.displayQuantity, yogurt.nutritionQuantityGrams);
});

test("test-only authorized liquid conversion can present ml without changing nutrition grams", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const selection = defaultRecipeSelection(library, "YOGURT_OATS_BANANA")!;
  const yogurtSelection = selection.ingredients.find((item) => item.componentId === "YOGURT")!;
  const testOnlyAuthority: LiquidMeasurementAuthority = {
    catalogEntryId: yogurtSelection.catalogEntryId, displayUnit: "ml", gramsPerMl: 1.02,
    source: "TEST_ONLY", sourceVersion: "test-only-v1", authorityType: "LAB_MEASUREMENT",
  };
  const yogurt = presentRecipe(library, selection, [testOnlyAuthority])!
    .ingredients.find((item) => item.componentId === "YOGURT")!;
  assert.equal(yogurt.displayUnit, "ml");
  assert.equal(yogurt.displayQuantity, 166.7);
  assert.equal(yogurt.nutritionQuantityGrams, 170);
});

test("presentation refuses an invalid or arbitrary composition", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const selection = defaultRecipeSelection(library, "YOGURT_OATS_BANANA")!;
  const arbitrary: RecipeSelection = { ...selection, recipeId: "ARBITRARY" };
  assert.equal(presentRecipe(library, arbitrary), null);
});

// Compile-time assertions keep production registries independent from test-only authorities.
void ({} as CulinaryLibrary);
