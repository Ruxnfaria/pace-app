import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { formatNutritionTarget, loadActiveNutritionTarget, parseActiveNutritionTarget } from "./active-target.ts";

test("normaliza o snapshot ativo preservando calorias, macros e fibra", () => {
  const target = parseActiveNutritionTarget({ version: 1, calories: "2500.00", protein_g: "110.00", carbs_g: "359.75", fat_g: "69.00", fiber_g: "35.00" });
  assert.deepEqual(target, { version: 1, calories: 2500, proteinG: 110, carbsG: 359.75, fatG: 69, fiberG: 35 });
  assert.equal(formatNutritionTarget(target!.carbsG), "359,75");
});

test("ausência de target ativo é um estado vazio seguro", () => {
  assert.equal(parseActiveNutritionTarget(null), null);
});

test("loader consulta somente nutrition_target_snapshots e seleciona o active mais recente", async () => {
  const calls: Array<[string, unknown?]> = [];
  const query = {
    select(value: string) { calls.push(["select", value]); return query; },
    eq(column: string, value: unknown) { calls.push([`eq:${column}`, value]); return query; },
    order(column: string, value: unknown) { calls.push([`order:${column}`, value]); return query; },
    limit(value: number) { calls.push(["limit", value]); return query; },
    async maybeSingle() { return { data: { version: 2, calories: 2100, protein_g: 120, carbs_g: 250, fat_g: 70, fiber_g: 30 }, error: null }; },
  };
  const client = { from(table: string) { calls.push(["from", table]); return query; } } as unknown as SupabaseClient;
  const target = await loadActiveNutritionTarget(client, "user-id");
  assert.equal(target?.version, 2);
  assert.deepEqual(calls[0], ["from", "nutrition_target_snapshots"]);
  assert.ok(calls.some(([name, value]) => name === "eq:status" && value === "active"));
  assert.equal(calls.some(([, value]) => value === "nutrition_logs" || value === "nutrition_plans"), false);
});
