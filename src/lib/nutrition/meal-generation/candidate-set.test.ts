import assert from "node:assert/strict";
import test from "node:test";

import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import {
  buildMealPlanCandidateSet,
  MAX_MEAL_PLAN_CANDIDATES,
} from "./candidate-set";
import { generationContext, officialTestCatalog } from "./test-helpers";

function snapshot() {
  const catalog = officialTestCatalog();
  return {
    ...catalog,
    portions: [],
    readiness: assessTrustedNutritionCatalog(catalog.entries).level,
  };
}

test("candidate set is deterministic, bounded and carries stable TACO identity", () => {
  const context = generationContext();
  const first = buildMealPlanCandidateSet(context, snapshot());
  const second = buildMealPlanCandidateSet(context, snapshot());
  assert.deepEqual(first, second);
  assert.ok(first.length <= MAX_MEAL_PLAN_CANDIDATES);
  assert.ok(first.every((candidate) => candidate.catalogEntryId && candidate.source === "TACO"
    && candidate.sourceFoodId && candidate.sourceVersion && candidate.preparationState));
});

test("candidate set excludes every food with a null required nutrient without coercing null to zero", () => {
  const candidates = buildMealPlanCandidateSet(generationContext(), snapshot());
  assert.equal(candidates.some((candidate) => candidate.canonicalName.includes("Frango")), false);
  assert.equal(candidates.some((candidate) => candidate.canonicalName.startsWith("Ovo")), false);
  assert.ok(candidates.every((candidate) => [
    candidate.calories,
    candidate.proteinG,
    candidate.carbsG,
    candidate.fatG,
    candidate.fiberG,
  ].every((value) => Number.isFinite(value))));
});

test("healthy unrestricted users retain eligible base-catalog choices", () => {
  const candidates = buildMealPlanCandidateSet(generationContext(), snapshot());
  assert.ok(candidates.some((candidate) => candidate.canonicalName === "Arroz, tipo 1, cozido"));
  assert.ok(candidates.some((candidate) => candidate.canonicalName === "Feijão, carioca, cozido"));
  assert.ok(candidates.some((candidate) => candidate.canonicalName === "Banana, prata, crua"));
});
