import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import targetCalculator from '../../src/lib/nutrition/target-calculator.ts';
import { readMigration, startLocalPostgres } from './local-postgres.mjs';

const { calculateNutritionTarget } = targetCalculator;

const root = fileURLToPath(new URL('../../', import.meta.url));
const forbiddenEnvironment = [
  'DATABASE_URL', 'DIRECT_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL',
  'SUPABASE_DB_URL', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY',
  'PRAXE_PRODUCTION_DB_URL', 'PRAXE_STAGING_DB_URL',
  'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE',
];

const phaseOneMigrations = [
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
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub',
      nullif(current_setting('request.jwt.claim.sub', true), '')
    )::uuid
  $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

function onboardingPayload({
  idempotencyKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  biologicalSex = 'male',
  weightKg = 80,
  activityLevel = 'moderate',
  schemaVersion = 4,
} = {}) {
  const value = {
    idempotency_key: idempotencyKey,
    payload_schema_version: schemaVersion,
    health: {
      birth_date: '1996-10-18', biological_sex: biologicalSex, height_cm: 180,
      weight_kg: weightKg, target_weight_kg: null, primary_goal: 'fat_loss',
      ...(activityLevel === undefined ? {} : { activity_level: activityLevel }),
    },
    training: {
      primary_goal: 'fat_loss', priority_muscles: [], training_experience: 'none',
      exercise_confidence: 'needs_guidance', recent_training_break: null,
      training_days_per_week: 3, available_weekdays: [1, 3, 5],
      session_duration_min: 60, session_duration_is_plus: false,
      training_location: 'full_gym', other_location_label: null,
      available_equipment: [], other_equipment_label: null,
      pain_or_limitation: false, affected_body_areas: [], activities: [],
    },
    nutrition: {
      meal_schedule_flexibility: 'moderate', preferred_meals_per_day: null,
      food_preparation_style: 'cook_some', food_budget_style: 'balanced',
      dietary_pattern: 'omnivore', dietary_pattern_other_label: null,
      has_food_restrictions: false, uses_supplements: false,
      restrictions: [], disliked_foods: [], preferred_foods: [], supplements: [],
    },
  };
  if (schemaVersion === 2) {
    delete value.health.activity_level;
    delete value.nutrition.preferred_meals_per_day;
  }
  if (schemaVersion === 5) {
    value.health.pregnancy_status = biologicalSex === 'female' ? 'no' : 'not_applicable';
    value.health.lactation_status = biologicalSex === 'female' ? 'no' : 'not_applicable';
    value.routine = {
      wake_time: '07:00', sleep_time: '23:00',
      routine_predictability: 'predictable', meal_break_availability: 'limited',
      preferred_training_period: 'evening',
    };
  }
  return value;
}

function targetFor(payload, effectiveDate = '2026-10-18') {
  return calculateNutritionTarget({
    effectiveDate,
    birthDate: payload.health.birth_date,
    weightKg: payload.health.weight_kg,
    heightCm: payload.health.height_cm,
    biologicalSex: payload.health.biological_sex,
    activityLevel: payload.health.activity_level,
    goal: payload.health.primary_goal,
    pregnant: payload.health.pregnancy_status === 'yes'
      ? true
      : payload.health.pregnancy_status === 'no' ? false : undefined,
    lactating: payload.health.lactation_status === 'yes'
      ? true
      : payload.health.lactation_status === 'no' ? false : undefined,
    requiresClinicalReview: false,
  });
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
  for (const migration of phaseOneMigrations) {
    await local.db.query(await readMigration(migration));
  }
  const before = await local.db.query(
    `select md5(pg_get_functiondef('public.complete_onboarding_v22(jsonb)'::regprocedure)) hash`,
  );
  await local.db.query(await readMigration('20261018040000_nutrition_target_writer.sql'));
  await local.db.query(await readMigration('20261018050000_onboarding_vnext_routine_context.sql'));
  await local.db.query(await readMigration('20261026015609_add_reproductive_context_to_onboarding_schema5.sql'));
  const after = await local.db.query(
    `select md5(pg_get_functiondef('public.complete_onboarding_v22(jsonb)'::regprocedure)) hash`,
  );
  assert.equal(after.rows[0].hash, before.rows[0].hash);
}

