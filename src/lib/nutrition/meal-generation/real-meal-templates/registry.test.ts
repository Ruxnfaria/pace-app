import assert from "node:assert/strict";
import test from "node:test";
import { REAL_MEAL_TEMPLATE_VERSION } from "./domain";
import { allRealMealTemplates } from "./registry";

test("V1 registry is small, deterministic and structurally diverse", () => {
  const templates = allRealMealTemplates();
  const variants = templates.flatMap((template) => template.variants);
  assert.ok(templates.length >= 18 && templates.length <= 30);
  assert.ok(variants.length >= 30 && variants.length <= 60);
  assert.equal(new Set(templates.map((template) => template.id)).size, templates.length);
  assert.equal(new Set(variants.map((variant) => variant.id)).size, variants.length);
  assert.ok(templates.every((template) => template.version === REAL_MEAL_TEMPLATE_VERSION
    && template.culture === "BRAZILIAN" && template.components.length >= 2));
  assert.ok(templates.some((template) => template.id.includes("CUSCUZ")));
  assert.ok(templates.some((template) => template.id.includes("YOGURT")));
  assert.ok(templates.some((template) => template.id.includes("LENTILS")));
  assert.ok(templates.some((template) => template.id.includes("FISH")));
});

test("spread and beverage components are bounded culinary support, never global macro anchors", () => {
  const components = allRealMealTemplates().flatMap((template) => template.components);
  const spreads = components.filter((component) => component.id === "SPREAD");
  const coffee = components.filter((component) => component.id === "COFFEE");
  assert.ok(spreads.length > 0 && spreads.every((component) => !component.required
    && component.maximumGrams <= 30 && component.slot === "FAT_ANCHOR"));
  assert.ok(coffee.length > 0 && coffee.every((component) => !component.required
    && component.presentationGroup === "COFFEE_BEVERAGE"));
});

test("every variant assigns at most one source-food bundle to each component", () => {
  for (const template of allRealMealTemplates()) {
    const componentIds = new Set(template.components.map((component) => component.id));
    assert.equal(componentIds.size, template.components.length);
    for (const variant of template.variants) {
      assert.ok(Object.keys(variant.componentSourceFoodIds).every((componentId) => componentIds.has(componentId)));
      assert.ok(Object.values(variant.componentSourceFoodIds).every((ids) => ids.length > 0));
    }
  }
});

test("every template declares daily-planning family, style, intent, staple and protein metadata", () => {
  for (const template of allRealMealTemplates()) {
    assert.ok(template.familyId.length > 0);
    assert.ok(["BREAKFAST", "MAIN", "SNACK"].includes(template.mealStyle));
    assert.ok(template.allowedIntents.length > 0);
    assert.ok(template.stapleFamily.length > 0);
    assert.ok(template.proteinFamily.length > 0);
  }
  assert.ok(allRealMealTemplates().some((template) => template.mealStyle === "MAIN"));
  assert.ok(allRealMealTemplates().some((template) => template.mealStyle === "BREAKFAST"));
  assert.ok(allRealMealTemplates().some((template) => template.mealStyle === "SNACK"));
});
