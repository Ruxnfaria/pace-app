import assert from "node:assert/strict";
import test from "node:test";
import { assessTrustedNutritionCatalog } from "../../food-catalog/capabilities";
import { balancedCandidate, generationContext, officialTestCatalog } from "../test-helpers";
import { buildRealMealTemplateSlots } from "./catalog";
import { validateRealMealTemplates } from "./validator";

function fixture() {
  const base = officialTestCatalog();
  const catalog = { ...base, portions: [], readiness: assessTrustedNutritionCatalog(base.entries).level };
  const context = generationContext("hypertrophy", ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"]);
  const slots = buildRealMealTemplateSlots(context, catalog);
  return { context, catalog, slots };
}

test("normal Brazilian breakfast, pre-workout and main meals satisfy their real templates", () => {
  const { context, slots } = fixture();
  const report = validateRealMealTemplates(context, balancedCandidate(context.mealRoles), slots);
  assert.equal(report.valid, true, JSON.stringify(report.issues));
});

test("one food cannot fill two semantic components", () => {
  const { context, slots } = fixture();
  const candidate = balancedCandidate(context.mealRoles);
  candidate.meals[0].items[0].catalogEntryId = candidate.meals[0].items[1].catalogEntryId;
  const report = validateRealMealTemplates(context, candidate, slots);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "PAIRING_VALID"));
});

test("the real bad E2E composition cannot be represented by an approved template", () => {
  const { context, slots } = fixture();
  const candidate = balancedCandidate(context.mealRoles);
  candidate.meals[0].items = [
    { componentId: "BREAD", catalogEntryId: "soy-bread", slot: "CARB_ANCHOR", quantityGrams: 90 },
    { componentId: "TOAST", catalogEntryId: "toast", slot: "CARB_ANCHOR", quantityGrams: 80 },
    { componentId: "SEEDS", catalogEntryId: "flax", slot: "FAT_ANCHOR", quantityGrams: 20 },
    { componentId: "FRUIT", catalogEntryId: "banana", slot: "PRODUCE_FIBER", quantityGrams: 60 },
  ];
  candidate.meals[1].items = [
    { componentId: "PROTEIN", catalogEntryId: "pintado", slot: "PROTEIN_ANCHOR", quantityGrams: 70 },
    { componentId: "FAROFA", catalogEntryId: "farofa", slot: "CARB_ANCHOR", quantityGrams: 130 },
    { componentId: "PEANUTS", catalogEntryId: "peanuts", slot: "FAT_ANCHOR", quantityGrams: 15 },
    { componentId: "BEANS", catalogEntryId: "jalo", slot: "LEGUME_ANCHOR", quantityGrams: 60 },
  ];
  const report = validateRealMealTemplates(context, candidate, slots);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => ["FOOD_ALLOWED_FOR_COMPONENT", "OPTIONAL_COMPONENT_ALLOWED",
    "REQUIRED_COMPONENTS_COMPLETE"].includes(issue.code)));
});

test("optional spread is accepted only in its bounded declared component", () => {
  const { context, catalog, slots } = fixture();
  const candidate = balancedCandidate(context.mealRoles);
  candidate.meals[0].items.push({ componentId: "SPREAD", catalogEntryId: catalog.entries.find((entry) =>
    entry.sourceFoodId === "468")!.id, slot: "FAT_ANCHOR", quantityGrams: 15 });
  assert.equal(validateRealMealTemplates(context, candidate, slots).valid, true);
  candidate.meals[0].items.at(-1)!.componentId = "BREAD";
  assert.equal(validateRealMealTemplates(context, candidate, slots).valid, false);
});

test("server validator rejects one optional component beyond the template maximum", () => {
  const { context, slots } = fixture();
  const candidate = balancedCandidate(context.mealRoles);
  const option = slots[0].options.find((value) =>
    value.components.filter((component) => !component.required).length > value.maximumOptionalComponents)!;
  const required = option.components.filter((component) => component.required);
  const optional = option.components.filter((component) => !component.required);
  candidate.meals[0] = {
    role: slots[0].role,
    templateId: option.templateId,
    variantId: option.variantId,
    label: option.displayName,
    items: [...required, ...optional.slice(0, option.maximumOptionalComponents + 1)].map((component) => ({
      componentId: component.componentId,
      catalogEntryId: component.catalogEntryIds[0],
      slot: component.slot,
      quantityGrams: component.minimumGrams,
    })),
  };

  const report = validateRealMealTemplates(context, candidate, slots);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "MAX_OPTIONAL_COMPONENTS"));
});

test("template component portion bounds cannot be bypassed", () => {
  const { context, slots } = fixture();
  const candidate = balancedCandidate(context.mealRoles);
  candidate.meals[0].items.find((item) => item.componentId === "BREAD")!.quantityGrams = 500;
  const report = validateRealMealTemplates(context, candidate, slots);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "COMPONENT_PORTION_RANGE"));
});
