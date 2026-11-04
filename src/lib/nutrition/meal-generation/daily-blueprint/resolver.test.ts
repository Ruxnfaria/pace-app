import assert from "node:assert/strict";
import test from "node:test";
import { generationContext } from "../test-helpers";
import { resolveDailyMealBlueprint } from "./resolver";

function lateTrainingFourMealContext() {
  const context = generationContext("hypertrophy", ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"]);
  context.trainingPeriod = "evening";
  context.mealWindows = [
    { position: 1, start: "11:32", end: "12:02", startDayOffset: 0, endDayOffset: 0 },
    { position: 2, start: "16:01", end: "16:31", startDayOffset: 0, endDayOffset: 0 },
    { position: 3, start: "20:29", end: "21:00", startDayOffset: 0, endDayOffset: 0 },
    { position: 4, start: "00:58", end: "01:28", startDayOffset: 1, endDayOffset: 1 },
  ];
  return context;
}

test("late training four-meal day resolves post-workout main and evening snack", () => {
  const blueprint = resolveDailyMealBlueprint(lateTrainingFourMealContext());
  assert.deepEqual(blueprint.mealIntents.map((meal) => meal.intent),
    ["BREAKFAST", "PRE_WORKOUT_SNACK", "POST_WORKOUT_MAIN", "EVENING_SNACK"]);
  assert.equal(blueprint.minimumMainMeals, 1);
});

test("three-meal blueprint guarantees a main meal without inventing a snack", () => {
  const context = generationContext("fat_loss", ["BREAKFAST", "MAIN_MEAL", "EVENING_MEAL"]);
  const blueprint = resolveDailyMealBlueprint(context);
  assert.deepEqual(blueprint.mealIntents.map((meal) => meal.intent), ["BREAKFAST", "MAIN_MEAL", "EVENING_MAIN"]);
});

test("five-meal blueprint preserves main meal and training semantics", () => {
  const context = generationContext("conditioning",
    ["BREAKFAST", "MAIN_MEAL", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"]);
  const blueprint = resolveDailyMealBlueprint(context);
  assert.ok(blueprint.mealIntents.some((meal) => meal.intent === "MAIN_MEAL"));
  assert.ok(blueprint.mealIntents.some((meal) => meal.intent === "POST_WORKOUT_MAIN"));
  assert.equal(blueprint.mealIntents.at(-1)?.intent, "EVENING_SNACK");
});
