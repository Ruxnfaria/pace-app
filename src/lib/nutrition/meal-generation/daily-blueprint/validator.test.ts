import assert from "node:assert/strict";
import test from "node:test";
import type { AiMealPlanCandidate } from "../domain";
import { generationContext } from "../test-helpers";
import { validateDailyMealBlueprint } from "./validator";

const item = { componentId: "TEST", catalogEntryId: "test", slot: "CARB_ANCHOR" as const, quantityGrams: 100 };
const meal = (role: AiMealPlanCandidate["meals"][number]["role"], templateId: string, variantId: string) =>
  ({ role, templateId, variantId, label: variantId, items: [item] });

function context() {
  const value = generationContext("hypertrophy", ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"]);
  value.trainingPeriod = "evening";
  value.mealWindows = [
    { position: 1, start: "11:32", end: "12:02", startDayOffset: 0, endDayOffset: 0 },
    { position: 2, start: "16:01", end: "16:31", startDayOffset: 0, endDayOffset: 0 },
    { position: 3, start: "20:29", end: "21:00", startDayOffset: 0, endDayOffset: 0 },
    { position: 4, start: "00:58", end: "01:28", startDayOffset: 1, endDayOffset: 1 },
  ];
  return value;
}

test("individually recognizable snack meals fail as a bread-heavy day without a main meal", () => {
  const candidate: AiMealPlanCandidate = { meals: [
    meal("BREAKFAST", "BREAKFAST_BREAD_EGGS_COFFEE_FRUIT", "BREAD_EGGS_WHOLE_APPLE"),
    meal("PRE_WORKOUT", "PRE_BREAD_CHEESE_FRUIT", "PRE_BREAD_CHEESE_WHOLE_APPLE"),
    meal("POST_WORKOUT", "POST_YOGURT_FRUIT_OATS", "POST_SKIM_YOGURT_PAPAYA_OATS"),
    meal("EVENING_MEAL", "EVENING_BREAD_EGGS_FRUIT", "EVENING_WHOLE_BREAD_EGGS"),
  ] };
  const report = validateDailyMealBlueprint(context(), candidate);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((value) => value.code === "DAILY_MAIN_MEAL_MISSING"));
  assert.ok(report.issues.some((value) => value.code === "EXCESSIVE_TEMPLATE_FAMILY_REPETITION"));
  assert.ok(report.issues.some((value) => value.code === "POST_WORKOUT_MAIN_EXPECTED"));
});

test("breakfast, pre-workout snack, post-workout main and evening snack form a valid day", () => {
  const candidate: AiMealPlanCandidate = { meals: [
    meal("BREAKFAST", "BREAKFAST_BREAD_EGGS_COFFEE_FRUIT", "BREAD_EGGS_WHOLE_APPLE"),
    meal("PRE_WORKOUT", "PRE_BREAD_CHEESE_FRUIT", "PRE_BREAD_CHEESE_WHOLE_APPLE"),
    meal("POST_WORKOUT", "MAIN_RICE_BEANS_BEEF_VEGETABLES", "BROWN_CARIOCA_BEEF_ZUCCHINI"),
    meal("EVENING_MEAL", "POST_YOGURT_FRUIT_OATS", "POST_SKIM_YOGURT_PAPAYA_OATS"),
  ] };
  const report = validateDailyMealBlueprint(context(), candidate);
  assert.equal(report.valid, true, JSON.stringify(report.issues));
  assert.equal(report.mainMealCount, 1);
  assert.equal(report.snackStyleMealCount, 3);
  assert.ok(report.stapleFamilyCount >= 2);
  assert.ok(report.proteinFamilyCount >= 2);
});

test("Brazilian four-meal routine requires both lunch and dinner independently of training relation", () => {
  const value = generationContext("hypertrophy", ["BREAKFAST", "MAIN_MEAL", "SNACK", "EVENING_MEAL"]);
  const displayTypes = ["BREAKFAST", "LUNCH", "AFTERNOON_SNACK", "DINNER"] as const;
  const relations = [null, null, "PRE_WORKOUT", "POST_WORKOUT"] as const;
  value.mealMacroTargets = value.mealMacroTargets.map((target, index) => ({
    ...target, mealDisplayType: displayTypes[index], trainingRelation: relations[index],
  }));
  const candidate: AiMealPlanCandidate = { meals: [
    meal("BREAKFAST", "BREAKFAST_BREAD_EGGS_COFFEE_FRUIT", "BREAD_EGGS_FRENCH_BANANA"),
    meal("MAIN_MEAL", "MAIN_RICE_BEANS_CHICKEN_VEGETABLES", "WHITE_CARIOCA_CHICKEN_BROCCOLI"),
    meal("SNACK", "BREAKFAST_YOGURT_OATS_FRUIT", "YOGURT_OATS_BANANA"),
    meal("EVENING_MEAL", "MAIN_RICE_BEANS_BEEF_VEGETABLES", "WHITE_CARIOCA_BEEF_CARROT"),
  ] };
  const report = validateDailyMealBlueprint(value, candidate);
  assert.equal(report.valid, true, JSON.stringify(report.issues));
  assert.equal(report.mainMealCount, 2);
});
