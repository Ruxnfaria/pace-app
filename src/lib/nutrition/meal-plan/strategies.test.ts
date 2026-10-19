import assert from "node:assert/strict";
import test from "node:test";
import { NUTRITION_GOAL_STRATEGY_VERSION } from "./domain";
import { NUTRITION_GOAL_STRATEGIES } from "./strategies";

test("declara as três estratégias versionadas sem confundir conditioning com fat loss", () => {
  assert.deepEqual(Object.keys(NUTRITION_GOAL_STRATEGIES).sort(), ["conditioning", "fat_loss", "hypertrophy"]);
  for (const strategy of Object.values(NUTRITION_GOAL_STRATEGIES)) {
    assert.equal(strategy.version, NUTRITION_GOAL_STRATEGY_VERSION);
    for (const field of [
      "energyIntent", "proteinPolicy", "fatPolicy", "carbPriority", "fiberPolicy",
      "mealDistributionPolicy", "preWorkoutPolicy", "postWorkoutPolicy",
      "satietyPriority", "digestionPriority",
    ] as const) assert.ok(strategy[field]);
  }
  assert.equal(NUTRITION_GOAL_STRATEGIES.fat_loss.energyIntent, "honor_authoritative_deficit");
  assert.equal(NUTRITION_GOAL_STRATEGIES.hypertrophy.fatPolicy, "avoid_surplus_concentration");
  assert.equal(NUTRITION_GOAL_STRATEGIES.conditioning.energyIntent, "support_performance");
  assert.equal(NUTRITION_GOAL_STRATEGIES.conditioning.carbPriority, "performance_priority");
});
