import assert from "node:assert/strict";
import test from "node:test";

import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import { buildMealPlanCandidateSet, buildMealPlanMealSlots } from "../meal-generation/candidate-set";
import { balancedCandidate, generationContext, officialTestCatalog } from "../meal-generation/test-helpers";
import { validateMealPlanCandidate } from "../meal-generation/validator";
import { validateMealCoherence } from "./coherence-validator";
import { validateDailyMealQuality } from "./daily-quality";
import { validatePortionRealism } from "./portion-realism";
import type { NutritionQualityGoal } from "./domain";

const scenarios: Array<{ name: string; goal: NutritionQualityGoal }> = [
  { name: "HYPERTROPHY", goal: "hypertrophy" },
  { name: "FAT_LOSS", goal: "fat_loss" },
  { name: "BODY_RECOMPOSITION", goal: "body_recomposition" },
  { name: "STRENGTH", goal: "strength" },
  { name: "HEALTH", goal: "health" },
];

for (const scenario of scenarios) {
  test(`${scenario.name} passes macro, coherence and daily-quality regression`, () => {
    const context = generationContext(scenario.goal === "hypertrophy" ? "hypertrophy" : "fat_loss");
    const catalog = officialTestCatalog();
    const snapshot = { ...catalog, portions: [], readiness: assessTrustedNutritionCatalog(catalog.entries).level };
    const report = validateMealPlanCandidate(context, balancedCandidate(context.mealRoles), snapshot,
      buildMealPlanCandidateSet(context, snapshot));
    assert.equal(report.valid, true, JSON.stringify(report.issues));
    assert.equal(validateMealCoherence(report.plan!, scenario.goal).valid, true);
    assert.equal(validateDailyMealQuality(report.plan!).valid, true);
    assert.equal(validatePortionRealism(report.plan!).valid, true);
  });
}

for (const [name, targetCarbsG, expectedFuel] of [
  ["CONDITIONING_LOW", 10, "LOW"],
  ["CONDITIONING_MODERATE", 30, "MODERATE"],
  ["CONDITIONING_HIGH", 60, "HIGH"],
] as const) {
  test(`${name} passes macro, coherence and daily-quality regression`, () => {
    const roles = ["PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"] as const;
    const context = generationContext("conditioning", [...roles]);
    context.mealMacroTargets = context.mealMacroTargets.map((target, index) =>
      index < 2 ? { ...target, carbsG: targetCarbsG } : target);
    const catalog = officialTestCatalog();
    const snapshot = { ...catalog, portions: [], readiness: assessTrustedNutritionCatalog(catalog.entries).level };
    const candidates = buildMealPlanCandidateSet(context, snapshot);
    assert.equal(buildMealPlanMealSlots(context, candidates)[0].fuelLevel, expectedFuel);
    const report = validateMealPlanCandidate(context, balancedCandidate([...roles]), snapshot, candidates);
    assert.equal(report.valid, true, JSON.stringify(report.issues));
    assert.equal(report.coherence?.valid, true);
    assert.equal(validateDailyMealQuality(report.plan!).valid, true);
    assert.equal(validatePortionRealism(report.plan!).valid, true);
  });
}
