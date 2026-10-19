import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Workbook } from "exceljs";
import { calculateFoodNutrients } from "../nutrients";
import { importNutritionCatalog } from "../importer";
import fixture from "./official-test-fixture.json" with { type: "json" };
import { TACO_SOURCE_REFERENCE, TACO_SOURCE_VERSION, TACO_WORKSHEET } from "./constants";
import { parseTacoDataset, parseTacoNutrientCell } from "./parser";

test("special values stay null and retain their documented TACO meaning", () => {
  assert.deepEqual(parseTacoNutrientCell("Tr"), { value: null, marker: "TRACE" });
  assert.deepEqual(parseTacoNutrientCell("NA"), { value: null, marker: "NOT_APPLICABLE" });
  assert.deepEqual(parseTacoNutrientCell("*"), { value: null, marker: "NOT_REEVALUATED" });
  assert.deepEqual(parseTacoNutrientCell(null), { value: null, marker: "NOT_REQUESTED" });
});

test("offline XLSX parser preserves preparation state and rejects duplicate source IDs", async () => {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(TACO_WORKSHEET);
  sheet.addRow(["Cereais e derivados"]);
  sheet.addRow([3, "Arroz, tipo 1, cozido", 69.1, 128.25, 536, 2.52, 0.227, "NA", 28.06, 1.561]);
  sheet.addRow(["Número do"]); // repeated page heading must not replace the food group
  sheet.addRow(["Alimento", "Descrição dos alimentos"]);
  sheet.addRow([3, "Arroz, tipo 1, cru", 12, 358, 1498, 7, 1, "NA", 79, "Tr"]);
  const path = join(tmpdir(), `taco-parser-${process.pid}-${Date.now()}.xlsx`);
  await workbook.xlsx.writeFile(path);
  try {
    const result = await parseTacoDataset(path);
    assert.equal(result.report.totalRows, 2);
    assert.equal(result.report.accepted, 1);
    assert.equal(result.report.rejected, 1);
    assert.deepEqual(result.report.duplicateSourceIds, ["3"]);
    assert.equal(result.records[0].canonicalName, "Arroz, tipo 1, cozido");
    assert.equal(result.records[0].preparationState, "cooked");
    assert.deepEqual(result.records[0].sourceMetadata.coverageCategories, ["cereals"]);
  } finally {
    await rm(path, { force: true });
  }
});

test("real-food calculation expectations come from the cited official fixture", () => {
  assert.equal(fixture.provenance.sourceVersion, TACO_SOURCE_VERSION);
  assert.match(fixture.provenance.publication, /NEPA\/UNICAMP, 2011/);
  for (const food of fixture.foods) {
    const [entry] = importNutritionCatalog([{
      canonicalName: food.canonicalName,
      sourceFoodId: food.sourceFoodId,
      foodGroup: "cereals",
      preparationState: "as_described",
      nutrientsPer100g: { calories: food.calories, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG, fiberG: food.fiberG },
      ediblePortion: null,
      densityGPerMl: null,
      dataQuality: "IMPORTED",
      dietaryTags: [], allergenTags: [], allergenDataComplete: false,
      foodRole: null, budgetTier: null, preparationComplexity: null,
      sourceMetadata: { officialFixture: true },
    }], { source: "TACO", sourceVersion: TACO_SOURCE_VERSION, sourceReference: TACO_SOURCE_REFERENCE, catalogScope: "PRODUCTION" }).acceptedRecords;
    const calculated = calculateFoodNutrients({ id: `fixture-${food.sourceFoodId}`, ...entry }, 150);
    assert.equal(calculated.calories, Number((food.calories * 1.5).toFixed(2)));
    assert.equal(calculated.proteinG, Number((food.proteinG * 1.5).toFixed(2)));
  }
});
