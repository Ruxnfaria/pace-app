import assert from "node:assert/strict";
import test from "node:test";
import { assessTrustedNutritionCatalog } from "../../food-catalog/capabilities";
import { buildMealPlanPromptContext } from "../generator";
import { generationContext, officialTestCatalog } from "../test-helpers";
import { buildDeterministicRealMealCandidate, nextCompatibleRealMealTemplate } from "./deterministic";
import { validateRealMealTemplates } from "./validator";
import { validateDailyMealBlueprint } from "../daily-blueprint/validator";

test("deterministic selection yields valid template-bound variety without free food choice", () => {
  const base = officialTestCatalog();
  const catalog = { ...base, portions: [], readiness: assessTrustedNutritionCatalog(base.entries).level };
  const context = generationContext("hypertrophy", ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"]);
  const prompt = buildMealPlanPromptContext(context, catalog);
  const plans = ["day-a", "day-b", "day-c"].map((seed) => buildDeterministicRealMealCandidate(context, prompt, seed));
  assert.ok(plans.every((plan) => validateRealMealTemplates(context, plan, prompt.templateSlots).valid));
  assert.ok(new Set(plans.map((plan) => plan.meals.map((meal) => meal.variantId).join("|"))).size >= 2);
  assert.ok(plans.every((plan) => plan.meals.every((meal) => meal.items.every((item) =>
    prompt.templateSlots.some((slot) => slot.options.some((option) => option.templateId === meal.templateId
      && option.components.some((component) => component.componentId === item.componentId
        && component.catalogEntryIds.includes(item.catalogEntryId))))))));
});

test("template switching keeps the role and moves to a server-approved alternative", () => {
  const base = officialTestCatalog();
  const catalog = { ...base, portions: [], readiness: assessTrustedNutritionCatalog(base.entries).level };
  const context = generationContext("hypertrophy", ["BREAKFAST", "MAIN_MEAL", "EVENING_MEAL"]);
  const prompt = buildMealPlanPromptContext(context, catalog);
  const current = prompt.templateSlots[0].options[0];
  const next = nextCompatibleRealMealTemplate(prompt.templateSlots[0], current.templateId, current.variantId);
  assert.ok(next);
  assert.notEqual(`${next.templateId}:${next.variantId}`, `${current.templateId}:${current.variantId}`);
  assert.equal(prompt.templateSlots[0].role, "BREAKFAST");
});

test("three deterministic whole days remain recognizable across all six product goal labels", (t) => {
  const base = officialTestCatalog();
  const catalog = { ...base, portions: [], readiness: assessTrustedNutritionCatalog(base.entries).level };
  const goalMappings = [
    ["HYPERTROPHY", "hypertrophy"], ["FAT_LOSS", "fat_loss"], ["BODY_RECOMP", "fat_loss"],
    ["STRENGTH", "hypertrophy"], ["CONDITIONING", "conditioning"], ["HEALTH", "fat_loss"],
  ] as const;
  for (const [productGoal, nutritionGoal] of goalMappings) {
    const context = generationContext(nutritionGoal, ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"]);
    const prompt = buildMealPlanPromptContext(context, catalog);
    const plans = [0, 1, 2].map((index) => buildDeterministicRealMealCandidate(
      context, prompt, `${productGoal.toLowerCase()}-human-review-${index + 1}`,
    ));
    assert.equal(plans.length, 3);
    assert.ok(plans.every((plan) => validateRealMealTemplates(context, plan, prompt.templateSlots).valid));
    assert.ok(plans.every((plan) => validateDailyMealBlueprint(context, plan).valid));
    assert.ok(plans.every((plan) => plan.meals.every((meal) => meal.label.length > 0 && meal.items.length >= 2)));
    t.diagnostic(`${productGoal}_SAMPLE_DAYS=${JSON.stringify(plans.map((plan) =>
      plan.meals.map((meal, index) => `${prompt.dailyBlueprint.mealIntents[index].intent}: ${meal.label}`)))}`);
  }
});
