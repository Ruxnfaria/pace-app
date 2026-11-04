import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./openai-generator.ts", import.meta.url), "utf8");

test("AI response schema accepts only server-provided templates, components and catalog IDs", () => {
  assert.match(source, /catalogEntryId:\s*\{\s*type:\s*"string" as const,\s*enum:\s*component\.catalogEntryIds/);
  assert.match(source, /componentId:\s*\{\s*type:\s*"string" as const,\s*const:\s*component\.componentId/);
  assert.match(source, /templateId:\s*\{\s*type:\s*"string" as const,\s*const:\s*option\.templateId/);
  assert.match(source, /variantId:\s*\{\s*type:\s*"string" as const,\s*const:\s*option\.variantId/);
  assert.match(source, /const mealSchemas = catalog\.templateSlots\.map/);
  assert.match(source, /meals:\s*\{[^}]*minItems:\s*mealSchemas\.length[^}]*maxItems:\s*mealSchemas\.length/);
  assert.match(source, /quantityGrams:\s*\{\s*type:\s*"number" as const,\s*minimum:\s*component\.minimumGrams,\s*maximum:\s*component\.maximumGrams/);
  assert.doesNotMatch(source, /foodQuery:\s*\{/);
  assert.doesNotMatch(source, /quantityUnit:\s*\{/);
});

test("controlled repair receives server real-meal templates instead of free-text foods", () => {
  const repairBlock = source.match(/repair\([\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(repairBlock, /catalog:\s*MealPlanCatalogPromptContext/);
  assert.match(repairBlock, /catalog\s*\},\s*catalog\)/);
  assert.match(repairBlock, /numericDiagnostics:\s*diagnostics/);
  assert.match(source, /escolhe somente templateId e variantId de refeições reais oferecidos pelo servidor/);
  assert.match(source, /não use pools globais/);
  assert.doesNotMatch(repairBlock, /controlledCatalogSuggestions|catalogFeedback/);
});
