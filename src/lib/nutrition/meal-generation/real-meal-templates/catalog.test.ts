import assert from "node:assert/strict";
import test from "node:test";
import { assessTrustedNutritionCatalog } from "../../food-catalog/capabilities";
import { generationContext, officialTestCatalog } from "../test-helpers";
import { auditRealMealTemplateAvailability, buildRealMealTemplateSlots,
  buildTemplateConstrainedCandidates } from "./catalog";

function fixture() {
  const base = officialTestCatalog();
  const catalog = { ...base, portions: [], readiness: assessTrustedNutritionCatalog(base.entries).level };
  return { context: generationContext("hypertrophy", ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"]), catalog };
}

test("template catalog exposes only foods reachable through server-defined components", () => {
  const { context, catalog } = fixture();
  const slots = buildRealMealTemplateSlots(context, catalog);
  const candidates = buildTemplateConstrainedCandidates(context, catalog, slots);
  const reachable = new Set(slots.flatMap((slot) => slot.options.flatMap((option) =>
    option.components.flatMap((component) => component.catalogEntryIds))));
  assert.ok(slots.every((slot) => slot.options.length > 0));
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((candidate) => reachable.has(candidate.catalogEntryId)
    && candidate.source === "TACO" && candidate.sourceFoodId));
});

test("disliked foods eliminate dependent variants instead of arbitrary substitution", () => {
  const { context, catalog } = fixture();
  const egg = catalog.entries.find((entry) => entry.sourceFoodId === "488")!;
  const filtered = buildRealMealTemplateSlots({ ...context, dislikedFoods: [egg.canonicalName] }, catalog);
  assert.equal(filtered[0].options.some((option) => option.templateId === "BREAKFAST_BREAD_EGGS_COFFEE_FRUIT"), false);
  assert.ok(filtered[0].options.some((option) => option.templateId === "BREAKFAST_YOGURT_OATS_FRUIT"));
});

test("incomplete source nutrients block a template instead of becoming invented zeroes", () => {
  const { context, catalog } = fixture();
  const audit = auditRealMealTemplateAvailability(context, catalog);
  const milk = audit.find((value) => value.templateId === "BREAKFAST_BREAD_EGGS_MILK_COFFEE");
  const pasta = audit.find((value) => value.templateId === "MAIN_PASTA_MEAT_VEGETABLES");
  assert.equal(milk?.feasible, false);
  assert.ok(milk?.reasons.includes("MISSING_MILK"));
  assert.equal(pasta?.feasible, false);
});
