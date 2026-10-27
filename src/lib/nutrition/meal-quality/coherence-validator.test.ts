import assert from "node:assert/strict";
import test from "node:test";

import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import { buildMealPlanCandidateSet } from "../meal-generation/candidate-set";
import { balancedCandidate, generationContext, officialTestCatalog } from "../meal-generation/test-helpers";
import { validateMealPlanCandidate } from "../meal-generation/validator";
import { validateMealCoherence } from "./coherence-validator";
import { MEAL_COHERENCE_VALIDATOR_VERSION } from "./domain";

function validPlan() {
  const catalog = officialTestCatalog();
  const snapshot = { ...catalog, portions: [], readiness: assessTrustedNutritionCatalog(catalog.entries).level };
  const context = generationContext("hypertrophy");
  const report = validateMealPlanCandidate(context, balancedCandidate(context.mealRoles), snapshot,
    buildMealPlanCandidateSet(context, snapshot));
  assert.ok(report.plan);
  return structuredClone(report.plan!);
}

test("coherence validator accepts recognizable Brazilian meals and exposes its stable version", () => {
  const report = validateMealCoherence(validPlan(), "hypertrophy");
  assert.equal(report.validatorVersion, MEAL_COHERENCE_VALIDATOR_VERSION);
  assert.equal(report.valid, true, JSON.stringify(report.issues));
});

test("historical bad-plan pattern is rejected with actionable issue codes", () => {
  const plan = validPlan();
  const replacements = ["Açúcar, refinado", "Achocolatado, pó, solúvel", "Farinha, de babaçu", "Doce, de goiaba"];
  replacements.forEach((name, index) => {
    const meal = plan.meals[index % plan.meals.length];
    const item = meal.items[index % meal.items.length];
    item.food.canonicalName = name;
    item.food.normalizedName = name.toLowerCase();
    item.food.sourceFoodId = `bad-${index}`;
    item.slot = "CARB_ANCHOR";
    item.quantityGrams = index === 1 ? 69 : 100;
    item.nutrients = { calories: 380, proteinG: 1, carbsG: 90, fatG: 1, fiberG: 1 };
    meal.totals.carbsG = 100;
  });
  const report = validateMealCoherence(plan, "hypertrophy");
  const codes = new Set(report.issues.map((item) => item.code));
  assert.equal(report.valid, false);
  assert.ok(codes.has("SWEET_AS_PRIMARY_CARB"));
  assert.ok(codes.has("POWDER_AS_MEAL_COMPONENT"));
  assert.ok(codes.has("FOOD_NOT_AUTOGENERATION_APPROVED"));
});

test("chicken-rice-beans breakfast is blocked while a normal main meal remains valid", () => {
  const plan = validPlan();
  plan.meals[0] = { ...plan.meals[1], position: 1, role: "BREAKFAST" };
  const report = validateMealCoherence(plan, "health");
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((item) => item.code === "BREAKFAST_ROLE_MISMATCH"));
});

test("main meal requires real vegetable produce and legumes do not substitute for it", () => {
  const plan = validPlan();
  const main = plan.meals.find((meal) => meal.role === "MAIN_MEAL")!;
  main.items = main.items.filter((item) => !item.food.canonicalName.includes("Brócolis"));
  const report = validateMealCoherence(plan, "health");
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((item) => item.code === "MAIN_MEAL_MISSING_PRODUCE"));
  assert.ok(report.issues.some((item) => item.code === "MEAL_REQUIRED_SLOT_MISSING"));
});

test("supporting food cannot become the largest energy contributor", () => {
  const plan = validPlan();
  const breakfast = plan.meals[0];
  const egg = breakfast.items.find((item) => item.food.sourceFoodId === "488")!;
  egg.quantityGrams = 200;
  egg.nutrients.calories = 291.4;
  const report = validateMealCoherence(plan, "health");
  assert.ok(report.issues.some((item) => item.code === "SUPPORTING_ITEM_DOMINATES_MEAL"));
});

test("substantial pre-workout protein plus fruit still fails without a starch slot", () => {
  const plan = validPlan();
  const breakfast = plan.meals[0];
  breakfast.role = "PRE_WORKOUT";
  breakfast.target.calories = plan.totals.calories;
  breakfast.items = breakfast.items.filter((item) => item.food.sourceFoodId !== "53");
  const report = validateMealCoherence(plan, "hypertrophy");
  assert.ok(report.issues.some((item) => item.code === "MEAL_REQUIRED_SLOT_MISSING"));
});

test("prepared composite beside a separate protein anchor raises slot conflict", () => {
  const plan = validPlan();
  const main = plan.meals.find((meal) => meal.role === "MAIN_MEAL")!;
  const starch = main.items.find((item) => item.slot === "CARB_ANCHOR")!;
  const composite = officialTestCatalog().entries.find((entry) => entry.sourceFoodId === "542")!;
  starch.food = composite;
  starch.foodQuery = composite.canonicalName;
  starch.displayName = composite.canonicalName;
  const report = validateMealCoherence(plan, "health");
  assert.ok(report.issues.some((item) => item.code === "COMPOSITE_DISH_SLOT_CONFLICT"));
});
