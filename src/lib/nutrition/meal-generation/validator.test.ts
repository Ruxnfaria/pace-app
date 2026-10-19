import assert from "node:assert/strict";
import test from "node:test";
import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import { normalizeFoodQuery } from "../food-catalog/normalization";
import { balancedCandidate, generationContext, officialTestCatalog } from "./test-helpers";
import { validateMealPlanCandidate } from "./validator";

function snapshot() {
  const catalog = officialTestCatalog();
  return { ...catalog, portions: [], readiness: assessTrustedNutritionCatalog(catalog.entries).level };
}

function codes(report: ReturnType<typeof validateMealPlanCandidate>) { return report.issues.filter((issue) => issue.severity === "HARD_FAILURE").map((issue) => issue.code); }

for (const [goal, roles] of [
  ["fat_loss", ["BREAKFAST", "MAIN_MEAL", "EVENING_MEAL"]],
  ["hypertrophy", ["BREAKFAST", "MAIN_MEAL", "EVENING_MEAL"]],
  ["conditioning", ["PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"]],
] as const) {
  test(`${goal} accepts a complete TACO-backed plan within daily and goal tolerances`, () => {
    const context = generationContext(goal, [...roles]);
    const report = validateMealPlanCandidate(context, balancedCandidate([...roles]), snapshot());
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
  const result = codes(validateMealPlanCandidate(context, balancedCandidate(context.mealRoles), snapshot()));
  assert.ok(result.includes("CALORIES_OUT_OF_RANGE"));
  assert.ok(result.includes("PROTEIN_OUT_OF_RANGE"));
  assert.ok(result.includes("DISLIKED_FOOD_VIOLATION"));
});

test("hypertrophy rejects excessive fat, low carbs and target mismatch", () => {
  const context = generationContext("hypertrophy");
  context.target = { ...context.target, calories: context.target.calories * 1.3, carbsG: context.target.carbsG * 1.5, fatG: context.target.fatG * 0.5 };
  const result = codes(validateMealPlanCandidate(context, balancedCandidate(context.mealRoles), snapshot()));
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
  const result = codes(validateMealPlanCandidate(context, candidate, snapshot()));
  assert.ok(result.includes("CALORIES_OUT_OF_RANGE"));
  assert.ok(result.includes("CARBS_OUT_OF_RANGE"));
  assert.ok(result.includes("MEAL_ROLE_MISMATCH"));
});

test("unknown, ambiguous and missing-nutrient TACO food all fail closed", () => {
  const context = generationContext();
  const unknown = balancedCandidate(context.mealRoles);
  unknown.meals[0].items[0].foodQuery = "alimento inexistente";
  assert.ok(codes(validateMealPlanCandidate(context, unknown, snapshot())).includes("UNKNOWN_FOOD"));

  const ambiguousCatalog = snapshot();
  const [rice, beans] = ambiguousCatalog.entries;
  ambiguousCatalog.aliases = [rice, beans].map((food, index) => ({ id: `a${index}`, foodId: food.id,
    alias: "base", normalizedAlias: normalizeFoodQuery("base"), locale: "pt-BR", source: "TACO", confidence: "CURATED" }));
  const ambiguous = balancedCandidate(context.mealRoles);
  ambiguous.meals[0].items[0].foodQuery = "base";
  assert.ok(codes(validateMealPlanCandidate(context, ambiguous, ambiguousCatalog)).includes("AMBIGUOUS_FOOD"));

  const missing = balancedCandidate(context.mealRoles);
  missing.meals[0].items[0].foodQuery = "Frango, peito, sem pele, grelhado";
  assert.ok(codes(validateMealPlanCandidate(context, missing, snapshot())).includes("UNKNOWN_REQUIRED_NUTRIENT"));
});

test("quantity and restriction safety fail closed without inferred metadata", () => {
  const context = generationContext();
  const quantity = balancedCandidate(context.mealRoles);
  quantity.meals[0].items[0].quantityValue = 1500;
  assert.ok(codes(validateMealPlanCandidate(context, quantity, snapshot())).includes("IMPOSSIBLE_PORTION"));
  const allergy = generationContext();
  allergy.allergenRestrictions = ["contains_milk"];
  allergy.restrictionSafetyKnown = false;
  assert.ok(codes(validateMealPlanCandidate(allergy, balancedCandidate(allergy.mealRoles), snapshot())).includes("ALLERGEN_SAFETY_UNVERIFIED"));
  const vegetarian = generationContext();
  vegetarian.dietaryPattern = "vegetarian";
  vegetarian.restrictionSafetyKnown = false;
  assert.ok(codes(validateMealPlanCandidate(vegetarian, balancedCandidate(vegetarian.mealRoles), snapshot())).includes("DIETARY_PATTERN_UNVERIFIED"));
});
