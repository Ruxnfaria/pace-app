import assert from "node:assert/strict";
import test from "node:test";
import { calculateFoodNutrients, sumMealNutrients, sumPlanNutrients } from "./nutrients";
import { TEST_ONLY_FOOD_CATALOG } from "./test-fixtures";

test("calcula nutrientes oficiais por 100 g e 150 g sem substituir kcal por macros", () => {
  const entry = TEST_ONLY_FOOD_CATALOG[0];
  const at100 = calculateFoodNutrients(entry, 100);
  const at150 = calculateFoodNutrients(entry, 150);
  assert.equal(at100.calories, 130);
  assert.equal(at100.macroDerivedEnergy, 124.7);
  assert.deepEqual(
    { calories: at150.calories, protein: at150.proteinG, carbs: at150.carbsG, fat: at150.fatG, fiber: at150.fiberG },
    { calories: 195, protein: 3.75, carbs: 42, fat: 0.45, fiber: 2.4 },
  );
});

test("nutriente ausente permanece desconhecido em alimento, refeição e plano", () => {
  const incomplete = calculateFoodNutrients(TEST_ONLY_FOOD_CATALOG[2], 100);
  assert.equal(incomplete.fiberG, null);
  assert.ok(incomplete.qualityWarnings.includes("INCOMPLETE_NUTRIENTS"));
  assert.equal(sumMealNutrients([calculateFoodNutrients(TEST_ONLY_FOOD_CATALOG[0], 100), incomplete]).fiberG, null);
  assert.equal(sumPlanNutrients([[incomplete]]).fiberG, null);
});
