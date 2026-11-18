import assert from "node:assert/strict";
import test from "node:test";
import type { AiMealPlanCandidate } from "../domain";
import { assessHumanPortionBalance } from "./human-portion-balance";

function meal(recipeFamilyId: string, values: Record<string, number>): AiMealPlanCandidate["meals"][number] {
  return { role: "BREAKFAST", templateId: "template", variantId: "variant", recipeFamilyId,
    label: "fixture", items: Object.entries(values).map(([componentId, quantityGrams]) => ({
      componentId, quantityGrams, catalogEntryId: componentId, slot: componentId === "COOKING_FAT"
        ? "FAT_ANCHOR" : "CARB_ANCHOR",
    })) };
}

test("bread and eggs remain proportionate while larger but balanced portions stay valid", () => {
  assert.equal(assessHumanPortionBalance({ meals: [meal("BREAD_EGGS_FRUIT", { BREAD: 110, EGGS: 100 })] }).valid, true);
  const report = assessHumanPortionBalance({ meals: [meal("BREAD_EGGS_FRUIT", { BREAD: 150, EGGS: 50 })] });
  assert.equal(report.valid, false);
  assert.equal(report.issues[0].code, "BREAD_EGG_IMBALANCE");
});

test("oats support rather than dominate a yogurt bowl", () => {
  assert.equal(assessHumanPortionBalance({ meals: [meal("YOGURT_OATS_FRUIT", { YOGURT: 210, OATS: 70 })] }).valid, true);
  assert.equal(assessHumanPortionBalance({ meals: [meal("YOGURT_OATS_FRUIT", { YOGURT: 210, OATS: 90 })] })
    .issues[0].code, "YOGURT_OATS_IMBALANCE");
});

test("added oil keeps the existing typical maximum without becoming globally forbidden", () => {
  assert.equal(assessHumanPortionBalance({ meals: [meal("RICE_BEANS_PROTEIN_VEGETABLES", { COOKING_FAT: 15 })] }).valid, true);
  assert.equal(assessHumanPortionBalance({ meals: [meal("RICE_BEANS_PROTEIN_VEGETABLES", { COOKING_FAT: 20 })] })
    .issues[0].code, "ADDED_FAT_COMPENSATION");
});

test("main-meal recipe proportions are a soft preference and never a universal clinical blocker", () => {
  const balanced = assessHumanPortionBalance({ meals: [meal("RICE_BEANS_PROTEIN_VEGETABLES",
    { RICE: 180, BEANS: 100, PROTEIN: 130 })] });
  assert.equal(balanced.valid, true);
  assert.equal(balanced.issues.length, 0);

  const skewed = assessHumanPortionBalance({ meals: [meal("RICE_BEANS_PROTEIN_VEGETABLES",
    { RICE: 280, BEANS: 60, PROTEIN: 70 })] });
  assert.equal(skewed.valid, true);
  assert.equal(skewed.penalty, balanced.penalty);
  assert.ok(skewed.preferencePenalty > balanced.preferencePenalty);
  assert.deepEqual(skewed.issues.map((issue) => [issue.code, issue.severity]), [
    ["MAIN_STAPLE_PROPORTION", "WARNING"],
    ["MAIN_PROTEIN_PROPORTION", "WARNING"],
  ]);
});
