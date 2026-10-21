import assert from "node:assert/strict";
import test from "node:test";

import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import { buildMealPlanCandidateSet } from "./candidate-set";
import {
  calibrateMealPlanPortions,
  MAX_CALIBRATION_ITERATIONS,
  MAX_PORTION_GRAMS,
  MIN_PORTION_GRAMS,
} from "./portion-calibration";
import { balancedCandidate, generationContext, officialTestCatalog } from "./test-helpers";
import { validateMealPlanCandidate } from "./validator";

function fixture() {
  const catalog = officialTestCatalog();
  const snapshot = { ...catalog, portions: [], readiness: assessTrustedNutritionCatalog(catalog.entries).level };
  const context = generationContext("hypertrophy");
  return { context, snapshot, allowed: buildMealPlanCandidateSet(context, snapshot) };
}

function validate(
  context: ReturnType<typeof generationContext>,
  candidate: ReturnType<typeof balancedCandidate>,
  snapshot: ReturnType<typeof fixture>["snapshot"],
  allowed: ReturnType<typeof buildMealPlanCandidateSet>,
) {
  return validateMealPlanCandidate(context, candidate, snapshot, allowed);
}

for (const [name, scale] of [["15 percent below calories", 0.85], ["above calories", 1.3]] as const) {
  test(`deterministic calibration brings a candidate ${name} into validation tolerance`, () => {
    const { context, snapshot, allowed } = fixture();
    const candidate = balancedCandidate(context.mealRoles);
    candidate.meals.forEach((meal) => meal.items.forEach((item) => { item.quantityGrams *= scale; }));
    assert.equal(validate(context, candidate, snapshot, allowed).valid, false);
    const result = calibrateMealPlanPortions(context, candidate, snapshot, allowed);
    assert.equal(validate(context, result.candidate, snapshot, allowed).valid, true);
    assert.ok(result.diagnostics.iterations <= MAX_CALIBRATION_ITERATIONS);
  });
}

test("low protein portions are corrected when the selected foods make the target feasible", () => {
  const { context, snapshot, allowed } = fixture();
  const candidate = balancedCandidate(context.mealRoles);
  const bean = snapshot.entries.find((entry) => entry.canonicalName.startsWith("Feijão"))!.id;
  candidate.meals.forEach((meal) => {
    meal.items.find((item) => item.catalogEntryId === bean)!.quantityGrams = 20;
  });
  const before = validate(context, candidate, snapshot, allowed);
  const result = calibrateMealPlanPortions(context, candidate, snapshot, allowed);
  const after = validate(context, result.candidate, snapshot, allowed);
  assert.ok((result.diagnostics.after?.actualProteinG ?? 0) > (result.diagnostics.before?.actualProteinG ?? 0));
  assert.ok(after.issues.filter((issue) => issue.code === "PROTEIN_DISTRIBUTION").length
    <= before.issues.filter((issue) => issue.code === "PROTEIN_DISTRIBUTION").length);
});

test("an incompatible selected-food composition remains rejected without inventing IDs", () => {
  const { context, snapshot, allowed } = fixture();
  context.target = { ...context.target, proteinG: context.target.proteinG * 6 };
  context.mealMacroTargets = context.mealMacroTargets.map((target) => ({ ...target, proteinG: target.proteinG * 6 }));
  const candidate = balancedCandidate(context.mealRoles);
  const riceId = snapshot.entries.find((entry) => entry.canonicalName.startsWith("Arroz"))!.id;
  candidate.meals.forEach((meal) => { meal.items = meal.items.filter((item) => item.catalogEntryId === riceId); });
  const originalIds = candidate.meals.flatMap((meal) => meal.items.map((item) => item.catalogEntryId));
  const result = calibrateMealPlanPortions(context, candidate, snapshot, allowed);
  assert.equal(validate(context, result.candidate, snapshot, allowed).valid, false);
  assert.deepEqual(result.candidate.meals.flatMap((meal) => meal.items.map((item) => item.catalogEntryId)), originalIds);
});

test("calibration improves poor per-meal protein distribution when possible", () => {
  const { context, snapshot, allowed } = fixture();
  const candidate = balancedCandidate(context.mealRoles);
  candidate.meals[0].items.forEach((item) => { item.quantityGrams = 20; });
  candidate.meals[1].items.forEach((item) => { item.quantityGrams = 180; });
  const before = validate(context, candidate, snapshot, allowed);
  const result = calibrateMealPlanPortions(context, candidate, snapshot, allowed);
  const after = validate(context, result.candidate, snapshot, allowed);
  const beforeIssues = before.diagnostics?.mealProteinDistributionIssues.length ?? 0;
  const afterIssues = after.diagnostics?.mealProteinDistributionIssues.length ?? 0;
  assert.ok(afterIssues < beforeIssues, JSON.stringify({ before: before.diagnostics, after: after.diagnostics }));
});

test("portion bounds, meal structure, catalog identities and TACO nutrients stay authoritative", () => {
  const { context, snapshot, allowed } = fixture();
  const candidate = balancedCandidate(context.mealRoles);
  candidate.meals[0].items[0].quantityGrams = 1;
  candidate.meals[1].items[0].quantityGrams = 5000;
  const structure = candidate.meals.map((meal) => ({ role: meal.role, ids: meal.items.map((item) => item.catalogEntryId) }));
  const result = calibrateMealPlanPortions(context, candidate, snapshot, allowed);
  assert.deepEqual(result.candidate.meals.map((meal) => ({ role: meal.role, ids: meal.items.map((item) => item.catalogEntryId) })), structure);
  assert.ok(result.candidate.meals.flatMap((meal) => meal.items).every((item) =>
    item.quantityGrams >= MIN_PORTION_GRAMS && item.quantityGrams <= MAX_PORTION_GRAMS));
  const report = validate(context, result.candidate, snapshot, allowed);
  if (report.plan) assert.ok(report.plan.meals.every((meal) => meal.items.every((item) => item.food.source === "TACO")));
});

test("2500 kcal in-memory E2E reproduction moves from invalid to valid without AI", () => {
  const { context, snapshot } = fixture();
  const scale = 2500 / context.target.calories;
  context.target = {
    ...context.target,
    calories: 2500,
    proteinG: context.target.proteinG * scale,
    carbsG: context.target.carbsG * scale,
    fatG: context.target.fatG * scale,
    fiberG: context.target.fiberG * scale,
  };
  context.mealMacroTargets = context.mealMacroTargets.map((target) => ({
    ...target,
    calories: target.calories * scale,
    proteinG: target.proteinG * scale,
    carbsG: target.carbsG * scale,
    fatG: target.fatG * scale,
    fiberG: target.fiberG * scale,
  }));
  const allowed = buildMealPlanCandidateSet(context, snapshot);
  const candidate = balancedCandidate(context.mealRoles);
  const before = validate(context, candidate, snapshot, allowed);
  const result = calibrateMealPlanPortions(context, candidate, snapshot, allowed);
  const after = validate(context, result.candidate, snapshot, allowed);
  assert.equal(before.valid, false);
  assert.equal(after.valid, true, JSON.stringify(after.issues));
  assert.equal(before.diagnostics?.actualKcal, 1157.25);
  assert.ok(Math.abs((after.diagnostics?.actualKcal ?? 0) - 2500) <= 125);
});
