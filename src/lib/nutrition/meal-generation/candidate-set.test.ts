import assert from "node:assert/strict";
import test from "node:test";

import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import {
  buildMealPlanCandidateSet,
  classifyMealPlanFoodPools,
  MAX_MEAL_PLAN_CANDIDATES,
  MAX_MEAL_PLAN_CANDIDATES_PER_POOL,
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

test("candidate set uses effective NOT_APPLICABLE fibre without mutating raw TACO data", () => {
  const catalog = snapshot();
  const candidates = buildMealPlanCandidateSet(generationContext(), snapshot());
  const chicken = catalog.entries.find((entry) => entry.canonicalName.includes("Frango"))!;
  assert.equal(chicken.nutrientsPer100g.fiberG, null);
  assert.equal(candidates.some((candidate) => candidate.catalogEntryId === chicken.id
    && candidate.fiberG === 0 && candidate.pools.includes("PROTEIN_ANCHOR")), true);
  assert.ok(candidates.every((candidate) => [
    candidate.calories,
    candidate.proteinG,
    candidate.carbsG,
    candidate.fatG,
    candidate.fiberG,
  ].every((value) => Number.isFinite(value))));
});

test("unknown null markers remain ineligible", () => {
  const catalog = snapshot();
  const chicken = catalog.entries.find((entry) => entry.canonicalName.includes("Frango"))!;
  chicken.sourceMetadata = { ...chicken.sourceMetadata, valueMarkers: { fiber: "TRACE" } };
  const candidates = buildMealPlanCandidateSet(generationContext(), catalog);
  assert.equal(candidates.some((candidate) => candidate.catalogEntryId === chicken.id), false);
});

test("nutritional ranking yields bounded useful pools instead of alphabetical sampling", () => {
  const catalog = snapshot();
  const candidates = buildMealPlanCandidateSet(generationContext(), catalog);
  for (const pool of ["PROTEIN_ANCHOR", "CARB_ANCHOR", "FAT_ANCHOR", "PRODUCE_FIBER"] as const) {
    assert.ok(candidates.some((candidate) => candidate.pools.includes(pool)), pool);
    assert.ok(candidates.filter((candidate) => candidate.pools.includes(pool)).length <= MAX_MEAL_PLAN_CANDIDATES_PER_POOL * 4);
  }
  const chicken = catalog.entries.find((entry) => entry.canonicalName.includes("Frango"))!;
  const beef = catalog.entries.find((entry) => entry.canonicalName.includes("patinho"))!;
  assert.ok(classifyMealPlanFoodPools(chicken).includes("PROTEIN_ANCHOR"));
  assert.ok(classifyMealPlanFoodPools(beef).includes("PROTEIN_ANCHOR"));
});

test("healthy unrestricted users retain eligible base-catalog choices", () => {
  const candidates = buildMealPlanCandidateSet(generationContext(), snapshot());
  assert.ok(candidates.some((candidate) => candidate.canonicalName === "Arroz, tipo 1, cozido"));
  assert.ok(candidates.some((candidate) => candidate.canonicalName === "Feijão, carioca, cozido"));
  assert.ok(candidates.some((candidate) => candidate.canonicalName === "Banana, prata, crua"));
});
