import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20261019045648_praxe_meal_plan_database_foundation.sql",
  import.meta.url,
);

test("migration cria as quatro tabelas, vínculos e contratos de idempotência", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of [
    "nutrition_meal_plans", "nutrition_meal_plan_meals",
    "nutrition_meal_plan_items", "nutrition_plan_generation_jobs",
  ]) assert.match(sql, new RegExp(`create table public\\.${table}`, "i"));
  assert.match(sql, /foreign key \(nutrition_target_snapshot_id, user_id\)[\s\S]*?nutrition_target_snapshots \(id, user_id\)/i);
  assert.match(sql, /unique \(nutrition_target_snapshot_id, strategy_version, generator_version\)/i);
  assert.match(sql, /nutrition_meal_plans_one_active_per_user_unique[\s\S]*?where status = 'active'/i);
  assert.match(sql, /nutrition_plan_generation_jobs_target_strategy_unique[\s\S]*?nutrition_target_snapshot_id, strategy_version, generator_version/i);
  assert.doesNotMatch(sql, /insert into public\.nutrition_meal_plans[\s\S]*?'[0-9a-f]{8}-[0-9a-f-]{27,}'/i);
});

test("validated activation is atomic, versioned and service-role only", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create function public\.activate_nutrition_meal_plan_v1/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /set status = 'superseded'[\s\S]*?insert into public\.nutrition_meal_plans/i);
  assert.match(sql, /generator_version text not null/i);
  assert.match(sql, /validator_version text not null/i);
  assert.match(sql, /validation_policy_version text not null/i);
  assert.match(sql, /revoke all on function public\.activate_nutrition_meal_plan_v1[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.activate_nutrition_meal_plan_v1[\s\S]*?to service_role/i);
  assert.match(sql, /create function public\.begin_nutrition_plan_generation_job_v1/i);
  assert.match(sql, /create function public\.finish_nutrition_plan_generation_job_v1/i);
  assert.match(sql, /grant execute on function public\.begin_nutrition_plan_generation_job_v1[\s\S]*?to service_role/i);
  assert.match(sql, /grant execute on function public\.finish_nutrition_plan_generation_job_v1[\s\S]*?to service_role/i);
});

test("migration cria catálogo confiável versionado sem seed de produção", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of ["nutrition_food_catalog", "nutrition_food_aliases", "nutrition_food_portions"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, "i"));
  }
  assert.match(sql, /unique \(source, source_food_id, source_version\)/i);
  assert.match(sql, /nutrition_food_catalog_one_active_source_entry_unique[\s\S]*?where is_active/i);
  assert.match(sql, /nutrient_completeness[\s\S]*?COMPLETE[\s\S]*?PARTIAL[\s\S]*?INSUFFICIENT/i);
  assert.match(sql, /allergen_data_complete boolean not null default false/i);
  assert.match(sql, /source_metadata jsonb not null default '\{\}'::jsonb/i);
  assert.match(sql, /jsonb_typeof\(source_metadata\) = 'object'/i);
  assert.match(sql, /foreign key \(food_catalog_entry_id, catalog_source, catalog_source_version\)[\s\S]*?references public\.nutrition_food_catalog \(id, source, source_version\)/i);
  assert.match(sql, /quantity_grams numeric\(10,3\) not null/i);
  assert.match(sql, /catalog_source_version text not null/i);
  assert.doesNotMatch(sql, /insert into public\.nutrition_food_(catalog|aliases|portions)/i);
});

test("RLS permite somente SELECT próprio e bloqueia writes do client", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of [
    "nutrition_food_catalog", "nutrition_food_aliases", "nutrition_food_portions",
    "nutrition_meal_plans", "nutrition_meal_plan_meals",
    "nutrition_meal_plan_items", "nutrition_plan_generation_jobs",
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
    assert.match(sql, new RegExp(`grant select on table public\\.${table} to authenticated`, "i"));
    assert.match(sql, new RegExp(`grant select, insert, update, delete on table public\\.${table} to service_role`, "i"));
  }
  assert.doesNotMatch(sql, /for (insert|update|delete) to authenticated/i);
});

test("target em review não pode ativar plano ou iniciar geração", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /Nutrition target requires review before meal-plan activation/i);
  assert.match(sql, /Review-required target must keep generation job in requires_review/i);
  assert.match(sql, /Superseded nutrition target cannot create a current meal plan/i);
  assert.match(sql, /nutrition_targets_supersede_meal_plans/i);
});
