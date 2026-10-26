import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildActiveMealPlan, formatMealRole, formatMealWindow, loadActiveMealPlan } from "./active-plan.ts";

const planRow = {
  id: "plan-1",
  version: 3,
  strategy_version: "strategy-v1",
  generator_version: "generator-v1",
  validator_version: "validator-v1",
  recommended_meals_per_day: 4,
  valid_from: "2026-10-26",
};

function mealRow(id: string, position: number, role: string, start = "11:32:00", end = "13:02:00", startOffset = 0, endOffset = 0) {
  return {
    id,
    meal_plan_id: "plan-1",
    position,
    role,
    label: `Meal ${position}`,
    window_start: start,
    window_end: end,
    window_start_day_offset: startOffset,
    window_end_day_offset: endOffset,
    target_calories: 625,
    target_protein_g: 27.5,
    target_carbs_g: 89.94,
    target_fat_g: 17.25,
    target_fiber_g: 8.75,
  };
}

function itemRow(mealId: string, position: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `${mealId}-item-${position}`,
    meal_id: mealId,
    position,
    food_catalog_entry_id: `food-${position}`,
    food_name: ["Frango grelhado", "Farinha de mandioca", "Castanha-do-Brasil", "Goiaba"][position - 1],
    quantity_grams: [49, 48, 12, 29][position - 1],
    calories: 100,
    protein_g: 10,
    carbs_g: 20,
    fat_g: 5,
    fiber_g: 2,
    catalog_source: "TACO",
    catalog_source_version: "taco-4ed-ampliada-2011",
    ...overrides,
  };
}

function activePlanFixture() {
  const meals = [
    mealRow("meal-4", 4, "EVENING_MEAL", "00:58:00", "02:28:00", 1, 1),
    mealRow("meal-2", 2, "PRE_WORKOUT"),
    mealRow("meal-1", 1, "BREAKFAST"),
    mealRow("meal-3", 3, "POST_WORKOUT"),
  ];
  const items = meals.flatMap((meal) => [4, 2, 1, 3].map((position) => itemRow(String(meal.id), position)));
  return buildActiveMealPlan(planRow, meals, items);
}

test("read model orders meals/items and calculates actual meal and daily totals from persisted items", () => {
  const plan = activePlanFixture();
  assert.deepEqual(plan.meals.map((meal) => meal.position), [1, 2, 3, 4]);
  assert.deepEqual(plan.meals[0].items.map((item) => item.position), [1, 2, 3, 4]);
  assert.deepEqual(
    {
      calories: plan.meals[0].actualCalories,
      proteinG: plan.meals[0].actualProteinG,
      carbsG: plan.meals[0].actualCarbsG,
      fatG: plan.meals[0].actualFatG,
      fiberG: plan.meals[0].actualFiberG,
    },
    { calories: 400, proteinG: 40, carbsG: 80, fatG: 20, fiberG: 8 },
  );
  assert.deepEqual(plan.actualTotals, { calories: 1600, proteinG: 160, carbsG: 320, fatG: 80, fiberG: 32 });
  assert.equal(plan.meals[0].targetCalories, 625);
  assert.notEqual(plan.meals[0].actualCalories, plan.meals[0].targetCalories);
});

test("role formatter translates known roles and fails safe for a future role", () => {
  assert.equal(formatMealRole("BREAKFAST"), "Café da manhã");
  assert.equal(formatMealRole("PRE_WORKOUT"), "Pré-treino");
  assert.equal(formatMealRole("POST_WORKOUT"), "Pós-treino");
  assert.equal(formatMealRole("EVENING_MEAL"), "Refeição noturna");
  assert.equal(formatMealRole("FUTURE_ROLE"), "Refeição");
});

test("cross-midnight formatter preserves the next-day meaning", () => {
  assert.equal(formatMealWindow("11:32:00", "13:02:00", 0, 0), "11:32 — 13:02");
  assert.equal(formatMealWindow("23:30:00", "00:30:00", 0, 1), "23:30 — 00:30 · termina no dia seguinte");
  assert.equal(formatMealWindow("00:58:00", "02:28:00", 1, 1), "00:58 — 02:28 · dia seguinte");
});

function mockClient(rows: { plan: typeof planRow | null; meals?: ReturnType<typeof mealRow>[]; items?: ReturnType<typeof itemRow>[] }) {
  const calls: Array<[string, unknown?]> = [];
  const client = {
    from(table: string) {
      calls.push(["from", table]);
      const data = table === "nutrition_meal_plan_meals" ? (rows.meals ?? []) : (rows.items ?? []);
      const query = {
        select(value: string) { calls.push([`${table}:select`, value]); return query; },
        eq(column: string, value: unknown) { calls.push([`${table}:eq:${column}`, value]); return query; },
        in(column: string, value: unknown) { calls.push([`${table}:in:${column}`, value]); return query; },
        order(column: string, value: unknown) { calls.push([`${table}:order:${column}`, value]); return query; },
        limit(value: number) { calls.push([`${table}:limit`, value]); return query; },
        async maybeSingle() { return { data: rows.plan, error: null }; },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) { return Promise.resolve(resolve({ data, error: null })); },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test("loader reads the newest active owner plan through the authenticated client only", async () => {
  const meals = [
    mealRow("meal-1", 1, "BREAKFAST"),
    mealRow("meal-2", 2, "PRE_WORKOUT"),
    mealRow("meal-3", 3, "POST_WORKOUT"),
    mealRow("meal-4", 4, "EVENING_MEAL"),
  ];
  const { client, calls } = mockClient({ plan: planRow, meals, items: meals.map((meal) => itemRow(String(meal.id), 1)) });
  const plan = await loadActiveMealPlan(client, "owner-user-id");
  assert.equal(plan?.id, "plan-1");
  assert.deepEqual(calls.slice(0, 3), [
    ["from", "nutrition_meal_plans"],
    ["nutrition_meal_plans:select", "id,version,strategy_version,generator_version,validator_version,recommended_meals_per_day,valid_from"],
    ["nutrition_meal_plans:eq:user_id", "owner-user-id"],
  ]);
  assert.ok(calls.some(([name, value]) => name === "nutrition_meal_plans:eq:status" && value === "active"));
  assert.deepEqual(calls.filter(([name]) => name === "from").map(([, table]) => table), [
    "nutrition_meal_plans",
    "nutrition_meal_plan_meals",
    "nutrition_meal_plan_items",
  ]);
});

test("missing active plan returns null and never reads child tables", async () => {
  const { client, calls } = mockClient({ plan: null });
  assert.equal(await loadActiveMealPlan(client, "owner-user-id"), null);
  assert.deepEqual(calls.filter(([name]) => name === "from"), [["from", "nutrition_meal_plans"]]);
});

test("active status filter excludes superseded and inactive plans at the read boundary", async () => {
  const { client, calls } = mockClient({ plan: null });
  await loadActiveMealPlan(client, "owner-user-id");
  assert.ok(calls.some(([name, value]) => name === "nutrition_meal_plans:eq:status" && value === "active"));
  assert.equal(calls.some(([, value]) => value === "superseded" || value === "pending"), false);
});

test("an active plan without persisted meals fails closed instead of rendering a false ready state", async () => {
  const { client } = mockClient({ plan: planRow, meals: [] });
  await assert.rejects(loadActiveMealPlan(client, "owner-user-id"), /incomplete/);
});
