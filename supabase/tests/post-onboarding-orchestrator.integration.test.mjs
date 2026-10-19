import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { readMigration, startLocalPostgres } from './local-postgres.mjs';

let local;
after(async () => { if (local) await local.stop(); });

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const receiptKey = '33333333-3333-4333-8333-333333333333';
const otherReceiptKey = '44444444-4444-4444-8444-444444444444';

const fixture = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
create function public.reward_system_set_updated_at() returns trigger language plpgsql as
  'begin new.updated_at = now(); return new; end';
create table public.onboarding_completion_receipts (
  user_id uuid not null references auth.users(id), onboarding_version smallint not null,
  idempotency_key uuid not null, payload_hash bytea not null default decode(repeat('00', 32), 'hex'),
  payload_schema_version smallint not null, canonicalization_version smallint not null,
  completed_at timestamptz not null default now(), primary key (user_id, onboarding_version),
  unique (user_id, idempotency_key)
);
create table public.training_profiles (user_id uuid primary key references auth.users(id));
create table public.nutrition_target_snapshots (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id));
create table public.nutrition_meal_plans (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), status text not null);
create table public.daily_missions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), for_date date not null);
create table public.workouts (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id));
create table public.workout_weekly_schedule (user_id uuid not null references auth.users(id), iso_weekday smallint not null);
insert into auth.users values ('${userId}'), ('${otherUserId}');
insert into public.onboarding_completion_receipts
  (user_id, onboarding_version, idempotency_key, payload_schema_version, canonicalization_version, completed_at)
values
  ('${userId}', 2, '${receiptKey}', 5, 5, '2026-10-19T12:00:00Z'),
  ('${otherUserId}', 2, '${otherReceiptKey}', 5, 5, '2026-10-19T12:00:00Z');
`;

test('post-onboarding SQL lifecycle is idempotent, concurrent and fail-closed', async () => {
  local = await startLocalPostgres();
  const { db } = local;
  await db.query(fixture);
  await db.query(await readMigration('20261019193825_praxe_post_onboarding_orchestrator_v1.sql'));

  await db.query('select * from public.initialize_post_onboarding_jobs_v1($1, null)', [userId]);
  await db.query('select * from public.initialize_post_onboarding_jobs_v1($1, null)', [userId]);
  const initialized = await db.query('select artifact, status, attempt_count from public.post_onboarding_jobs where user_id = $1 order by artifact', [userId]);
  assert.equal(initialized.rows.length, 3);
  assert.ok(initialized.rows.every((row) => row.status === 'pending' && row.attempt_count === 0));

  const second = await local.connect();
  const claims = await Promise.all([
    db.query("select * from public.claim_post_onboarding_job_v1($1, 'WORKOUT_PLAN', 'praxe-post-onboarding-orchestrator-v1', 3::smallint)", [userId]),
    second.query("select * from public.claim_post_onboarding_job_v1($1, 'WORKOUT_PLAN', 'praxe-post-onboarding-orchestrator-v1', 3::smallint)", [userId]),
  ]);
  assert.deepEqual(claims.map((result) => result.rows.length).sort(), [0, 1]);
  const workoutJob = claims.flatMap((result) => result.rows)[0];
  await assert.rejects(
    db.query("select * from public.finish_post_onboarding_job_v1($1, 'ready', null)", [workoutJob.id]),
    /Artifact does not exist/,
  );
  await db.query('insert into public.workouts (user_id) values ($1)', [userId]);
  await db.query('insert into public.workout_weekly_schedule (user_id, iso_weekday) select $1, day from generate_series(1, 7) day', [userId]);
  const ready = await db.query("select * from public.finish_post_onboarding_job_v1($1, 'ready', null)", [workoutJob.id]);
  assert.equal(ready.rows[0].status, 'ready');

  const mealClaim = await db.query("select * from public.claim_post_onboarding_job_v1($1, 'MEAL_PLAN', 'praxe-post-onboarding-orchestrator-v1', 3::smallint)", [userId]);
  const deferred = await db.query("select * from public.defer_post_onboarding_job_v1($1, 'CATALOG_NOT_READY', now() + interval '1 hour')", [mealClaim.rows[0].id]);
  assert.equal(deferred.rows[0].status, 'pending');
  assert.equal(deferred.rows[0].attempt_count, 0);

  await db.query('select * from public.initialize_post_onboarding_jobs_v1($1, null)', [otherUserId]);
  await db.query('grant usage on schema public, auth to authenticated');
  await db.query('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  const visible = await db.query('select distinct user_id::text from public.post_onboarding_jobs');
  assert.deepEqual(visible.rows, [{ user_id: userId }]);
  await db.query('reset role');
});
