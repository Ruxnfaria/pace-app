import assert from "node:assert/strict";
import test from "node:test";

import { deriveMealFuelLevel, fuelCarbohydratePortionRange } from "./fuel-level";
import { allBrazilianMealArchetypes, mealArchetypeFor } from "./meal-archetypes";
import type { NutritionQualityGoal } from "./domain";

test("Brazilian defaults define recognizable breakfast, main, snack and training meals", () => {
  const archetypes = allBrazilianMealArchetypes();
  assert.deepEqual(new Set(archetypes.map((item) => item.role)), new Set([
    "BREAKFAST", "MAIN_MEAL", "PRE_WORKOUT", "POST_WORKOUT", "SNACK", "EVENING_MEAL",
  ]));
  assert.equal(mealArchetypeFor("BREAKFAST", "health").id, "BRAZILIAN_BREAKFAST_V1");
  assert.equal(mealArchetypeFor("MAIN_MEAL", "hypertrophy").id, "BRAZILIAN_MAIN_MEAL_V1");
});

test("all six goals resolve deterministic meal architecture", () => {
  const goals: NutritionQualityGoal[] = ["fat_loss", "body_recomposition", "hypertrophy", "strength", "conditioning", "health"];
  for (const goal of goals) assert.match(mealArchetypeFor("MAIN_MEAL", goal).id, /BRAZILIAN_MAIN_MEAL_V1/);
});

test("fuel levels change approved carbohydrate portion bands without changing food quality", () => {
  assert.equal(deriveMealFuelLevel({ goal: "fat_loss", role: "SNACK", targetCarbsG: 20 }), "LOW");
  assert.equal(deriveMealFuelLevel({ goal: "health", role: "MAIN_MEAL", targetCarbsG: 45 }), "MODERATE");
  assert.equal(deriveMealFuelLevel({ goal: "conditioning", role: "POST_WORKOUT", targetCarbsG: 65 }), "HIGH");
  const low = fuelCarbohydratePortionRange("LOW");
  const moderate = fuelCarbohydratePortionRange("MODERATE");
  const high = fuelCarbohydratePortionRange("HIGH");
  assert.ok(low.maximumGrams < moderate.maximumGrams && moderate.maximumGrams < high.maximumGrams);
});
