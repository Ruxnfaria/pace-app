import assert from "node:assert/strict";
import test from "node:test";
import { assessTrustedNutritionCatalog, calculateCatalogCoverage, isTrustedNutritionCatalogReady } from "./capabilities";
import { FOOD_COVERAGE_CATEGORIES, MEAL_PLAN_GENERATION_AVAILABLE, type NutritionFoodCatalogEntry } from "./domain";
import { resolveMealPlanGenerationEligibility } from "./eligibility";
import { TACO_SOURCE_REFERENCE, TACO_SOURCE_VERSION } from "./taco/constants";
import { TEST_ONLY_FOOD_CATALOG } from "./test-fixtures";

function productionCatalog(allergenDataComplete = false): NutritionFoodCatalogEntry[] {
  return FOOD_COVERAGE_CATEGORIES.map((category, index) => ({
    ...TEST_ONLY_FOOD_CATALOG[0],
    id: `taco-${index}`,
    source: "TACO",
    sourceFoodId: String(index + 1),
    sourceVersion: TACO_SOURCE_VERSION,
    sourceReference: TACO_SOURCE_REFERENCE,
    catalogScope: "PRODUCTION",
    foodGroup: category,
    sourceMetadata: { coverageCategories: [category], catalogVersion: "praxe-food-catalog-taco-v1" },
    allergenDataComplete,
    dietaryTags: [],
  }));
}

test("tables and test fixtures never make the catalog ready", () => {
  assert.equal(MEAL_PLAN_GENERATION_AVAILABLE, false);
  assert.equal(isTrustedNutritionCatalogReady(TEST_ONLY_FOOD_CATALOG), false);
  assert.equal(assessTrustedNutritionCatalog(TEST_ONLY_FOOD_CATALOG).level, "CATALOG_DEVELOPMENT_ONLY");
  assert.equal(calculateCatalogCoverage(TEST_ONLY_FOOD_CATALOG).productionEntries, 0);
});

test("recognized TACO coverage is base-ready but not restriction-safe", () => {
  const status = assessTrustedNutritionCatalog(productionCatalog());
  assert.equal(status.level, "CATALOG_BASE_NUTRITION_READY");
  assert.equal(isTrustedNutritionCatalogReady(productionCatalog()), true);
  assert.deepEqual(status.coverage.missingCategories, []);
  assert.equal(status.restrictionMetadataComplete, false);
});

test("meal-plan eligibility allows base nutrition and fails closed for restrictions", () => {
  const base = assessTrustedNutritionCatalog(productionCatalog());
  assert.equal(resolveMealPlanGenerationEligibility({
    isAdult: true, hasCriticalAllergy: false, hasFoodRestriction: false,
    dietaryPattern: "omnivore", restrictionSafetyKnown: true,
  }, base).status, "ELIGIBLE");
  assert.equal(resolveMealPlanGenerationEligibility({
    isAdult: true, hasCriticalAllergy: true, hasFoodRestriction: false,
    dietaryPattern: "omnivore", restrictionSafetyKnown: false,
  }, base).status, "REQUIRES_REVIEW");
  const restrictionSafe = assessTrustedNutritionCatalog(productionCatalog(true));
  assert.equal(restrictionSafe.level, "CATALOG_RESTRICTION_SAFE");
});
