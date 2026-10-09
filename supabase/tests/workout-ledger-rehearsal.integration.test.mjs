import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { readMigration, startLocalPostgres } from './local-postgres.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cacheRoot = resolve(root, 'node_modules/.cache/onboarding-v22');
const cliPackage = 'supabase@2.120.0';
const expectedCliVersion = '2.120.0';
const npmCli = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const expectedHost = '127.0.0.1';
const recorderMd5 = '66a1d1b6ad6cdfd150ef06026410320c';
const energyMd5 = '4a1deeecb318df2dd76a30a1cd4acb74';

const repairedVersions = [
  '20260907000100',
  '20260909000200',
  '20260911000100',
  '20261004000100',
  '20261004000200',
  '20261004000300',
  '20261005000100',
];
const pendingVersion = '20261008000100';

const migrationFiles = [
  '20260907000100_reward_system_foundation.sql',
  '20260909000200_user_streaks.sql',
  '20260911000100_add_current_mission_unique_index.sql',
  '20261004000100_restore_complete_mission_with_energy_and_contain_legacy_toggle.sql',
  '20261004000200_sync_streak_recorder_to_profile_compatibility.sql',
  '20261004000300_add_praxe_workout_persistence.sql',
  '20261005000100_reconcile_praxe_workout_phase1_dormant_acl.sql',
  '20261008000100_harden_praxe_workout_active_session_concurrency.sql',
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

const forbiddenEnvironment = [
  'DATABASE_URL',
  'DIRECT_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'SUPABASE_DB_URL',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
];

const fixtureUrl = new URL('./fixtures/workout-phase1-baseline.sql', import.meta.url);
const checkpointUrl = new URL(
  './fixtures/workout-phase1-post-energy-checkpoint.sql',
  import.meta.url,
);
const snapshotsUrl = new URL(
  './fixtures/workout-phase1-production-function-snapshots.json',
  import.meta.url,
);

function md5(value) {
  return createHash('md5').update(value, 'utf8').digest('hex');
}

function assertNoExternalConfiguration() {
  const configured = forbiddenEnvironment.filter(
    (name) => typeof process.env[name] === 'string' && process.env[name].length > 0,
  );
  assert.deepEqual(configured, [], `External configuration is forbidden: ${configured.join(', ')}`);
}

function sanitizedEnvironment() {
  const environment = { ...process.env, NO_COLOR: '1' };
  for (const name of forbiddenEnvironment) delete environment[name];
  return environment;
}

function validatedClusterDataDir(dataDir) {
  const resolvedDataDir = resolve(dataDir);
  const relativeDataDir = relative(cacheRoot, resolvedDataDir);
  assert.equal(dirname(resolvedDataDir), cacheRoot, `Unsafe cluster parent: ${resolvedDataDir}`);
  assert.equal(isAbsolute(relativeDataDir), false, `Unsafe cluster path: ${resolvedDataDir}`);
  assert.equal(relativeDataDir.startsWith('..'), false, `Unsafe cluster path: ${resolvedDataDir}`);
  assert.match(basename(resolvedDataDir), /^pg-test-[A-Za-z0-9_-]+$/);
  return resolvedDataDir;
}

async function collectClusterCleanupErrors(cluster, removeDirectory = rm) {
  if (!cluster) return [];
  const cleanupErrors = [];
  try {
    await cluster.stop();
  } catch (error) {
    cleanupErrors.push(new Error('Failed to stop local PostgreSQL cluster', { cause: error }));
  }
  try {
    const dataDir = validatedClusterDataDir(cluster.dataDir);
    await removeDirectory(dataDir, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(new Error('Failed to remove local PostgreSQL data directory', { cause: error }));
  }
  return cleanupErrors;
}

function finishCleanup(primaryError, cleanupErrors, reportSecondary = console.error) {
  if (cleanupErrors.length === 0) return;
  if (!primaryError) {
    throw new AggregateError(cleanupErrors, 'Local rehearsal cleanup failed');
  }
  if (Object.isExtensible(primaryError)) {
    Object.defineProperty(primaryError, 'cleanupErrors', {
      configurable: true,
      enumerable: false,
      value: cleanupErrors,
    });
  }
  reportSecondary(
    `Secondary cleanup errors: ${cleanupErrors.map((error) => error.message).join('; ')}`,
  );
}

async function removeTemporaryProject(projectDir, cleanupErrors) {
  if (!projectDir) return;
  try {
    await rm(projectDir, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(new Error('Failed to remove temporary Supabase CLI project', { cause: error }));
  }
}

function validateLoopbackUrl(databaseUrl, expectedPort) {
  const parsed = new URL(databaseUrl);
  assert.equal(parsed.protocol, 'postgresql:');
  assert.equal(parsed.hostname, expectedHost);
  assert.equal(Number(parsed.port), expectedPort);
  assert.equal(parsed.username, 'postgres');
  assert.equal(parsed.password, '');
  assert.equal(parsed.pathname, '/postgres');
  assert.equal(parsed.searchParams.get('sslmode'), 'disable');
}

function runCli({ projectDir, databaseUrl, port, args, expectSuccess = true }) {
  validateLoopbackUrl(databaseUrl, port);
  assert.equal(args.includes('--linked'), false);
  assert.equal(args.includes('link'), false);
  assert.equal(args.includes('login'), false);
  assert.equal(args.includes('--project-ref'), false);
  const result = spawnSync(
    process.execPath,
    [npmCli, 'exec', '--yes', `--package=${cliPackage}`, '--', 'supabase', ...args, '--db-url', databaseUrl],
    {
      cwd: projectDir,
      env: sanitizedEnvironment(),
      encoding: 'utf8',
      timeout: 120000,
      windowsHide: true,
    },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (expectSuccess) {
    assert.equal(result.status, 0, output);
  } else {
    assert.notEqual(result.status, 0, 'CLI command unexpectedly succeeded');
  }
  return { status: result.status, output: output.trim() };
}

async function makeCliProject() {
  await mkdir(cacheRoot, { recursive: true });
  const projectDir = await mkdtemp(join(cacheRoot, 'ledger-cli-'));
  const migrationDir = join(projectDir, 'supabase', 'migrations');
  await mkdir(migrationDir, { recursive: true });
  for (const filename of migrationFiles) {
    await copyFile(
      resolve(root, 'supabase', 'migrations', filename),
      join(migrationDir, filename),
    );
  }
  return projectDir;
}

async function renderProductionCheckpoint() {
  const snapshots = JSON.parse(await readFile(snapshotsUrl, 'utf8'));
  const recorder = snapshots.record_user_streak_activity;
  const energy = snapshots.complete_mission_with_energy;
  assert.equal(recorder.signature, 'public.record_user_streak_activity(uuid)');
  assert.equal(energy.signature, 'public.complete_mission_with_energy(uuid)');
  assert.equal(recorder.definition_md5, recorderMd5);
  assert.equal(energy.definition_md5, energyMd5);
  assert.equal(md5(recorder.function_definition), recorderMd5);
  assert.equal(md5(energy.function_definition), energyMd5);
  const template = await readFile(checkpointUrl, 'utf8');
  return template
    .replace(
      '-- {{PRODUCTION_RECORD_USER_STREAK_ACTIVITY_FUNCTION_DEFINITION}}',
      recorder.function_definition,
    )
    .replace(
      '-- {{PRODUCTION_COMPLETE_MISSION_WITH_ENERGY_FUNCTION_DEFINITION}}',
      energy.function_definition,
    );
}

async function readDependencyFingerprints(db) {
  const result = await db.query(`
    select
      pg_catalog.md5(pg_catalog.pg_get_functiondef(
        'public.record_user_streak_activity(uuid)'::regprocedure
      )) as recorder_md5,
      pg_catalog.md5(pg_catalog.pg_get_functiondef(
        'public.complete_mission_with_energy(uuid)'::regprocedure
      )) as energy_md5
  `);
  return result.rows[0];
}

async function readWorkoutState(db) {
  const result = await db.query(`
    with expected(signature) as (
      select pg_catalog.unnest($1::text[])
    )
    select
      expected.signature,
      procedure_record.oid is not null as exists_now,
      pg_catalog.pg_get_userbyid(procedure_record.proowner)::text as owner_name,
      procedure_record.prosecdef as security_definer,
      pg_catalog.array_to_string(procedure_record.proconfig, ',')::text as configuration,
      pg_catalog.has_function_privilege('anon', procedure_record.oid, 'EXECUTE') as anon_execute,
      pg_catalog.has_function_privilege('authenticated', procedure_record.oid, 'EXECUTE') as authenticated_execute,
      pg_catalog.has_function_privilege('service_role', procedure_record.oid, 'EXECUTE') as service_execute,
      exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(
            procedure_record.proacl,
            pg_catalog.acldefault('f', procedure_record.proowner)
          )
        ) acl
        where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
      ) as public_execute,
      pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure_record.oid)) as definition_md5
    from expected
    left join pg_catalog.pg_proc procedure_record
      on procedure_record.oid = pg_catalog.to_regprocedure('public.' || expected.signature)
    order by expected.signature
  `, [expectedFunctions]);
  return result.rows;
}

function assertDormant(rows) {
  assert.equal(rows.length, 17);
  for (const row of rows) {
    assert.equal(row.exists_now, true, row.signature);
    assert.equal(row.owner_name, 'postgres', row.signature);
    assert.equal(row.public_execute, false, row.signature);
    assert.equal(row.anon_execute, false, row.signature);
    assert.equal(row.authenticated_execute, false, row.signature);
    assert.equal(row.service_execute, false, row.signature);
  }
}

async function createSyntheticChestEvidence(db) {
  await db.query(`
    create function public.open_user_chest(p_chest_id uuid)
    returns table (
      chest_id uuid,
      chest_slug text,
      chest_name text,
      chest_rarity text,
      reward_type text,
      amount integer,
      item_id uuid
    )
    language sql
    security definer
    set search_path = ''
    as $synthetic_chest$
      select null::uuid, null::text, null::text, null::text,
             null::text, null::integer, null::uuid
      where false
    $synthetic_chest$;
    alter function public.open_user_chest(uuid) owner to postgres;
    revoke all on function public.open_user_chest(uuid)
      from public, anon, authenticated, service_role;
  `);
}

async function buildProductionLike(local) {
  const db = local.db;
  await db.query(await readFile(fixtureUrl, 'utf8'));
  for (const filename of [
    '20260907000100_reward_system_foundation.sql',
    '20260909000200_user_streaks.sql',
    '20260911000100_add_current_mission_unique_index.sql',
  ]) {
    await db.query(await readMigration(filename));
  }
  await createSyntheticChestEvidence(db);
  await db.query(await renderProductionCheckpoint());
  const checkpoint = await readDependencyFingerprints(db);
  assert.deepEqual(checkpoint, { recorder_md5: recorderMd5, energy_md5: energyMd5 });
  await db.query(await readMigration('20261004000300_add_praxe_workout_persistence.sql'));
  assertDormant(await readWorkoutState(db));
  const audit = await db.query(
    await readMigration('audit_praxe_workout_persistence_postapply_READONLY.sql'),
  );
  assert.deepEqual(audit.rows.filter((row) => row.status !== 'PASS'), []);
  assert.equal(
    audit.rows.find((row) => row.check_name === 'workout_runtime_activation_state')
      .details.workout_runtime_activation_state,
    'DORMANT',
  );
  const initial = await db.query(`
    select
      pg_catalog.host(pg_catalog.inet_server_addr()) as host,
      pg_catalog.inet_server_port() as port,
      current_setting('server_version') as server_version,
      pg_catalog.to_regclass('supabase_migrations.schema_migrations') is not null
        as ledger_exists,
      pg_catalog.to_regclass(
        'public.workout_sessions_one_in_progress_per_user_unique'
      ) is not null as migration_g_index_exists,
      pg_catalog.to_regprocedure('public.open_user_chest(uuid)') is not null
        as synthetic_chest_effect_exists
  `);
  assert.equal(initial.rows[0].host, expectedHost);
  assert.equal(Number(initial.rows[0].port), local.port);
  assert.equal(initial.rows[0].ledger_exists, false);
  assert.equal(initial.rows[0].migration_g_index_exists, false);
  assert.equal(initial.rows[0].synthetic_chest_effect_exists, true);
  return { checkpoint, initial: initial.rows[0], audit };
}

async function readLedger(db) {
  const columns = await db.query(`
    select column_name, data_type, is_nullable, ordinal_position
    from information_schema.columns
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
    order by ordinal_position
  `);
  const rows = await db.query(`
    select to_jsonb(migration_row) - 'statements' as metadata
    from supabase_migrations.schema_migrations migration_row
    order by to_jsonb(migration_row) ->> 'version'
  `);
  return { columns: columns.rows, rows: rows.rows.map((row) => row.metadata) };
}

function repairHistory({ projectDir, databaseUrl, port }) {
  return runCli({
    projectDir,
    databaseUrl,
    port,
    args: ['migration', 'repair', ...repairedVersions, '--status', 'applied'],
  });
}

function migrationList({ projectDir, databaseUrl, port }) {
  return runCli({
    projectDir,
    databaseUrl,
    port,
    args: ['migration', 'list'],
  });
}

function dryRun({ projectDir, databaseUrl, port }) {
  return runCli({
    projectDir,
    databaseUrl,
    port,
    args: ['db', 'push', '--dry-run'],
  });
}

function assertOnlyMigrationGPending(output) {
  assert.match(output, /20261008000100/);
  for (const version of repairedVersions) {
    assert.doesNotMatch(output, new RegExp(`${version}.*\.sql`));
  }
}

async function insertDuplicateActiveSessions(db) {
  const userId = '10000000-0000-4000-8000-000000000001';
  const workoutId = '20000000-0000-4000-8000-000000000001';
  await db.query('insert into auth.users (id) values ($1)', [userId]);
  await db.query(
    `insert into public.workouts (id, user_id, title, exercises)
     values ($1, $2, 'Ledger rehearsal workout', $3)`,
    [workoutId, userId, JSON.stringify([{ id: 'squat', name: 'Squat', sets: '3', reps: '10' }])],
  );
  await db.query(
    `insert into public.workout_sessions
       (user_id, workout_id, workout_title, client_request_id)
     values
       ($1, $2, 'Duplicate A', '30000000-0000-4000-8000-000000000001'),
       ($1, $2, 'Duplicate B', '30000000-0000-4000-8000-000000000002')`,
    [userId, workoutId],
  );
}

async function assertGAbsent(db, expectedStartMd5) {
  const state = await db.query(`
    select
      pg_catalog.to_regclass(
        'public.workout_sessions_one_in_progress_per_user_unique'
      ) is not null as index_exists,
      pg_catalog.md5(pg_catalog.pg_get_functiondef(
        'public.start_workout_session(uuid,uuid,uuid)'::regprocedure
      )) as start_md5,
      exists (
        select 1
        from supabase_migrations.schema_migrations migration_row
        where to_jsonb(migration_row) ->> 'version' = $1
      ) as ledger_recorded
  `, [pendingVersion]);
  assert.equal(state.rows[0].index_exists, false);
  assert.equal(state.rows[0].start_md5, expectedStartMd5);
  assert.equal(state.rows[0].ledger_recorded, false);
}

test('cluster cleanup removes an allowed data directory after success', async () => {
  await mkdir(cacheRoot, { recursive: true });
  const dataDir = await mkdtemp(join(cacheRoot, 'pg-test-cleanup-success-'));
  let stopped = false;
  const cleanupErrors = await collectClusterCleanupErrors({
    dataDir,
    stop: async () => { stopped = true; },
  });
  assert.equal(stopped, true);
  assert.deepEqual(cleanupErrors, []);
  await assert.rejects(stat(dataDir), { code: 'ENOENT' });
});

test('cluster cleanup preserves a primary test error while removing its data directory', async () => {
  await mkdir(cacheRoot, { recursive: true });
  const dataDir = await mkdtemp(join(cacheRoot, 'pg-test-cleanup-primary-'));
  const primaryError = new Error('primary test failure');
  const cleanupErrors = await collectClusterCleanupErrors({ dataDir, stop: async () => {} });
  finishCleanup(primaryError, cleanupErrors);
  assert.equal(primaryError.message, 'primary test failure');
  await assert.rejects(stat(dataDir), { code: 'ENOENT' });
});

test('cluster cleanup attempts removal when stop fails', async () => {
  await mkdir(cacheRoot, { recursive: true });
  const dataDir = await mkdtemp(join(cacheRoot, 'pg-test-cleanup-stop-'));
  const cleanupErrors = await collectClusterCleanupErrors({
    dataDir,
    stop: async () => { throw new Error('stop failure'); },
  });
  assert.equal(cleanupErrors.length, 1);
  assert.match(cleanupErrors[0].message, /stop/i);
  await assert.rejects(stat(dataDir), { code: 'ENOENT' });
});

test('cluster cleanup does not replace a primary error when directory removal fails', async () => {
  await mkdir(cacheRoot, { recursive: true });
  const dataDir = await mkdtemp(join(cacheRoot, 'pg-test-cleanup-rm-'));
  const primaryError = new Error('primary test failure');
  const reports = [];
  const cleanupErrors = await collectClusterCleanupErrors(
    { dataDir, stop: async () => {} },
    async () => { throw new Error('rm failure'); },
  );
  finishCleanup(primaryError, cleanupErrors, (message) => reports.push(message));
  assert.equal(primaryError.message, 'primary test failure');
  assert.equal(primaryError.cleanupErrors, cleanupErrors);
  assert.match(reports[0], /remove local PostgreSQL data directory/i);
  await rm(dataDir, { recursive: true, force: true });
});

test('Supabase CLI ledger reconciliation remains local and keeps Migration G pending until real apply', async () => {
  assertNoExternalConfiguration();
  const cliVersion = spawnSync(
    process.execPath,
    [npmCli, 'exec', '--yes', `--package=${cliPackage}`, '--', 'supabase', '--version'],
    { cwd: root, env: sanitizedEnvironment(), encoding: 'utf8', timeout: 120000, windowsHide: true },
  );
  assert.equal(cliVersion.status, 0, `${cliVersion.stdout}${cliVersion.stderr}`);
  assert.equal(cliVersion.stdout.trim(), expectedCliVersion);

  const report = {
    cli_version: expectedCliVersion,
    cli_package: cliPackage,
    repaired_versions: repairedVersions,
    pending_version: pendingVersion,
  };

  let negativeLocal;
  let negativeProject;
  let negativePrimaryError;
  try {
    negativeProject = await makeCliProject();
    negativeLocal = await startLocalPostgres();
    const built = await buildProductionLike(negativeLocal);
    const databaseUrl = `postgresql://postgres@${expectedHost}:${negativeLocal.port}/postgres?sslmode=disable`;
    repairHistory({ projectDir: negativeProject, databaseUrl, port: negativeLocal.port });
    const firstList = migrationList({
      projectDir: negativeProject,
      databaseUrl,
      port: negativeLocal.port,
    });
    const firstDryRun = dryRun({
      projectDir: negativeProject,
      databaseUrl,
      port: negativeLocal.port,
    });
    assertOnlyMigrationGPending(firstDryRun.output);
    const preG = await readWorkoutState(negativeLocal.db);
    const preGStart = preG.find(
      (row) => row.signature === 'start_workout_session(uuid,uuid,uuid)',
    );
    await insertDuplicateActiveSessions(negativeLocal.db);
    const failedPush = runCli({
      projectDir: negativeProject,
      databaseUrl,
      port: negativeLocal.port,
      args: ['db', 'push', '--yes'],
      expectSuccess: false,
    });
    assert.match(failedPush.output, /multiple in-progress sessions/i);
    await assertGAbsent(negativeLocal.db, preGStart.definition_md5);
    report.negative = {
      postgres_version: built.initial.server_version,
      host: built.initial.host,
      port: built.initial.port,
      migration_list: firstList.output,
      first_dry_run: firstDryRun.output,
      failed_push: failedPush.output,
      migration_g_ledger_recorded: false,
      migration_g_index_created: false,
      start_function_preserved: true,
    };
  } catch (error) {
    negativePrimaryError = error;
    throw error;
  } finally {
    const cleanupErrors = await collectClusterCleanupErrors(negativeLocal);
    await removeTemporaryProject(negativeProject, cleanupErrors);
    finishCleanup(negativePrimaryError, cleanupErrors);
  }

  let positiveLocal;
  let positiveProject;
  let positivePrimaryError;
  try {
    positiveProject = await makeCliProject();
    positiveLocal = await startLocalPostgres();
    const built = await buildProductionLike(positiveLocal);
    const databaseUrl = `postgresql://postgres@${expectedHost}:${positiveLocal.port}/postgres?sslmode=disable`;
    const repair = repairHistory({
      projectDir: positiveProject,
      databaseUrl,
      port: positiveLocal.port,
    });
    const ledgerAfterRepair = await readLedger(positiveLocal.db);
    assert.deepEqual(
      ledgerAfterRepair.rows.map((row) => row.version),
      repairedVersions,
    );
    const firstList = migrationList({
      projectDir: positiveProject,
      databaseUrl,
      port: positiveLocal.port,
    });
    const firstDryRun = dryRun({
      projectDir: positiveProject,
      databaseUrl,
      port: positiveLocal.port,
    });
    assertOnlyMigrationGPending(firstDryRun.output);
    const preGState = await readWorkoutState(positiveLocal.db);
    assertDormant(preGState);
    const preGStartMd5 = preGState.find(
      (row) => row.signature === 'start_workout_session(uuid,uuid,uuid)',
    ).definition_md5;
    const applyG = runCli({
      projectDir: positiveProject,
      databaseUrl,
      port: positiveLocal.port,
      args: ['db', 'push', '--yes'],
    });
    const ledgerAfterG = await readLedger(positiveLocal.db);
    assert.deepEqual(
      ledgerAfterG.rows.map((row) => row.version),
      [...repairedVersions, pendingVersion],
    );
    const gIndex = await positiveLocal.db.query(`
      select index_record.indisunique, index_record.indisvalid,
             index_record.indisready,
             pg_catalog.pg_get_expr(
               index_record.indpred,
               index_record.indrelid
             ) as predicate
      from pg_catalog.pg_index index_record
      where index_record.indexrelid =
        'public.workout_sessions_one_in_progress_per_user_unique'::regclass
    `);
    assert.deepEqual(gIndex.rows, [{
      indisunique: true,
      indisvalid: true,
      indisready: true,
      predicate: "(status = 'in_progress'::text)",
    }]);
    const postGState = await readWorkoutState(positiveLocal.db);
    assertDormant(postGState);
    assert.notEqual(
      postGState.find(
        (row) => row.signature === 'start_workout_session(uuid,uuid,uuid)',
      ).definition_md5,
      preGStartMd5,
    );
    const finalFingerprints = await readDependencyFingerprints(positiveLocal.db);
    assert.deepEqual(finalFingerprints, built.checkpoint);
    const finalAudit = await positiveLocal.db.query(
      await readMigration('audit_praxe_workout_persistence_postapply_READONLY.sql'),
    );
    assert.deepEqual(finalAudit.rows.filter((row) => row.status !== 'PASS'), []);
    const finalList = migrationList({
      projectDir: positiveProject,
      databaseUrl,
      port: positiveLocal.port,
    });
    const secondDryRun = dryRun({
      projectDir: positiveProject,
      databaseUrl,
      port: positiveLocal.port,
    });
    assert.doesNotMatch(secondDryRun.output, /2026\d{10}.*\.sql/);
    report.positive = {
      postgres_version: built.initial.server_version,
      host: built.initial.host,
      port: built.initial.port,
      repair_output: repair.output,
      ledger_schema: ledgerAfterRepair.columns,
      ledger_after_repair: ledgerAfterRepair.rows,
      first_migration_list: firstList.output,
      first_dry_run: firstDryRun.output,
      migration_g_apply: applyG.output,
      ledger_after_g: ledgerAfterG.rows,
      final_migration_list: finalList.output,
      second_dry_run: secondDryRun.output,
      migration_g_index: gIndex.rows[0],
      workout_functions: postGState.length,
      workout_runtime_activation_state: 'DORMANT',
      fingerprints: finalFingerprints,
      post_audit_checks: finalAudit.rows.map(({ check_name, status }) => ({ check_name, status })),
    };
  } catch (error) {
    positivePrimaryError = error;
    throw error;
  } finally {
    const cleanupErrors = await collectClusterCleanupErrors(positiveLocal);
    await removeTemporaryProject(positiveProject, cleanupErrors);
    finishCleanup(positivePrimaryError, cleanupErrors);
  }

  console.log('PRAXE_LEDGER_REHEARSAL_RESULT_START');
  console.log(JSON.stringify(report, null, 2));
  console.log('PRAXE_LEDGER_REHEARSAL_RESULT_END');
});
