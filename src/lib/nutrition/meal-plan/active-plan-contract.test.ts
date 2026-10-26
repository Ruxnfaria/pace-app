import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../../../", import.meta.url);

test("active meal plan read path preserves owner RLS and has no writes or privileged client", async () => {
  const source = await readFile(new URL("lib/nutrition/meal-plan/active-plan.ts", root), "utf8");
  assert.match(source, /\.eq\("user_id", userId\)/);
  assert.match(source, /\.eq\("status", "active"\)/);
  assert.match(source, /nutrition_meal_plan_meals/);
  assert.match(source, /nutrition_meal_plan_items/);
  assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE_KEY|createClient\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.rpc\(/);
});

test("nutrition page keeps target and meal-plan loading/errors independent", async () => {
  const page = await readFile(new URL("app/dashboard/nutrition/page.tsx", root), "utf8");
  for (const state of ["targetLoading", "mealPlanLoading", "targetLoadFailed", "mealPlanLoadFailed"]) assert.match(page, new RegExp(state));
  assert.match(page, /loadActiveNutritionTarget/);
  assert.match(page, /loadActiveMealPlan/);
  assert.match(page, /readyContent=\{mealPlan \? <ActiveMealPlan/);
  assert.match(page, /Consumo de hoje/);
  assert.match(page, /Nenhum consumo registrado/);
});

test("ready reload is wired to the read loader and never to generation/retry", async () => {
  const page = await readFile(new URL("app/dashboard/nutrition/page.tsx", root), "utf8");
  const preparation = await readFile(new URL("components/post-onboarding/MealPlanPreparation.tsx", root), "utf8");
  assert.match(page, /reloadReady=\{\(\) => void loadMealPlan\(\)\}/);
  assert.match(preparation, /onClick=\{reloadReady\}/);
  const readyBranch = preparation.slice(preparation.indexOf('if (value === "ready")'), preparation.indexOf("const Icon"));
  assert.doesNotMatch(readyBranch, /retry\(|\/api\/post-onboarding\/process|generate/);
});
