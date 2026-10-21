import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./openai-generator.ts", import.meta.url), "utf8");

test("AI response schema accepts only server-provided catalog IDs and gram quantities", () => {
  assert.match(source, /catalogEntryId:\s*\{\s*type:\s*"string",\s*enum:\s*catalog\.candidates\.map/);
  assert.match(source, /quantityGrams:\s*\{\s*type:\s*"number",\s*exclusiveMinimum:\s*0/);
  assert.doesNotMatch(source, /foodQuery:\s*\{/);
  assert.doesNotMatch(source, /quantityUnit:\s*\{/);
});

test("controlled repair receives the same constrained catalog instead of free-text suggestions", () => {
  const repairBlock = source.match(/repair\([\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(repairBlock, /catalog:\s*MealPlanCatalogPromptContext/);
  assert.match(repairBlock, /catalog\s*\},\s*catalog\)/);
  assert.match(repairBlock, /numericDiagnostics:\s*diagnostics/);
  assert.doesNotMatch(repairBlock, /controlledCatalogSuggestions|catalogFeedback/);
});