async function createUser(db, userId) {
  await db.query('insert into auth.users (id) values ($1)', [userId]);
  await db.query('insert into public.profiles (user_id) values ($1)', [userId]);
}

async function atomicOnboarding(db, userId, payload, target = targetFor(payload)) {
  return db.query(
    `select * from public.complete_onboarding_v2_with_nutrition_target(
      $1::uuid, $2::jsonb, $3::jsonb, $4::date
    )`,
    [userId, JSON.stringify(payload), JSON.stringify(target), target.effectiveDate],
  );
}

async function stopAndRemove(local) {
  if (!local) return;
  await local.stop();
  await rm(local.dataDir, { recursive: true, force: true });
}

test('authoritative writer is atomic, idempotent, versioned, concurrent, and review-safe', async () => {
  assertNoRemoteConfiguration();
  let local;
  try {
    local = await startLocalPostgres();
    await bootstrap(local);
    const db = local.db;

    const eligibleUser = '11111111-1111-4111-8111-111111111111';
    const otherUser = '22222222-2222-4222-8222-222222222222';
    const schema5User = '88888888-8888-4888-8888-888888888888';
    await createUser(db, eligibleUser);
    await createUser(db, otherUser);
    await createUser(db, schema5User);

    const payload = onboardingPayload();
    const expected = targetFor(payload);
    await db.query('set role service_role');
    const completed = await atomicOnboarding(db, eligibleUser, payload, expected);
    assert.equal(completed.rows[0].result, 'completed');
    await db.query('reset role');

    const first = await db.query(`
      select version, writer_event_id, algorithm_version, source, status,
             effective_from::text, effective_until::text,
             weight_kg::float8, height_cm::float8, age_years,
             biological_sex_basis, activity_level,
             activity_multiplier::float8, goal, goal_adjustment::float8,
             bmr::float8, tdee::float8, calories::float8,
             protein_g::float8, carbs_g::float8, fat_g::float8, fiber_g::float8,
             metadata
      from public.nutrition_target_snapshots where user_id=$1
    `, [eligibleUser]);
    assert.equal(first.rowCount, 1);
    assert.equal(first.rows[0].version, 1);
    assert.equal(first.rows[0].writer_event_id, payload.idempotency_key);
    assert.equal(first.rows[0].source, 'onboarding');
    assert.equal(first.rows[0].status, 'active');
    assert.equal(first.rows[0].algorithm_version, expected.algorithmVersion);
    for (const [column, value] of [
      ['bmr', expected.bmr], ['tdee', expected.tdee], ['calories', expected.calories],
      ['protein_g', expected.proteinG], ['carbs_g', expected.carbsG],
      ['fat_g', expected.fatG], ['fiber_g', expected.fiberG],
    ]) assert.equal(first.rows[0][column], value);
    assert.deepEqual(first.rows[0].metadata.reasons, []);
    const immutableFirstCalories = first.rows[0].calories;

    const schema5Payload = onboardingPayload({
      idempotencyKey: '98989898-9898-4989-8989-989898989898',
      schemaVersion: 5,
    });
    const schema5PayloadWithoutMeals = structuredClone(schema5Payload);
    delete schema5PayloadWithoutMeals.nutrition.preferred_meals_per_day;
    const schema5Target = targetFor(schema5Payload);

    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [schema5User]);
    await db.query('set role authenticated');
    const schema5Direct = await db.query(
      'select * from public.complete_onboarding_v2($1::jsonb)',
      [JSON.stringify(schema5PayloadWithoutMeals)],
    );
    assert.equal(schema5Direct.rows[0].result, 'completed');
    const schema5ReplayWithoutKey = await db.query(
      'select * from public.complete_onboarding_v2($1::jsonb)',
      [JSON.stringify(schema5PayloadWithoutMeals)],
    );
    assert.equal(schema5ReplayWithoutKey.rows[0].result, 'replay');
    const schema5ReplayWithNull = await db.query(
      'select * from public.complete_onboarding_v2($1::jsonb)',
      [JSON.stringify(schema5Payload)],
    );
    assert.equal(schema5ReplayWithNull.rows[0].result, 'replay');
    await db.query('reset role');

    await db.query('set role service_role');
    const schema5Completion = await atomicOnboarding(
      db, schema5User, schema5Payload, schema5Target,
    );
    const schema5AtomicReplayWithoutKey = await atomicOnboarding(
      db, schema5User, schema5PayloadWithoutMeals, schema5Target,
    );
    await db.query('reset role');
    assert.equal(schema5Completion.rows[0].result, 'replay');
    assert.equal(schema5AtomicReplayWithoutKey.rows[0].result, 'replay');
    const routineContext = await db.query(`
      select n.wake_time::text, n.sleep_time::text, n.routine_predictability,
             n.meal_break_availability, n.preferred_meals_per_day,
             h.pregnancy_status, h.lactation_status,
             t.preferred_training_period,
             r.payload_schema_version, r.canonicalization_version
      from public.nutrition_profiles n
      join public.user_health_profiles h using (user_id)
      join public.training_profiles t using (user_id)
      join public.onboarding_completion_receipts r using (user_id)
      where n.user_id = $1
    `, [schema5User]);
    assert.deepEqual(routineContext.rows[0], {
      wake_time: '07:00:00', sleep_time: '23:00:00',
      routine_predictability: 'predictable', meal_break_availability: 'limited',
      preferred_meals_per_day: null, preferred_training_period: 'evening',
      pregnancy_status: 'not_applicable', lactation_status: 'not_applicable',
      payload_schema_version: 5,
      canonicalization_version: 5,
    });
    const schema5Targets = await db.query(
      `select count(*)::int count, min(calories)::float8 calories
       from public.nutrition_target_snapshots where user_id=$1`,
      [schema5User],
    );
    assert.deepEqual(schema5Targets.rows[0], {
      count: 1,
      calories: schema5Target.calories,
    });

    const schema5NullUser = '89898989-8989-4989-8989-898989898989';
    await createUser(db, schema5NullUser);
    const schema5NullPayload = onboardingPayload({
      idempotencyKey: '96969696-9696-4969-8969-969696969696',
      schemaVersion: 5,
    });
    const schema5NullPayloadWithoutMeals = structuredClone(schema5NullPayload);
    delete schema5NullPayloadWithoutMeals.nutrition.preferred_meals_per_day;
    const schema5NullTarget = targetFor(schema5NullPayload);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [schema5NullUser]);
    await db.query('set role authenticated');
    const schema5DirectWithNull = await db.query(
      'select * from public.complete_onboarding_v2($1::jsonb)',
      [JSON.stringify(schema5NullPayload)],
    );
    assert.equal(schema5DirectWithNull.rows[0].result, 'completed');
    const schema5NullCrossFormReplay = await db.query(
      'select * from public.complete_onboarding_v2($1::jsonb)',
      [JSON.stringify(schema5NullPayloadWithoutMeals)],
    );
    assert.equal(schema5NullCrossFormReplay.rows[0].result, 'replay');
    await db.query('reset role');
    await db.query('set role service_role');
    const schema5NullAtomicReplay = await atomicOnboarding(
      db, schema5NullUser, schema5NullPayloadWithoutMeals, schema5NullTarget,
    );
    await db.query('reset role');
    assert.equal(schema5NullAtomicReplay.rows[0].result, 'replay');
    const schema5NullState = await db.query(`
      select n.preferred_meals_per_day,
             (select count(*)::int from public.onboarding_completion_receipts r
              where r.user_id=n.user_id) receipt_count,
             (select count(*)::int from public.nutrition_target_snapshots s
              where s.user_id=n.user_id) target_count
      from public.nutrition_profiles n where n.user_id=$1
    `, [schema5NullUser]);
    assert.deepEqual(schema5NullState.rows[0], {
      preferred_meals_per_day: null,
      receipt_count: 1,
      target_count: 1,
    });

    const schema4MissingMealsUser = '99999999-9999-4999-8999-999999999999';
    await createUser(db, schema4MissingMealsUser);
    const schema4MissingMeals = onboardingPayload({
      idempotencyKey: '97979797-9797-4979-8979-979797979797',
    });
    delete schema4MissingMeals.nutrition.preferred_meals_per_day;
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false)",
      [schema4MissingMealsUser],
    );
    await db.query('set role authenticated');
    await assert.rejects(
      db.query(
        'select * from public.complete_onboarding_v2($1::jsonb)',
        [JSON.stringify(schema4MissingMeals)],
      ),
      (error) => error?.code === '22023',
    );
    await db.query('reset role');

    await db.query('set role service_role');
    const replay = await atomicOnboarding(db, eligibleUser, payload, expected);
    assert.equal(replay.rows[0].result, 'replay');
    await db.query('reset role');
    assert.equal((await db.query(
      'select count(*)::int count from public.nutrition_target_snapshots where user_id=$1',
      [eligibleUser],
    )).rows[0].count, 1);

    await db.query('update public.user_health_profiles set weight_kg=82 where user_id=$1', [eligibleUser]);
    const recalculationPayload = onboardingPayload({ weightKg: 82 });
    const recalculated = targetFor(recalculationPayload);
    const recalculationEvent = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await db.query('set role service_role');
    const second = await db.query(
      `select (public.write_nutrition_target_v1($1::uuid,$2::uuid,$3::date,$4::jsonb)).*`,
      [eligibleUser, recalculationEvent, recalculated.effectiveDate, JSON.stringify(recalculated)],
    );
    await db.query('reset role');
    assert.equal(second.rows[0].version, 2);
    assert.equal(second.rows[0].source, 'recalculation');
    assert.equal(second.rows[0].status, 'active');

    const history = await db.query(`
      select version, status, effective_until::text, calories::float8
      from public.nutrition_target_snapshots where user_id=$1 order by version
    `, [eligibleUser]);
    assert.deepEqual(history.rows.map(({ version, status }) => ({ version, status })), [
      { version: 1, status: 'superseded' }, { version: 2, status: 'active' },
    ]);
    assert.equal(history.rows[0].effective_until, '2026-10-18');
    assert.equal(history.rows[0].calories, immutableFirstCalories);

    const reviewUser = '33333333-3333-4333-8333-333333333333';
    await createUser(db, reviewUser);
    const reviewPayload = onboardingPayload({
      idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      biologicalSex: 'not_specified',
    });
    const reviewTarget = targetFor(reviewPayload);
    await db.query('set role service_role');
    await atomicOnboarding(db, reviewUser, reviewPayload, reviewTarget);
    await db.query('reset role');
    const review = await db.query(`
      select status, calories, metadata->'reasons' reasons
      from public.nutrition_target_snapshots where user_id=$1
    `, [reviewUser]);
    assert.deepEqual(review.rows[0], {
      status: 'requires_review', calories: null, reasons: ['undefined_metabolic_sex'],
    });
    assert.equal((await db.query(`
      select count(*)::int count from public.nutrition_target_snapshots
      where user_id=$1 and status='active' and effective_until is null
    `, [reviewUser])).rows[0].count, 0);

    const concurrentUser = '44444444-4444-4444-8444-444444444444';
    await createUser(db, concurrentUser);
    const concurrentPayload = onboardingPayload({
      idempotencyKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    });
    const concurrentTarget = targetFor(concurrentPayload);
    const firstClient = await local.connect();
    const secondClient = await local.connect();
    await Promise.all([
      firstClient.query('set role service_role'), secondClient.query('set role service_role'),
    ]);
    const concurrentResults = await Promise.all([
      atomicOnboarding(firstClient, concurrentUser, concurrentPayload, concurrentTarget),
      atomicOnboarding(secondClient, concurrentUser, concurrentPayload, concurrentTarget),
    ]);
    assert.deepEqual(
      concurrentResults.map((result) => result.rows[0].result).sort(),
      ['completed', 'replay'],
    );
    assert.equal((await db.query(`
      select count(*)::int total,
             count(*) filter (where status='active' and effective_until is null)::int active
      from public.nutrition_target_snapshots where user_id=$1
    `, [concurrentUser])).rows[0].total, 1);

    const rollbackUser = '55555555-5555-4555-8555-555555555555';
    await createUser(db, rollbackUser);
    const rollbackPayload = onboardingPayload({
      idempotencyKey: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    });
    const invalidTarget = { ...targetFor(rollbackPayload), algorithmVersion: 'client-choice' };
    await db.query('set role service_role');
    await assert.rejects(
      atomicOnboarding(db, rollbackUser, rollbackPayload, invalidTarget),
      (error) => error?.code === '22023',
    );
    await db.query('reset role');
    const rollbackState = await db.query(`
      select p.onboarding_completed,
             (select count(*) from public.onboarding_completion_receipts r where r.user_id=p.user_id)::int receipts,
             (select count(*) from public.user_health_profiles h where h.user_id=p.user_id)::int health,
             (select count(*) from public.nutrition_target_snapshots t where t.user_id=p.user_id)::int targets
      from public.profiles p where p.user_id=$1
    `, [rollbackUser]);
    assert.deepEqual(rollbackState.rows[0], {
      onboarding_completed: false, receipts: 0, health: 0, targets: 0,
    });

    const missingActivityUser = '66666666-6666-4666-8666-666666666666';
    await createUser(db, missingActivityUser);
    const missingActivity = onboardingPayload({
      idempotencyKey: 'ffffffff-ffff-4fff-8fff-ffffffffffff', activityLevel: null,
    });
    await db.query('set role service_role');
    await assert.rejects(
      atomicOnboarding(db, missingActivityUser, missingActivity, targetFor(missingActivity)),
      (error) => error?.code === '22023',
    );
    await db.query('reset role');
    assert.equal((await db.query(
      'select count(*)::int count from public.nutrition_target_snapshots where user_id=$1',
      [missingActivityUser],
    )).rows[0].count, 0);

    const schemaTwoUser = '77777777-7777-4777-8777-777777777777';
    await createUser(db, schemaTwoUser);
    const schemaTwoPayload = onboardingPayload({
      idempotencyKey: '12121212-1212-4212-8212-121212121212',
    });
    delete schemaTwoPayload.health.activity_level;
    delete schemaTwoPayload.nutrition.preferred_meals_per_day;
    schemaTwoPayload.payload_schema_version = 2;
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [schemaTwoUser]);
    await db.query('set role authenticated');
    const schemaTwo = await db.query(
      'select * from public.complete_onboarding_v2($1::jsonb)',
      [JSON.stringify(schemaTwoPayload)],
    );
    assert.equal(schemaTwo.rows[0].result, 'completed');
    await db.query('reset role');
    assert.equal((await db.query(
      'select count(*)::int count from public.nutrition_target_snapshots where user_id=$1',
      [schemaTwoUser],
    )).rows[0].count, 0);

    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [eligibleUser]);
    await db.query('set role authenticated');
    const own = await db.query('select version from public.nutrition_target_snapshots order by version');
    assert.deepEqual(own.rows, [{ version: 1 }, { version: 2 }]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [otherUser]);
    assert.equal((await db.query('select count(*)::int count from public.nutrition_target_snapshots')).rows[0].count, 0);
    await assert.rejects(
      db.query(`insert into public.nutrition_target_snapshots
        (user_id,version,algorithm_version,source,status,effective_from)
        values ($1,1,'client','onboarding','requires_review',current_date)`, [otherUser]),
      (error) => error?.code === '42501',
    );
    await assert.rejects(
      atomicOnboarding(db, otherUser, onboardingPayload(), targetFor(onboardingPayload())),
      (error) => error?.code === '42501',
    );
    await assert.rejects(
      db.query(`select (public.write_nutrition_target_v1(
        $1::uuid,$2::uuid,current_date,$3::jsonb
      )).*`, [otherUser, '13131313-1313-4313-8313-131313131313', JSON.stringify(expected)]),
      (error) => error?.code === '42501',
    );
    await db.query('reset role');
  } finally {
    await stopAndRemove(local);
  }
});
