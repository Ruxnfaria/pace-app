import assert from "node:assert/strict";
import test from "node:test";

import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import { buildMealPlanCandidateSet } from "../meal-generation/candidate-set";
import { balancedCandidate, generationContext, officialTestCatalog } from "../meal-generation/test-helpers";
import { validateMealPlanCandidate } from "../meal-generation/validator";
import { auditPortionProfiles } from "./catalog-audit";

function fixture() {
  const catalog = officialTestCatalog();
  const snapshot = { ...catalog, portions: [], readiness: assessTrustedNutritionCatalog(catalog.entries).level };
  const context = generationContext("hypertrophy", ["BREAKFAST", "POST_WORKOUT", "EVENING_MEAL"]);
  return { context, snapshot, allowed: buildMealPlanCandidateSet(context, snapshot) };
}

test("A. fruit cannot be scaled indefinitely or become the carbohydrate macro patch", () => {
  const { context, snapshot, allowed } = fixture();
  const candidate = balancedCandidate(context.mealRoles);
  candidate.meals[0].items.find((item) => item.slot === "PRODUCE_FIBER")!.quantityGrams = 250;
  const report = validateMealPlanCandidate(context, candidate, snapshot, allowed);
  assert.ok(report.issues.some((issue) => issue.code === "FRUIT_PORTION_IMPLAUSIBLE"));
  assert.ok(report.issues.some((issue) => issue.code === "PRODUCE_USED_AS_MACRO_COMPENSATOR"));
});

test("B. a protein anchor cannot become a token portion", () => {
  const { context, snapshot, allowed } = fixture();
  const candidate = balancedCandidate(context.mealRoles);
  candidate.meals[1].items.find((item) => item.slot === "PROTEIN_ANCHOR")!.quantityGrams = 40;
  const report = validateMealPlanCandidate(context, candidate, snapshot, allowed);
  assert.ok(report.issues.some((issue) => issue.code === "PROTEIN_ANCHOR_TOO_SMALL"));
});

test("C. added oil cannot repair an arbitrary fat deficit beyond its product guardrail", () => {
  const { context, snapshot, allowed } = fixture();
  const candidate = balancedCandidate(context.mealRoles);
  candidate.meals[2].items.find((item) => item.slot === "FAT_ANCHOR")!.quantityGrams = 21;
  const report = validateMealPlanCandidate(context, candidate, snapshot, allowed);
  assert.ok(report.issues.some((issue) => issue.code === "ADDED_FAT_PORTION_IMPLAUSIBLE"));
});

test("portion profiles classify every catalog entry without inventing household units", () => {
  const audit = auditPortionProfiles(officialTestCatalog().entries);
  assert.equal(audit.coveragePercent, 100);
  assert.equal(audit.unclassified, 0);
});
