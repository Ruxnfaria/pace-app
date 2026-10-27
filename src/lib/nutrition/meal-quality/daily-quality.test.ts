import assert from "node:assert/strict";
import test from "node:test";

import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import { buildMealPlanCandidateSet } from "../meal-generation/candidate-set";
import { balancedCandidate, generationContext, officialTestCatalog } from "../meal-generation/test-helpers";
import { validateMealPlanCandidate } from "../meal-generation/validator";
import { validateDailyMealQuality } from "./daily-quality";

function plan() {
  const catalog = officialTestCatalog();
  const snapshot = { ...catalog, portions: [], readiness: assessTrustedNutritionCatalog(catalog.entries).level };
  const context = generationContext();
  const report = validateMealPlanCandidate(context, balancedCandidate(context.mealRoles), snapshot,
    buildMealPlanCandidateSet(context, snapshot));
  assert.ok(report.plan);
  return structuredClone(report.plan!);
}

test("daily quality requires vegetable produce in every main-style meal", () => {
  const value = plan();
  assert.equal(validateDailyMealQuality(value).valid, true);
  const evening = value.meals.find((meal) => meal.role === "EVENING_MEAL")!;
  evening.items = evening.items.filter((item) => !item.food.canonicalName.includes("Brócolis"));
  const report = validateDailyMealQuality(value);
  assert.equal(report.valid, false);
  assert.equal(report.mainMealCount, 2);
  assert.equal(report.mainMealsWithProduce, 1);
});
