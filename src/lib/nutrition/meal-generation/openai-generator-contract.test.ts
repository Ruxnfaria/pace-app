import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./openai-generator.ts", import.meta.url), "utf8");

test("AI response schema accepts only server-provided catalog IDs and gram quantities", () => {
  assert.match(source, /catalogEntryId:\s*\{\s*type:\s*"string" as const,\s*enum:\s*slot\.catalogEntryIds/);
  assert.match(source, /slot:\s*\{\s*type:\s*"string" as const,\s*const:\s*slot\.pool/);
  assert.match(source, /items:\s*\{\s*anyOf:\s*slotSchemas/);
  assert.match(source, /quantityGrams:\s*\{\s*type:\s*"number" as const,\s*exclusiveMinimum:\s*0/);
  assert.doesNotMatch(source, /foodQuery:\s*\{/);
  assert.doesNotMatch(source, /quantityUnit:\s*\{/);
});

test("controlled repair receives server pool slots instead of free-text suggestions", () => {
  const repairBlock = source.match(/repair\([\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(repairBlock, /catalog:\s*MealPlanCatalogPromptContext/);
  assert.match(repairBlock, /catalog\s*\},\s*catalog\)/);
  assert.match(repairBlock, /numericDiagnostics:\s*diagnostics/);
  assert.match(source, /Escolha somente catalogEntryId permitido para o pool do slot/);
  assert.doesNotMatch(repairBlock, /controlledCatalogSuggestions|catalogFeedback/);
});
