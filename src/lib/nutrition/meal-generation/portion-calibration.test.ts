import assert from "node:assert/strict";
import test from "node:test";

import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import { buildMealPlanCandidateSet } from "./candidate-set";
import { buildMealPlanPromptContext } from "./generator";
import {
  calibrateMealPlanPortions,
  MAX_CALIBRATION_ITERATIONS,
  MAX_PORTION_GRAMS,
  MIN_PORTION_GRAMS,
} from "./portion-calibration";
import { balancedCandidate, generationContext, officialTestCatalog } from "./test-helpers";
import { validateMealPlanCandidate } from "./validator";
import { validateDailyMealQuality } from "../meal-quality/daily-quality";
import { validatePortionRealism } from "../meal-quality/portion-realism";
import { foodPortionProfile } from "../meal-quality/portion-profile";

function fixture() {
  const catalog = officialTestCatalog();
  const snapshot = { ...catalog, portions: [], readiness: assessTrustedNutritionCatalog(catalog.entries).level };
  const context = generationContext("hypertrophy");
  return { context, snapshot, allowed: buildMealPlanCandidateSet(context, snapshot) };
}

export function exactE2eFixture() {
  const catalog = officialTestCatalog();
  const entries = catalog.entries;
  const snapshot = { entries, aliases: catalog.aliases, portions: [], readiness: assessTrustedNutritionCatalog(entries).level };
  const roles = ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"] as const;
  const context = generationContext("hypertrophy", [...roles]);
  context.target = { ...context.target, calories: 2500, proteinG: 110, carbsG: 359.75, fatG: 69, fiberG: 35 };
  context.routinePredictability = "variable";
  context.mealBreakAvailability = "flexible";
  context.trainingPeriod = "afternoon";
  context.preparationStyle = "flexible";
  context.budget = "varied";
  context.dietaryPattern = "omnivore";
  context.hasFoodRestriction = false;
  context.mealWindows = [
    { position: 1, start: "11:30", end: "12:30", startDayOffset: 0, endDayOffset: 0 },
    { position: 2, start: "15:00", end: "16:00", startDayOffset: 0, endDayOffset: 0 },
    { position: 3, start: "18:00", end: "19:00", startDayOffset: 0, endDayOffset: 0 },
    { position: 4, start: "00:30", end: "01:30", startDayOffset: 1, endDayOffset: 1 },
  ];
  context.mealMacroTargets = context.mealMacroTargets.map((target) => ({
    ...target, calories: 625, proteinG: 27.5, carbsG: 89.9375, fatG: 17.25, fiberG: 8.75,
  }));
  const prompt = buildMealPlanPromptContext(context, snapshot);
  const allowed = prompt.candidates;
  const variantIds = ["BREAD_EGGS_FRENCH_BANANA", "PRE_BREAD_CHEESE_FRENCH_BANANA",
    "WHITE_CARIOCA_BEEF_BROCCOLI", "POST_SKIM_YOGURT_PAPAYA_OATS"];
  const optionalIds: Array<string | false> = ["SPREAD", false, "AVOCADO_SIDE", false];
  const initialQuantities: Array<Record<string, number>> = [
    { BREAD: 140, EGGS: 100, FRUIT: 130, SPREAD: 20 },
    { BREAD: 140, CHEESE: 70, FRUIT: 130 },
    { RICE: 300, BEANS: 100, PROTEIN: 70, VEGETABLES: 150, AVOCADO_SIDE: 100 },
    { YOGURT: 200, OATS: 70, FRUIT: 130 },
  ];
  const candidate = { meals: variantIds.map((variantId, index) => {
    const option = prompt.templateSlots[index].options.find((value) => value.variantId === variantId)!;
    return {
      role: roles[index], templateId: option.templateId, variantId: option.variantId, label: option.displayName,
      items: option.components.filter((component) => component.required || component.componentId === optionalIds[index])
        .map((component) => ({
          componentId: component.componentId, slot: component.slot, catalogEntryId: component.catalogEntryIds[0],
          quantityGrams: initialQuantities[index][component.componentId]
            ?? Math.round((component.minimumGrams + component.maximumGrams) / 2 / 5) * 5,
          ...(component.preparationNote ? { preparationNote: component.preparationNote } : {}),
        })),
    };
  }) };
  const avocadoId = entries.find((entry) => entry.sourceFoodId === "163")!.id;
  return { context, snapshot, allowed, candidate,
    eggId: avocadoId };
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
  candidate.meals.forEach((meal) => {
    meal.items.find((item) => item.slot === "PROTEIN_ANCHOR")!.quantityGrams = 20;
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

test("exact E2E target converges after deterministic calibration without relaxing validation", () => {
  const { context, snapshot, allowed, candidate } = exactE2eFixture();
  const before = validate(context, candidate, snapshot, allowed);
  const result = calibrateMealPlanPortions(context, candidate, snapshot, allowed);
  const after = validate(context, result.candidate, snapshot, allowed);
  assert.equal(before.valid, false);
  assert.equal(after.valid, true, JSON.stringify(after.issues));
  assert.equal(after.coherence?.valid, true, JSON.stringify(after.coherence?.issues));
  assert.equal(validateDailyMealQuality(after.plan!).valid, true);
  assert.equal(validatePortionRealism(after.plan!).valid, true);
  assert.equal(result.diagnostics.feedback?.status, "CONVERGED");
  assert.ok((after.diagnostics?.actualFatG ?? 0) >= context.target.fatG * 0.9);
  assert.ok(!after.issues.some((issue) => issue.code === "PROTEIN_OUT_OF_RANGE" || issue.code === "CARBS_OUT_OF_RANGE"));
  assert.equal(result.diagnostics.fiberProximityOptimized, true);
  assert.deepEqual(result.diagnostics.feedback?.violatedConstraints, []);
  const assertPlausible = (role: typeof context.mealRoles[number], slot: "PROTEIN_ANCHOR" | "PRODUCE_FIBER" | "FAT_ANCHOR") => {
    const meal = after.plan!.meals.find((value) => value.role === role)!;
    const item = meal.items.find((value) => value.slot === slot)!;
    const profile = foodPortionProfile(item.food, item.slot, meal.role);
    assert.ok(item.quantityGrams >= profile.minimumGrams);
    assert.ok(item.quantityGrams <= profile.maximumAutogenerationGrams);
  };
  assertPlausible("BREAKFAST", "PRODUCE_FIBER");
  assertPlausible("PRE_WORKOUT", "PRODUCE_FIBER");
  assertPlausible("BREAKFAST", "PROTEIN_ANCHOR");
  assertPlausible("PRE_WORKOUT", "PROTEIN_ANCHOR");
  assertPlausible("EVENING_MEAL", "PROTEIN_ANCHOR");
  assertPlausible("POST_WORKOUT", "FAT_ANCHOR");
  assert.ok(!after.issues.some((issue) => ["PRODUCE_USED_AS_MACRO_COMPENSATOR",
    "SUPPORTING_ITEM_DOMINATES_MEAL"].includes(issue.code)));
});

test("G. fat loss calibration keeps practical meal portions", () => {
  const { context, snapshot, allowed } = fixture();
  const candidate = balancedCandidate(context.mealRoles);
  candidate.meals.forEach((meal) => meal.items.forEach((item) => { item.quantityGrams *= 0.85; }));
  const result = calibrateMealPlanPortions(context, candidate, snapshot, allowed);
  const report = validate(context, result.candidate, snapshot, allowed);
  assert.equal(report.valid, true, JSON.stringify(report.issues));
  assert.equal(validatePortionRealism(report.plan!).valid, true);
});

test("H. high fuel expands the primary carbohydrate anchor", () => {
  const roles = ["PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"] as const;
  const catalog = officialTestCatalog();
  const snapshot = { ...catalog, portions: [], readiness: assessTrustedNutritionCatalog(catalog.entries).level };
  const lowContext = generationContext("conditioning", [...roles]);
  const highContext = generationContext("conditioning", [...roles]);
  highContext.target = { ...highContext.target,
    calories: highContext.target.calories + 320, carbsG: highContext.target.carbsG + 80 };
  highContext.mealMacroTargets = highContext.mealMacroTargets.map((target, index) => ({
    ...target,
    calories: target.calories + 320 / highContext.mealCount,
    carbsG: target.carbsG + (index < 2 ? 40 : 0),
  }));
  const candidate = balancedCandidate([...roles]);
  const low = calibrateMealPlanPortions(lowContext, candidate, snapshot, buildMealPlanCandidateSet(lowContext, snapshot));
  const highAllowed = buildMealPlanCandidateSet(highContext, snapshot);
  const high = calibrateMealPlanPortions(highContext, candidate, snapshot, highAllowed);
  const carbGrams = (value: typeof candidate) => value.meals.flatMap((meal) => meal.items)
    .filter((item) => item.slot === "CARB_ANCHOR").reduce((total, item) => total + item.quantityGrams, 0);
  assert.equal(validate(highContext, high.candidate, snapshot, highAllowed).valid, true);
  assert.ok(carbGrams(high.candidate) > carbGrams(low.candidate));
});

for (const [name, slot, scale, expectedCode] of [
  ["protein low", "PROTEIN_ANCHOR", 0.35, "PROTEIN_OUT_OF_RANGE"],
  ["protein high", "PROTEIN_ANCHOR", 1.8, "PROTEIN_OUT_OF_RANGE"],
  ["carbs low", "CARB_ANCHOR", 0.35, "CARBS_OUT_OF_RANGE"],
  ["carbs high", "CARB_ANCHOR", 1.8, "CARBS_OUT_OF_RANGE"],
] as const) {
  test(`${name} converges when the selected pool composition is feasible`, () => {
    const { context, snapshot, allowed, candidate } = exactE2eFixture();
    const feasibleSeed = calibrateMealPlanPortions(context, candidate, snapshot, allowed).candidate;
    feasibleSeed.meals.forEach((meal) => {
      const item = meal.items.find((value) => value.slot === slot);
      if (item) item.quantityGrams *= scale;
    });
    const before = validate(context, feasibleSeed, snapshot, allowed);
    assert.ok(before.issues.some((issue) => issue.code === expectedCode), JSON.stringify(before.issues));
    const result = calibrateMealPlanPortions(context, feasibleSeed, snapshot, allowed);
    const after = validate(context, result.candidate, snapshot, allowed);
    assert.equal(after.valid, true, JSON.stringify({ name, diagnostics: after.diagnostics, issues: after.issues }));
  });
}

test("coordinated multi-item adjustment resolves simultaneous carbs-high and fat-low constraints", () => {
  const { context, snapshot, allowed, candidate } = exactE2eFixture();
  const feasibleSeed = calibrateMealPlanPortions(context, candidate, snapshot, allowed).candidate;
  feasibleSeed.meals.forEach((meal) => {
    const protein = meal.items.find((item) => item.slot === "PROTEIN_ANCHOR")!;
    protein.quantityGrams = protein.componentId === "YOGURT" ? 100
      : protein.componentId === "PROTEIN" ? 70 : protein.componentId === "EGGS" ? 50 : 40;
    const carb = meal.items.find((item) => item.slot === "CARB_ANCHOR")!;
    carb.quantityGrams = carb.componentId === "RICE" ? 350 : carb.componentId === "OATS" ? 100 : 200;
  });
  const before = validate(context, feasibleSeed, snapshot, allowed);
  assert.ok(before.issues.some((issue) => issue.code === "CARBS_OUT_OF_RANGE"));
  assert.ok(before.issues.some((issue) => issue.code === "FAT_OUT_OF_RANGE"));
  const result = calibrateMealPlanPortions(context, feasibleSeed, snapshot, allowed);
  const after = validate(context, result.candidate, snapshot, allowed);
  assert.equal(after.valid, true, JSON.stringify({ diagnostics: after.diagnostics, issues: after.issues }));
  assert.ok(result.diagnostics.adjustedItemCount >= 2);
});

for (const [name, eggScale] of [["low", 0.5]] as const) {
  test(`${name} fat is calibrated into tolerance when the selected foods are feasible`, () => {
    const { context, snapshot, allowed, candidate, eggId } = exactE2eFixture();
    const feasibleSeed = calibrateMealPlanPortions(context, candidate, snapshot, allowed).candidate;
    feasibleSeed.meals.forEach((meal) => {
      const culinaryFat = meal.items.find((item) => item.catalogEntryId === eggId);
      if (culinaryFat) culinaryFat.quantityGrams *= eggScale;
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
    item.quantityGrams >= 5 && item.quantityGrams <= MAX_PORTION_GRAMS));
  const report = validate(context, result.candidate, snapshot, allowed);
  if (report.plan) assert.ok(report.plan.meals.every((meal) => meal.items.every((item) => item.food.source === "TACO")));
});

test("verified discrete portion authorities constrain solver grams instead of rounding only the display", () => {
  const { context, snapshot, allowed } = fixture();
  const candidate = balancedCandidate(context.mealRoles);
  const breakfast = candidate.meals[0];
  const bread = breakfast.items.find((item) => item.componentId === "BREAD")!;
  const eggs = breakfast.items.find((item) => item.componentId === "EGGS")!;
  const fruit = breakfast.items.find((item) => item.componentId === "FRUIT")!;
  bread.quantityGrams = 73;
  eggs.quantityGrams = 83;
  fruit.quantityGrams = 137;
  const authorities = [
    { catalogEntryId: bread.catalogEntryId, gramsPerCount: 50, singularName: "pão francês",
      pluralName: "pães franceses", source: "TEST_ONLY", sourceVersion: "test-v1",
      authorityType: "CURATED_PORTION" as const },
    { catalogEntryId: eggs.catalogEntryId, gramsPerCount: 50, singularName: "ovo cozido",
      pluralName: "ovos cozidos", source: "TEST_ONLY", sourceVersion: "test-v1",
      authorityType: "CURATED_PORTION" as const },
    { catalogEntryId: fruit.catalogEntryId, gramsPerCount: 100, singularName: "banana",
      pluralName: "bananas", source: "TEST_ONLY", sourceVersion: "test-v1",
      authorityType: "CURATED_PORTION" as const },
  ];
  const result = calibrateMealPlanPortions(context, candidate, snapshot, allowed, undefined, authorities);
  const calibratedBreakfast = result.candidate.meals[0];
  for (const authority of authorities) {
    const item = calibratedBreakfast.items.find((value) => value.catalogEntryId === authority.catalogEntryId)!;
    assert.equal(item.quantityGrams % authority.gramsPerCount, 0);
  }
  assert.notEqual(calibratedBreakfast.items.find((item) => item.componentId === "BREAD")!.quantityGrams, 73);
  assert.notEqual(calibratedBreakfast.items.find((item) => item.componentId === "EGGS")!.quantityGrams, 83);
  assert.notEqual(calibratedBreakfast.items.find((item) => item.componentId === "FRUIT")!.quantityGrams, 137);
});

test("2500 kcal fixed recipe composition fails closed when human balance needs recipe fallback", () => {
  const { context, snapshot } = fixture();
  const scale = 2500 / context.target.calories;
  context.target = {
    ...context.target,
    calories: 2500,
    proteinG: context.target.proteinG * scale,
    carbsG: context.target.carbsG * scale,
    fatG: context.target.fatG * scale,
    fiberG: context.target.fiberG,
  };
  context.mealMacroTargets = context.mealMacroTargets.map((target) => ({
    ...target,
    calories: target.calories * scale,
    proteinG: target.proteinG * scale,
    carbsG: target.carbsG * scale,
    fatG: target.fatG * scale,
    fiberG: target.fiberG,
  }));
  const allowed = buildMealPlanCandidateSet(context, snapshot);
  const candidate = balancedCandidate(context.mealRoles);
  const before = validate(context, candidate, snapshot, allowed);
  const result = calibrateMealPlanPortions(context, candidate, snapshot, allowed);
  const after = validate(context, result.candidate, snapshot, allowed);
  assert.equal(before.valid, false);
  assert.equal(after.valid, false);
  assert.ok(after.issues.some((issue) => issue.code === "FAT_OUT_OF_RANGE"), JSON.stringify(after.issues));
  assert.equal(result.diagnostics.feedback?.status, "PORTION_CALIBRATION_NO_FEASIBLE_SOLUTION");
  assert.equal(before.diagnostics?.actualKcal, 1348.4);
  assert.deepEqual(result.candidate.meals.map((meal) => meal.items.map((item) => item.catalogEntryId)),
    candidate.meals.map((meal) => meal.items.map((item) => item.catalogEntryId)));
});
