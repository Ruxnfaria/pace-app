import assert from "node:assert/strict";
import test from "node:test";
import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import { buildMealPlanCandidateSet } from "./candidate-set";
import { balancedCandidate, generationContext, officialTestCatalog } from "./test-helpers";
import { validateMealPlanCandidate } from "./validator";

function snapshot() {
  const catalog = officialTestCatalog();
  return { ...catalog, portions: [], readiness: assessTrustedNutritionCatalog(catalog.entries).level };
}

function codes(report: ReturnType<typeof validateMealPlanCandidate>) { return report.issues.filter((issue) => issue.severity === "HARD_FAILURE").map((issue) => issue.code); }

function validate(context: ReturnType<typeof generationContext>, candidate: ReturnType<typeof balancedCandidate>, catalog = snapshot()) {
  return validateMealPlanCandidate(context, candidate, catalog, buildMealPlanCandidateSet(context, catalog));
}

for (const [goal, roles] of [
  ["fat_loss", ["BREAKFAST", "MAIN_MEAL", "EVENING_MEAL"]],
  ["hypertrophy", ["BREAKFAST", "MAIN_MEAL", "EVENING_MEAL"]],
  ["conditioning", ["PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"]],
] as const) {
  test(`${goal} accepts a complete TACO-backed plan within daily and goal tolerances`, () => {
    const context = generationContext(goal, [...roles]);
    const report = validate(context, balancedCandidate([...roles]));
    assert.equal(report.valid, true, JSON.stringify(report.issues));
    assert.equal(report.plan?.totals.calories, context.target.calories);
    assert.equal(report.plan?.meals[0].items[0].food.source, "TACO");
    assert.ok(report.preferenceScore > 0);
  });
}

test("fat-loss rejects low protein, high calories and disliked food with exact codes", () => {
  const context = generationContext("fat_loss");
  context.target = { ...context.target, calories: context.target.calories * 0.7, proteinG: context.target.proteinG * 1.5 };
  context.dislikedFoods = ["Banana, prata, crua"];
  const result = codes(validate(context, balancedCandidate(context.mealRoles)));
  assert.ok(result.includes("CALORIES_OUT_OF_RANGE"));
  assert.ok(result.includes("PROTEIN_OUT_OF_RANGE"));
  assert.ok(result.includes("DISLIKED_FOOD_VIOLATION"));
});

test("hypertrophy rejects excessive fat, low carbs and target mismatch", () => {
  const context = generationContext("hypertrophy");
  context.target = { ...context.target, calories: context.target.calories * 1.3, carbsG: context.target.carbsG * 1.5, fatG: context.target.fatG * 0.5 };
  const result = codes(validate(context, balancedCandidate(context.mealRoles)));
  assert.ok(result.includes("CALORIES_OUT_OF_RANGE"));
  assert.ok(result.includes("CARBS_OUT_OF_RANGE"));
  assert.ok(result.includes("FAT_OUT_OF_RANGE"));
});

test("conditioning rejects energy, carbohydrate and prescribed structure mismatches", () => {
  const roles = ["PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"] as const;
  const context = generationContext("conditioning", [...roles]);
  context.target = { ...context.target, calories: context.target.calories * 1.3, carbsG: context.target.carbsG * 1.4 };
  const candidate = balancedCandidate([...roles]);
  candidate.meals[0].role = "BREAKFAST";
  const result = codes(validate(context, candidate));
  assert.ok(result.includes("CALORIES_OUT_OF_RANGE"));
  assert.ok(result.includes("CARBS_OUT_OF_RANGE"));
  assert.ok(result.includes("MEAL_ROLE_MISMATCH"));
});

test("unknown and non-provided catalog IDs fail closed without name or alias fallback", () => {
  const context = generationContext();
  const unknown = balancedCandidate(context.mealRoles);
  unknown.meals[0].items[0].catalogEntryId = "not-offered-by-server";
  assert.ok(codes(validate(context, unknown)).includes("UNKNOWN_CATALOG_ENTRY_ID"));
});

test("quantity and restriction safety fail closed without inferred metadata", () => {
  const context = generationContext();
  const quantity = balancedCandidate(context.mealRoles);
  quantity.meals[0].items[0].quantityGrams = 1500;
  assert.ok(codes(validate(context, quantity)).includes("IMPOSSIBLE_PORTION"));
  const allergy = generationContext();
  allergy.allergenRestrictions = ["contains_milk"];
  allergy.restrictionSafetyKnown = false;
  assert.ok(codes(validate(allergy, balancedCandidate(allergy.mealRoles))).includes("ALLERGEN_SAFETY_UNVERIFIED"));
  const vegetarian = generationContext();
  vegetarian.dietaryPattern = "vegetarian";
  vegetarian.restrictionSafetyKnown = false;
  assert.ok(codes(validate(vegetarian, balancedCandidate(vegetarian.mealRoles))).includes("DIETARY_PATTERN_UNVERIFIED"));
});

test("display names and nutrients always come from the authoritative catalog", () => {
  const context = generationContext();
  const candidate = balancedCandidate(context.mealRoles);
  const report = validate(context, candidate);
  assert.equal(report.plan?.meals[0].items[0].displayName, "Arroz, tipo 1, cozido");
  assert.equal(report.plan?.meals[0].items[0].resolution, "CATALOG_ENTRY_ID");
  assert.equal(report.plan?.meals[0].items[0].nutrients.calories, 128.26);
});
