import assert from "node:assert/strict";
import test from "node:test";

import type { NutritionFoodCatalogEntry } from "./domain";
import { hasCompleteEffectiveNutrients, resolveEffectiveNutrients } from "./effective-nutrients";
import { officialTestCatalog } from "../meal-generation/test-helpers";

function chicken(marker: unknown): NutritionFoodCatalogEntry {
  const entry = officialTestCatalog().entries.find((value) => value.canonicalName.startsWith("Frango"))!;
  return {
    ...entry,
    nutrientsPer100g: { ...entry.nutrientsPer100g, fiberG: null },
    sourceMetadata: { ...entry.sourceMetadata, valueMarkers: { fiber: marker } },
  };
}

test("NOT_APPLICABLE yields effective zero without mutating TACO provenance", () => {
  const raw = chicken("NOT_APPLICABLE");
  const effective = resolveEffectiveNutrients(raw);
  assert.equal(raw.nutrientsPer100g.fiberG, null);
  assert.equal((raw.sourceMetadata.valueMarkers as Record<string, unknown>).fiber, "NOT_APPLICABLE");
  assert.equal(effective.fiberG, 0);
  assert.equal(hasCompleteEffectiveNutrients(raw), true);
});

for (const marker of ["TRACE", "NOT_REQUESTED", "NOT_REEVALUATED", "UNDER_REEVALUATION", "REEVALUATION", "", undefined]) {
  test(`${String(marker)} remains unknown and fails closed`, () => {
    const raw = chicken(marker);
    assert.equal(resolveEffectiveNutrients(raw).fiberG, null);
    assert.equal(hasCompleteEffectiveNutrients(raw), false);
  });
}
