import assert from "node:assert/strict";
import test from "node:test";
import type { NutritionCatalogImportRecord } from "../importer";
import { TACO_SOURCE_VERSION } from "./constants";
import { assertNoActiveTacoVersionConflict, buildTacoDatabaseRows, chunkTacoRows } from "./database-import";

const record: NutritionCatalogImportRecord = {
  canonicalName: "Arroz, tipo 1, cozido", sourceFoodId: "3", foodGroup: "cereals", preparationState: "cooked",
  nutrientsPer100g: { calories: 128, proteinG: 2.5, carbsG: 28, fatG: 0.2, fiberG: 1.6 },
  ediblePortion: null, densityGPerMl: null, dataQuality: "IMPORTED", dietaryTags: [], allergenTags: [],
  allergenDataComplete: false, foodRole: null, budgetTier: null, preparationComplexity: null,
  sourceMetadata: { catalogVersion: "praxe-food-catalog-taco-v1" },
};

test("same source identity and version produce the same idempotent upsert key", () => {
  const first = buildTacoDatabaseRows([record]);
  const second = buildTacoDatabaseRows([record]);
  assert.deepEqual(first, second);
  assert.deepEqual([first[0].source, first[0].source_food_id, first[0].source_version], ["TACO", "3", TACO_SOURCE_VERSION]);
});

test("active different source version fails closed instead of being overwritten", () => {
  assert.doesNotThrow(() => assertNoActiveTacoVersionConflict([{ source_food_id: "3", source_version: TACO_SOURCE_VERSION }], new Set(["3"])));
  assert.throws(() => assertNoActiveTacoVersionConflict([{ source_food_id: "3", source_version: "future" }], new Set(["3"])), /VERSION_CONFLICT/);
  assert.deepEqual(chunkTacoRows([1, 2, 3], 2), [[1, 2], [3]]);
});
