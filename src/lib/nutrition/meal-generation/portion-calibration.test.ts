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

function exactE2eFixture() {
  const catalog = officialTestCatalog();
  const entries = catalog.entries.map((entry) => entry.nutrientsPer100g.fiberG === null
    ? { ...entry, nutrientsPer100g: { ...entry.nutrientsPer100g, fiberG: 0 }, nutrientCompleteness: "COMPLETE" as const }
    : entry);
  const snapshot = { entries, aliases: catalog.aliases, portions: [], readiness: assessTrustedNutritionCatalog(entries).level };
  const roles = ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"] as const;
  const context = generationContext("hypertrophy", [...roles]);
  context.target = { ...context.target, calories: 2500, proteinG: 110, carbsG: 359.75, fatG: 69, fiberG: 35 };
  context.mealMacroTargets = context.mealMacroTargets.map((target) => ({
    ...target, calories: 625, proteinG: 27.5, carbsG: 89.9375, fatG: 17.25, fiberG: 8.75,
  }));
  const allowed = buildMealPlanCandidateSet(context, snapshot);
  const ids = new Map(entries.map((entry) => [entry.canonicalName, entry.id]));
  const names = [
    "Arroz, tipo 1, cozido",
    "Feijão, carioca, cozido",
    "Ovo, de galinha, inteiro, cozido/10minutos",
    "Banana, prata, crua",
    "Leite, de vaca, achocolatado",
  ];
  const quantities = [
    [194, 145, 69, 293, 150],
    [96, 221, 347, 186, 88],
    [222, 234, 393, 259, 95],
    [294, 203, 68, 388, 305],
  ];
  const candidate = { meals: roles.map((role, mealIndex) => ({
    role,
    label: `Refeição ${mealIndex + 1}`,
    items: names.map((name, itemIndex) => ({ catalogEntryId: ids.get(name)!, quantityGrams: quantities[mealIndex][itemIndex] })),
  })) };
  return { context, snapshot, allowed, candidate, eggId: ids.get(names[2])! };
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
  assert.equal(result.diagnostics.feedback?.status, "PORTION_CALIBRATION_NO_FEASIBLE_SOLUTION");
  assert.deepEqual(result.candidate.meals.flatMap((meal) => meal.items.map((item) => item.catalogEntryId)), originalIds);
});

test("exact E2E target converges across the former low-fat boundary without relaxing validation", () => {
  const { context, snapshot, allowed, candidate } = exactE2eFixture();
  const before = validate(context, candidate, snapshot, allowed);
  const result = calibrateMealPlanPortions(context, candidate, snapshot, allowed);
  const after = validate(context, result.candidate, snapshot, allowed);
  assert.equal(before.valid, false);
  assert.equal(after.valid, true, JSON.stringify(after.issues));
  assert.equal(result.diagnostics.feedback?.status, "CONVERGED");
  assert.ok((after.diagnostics?.actualFatG ?? 0) >= context.target.fatG * 0.9);
  assert.ok(!after.issues.some((issue) => issue.code === "PROTEIN_OUT_OF_RANGE" || issue.code === "CARBS_OUT_OF_RANGE"));
});

for (const [name, eggScale] of [["low", 0.5], ["high", 2]] as const) {
  test(`${name} fat is calibrated into tolerance when the selected foods are feasible`, () => {
    const { context, snapshot, allowed, candidate, eggId } = exactE2eFixture();
    const feasibleSeed = calibrateMealPlanPortions(context, candidate, snapshot, allowed).candidate;
    feasibleSeed.meals.forEach((meal) => {
      const egg = meal.items.find((item) => item.catalogEntryId === eggId)!;
      egg.quantityGrams *= eggScale;
    });
    const before = validate(context, feasibleSeed, snapshot, allowed);
    const result = calibrateMealPlanPortions(context, feasibleSeed, snapshot, allowed);
    const after = validate(context, result.candidate, snapshot, allowed);
    assert.ok(before.issues.some((issue) => issue.code === "FAT_OUT_OF_RANGE"));
    assert.equal(after.valid, true, JSON.stringify({ diagnostics: after.diagnostics, issues: after.issues }));
    assert.ok(result.candidate.meals.flatMap((meal) => meal.items).every((item) =>
      item.quantityGrams >= MIN_PORTION_GRAMS && item.quantityGrams <= MAX_PORTION_GRAMS));
  });
}

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
