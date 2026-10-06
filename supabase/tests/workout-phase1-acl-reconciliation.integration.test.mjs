import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readMigration, startLocalPostgres } from './local-postgres.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const expectedHost = '127.0.0.1';
const expectedCacheRoot = resolve(root, 'node_modules/.cache/onboarding-v22');
const fixtureUrl = new URL('./fixtures/workout-phase1-baseline.sql', import.meta.url);
const checkpointUrl = new URL(
  './fixtures/workout-phase1-post-energy-checkpoint.sql',
  import.meta.url,
);
const productionSnapshotsUrl = new URL(
  './fixtures/workout-phase1-production-function-snapshots.json',
  import.meta.url,
);
const harnessUrl = new URL('./local-postgres.mjs', import.meta.url);

const forbiddenConnectionVariables = [
  'DATABASE_URL',
  'DIRECT_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'SUPABASE_DB_URL',
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const prerequisiteMigrations = [
  '20260907000100_reward_system_foundation.sql',
  '20260909000200_user_streaks.sql',
  '20260911000100_add_current_mission_unique_index.sql',
];

const installMigration = '20261004000300_add_praxe_workout_persistence.sql';
const reconciliationMigration = '20261005000100_reconcile_praxe_workout_phase1_dormant_acl.sql';
const postApplyAudit = 'audit_praxe_workout_persistence_postapply_READONLY.sql';
const expectedProductionRecorderRawMd5 = '66a1d1b6ad6cdfd150ef06026410320c';
const expectedProductionEnergyRawMd5 = '4a1deeecb318df2dd76a30a1cd4acb74';

const expectedChecks = [
  'six_tables_exact_columns',
  'pk_fk_unique_delete_behavior',
  'required_indexes',
  'rls_owner_and_policies',
  'table_acl_allowlist',
  'immutability_triggers',
  'rpc_exact_signatures_no_overloads',
  'rpc_security_and_dormant_acl_allowlists',
  'workout_runtime_activation_state',
  'legacy_workout_contract_unchanged',
  'energy_streak_fingerprints_unchanged',
];

const expectedFunctions = [
  'workout_persistence_parse_exercises(text)',
  'workout_persistence_materialize_for_user(uuid)',
  'workout_persistence_guard_session_update()',
  'workout_persistence_guard_exercise_update()',
  'workout_persistence_guard_occurrence_update()',
  'workout_persistence_reject_update()',
  'materialize_my_workout_schedule()',
  'get_pending_workout_occurrence()',
  'start_workout_session(uuid,uuid,uuid)',
  'set_workout_session_exercise_completion(uuid,uuid,boolean)',
  'update_workout_session_note(uuid,text)',
  'abandon_workout_session(uuid)',
  'skip_workout_schedule_occurrence(uuid,text)',
  'update_workout_weekly_schedule(jsonb)',
  'restore_original_workout_schedule()',
  'replace_user_workout_plan(jsonb)',
  'complete_workout_session(uuid)',
];

const expectedPublicRpcs = new Set([
  'materialize_my_workout_schedule()',
  'get_pending_workout_occurrence()',
  'start_workout_session(uuid,uuid,uuid)',
  'set_workout_session_exercise_completion(uuid,uuid,boolean)',
  'update_workout_session_note(uuid,text)',
  'abandon_workout_session(uuid)',
  'skip_workout_schedule_occurrence(uuid,text)',
  'update_workout_weekly_schedule(jsonb)',
  'restore_original_workout_schedule()',
  'replace_user_workout_plan(jsonb)',
  'complete_workout_session(uuid)',
]);

let local;

after(async () => {
  if (local) {
    await local.stop();
    local = undefined;
  }
});

function assertNoExternalConfiguration() {
  const configured = forbiddenConnectionVariables.filter(
    (name) => typeof process.env[name] === 'string' && process.env[name].length > 0,
  );
  assert.deepEqual(
    configured,
    [],
    `External database configuration is forbidden for this test: ${configured.join(', ')}`,
  );
  assert.notEqual(process.env.ONBOARDING_TEST_ENGINE, 'pglite',
    'This test requires the native embedded PostgreSQL engine');
}

async function assertHarnessIsLoopbackOnly() {
  const source = await readFile(harnessUrl, 'utf8');
  const environmentReferences = [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)]
    .map((match) => match[1]);
  assert.match(source, /probe\.listen\(0, '127\.0\.0\.1'/);
  assert.match(source, /host: '127\.0\.0\.1'/);
  assert.match(source, /password: ''/);
  assert.match(source, /ssl: false/);
  assert.doesNotMatch(source, /['"]localhost['"]/);
  assert.doesNotMatch(source, /DATABASE_URL|SUPABASE_DB_URL|NEXT_PUBLIC_SUPABASE_URL/);
  assert.doesNotMatch(source, /dotenv|@supabase\/supabase-js/);
  assert.deepEqual([...new Set(environmentReferences)], ['ONBOARDING_TEST_ENGINE']);
}

async function applyMigration(db, name) {
  await db.query(await readMigration(name));
}

function md5Utf8(value) {
  return createHash('md5').update(Buffer.from(value, 'utf8')).digest('hex');
}

async function readAuthenticatedProductionSnapshots() {
  const snapshots = JSON.parse(await readFile(productionSnapshotsUrl, 'utf8'));
  const recorder = snapshots.record_user_streak_activity;
  const energy = snapshots.complete_mission_with_energy;

  assert.equal(recorder?.signature, 'public.record_user_streak_activity(uuid)');
  assert.equal(recorder?.definition_md5, expectedProductionRecorderRawMd5);
  assert.equal(md5Utf8(recorder?.function_definition), expectedProductionRecorderRawMd5);
  assert.equal(energy?.signature, 'public.complete_mission_with_energy(uuid)');
  assert.equal(energy?.definition_md5, expectedProductionEnergyRawMd5);
  assert.equal(md5Utf8(energy?.function_definition), expectedProductionEnergyRawMd5);

  return { recorder, energy };
}

async function renderProductionCheckpoint(snapshots) {
  const recorderMarker = '-- {{PRODUCTION_RECORD_USER_STREAK_ACTIVITY_FUNCTION_DEFINITION}}';
  const energyMarker = '-- {{PRODUCTION_COMPLETE_MISSION_WITH_ENERGY_FUNCTION_DEFINITION}}';
  const template = await readFile(checkpointUrl, 'utf8');
  assert.equal(template.split(recorderMarker).length, 2, 'Recorder checkpoint marker count');
  assert.equal(template.split(energyMarker).length, 2, 'Energy checkpoint marker count');
  const rendered = template
    .replace(recorderMarker, () => snapshots.recorder.function_definition)
    .replace(energyMarker, () => snapshots.energy.function_definition);
  assert.doesNotMatch(rendered, /\{\{PRODUCTION_.*_FUNCTION_DEFINITION\}\}/);
  return rendered;
}

async function readDependencyState(db) {
  const result = await db.query(`
    with expected(signature) as (
      values
        ('record_user_streak_activity(uuid)'::text),
        ('complete_mission_with_energy(uuid)'::text)
    ), resolved as (
      select expected.signature,
             pg_catalog.to_regprocedure('public.' || expected.signature)::oid as oid
      from expected
    )
    select
      resolved.signature,
      pg_catalog.pg_get_functiondef(function_record.oid)::text as definition,
      pg_catalog.md5(
        pg_catalog.pg_get_functiondef(function_record.oid)::text
      ) as raw_md5,
      pg_catalog.regexp_replace(
        lower(pg_catalog.pg_get_functiondef(function_record.oid)::text),
        '[[:space:]]+',
        ' ',
        'g'
      ) as normalized_definition,
      pg_catalog.md5(
        pg_catalog.regexp_replace(
          lower(pg_catalog.pg_get_functiondef(function_record.oid)::text),
          '[[:space:]]+',
          ' ',
          'g'
        )
      ) as normalized_md5,
      pg_catalog.pg_get_function_identity_arguments(function_record.oid)::text
        as identity_arguments,
      pg_catalog.pg_get_function_result(function_record.oid)::text as result_type,
      pg_catalog.pg_get_userbyid(function_record.proowner)::text as owner,
      language.lanname::text as language,
      function_record.provolatile::text as volatility,
      function_record.prosecdef as security_definer,
      pg_catalog.array_to_string(function_record.proconfig, ',')::text
        as configuration,
      function_record.proacl::text as acl,
      pg_catalog.has_function_privilege(
        'public', function_record.oid, 'EXECUTE'
      ) as public_execute,
      pg_catalog.has_function_privilege(
        'anon', function_record.oid, 'EXECUTE'
      ) as anon_execute,
      pg_catalog.has_function_privilege(
        'authenticated', function_record.oid, 'EXECUTE'
      ) as authenticated_execute,
      pg_catalog.has_function_privilege(
        'service_role', function_record.oid, 'EXECUTE'
      ) as service_execute
    from resolved
    left join pg_catalog.pg_proc as function_record
      on function_record.oid = resolved.oid
    left join pg_catalog.pg_language as language
      on language.oid = function_record.prolang
    order by resolved.signature
  `);
  return result.rows;
}

function assertCheckpointState(rows) {
  assert.equal(rows.length, 2, 'Checkpoint dependency function count');
  const bySignature = new Map(rows.map((row) => [row.signature, row]));
  const recorder = bySignature.get('record_user_streak_activity(uuid)');
  const energy = bySignature.get('complete_mission_with_energy(uuid)');

  assert.ok(recorder?.definition, 'Post-sync streak recorder must exist');
  assert.equal(recorder.identity_arguments, 'p_user_id uuid');
  assert.equal(
    recorder.result_type.toLowerCase(),
    'table(user_id uuid, current_streak integer, effective_streak integer, '
      + 'longest_streak integer, last_active_date date)',
  );
  assert.equal(recorder.owner, 'postgres');
  assert.equal(recorder.language, 'plpgsql');
  assert.equal(recorder.volatility, 'v');
  assert.equal(recorder.security_definer, true);
  assert.ok(['search_path=', 'search_path=""'].includes(recorder.configuration));
  assert.equal(recorder.public_execute, false);
  assert.equal(recorder.anon_execute, false);
  assert.equal(recorder.authenticated_execute, false);
  assert.equal(recorder.service_execute, true);
  assert.match(recorder.normalized_definition, /america\/sao_paulo/);
  assert.match(recorder.normalized_definition,
    /perform 1 from public\.profiles.*for update/);
  assert.match(recorder.normalized_definition,
    /on conflict on constraint user_streaks_pkey do nothing/);
  assert.match(recorder.normalized_definition, /update public\.user_streaks/);
  assert.match(recorder.normalized_definition, /update public\.profiles/);

  assert.ok(energy?.definition, 'Energy successor must exist');
  assert.equal(energy.identity_arguments, 'p_mission_id uuid');
  assert.equal(
    energy.result_type.toLowerCase(),
    'table(mission_id uuid, completed_now boolean, energy_awarded integer, '
      + 'total_energy integer)',
  );
  assert.equal(energy.owner, 'postgres');
  assert.equal(energy.language, 'plpgsql');
  assert.equal(energy.volatility, 'v');
  assert.equal(energy.security_definer, true);
  assert.ok(['search_path=', 'search_path=""'].includes(energy.configuration));
  assert.equal(energy.public_execute, false);
  assert.equal(energy.anon_execute, false);
  assert.equal(energy.authenticated_execute, true);
  assert.equal(energy.service_execute, true);
  assert.match(energy.normalized_definition, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(energy.normalized_definition, /mission\.user_id = v_user_id/);
  assert.match(energy.normalized_definition, /mission\.completed = false/);
  assert.match(energy.normalized_definition, /v_energy_reward > 500/);
  assert.match(energy.normalized_definition, /\/ 500/);
  assert.match(energy.normalized_definition, /idempotency_key/);
  assert.match(energy.normalized_definition, /record_user_streak_activity/);

  return { recorder, energy };
}

async function readWorkoutFunctionState(db) {
  const result = await db.query(`
    with expected(signature) as (
      select unnest($1::text[])
    ), resolved as (
      select expected.signature,
             pg_catalog.to_regprocedure('public.' || expected.signature)::oid as oid
      from expected
    )
    select resolved.signature,
           function_record.oid is not null as exists_now,
           pg_catalog.pg_get_userbyid(function_record.proowner)::text as owner,
           function_record.prosecdef as security_definer,
           pg_catalog.array_to_string(function_record.proconfig, ',')::text as configuration,
           pg_catalog.md5(pg_catalog.pg_get_functiondef(function_record.oid)) as definition_md5,
           pg_catalog.has_function_privilege('public', function_record.oid, 'EXECUTE') as public_execute,
           pg_catalog.has_function_privilege('anon', function_record.oid, 'EXECUTE') as anon_execute,
           pg_catalog.has_function_privilege('authenticated', function_record.oid, 'EXECUTE') as authenticated_execute,
           pg_catalog.has_function_privilege('service_role', function_record.oid, 'EXECUTE') as service_execute,
           exists (
             select 1
             from pg_catalog.aclexplode(
               coalesce(
                 function_record.proacl,
                 pg_catalog.acldefault('f', function_record.proowner)
               )
             ) acl
             where acl.privilege_type = 'EXECUTE'
               and (acl.grantee = 0 or acl.grantee <> function_record.proowner)
           ) as unexpected_non_owner_execute
    from resolved
    left join pg_catalog.pg_proc function_record on function_record.oid = resolved.oid
    order by resolved.signature
  `, [expectedFunctions]);
  return result.rows;
}

function assertDormantState(rows) {
  assert.equal(rows.length, 17);
  for (const row of rows) {
    assert.equal(row.exists_now, true, `${row.signature} must exist`);
    assert.equal(row.owner, 'postgres', `${row.signature} owner`);
    assert.equal(row.public_execute, false, `${row.signature} PUBLIC EXECUTE`);
    assert.equal(row.anon_execute, false, `${row.signature} anon EXECUTE`);
    assert.equal(row.authenticated_execute, false, `${row.signature} authenticated EXECUTE`);
    assert.equal(row.service_execute, false, `${row.signature} service_role EXECUTE`);
    assert.equal(row.unexpected_non_owner_execute, false,
      `${row.signature} unexpected non-owner EXECUTE`);
    if (expectedPublicRpcs.has(row.signature)) {
      assert.equal(row.security_definer, true, `${row.signature} SECURITY DEFINER`);
      assert.ok(['search_path=', 'search_path=""'].includes(row.configuration),
        `${row.signature} empty search_path`);
    }
  }
}

test('Workout Phase-1 ACL reconciliation remains local, dormant and idempotent', async () => {
  assertNoExternalConfiguration();
  await assertHarnessIsLoopbackOnly();
  const productionSnapshots = await readAuthenticatedProductionSnapshots();
  const productionCheckpoint = await renderProductionCheckpoint(productionSnapshots);

  local = await startLocalPostgres();
  try {
    assert.equal(expectedHost, '127.0.0.1');
    assert.ok(Number.isInteger(local.port) && local.port > 0 && local.port <= 65535,
      'Embedded PostgreSQL must use an ephemeral TCP port');
    const relativeDataDir = relative(expectedCacheRoot, resolve(local.dataDir));
    assert.ok(relativeDataDir.length > 0
      && !relativeDataDir.startsWith('..')
      && !isAbsolute(relativeDataDir),
      'Embedded PostgreSQL data directory escaped the ignored local cache');

    const { db } = local;
    const endpoint = await db.query(`
      select pg_catalog.host(pg_catalog.inet_server_addr()) as host,
             pg_catalog.inet_server_port() as port,
             pg_catalog.current_setting('server_version') as server_version
    `);
    assert.equal(endpoint.rows[0].host, expectedHost,
      'Connected PostgreSQL server must resolve to literal 127.0.0.1');
    assert.equal(endpoint.rows[0].port, local.port,
      'Connected PostgreSQL port must match the ephemeral harness port');
    assert.match(endpoint.rows[0].server_version, /^17\.6(?:\.|$)/,
      'Primary test engine must be embedded PostgreSQL 17.6');

    await db.query(await readFile(fixtureUrl, 'utf8'));
    for (const migration of prerequisiteMigrations) {
      await applyMigration(db, migration);
    }

    const legacyBefore = await db.query(`
      select pg_catalog.md5(pg_catalog.pg_get_functiondef(
        'public.toggle_mission_with_xp(uuid,boolean)'::regprocedure
      )) as definition_md5
    `);
    await db.query(productionCheckpoint);
    const checkpointState = assertCheckpointState(await readDependencyState(db));
    const legacyAfter = await db.query(`
      select pg_catalog.md5(pg_catalog.pg_get_functiondef(
        'public.toggle_mission_with_xp(uuid,boolean)'::regprocedure
      )) as definition_md5,
      pg_catalog.has_function_privilege(
        'public',
        'public.toggle_mission_with_xp(uuid,boolean)',
        'EXECUTE'
      ) as public_execute,
      pg_catalog.has_function_privilege(
        'anon',
        'public.toggle_mission_with_xp(uuid,boolean)',
        'EXECUTE'
      ) as anon_execute,
      pg_catalog.has_function_privilege(
        'authenticated',
        'public.toggle_mission_with_xp(uuid,boolean)',
        'EXECUTE'
      ) as authenticated_execute,
      pg_catalog.has_function_privilege(
        'service_role',
        'public.toggle_mission_with_xp(uuid,boolean)',
        'EXECUTE'
      ) as service_execute
    `);
    assert.equal(
      legacyAfter.rows[0].definition_md5,
      legacyBefore.rows[0].definition_md5,
      'Checkpoint must not modify the legacy toggle body',
    );
    assert.equal(legacyAfter.rows[0].public_execute, false);
    assert.equal(legacyAfter.rows[0].anon_execute, false);
    assert.equal(legacyAfter.rows[0].authenticated_execute, true);
    assert.equal(legacyAfter.rows[0].service_execute, true);

    assert.equal(
      checkpointState.recorder.raw_md5,
      expectedProductionRecorderRawMd5,
      'Stop before Workout install: streak recorder raw Production fingerprint mismatch',
    );
    assert.equal(
      checkpointState.energy.raw_md5,
      expectedProductionEnergyRawMd5,
      'Stop before Workout install: Energy raw Production fingerprint mismatch',
    );

    await applyMigration(db, installMigration);
    const installedState = await readWorkoutFunctionState(db);
    assertDormantState(installedState);

    await applyMigration(db, reconciliationMigration);
    const firstReconciliationState = await readWorkoutFunctionState(db);
    assertDormantState(firstReconciliationState);
    assert.deepEqual(
      firstReconciliationState.map(({ signature, definition_md5 }) => ({ signature, definition_md5 })),
      installedState.map(({ signature, definition_md5 }) => ({ signature, definition_md5 })),
      'Reconciliation must not change Workout function definitions',
    );

    await applyMigration(db, reconciliationMigration);
    const secondReconciliationState = await readWorkoutFunctionState(db);
    assertDormantState(secondReconciliationState);
    assert.deepEqual(secondReconciliationState, firstReconciliationState,
      'A second reconciliation must be an exact ACL/catalog no-op');

    const audit = await db.query(await readMigration(postApplyAudit));
    assert.equal(Array.isArray(audit), false, 'Post-apply audit must return one result set');
    assert.deepEqual(audit.rows.map((row) => row.check_name), expectedChecks);
    assert.deepEqual(
      audit.rows.filter((row) => row.status !== 'PASS'),
      [],
      JSON.stringify(audit.rows, null, 2),
    );

    const activation = audit.rows.find(
      (row) => row.check_name === 'workout_runtime_activation_state',
    );
    assert.ok(activation, 'Activation-state audit row is required');
    assert.equal(activation.status, 'PASS');
    assert.equal(activation.details.workout_runtime_activation_state, 'DORMANT');
    assert.equal(activation.details.expected_user_facing_rpcs, 11);

    const finalDependencyState = assertCheckpointState(await readDependencyState(db));
    assert.equal(
      finalDependencyState.recorder.raw_md5,
      checkpointState.recorder.raw_md5,
      'Workout migrations must preserve the streak recorder fingerprint',
    );
    assert.equal(
      finalDependencyState.energy.raw_md5,
      checkpointState.energy.raw_md5,
      'Workout migrations must preserve the Energy fingerprint',
    );

    console.log('WORKOUT_PHASE1_LOCAL_RESULT_START');
    console.log(JSON.stringify({
      postgres_version: endpoint.rows[0].server_version,
      host: endpoint.rows[0].host,
      port: endpoint.rows[0].port,
      checkpoint: {
        recorder_raw_md5: checkpointState.recorder.raw_md5,
        recorder_normalized_md5: checkpointState.recorder.normalized_md5,
        recorder_expected_production_raw_md5: expectedProductionRecorderRawMd5,
        recorder_raw_matches_production:
          checkpointState.recorder.raw_md5 === expectedProductionRecorderRawMd5,
        energy_raw_md5: checkpointState.energy.raw_md5,
        energy_normalized_md5: checkpointState.energy.normalized_md5,
        energy_expected_production_raw_md5: expectedProductionEnergyRawMd5,
        energy_raw_matches_production:
          checkpointState.energy.raw_md5 === expectedProductionEnergyRawMd5,
        legacy_definition_preserved: true,
      },
      workout_functions: firstReconciliationState.length,
      second_reconciliation_exact_no_op: true,
      audit_checks: audit.rows.map(({ check_name, status }) => ({ check_name, status })),
      workout_runtime_activation_state:
        activation.details.workout_runtime_activation_state,
    }, null, 2));
    console.log('WORKOUT_PHASE1_LOCAL_RESULT_END');
  } finally {
    if (local) {
      await local.stop();
      local = undefined;
    }
  }
});
