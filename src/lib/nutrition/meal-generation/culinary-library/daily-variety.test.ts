import assert from "node:assert/strict";
import test from "node:test";
import { assessTrustedNutritionCatalog } from "../../food-catalog/capabilities";
import { buildMealPlanPromptContext } from "../generator";
import { buildDeterministicRealMealCandidate } from "../real-meal-templates/deterministic";
import { generationContext, officialTestCatalog } from "../test-helpers";
import { assessDailyCulinaryVariety, emptyDailyVarietyState, recordDailyVarietySelection,
  scoreDailyVarietyOption } from "./daily-variety";

function fixture() {
  const base = officialTestCatalog();
  const catalog = { ...base, portions: [], readiness: assessTrustedNutritionCatalog(base.entries).level };
  const context = generationContext("hypertrophy", ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"]);
  const prompt = buildMealPlanPromptContext(context, catalog);
  return { context, prompt };
}

test("daily variety prefers a novel culinary family, staple, protein and fruit when options remain valid", () => {
  const { prompt } = fixture();
  const first = prompt.recipeSlots[0].options.find((option) => option.recipeId === "FRENCH_BREAD_MINAS_CHEESE_BANANA")!;
  const firstTemplate = prompt.templateSlots[0].options.find((option) => option.templateId === first.templateId
    && option.variantId === first.templateVariantId)!;
  const state = emptyDailyVarietyState();
  recordDailyVarietySelection(state, first, firstTemplate,
    first.components.filter((component) => component.required).map((component) => component.catalogEntryIds[0]));

  const repeated = prompt.recipeSlots[1].options.find((option) => option.recipeId === "FRENCH_BREAD_MINAS_CHEESE_BANANA")!;
  const varied = prompt.recipeSlots[1].options.find((option) => option.recipeId === "FRENCH_BREAD_BOILED_EGGS_PAPAYA")!;
  const repeatedTemplate = prompt.templateSlots[1].options.find((option) => option.templateId === repeated.templateId
    && option.variantId === repeated.templateVariantId)!;
  const variedTemplate = prompt.templateSlots[1].options.find((option) => option.templateId === varied.templateId
    && option.variantId === varied.templateVariantId)!;
  assert.ok(scoreDailyVarietyOption(varied, variedTemplate, state)
    > scoreDailyVarietyOption(repeated, repeatedTemplate, state));
});

test("deterministic whole-day selection activates variety without leaving server-authorized recipes", () => {
  const { context, prompt } = fixture();
  const candidate = buildDeterministicRealMealCandidate(context, prompt, "daily-variety-regression");
  const report = assessDailyCulinaryVariety(candidate, prompt.recipeSlots, prompt.templateSlots);
  assert.ok(new Set(report.recipeFamilies).size >= 3);
  assert.equal(candidate.meals.every((meal, index) => prompt.recipeSlots[index].options.some((option) =>
    option.recipeId === meal.recipeId && option.recipeVariantId === meal.recipeVariantId)), true);
});

test("repetition remains representable when authorized choices are limited", () => {
  const { prompt } = fixture();
  const option = prompt.recipeSlots[0].options.find((value) => value.recipeId === "FRENCH_BREAD_BOILED_EGGS_BANANA")!;
  const template = prompt.templateSlots[0].options.find((value) => value.templateId === option.templateId
    && value.variantId === option.templateVariantId)!;
  const state = emptyDailyVarietyState();
  const selectedIds = option.components.filter((component) => component.required).map((component) => component.catalogEntryIds[0]);
  recordDailyVarietySelection(state, option, template, selectedIds);
  const repeatedScore = scoreDailyVarietyOption(option, template, state);
  assert.equal(Number.isFinite(repeatedScore), true);
  assert.ok(repeatedScore < 0);
});
