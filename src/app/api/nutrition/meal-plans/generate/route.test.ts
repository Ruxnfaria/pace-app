import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("meal-plan route stays authenticated, server-only and exposes safe errors", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /requireActiveSubscription/);
  assert.match(source, /generateMealPlanForUser/);
  assert.match(source, /Cache-Control": "no-store"/);
  assert.doesNotMatch(source, /OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /prompt|messages/);
  assert.doesNotMatch(source, /error\.message/);
});

test("OpenAI adapter uses strict structured output without nutrient authority fields", async () => {
  const source = await readFile(new URL("../../../../../lib/nutrition/meal-generation/openai-generator.ts", import.meta.url), "utf8");
  assert.match(source, /type: "json_schema"/);
  assert.match(source, /strict: true/);
  assert.doesNotMatch(source, /calories.*properties|proteinG.*properties|carbsG.*properties|fatG.*properties|fiberG.*properties/);
});
