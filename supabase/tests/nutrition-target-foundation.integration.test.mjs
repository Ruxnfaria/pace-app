import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { readMigration, startLocalPostgres } from './local-postgres.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const forbiddenEnvironment = [
  'DATABASE_URL', 'DIRECT_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL',
  'SUPABASE_DB_URL', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY',
  'PRAXE_PRODUCTION_DB_URL', 'PRAXE_STAGING_DB_URL',
  'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE',
];

const migrations = [
  '20260907000100_reward_system_foundation.sql',
  '20260912000100_add_onboarding_version_foundation.sql',
  '20260913000200_create_training_profiles.sql',
  '20260913000600_create_nutrition_profiles.sql',
  '20260913000900_create_nutrition_profile_details.sql',
  '20260914000200_create_user_health_profiles.sql',
  '20260914000400_create_onboarding_completion_receipts.sql',
  '20260914000700_add_nutrition_egg_dairy_acceptance.sql',
  '20260914001000_protect_profiles_onboarding_v2_markers.sql',
  '20260914001100_create_complete_onboarding_v2_rpc.sql',
  '20260921000100_onboarding_v21_contract.sql',
  '20260928000100_onboarding_v22_foundation.sql',
  '20261018010953_nutrition_target_foundation.sql',
];

const localFoundation = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid()
  returns uuid language sql stable set search_path = ''
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

function payload(schemaVersion = 4) {
  const value = {
    idempotency_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    payload_schema_version: schemaVersion,
    health: {
      birth_date: '1996-10-18', biological_sex: 'male', height_cm: 180,
      weight_kg: 80, target_weight_kg: null, primary_goal: 'hypertrophy',
    },
    training: {
      primary_goal: 'hypertrophy', priority_muscles: [],
      training_experience: 'none', exercise_confidence: 'needs_guidance',
      recent_training_break: null, training_days_per_week: 3,
      available_weekdays: [1, 3, 5], session_duration_min: 60,
      session_duration_is_plus: false, training_location: 'full_gym',
      other_location_label: null, available_equipment: [],
      other_equipment_label: null, pain_or_limitation: false,
      affected_body_areas: [], activities: [],
    },
    nutrition: {
      meal_schedule_flexibility: 'moderate', food_preparation_style: 'cook_some',
      food_budget_style: 'balanced', dietary_pattern: 'omnivore',
      dietary_pattern_other_label: null, has_food_restrictions: false,
      uses_supplements: false, restrictions: [], disliked_foods: [],
      preferred_foods: [], supplements: [],
    },
  };
  if (schemaVersion === 4) {
    value.health.activity_level = 'moderate';
    value.nutrition.preferred_meals_per_day = null;
  }
  return value;
}

function assertNoRemoteConfiguration() {
  const configured = forbiddenEnvironment.filter((name) => process.env[name]);
  assert.deepEqual(configured, [], `Remote configuration is forbidden: ${configured.join(', ')}`);
}

async function bootstrap(local) {
  const endpoint = await local.db.query(`
    select pg_catalog.host(pg_catalog.inet_server_addr()) as host,
           pg_catalog.inet_server_port() as port
  `);
  assert.equal(endpoint.rows[0].host, '127.0.0.1');
  assert.equal(Number(endpoint.rows[0].port), local.port);
  await local.db.query(localFoundation);
  await local.db.query(`
    select set_config('praxe.bootstrap.project_ref', 'fuagyujetzuzfjzhllko', false),
           set_config('praxe.bootstrap.confirmation', 'I_CONFIRM_PRAXE_STAGING_EMPTY_BOOTSTRAP', false)
  `);
  await local.db.query(
    await readFile(resolve(root, 'supabase/bootstrap/legacy-staging-bootstrap.sql'), 'utf8'),
  );
  for (const migration of migrations) await local.db.query(await readMigration(migration));
}

