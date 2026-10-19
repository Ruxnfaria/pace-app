import assert from "node:assert/strict";
import test from "node:test";
import type { NutritionCatalogImportRecord } from "./importer";
import { importNutritionCatalog } from "./importer";

function record(overrides: Partial<NutritionCatalogImportRecord> = {}): NutritionCatalogImportRecord {
  return {
    canonicalName: "Fixture importável",
    sourceFoodId: "F-001",
    foodGroup: "cereals",
    preparationState: "cooked",
    nutrientsPer100g: { calories: 100, proteinG: 4, carbsG: 20, fatG: 1, fiberG: 2 },
    ediblePortion: 1,
    densityGPerMl: null,
    dataQuality: "ANALYTICAL",
    dietaryTags: ["vegan", "vegetarian"],
    allergenTags: [],
    allergenDataComplete: true,
    foodRole: "carb",
    budgetTier: "economical",
    preparationComplexity: "low",
    sourceMetadata: { fixture: true },
    ...overrides,
  };
}

const metadata = {
  source: "TACO" as const,
  sourceVersion: "test-source-v1",
  sourceReference: "TEST_ONLY importer contract",
  catalogScope: "TEST_ONLY" as const,
};

test("import valida procedência e distingue insert de nova versão", () => {
  const inserted = importNutritionCatalog([record()], metadata);
  assert.equal(inserted.inserted, 1);
  assert.equal(inserted.versioned, 0);
  assert.equal(inserted.acceptedRecords[0].normalizedName, "fixture importavel");
  const versioned = importNutritionCatalog([record()], metadata, new Set(["TACO:F-001"]));
  assert.equal(versioned.versioned, 1);
});

test("import rejeita source ID duplicado e nutrientes negativos", () => {
  const report = importNutritionCatalog([
    record(),
    record({ canonicalName: "Duplicado" }),
    record({ sourceFoodId: "F-002", nutrientsPer100g: { calories: -1, proteinG: 1, carbsG: 1, fatG: 1, fiberG: 1 } }),
  ], metadata);
  assert.equal(report.inserted, 1);
  assert.equal(report.rejected, 2);
  assert.ok(report.rejections.some((item) => item.codes.includes("DUPLICATE_SOURCE_ID")));
  assert.ok(report.rejections.some((item) => item.codes.includes("INVALID_NUTRIENTS")));
});

test("import rejeita metadados sem proveniência", () => {
  assert.throws(() => importNutritionCatalog([record()], { ...metadata, sourceReference: "" }), /provenance/i);
});
