import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import type { MealPlanCatalogPromptContext } from "./domain";
import { buildRealMealTemplateSlots } from "./real-meal-templates/catalog";
import { buildCulinaryRecipeSlots } from "./culinary-library/integration";
import { generationContext, officialTestCatalog } from "./test-helpers";

const source = readFileSync(new URL("./openai-generator.ts", import.meta.url), "utf8");

type ResponseSchema = {
  schema: { properties: { meals: { items: { anyOf: Array<{ anyOf: Array<{
    properties: { components: { minItems: number; maxItems: number } };
  }> }> } } } };
};

function loadSchemaBuilder() {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const testModule = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(compiled, {
    module: testModule,
    exports: testModule.exports,
    require: (specifier: string) => {
      if (specifier === "server-only") return {};
      throw new Error(`Unexpected runtime import in schema test: ${specifier}`);
    },
  });
  return testModule.exports.buildMealPlanResponseSchema as
    (catalog: MealPlanCatalogPromptContext) => ResponseSchema;
}

function schemaCatalog(requiredCount: number, optionalCount: number, maximumOptionalComponents: number) {
  const component = (index: number, required: boolean) => ({
    componentId: `${required ? "REQUIRED" : "OPTIONAL"}_${index}`,
    slot: "CARB_ANCHOR" as const,
    required,
    catalogEntryIds: [`food-${index}`],
    minimumGrams: 10,
    maximumGrams: 100,
    presentationGroup: "fixture",
  });
  return {
    recipeSlots: [{
      position: 1,
      role: "BREAKFAST" as const,
      intent: "BREAKFAST" as const,
      options: [{
        recipeId: "TEST_RECIPE",
        recipeVersion: "praxe-culinary-library-v1",
        recipeFamilyId: "test-recipe-family",
        recipeVariantId: "TEST_RECIPE_V1",
        recipeDisplayName: "Test meal",
        templateId: "TEST_TEMPLATE",
        templateVariantId: "TEST_VARIANT",
        mealRole: "BREAKFAST" as const,
        mealIntent: "BREAKFAST" as const,
        preparationDescription: "Test",
        maximumOptionalComponents,
        components: [
          ...Array.from({ length: requiredCount }, (_, index) => component(index, true)),
          ...Array.from({ length: optionalCount }, (_, index) => component(requiredCount + index, false)),
        ],
      }],
    }],
  } as unknown as MealPlanCatalogPromptContext;
}

function componentBounds(schema: ResponseSchema) {
  const components = schema.schema.properties.meals.items.anyOf[0].anyOf[0].properties.components;
  return { minItems: components.minItems, maxItems: components.maxItems };
}

test("AI response schema accepts only server-provided templates, components and catalog IDs", () => {
  assert.match(source, /catalogEntryId:\s*\{\s*type:\s*"string" as const,\s*enum:\s*component\.catalogEntryIds/);
  assert.match(source, /componentId:\s*\{\s*type:\s*"string" as const,\s*const:\s*component\.componentId/);
  assert.match(source, /templateId:\s*\{\s*type:\s*"string" as const,\s*const:\s*option\.templateId/);
  assert.match(source, /variantId:\s*\{\s*type:\s*"string" as const,\s*const:\s*option\.templateVariantId/);
  assert.match(source, /recipeId:\s*\{\s*type:\s*"string" as const,\s*const:\s*option\.recipeId/);
  assert.match(source, /recipeVersion:\s*\{\s*type:\s*"string" as const,\s*const:\s*option\.recipeVersion/);
  assert.match(source, /const mealSchemas = catalog\.recipeSlots\.map/);
  assert.match(source, /meals:\s*\{[^}]*minItems:\s*mealSchemas\.length[^}]*maxItems:\s*mealSchemas\.length/);
  assert.match(source, /quantityGrams:\s*\{\s*type:\s*"number" as const,\s*minimum:\s*component\.minimumGrams,\s*maximum:\s*component\.maximumGrams/);
  assert.doesNotMatch(source, /foodQuery:\s*\{/);
  assert.doesNotMatch(source, /quantityUnit:\s*\{/);
});

test("controlled repair receives server culinary recipes instead of free-text foods", () => {
  const repairBlock = source.match(/repair\([\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(repairBlock, /catalog:\s*MealPlanCatalogPromptContext/);
  assert.match(repairBlock, /catalog\s*\},\s*catalog\)/);
  assert.match(repairBlock, /numericDiagnostics:\s*diagnostics/);
  assert.match(source, /recipeId\/recipeVersion\/recipeFamilyId\/recipeVariantId explicitamente oferecida pelo servidor/);
  assert.match(source, /não use pools globais/);
  assert.doesNotMatch(repairBlock, /controlledCatalogSuggestions|catalogFeedback/);
});

test("response schema caps optional components at the server recipe allowance", () => {
  const buildSchema = loadSchemaBuilder();
  assert.deepEqual(componentBounds(buildSchema(schemaCatalog(3, 2, 1))), { minItems: 3, maxItems: 4 });
  assert.deepEqual(componentBounds(buildSchema(schemaCatalog(4, 2, 1))), { minItems: 4, maxItems: 5 });
  assert.deepEqual(componentBounds(buildSchema(schemaCatalog(3, 0, 1))), { minItems: 3, maxItems: 3 });
  assert.deepEqual(componentBounds(buildSchema(schemaCatalog(3, 2, 5))), { minItems: 3, maxItems: 5 });
});

test("every viable registry option exposes the same optional cap as the server validator", () => {
  const base = officialTestCatalog();
  const catalogSnapshot = { ...base, portions: [], readiness: assessTrustedNutritionCatalog(base.entries).level };
  const context = generationContext("hypertrophy", ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"]);
  const templateSlots = buildRealMealTemplateSlots(context, catalogSnapshot);
  const recipeSlots = buildCulinaryRecipeSlots(context, catalogSnapshot, templateSlots);
  const catalog = { templateSlots, recipeSlots } as unknown as MealPlanCatalogPromptContext;
  const schema = loadSchemaBuilder()(catalog);

  recipeSlots.forEach((slot, slotIndex) => slot.options.forEach((option, optionIndex) => {
    const requiredCount = option.components.filter((component) => component.required).length;
    const optionalCount = option.components.length - requiredCount;
    const bounds = schema.schema.properties.meals.items.anyOf[slotIndex].anyOf[optionIndex]
      .properties.components;
    assert.equal(bounds.minItems, requiredCount, `${option.recipeId}/${option.recipeVariantId} required count`);
    assert.equal(bounds.maxItems,
      requiredCount + Math.min(option.maximumOptionalComponents, optionalCount),
      `${option.recipeId}/${option.recipeVariantId} optional cap`);
  }));
});

test("system instruction treats optional components as optional server-side rules", () => {
  assert.match(source, /Inclua todos os ingredientes required/);
  assert.match(source, /Ingredientes opcionais são realmente opcionais/);
  assert.match(source, /respeite maximumOptionalComponents/);
  assert.match(source, /não inclua um opcional apenas para preencher macronutrientes/);
  assert.match(source, /repair pode escolher outra receita, mas somente dentre as opções server-defined/);
});