async function createUser(db, userId) {
  await db.query('insert into auth.users (id) values ($1)', [userId]);
  await db.query('insert into public.profiles (user_id) values ($1)', [userId]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

async function stopAndRemove(local) {
  if (!local) return;
  await local.stop();
  await rm(local.dataDir, { recursive: true, force: true });
}

test('Nutrição V1 migration supports schema 4, replay, append constraints, and read-only RLS', async () => {
  assertNoRemoteConfiguration();
  let local;
  try {
    local = await startLocalPostgres();
    await bootstrap(local);
    const db = local.db;
    const userId = '11111111-1111-4111-8111-111111111111';
    const otherUserId = '22222222-2222-4222-8222-222222222222';
    await createUser(db, userId);
    await db.query('insert into auth.users (id) values ($1)', [otherUserId]);

    const completed = await db.query(
      'select * from public.complete_onboarding_v2($1::jsonb)',
      [JSON.stringify(payload())],
    );
    assert.equal(completed.rows[0].result, 'completed');

    const stored = await db.query(`
      select activity_level, preferred_meals_per_day
      from public.nutrition_profiles where user_id = $1
    `, [userId]);
    assert.deepEqual(stored.rows[0], { activity_level: 'moderate', preferred_meals_per_day: null });

    const receipt = await db.query(`
      select payload_schema_version, canonicalization_version
      from public.onboarding_completion_receipts where user_id = $1
    `, [userId]);
    assert.deepEqual(receipt.rows[0], { payload_schema_version: 4, canonicalization_version: 4 });

    const replay = await db.query(
      'select * from public.complete_onboarding_v2($1::jsonb)',
      [JSON.stringify(payload())],
    );
    assert.equal(replay.rows[0].result, 'replay');

    const conflict = payload();
    conflict.health.activity_level = 'high';
    await assert.rejects(
      db.query('select * from public.complete_onboarding_v2($1::jsonb)', [JSON.stringify(conflict)]),
      (error) => error?.code === '23505',
    );

    await db.query(`
      insert into public.nutrition_target_snapshots (
        user_id, version, algorithm_version, source, status, effective_from,
        weight_kg, height_cm, age_years, biological_sex_basis,
        activity_level, activity_multiplier, goal, goal_adjustment,
        bmr, tdee, calories, protein_g, carbs_g, fat_g, fiber_g, metadata
      ) values (
        $1, 1, 'praxe-nutrition-target-msj-v1', 'calculated', 'active', date '2026-10-18',
        80, 180, 30, 'male', 'moderate', 1.55, 'hypertrophy', 1.08,
        1780, 2759, 2980, 128, 429.25, 83, 42, '{}'::jsonb
      )
    `, [userId]);

    await assert.rejects(db.query(`
      insert into public.nutrition_target_snapshots (
        user_id, version, algorithm_version, source, status, effective_from,
        weight_kg, height_cm, age_years, biological_sex_basis,
        activity_level, activity_multiplier, goal, goal_adjustment,
        bmr, tdee, calories, protein_g, carbs_g, fat_g, fiber_g
      ) values (
        $1, 2, 'praxe-nutrition-target-msj-v1', 'recalculation', 'active', date '2026-10-19',
        80, 180, 30, 'male', 'moderate', 1.55, 'hypertrophy', 1.08,
        1780, 2759, 2980, 128, 429.25, 83, 42
      )
    `, [userId]), (error) => error?.code === '23505');

    await db.query('set role authenticated');
    const ownRows = await db.query('select version from public.nutrition_target_snapshots');
    assert.deepEqual(ownRows.rows, [{ version: 1 }]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [otherUserId]);
    const otherRows = await db.query('select version from public.nutrition_target_snapshots');
    assert.deepEqual(otherRows.rows, []);
    await assert.rejects(
      db.query(`insert into public.nutrition_target_snapshots
        (user_id, version, algorithm_version, source, status, effective_from)
        values ($1, 1, 'x', 'manual_review', 'requires_review', current_date)`, [otherUserId]),
      (error) => error?.code === '42501',
    );
    await db.query('reset role');
  } finally {
    await stopAndRemove(local);
  }
});

test('schema 2 completion remains available through the compatibility wrapper', async () => {
  assertNoRemoteConfiguration();
  let local;
  try {
    local = await startLocalPostgres();
    await bootstrap(local);
    const userId = '33333333-3333-4333-8333-333333333333';
    await createUser(local.db, userId);
    const completed = await local.db.query(
      'select * from public.complete_onboarding_v2($1::jsonb)',
      [JSON.stringify(payload(2))],
    );
    assert.equal(completed.rows[0].result, 'completed');
    const receipt = await local.db.query(`
      select payload_schema_version from public.onboarding_completion_receipts where user_id = $1
    `, [userId]);
    assert.equal(receipt.rows[0].payload_schema_version, 2);
  } finally {
    await stopAndRemove(local);
  }
});
