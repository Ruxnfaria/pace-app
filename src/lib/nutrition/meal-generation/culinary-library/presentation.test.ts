import assert from "node:assert/strict";
import test from "node:test";
import { officialTestCatalog } from "../test-helpers";
import type { CountableMeasurementAuthority, CulinaryLibrary, LiquidMeasurementAuthority, RecipeSelection } from "./domain";
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

test("liquid authority falls back to grams rather than presenting artificial ml precision", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const selection = defaultRecipeSelection(library, "YOGURT_OATS_BANANA")!;
  const yogurtSelection = selection.ingredients.find((item) => item.componentId === "YOGURT")!;
  const testOnlyAuthority: LiquidMeasurementAuthority = {
    catalogEntryId: yogurtSelection.catalogEntryId, displayUnit: "ml", gramsPerMl: 1.02, displayIncrementMl: 10,
    source: "TEST_ONLY", sourceVersion: "test-only-v1", authorityType: "LAB_MEASUREMENT",
  };
  const presentation = presentRecipe(library, selection, [testOnlyAuthority])!;
  const yogurt = presentation.ingredients.find((item) => item.componentId === "YOGURT")!;
  assert.equal(yogurt.displayUnit, "g");
  assert.equal(yogurt.displayQuantity, 170);
  assert.equal(yogurt.nutritionQuantityGrams, 170);
  assert.equal(presentation.lines[0].text, "170 g de iogurte natural");
});

test("test-only liquid authority presents ml only at an exact authorized display increment", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const selection = defaultRecipeSelection(library, "YOGURT_OATS_BANANA")!;
  const yogurtSelection = selection.ingredients.find((item) => item.componentId === "YOGURT")!;
  yogurtSelection.nutritionQuantityGrams = 200;
  const testOnlyAuthority: LiquidMeasurementAuthority = {
    catalogEntryId: yogurtSelection.catalogEntryId, displayUnit: "ml", gramsPerMl: 1,
    displayIncrementMl: 10, source: "TEST_ONLY", sourceVersion: "test-only-v1", authorityType: "LAB_MEASUREMENT",
  };
  const presentation = presentRecipe(library, selection, [testOnlyAuthority])!;
  const yogurt = presentation.ingredients.find((item) => item.componentId === "YOGURT")!;
  assert.equal(yogurt.displayUnit, "ml");
  assert.equal(yogurt.displayQuantity, 200);
  assert.equal(yogurt.nutritionQuantityGrams, 200);
  assert.equal(presentation.lines[0].text, "200 mL de iogurte natural");
});

test("countable portions use natural singular and plural without changing authoritative grams", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const selection = defaultRecipeSelection(library, "FRENCH_BREAD_BOILED_EGGS_BANANA")!;
  const byComponent = new Map(selection.ingredients.map((ingredient) => [ingredient.componentId, ingredient]));
  byComponent.get("BREAD")!.nutritionQuantityGrams = 50;
  byComponent.get("EGGS")!.nutritionQuantityGrams = 100;
  byComponent.get("FRUIT")!.nutritionQuantityGrams = 100;
  const authoritativeSelection = structuredClone(selection);
  const authorities: CountableMeasurementAuthority[] = [
    { catalogEntryId: byComponent.get("BREAD")!.catalogEntryId, gramsPerCount: 50,
      singularName: "pão francês", pluralName: "pães franceses", source: "TEST_ONLY", sourceVersion: "test-v1",
      authorityType: "CURATED_PORTION" },
    { catalogEntryId: byComponent.get("EGGS")!.catalogEntryId, gramsPerCount: 50,
      singularName: "ovo cozido", pluralName: "ovos cozidos", source: "TEST_ONLY", sourceVersion: "test-v1",
      authorityType: "CURATED_PORTION" },
    { catalogEntryId: byComponent.get("FRUIT")!.catalogEntryId, gramsPerCount: 100,
      singularName: "banana", pluralName: "bananas", source: "TEST_ONLY", sourceVersion: "test-v1",
      authorityType: "CURATED_PORTION" },
  ];
  const presentation = presentRecipe(library, selection, [], authorities)!;
  assert.deepEqual(presentation.lines.map((line) => line.text), [
    "1 pão francês com 2 ovos cozidos",
    "1 banana",
  ]);
  assert.equal(presentation.lines.reduce((total, line) => total + line.nutritionQuantityGrams, 0), 250);
  assert.deepEqual(presentation.ingredients.map((ingredient) => ingredient.nutritionQuantityGrams), [50, 100, 100]);
  assert.deepEqual(selection, authoritativeSelection);
});

test("non-exact countable equivalence falls back to grams instead of rounding a portion", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const selection = defaultRecipeSelection(library, "FRENCH_BREAD_BOILED_EGGS_BANANA")!;
  const bread = selection.ingredients.find((ingredient) => ingredient.componentId === "BREAD")!;
  bread.nutritionQuantityGrams = 70;
  const authority: CountableMeasurementAuthority = { catalogEntryId: bread.catalogEntryId, gramsPerCount: 50,
    singularName: "pão francês", pluralName: "pães franceses", source: "TEST_ONLY", sourceVersion: "test-v1",
    authorityType: "CURATED_PORTION" };
  const presentation = presentRecipe(library, selection, [], [authority])!;
  const displayedBread = presentation.ingredients.find((ingredient) => ingredient.componentId === "BREAD")!;
  assert.equal(displayedBread.displayUnit, "g");
  assert.equal(displayedBread.displayQuantity, 70);
});

test("test-only apple authority presents a natural count while preserving its exact nutrition grams", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const selection = defaultRecipeSelection(library, "FRENCH_BREAD_MINAS_CHEESE_APPLE")!;
  const apple = selection.ingredients.find((ingredient) => ingredient.componentId === "FRUIT")!;
  apple.nutritionQuantityGrams = 100;
  const authority: CountableMeasurementAuthority = { catalogEntryId: apple.catalogEntryId, gramsPerCount: 100,
    singularName: "maçã", pluralName: "maçãs", source: "TEST_ONLY", sourceVersion: "test-v1",
    authorityType: "CURATED_PORTION" };
  const presentation = presentRecipe(library, selection, [], [authority])!;
  const displayedApple = presentation.ingredients.find((ingredient) => ingredient.componentId === "FRUIT")!;
  assert.equal(displayedApple.displayUnit, "count");
  assert.equal(displayedApple.displayQuantity, 1);
  assert.equal(displayedApple.nutritionQuantityGrams, 100);
  assert.ok(presentation.lines.some((line) => line.text === "1 maçã"));
});

test("weighted foods preserve culinary order and natural de-grammar", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const selection = defaultRecipeSelection(library, "RICE_BEANS_CHICKEN_BROCCOLI")!;
  const presentation = presentRecipe(library, selection)!;
  assert.deepEqual(presentation.lines.map((line) => line.text), [
    "180 g de arroz branco cozido",
    "100 g de feijão carioca cozido",
    "130 g de peito de frango grelhado",
    "100 g de brócolis cozido",
  ]);
});

test("presentation refuses an invalid or arbitrary composition", () => {
  const library = buildCulinaryLibrary(officialTestCatalog().entries);
  const selection = defaultRecipeSelection(library, "YOGURT_OATS_BANANA")!;
  const arbitrary: RecipeSelection = { ...selection, recipeId: "ARBITRARY" };
  assert.equal(presentRecipe(library, arbitrary), null);
});

// Compile-time assertions keep production registries independent from test-only authorities.
void ({} as CulinaryLibrary);
