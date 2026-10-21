import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { readMigration, startLocalPostgres } from './local-postgres.mjs';

let local;
after(async () => { if (local) await local.stop(); });

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';

const schema = `
create table public.workout_schedule_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  scheduled_for_date date not null,
  skipped_at timestamptz
);
create table public.daily_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  for_date date not null,
  mission_code text,
  algorithm_version text,
  completion_rule text,
  difficulty text,
  source_workout_occurrence_id uuid references public.workout_schedule_occurrences(id),
  title text not null,
  description text,
  category text not null,
  xp_reward integer not null,
  target_value integer not null,
  current_value integer not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint daily_missions_intelligence_identity_unique
    unique (user_id, for_date, algorithm_version, mission_code)
);
`;

const ambiguousFunction = `
create function public.materialize_daily_missions_v1(
  p_user_id uuid, p_for_date date, p_algorithm_version text, p_missions jsonb
)
returns table (id uuid, mission_code text, completed boolean)
language plpgsql security definer set search_path = '' as $function$
begin
  insert into public.daily_missions (
    user_id, for_date, mission_code, algorithm_version, completion_rule, difficulty,
    title, description, category, xp_reward, target_value, current_value, completed
  ) values (
    p_user_id, p_for_date, 'REST_RECOVERY', p_algorithm_version, 'CHECK_IN', 'EASY',
    'Recuperação', 'Dia de descanso', 'RECOVERY', 20, 1, 0, false
  )
  on conflict (user_id, for_date, algorithm_version, mission_code) do nothing;
end
$function$;
`;

function mission(code, category, sourceWorkoutOccurrenceId = null) {
  return [{
    code, category, title: `Mission ${code}`, description: 'Deterministic fixture',
    completion_rule: 'CHECK_IN', energy_reward: 20, difficulty: 'EASY',
    target_value: 1, current_value: 0,
    source_workout_occurrence_id: sourceWorkoutOccurrenceId,
  }];
}

test('mission conflict fix reproduces 42702 then preserves idempotent and capability-aware materialization', async () => {
  local = await startLocalPostgres();
  const { db } = local;
  await db.query(schema);
  await db.query(ambiguousFunction);
  await assert.rejects(
    db.query("select * from public.materialize_daily_missions_v1($1, date '2026-10-21', 'praxe-missions-v1', '[]'::jsonb)", [userId]),
    (error) => error?.code === '42702' && /mission_code.*ambiguous/i.test(error.message),
  );

  await db.query(await readMigration('20261021163732_fix_materialize_daily_missions_v1_conflict.sql'));

  const restPayload = JSON.stringify(mission('REST_RECOVERY', 'RECOVERY'));
  const first = await db.query(
    "select * from public.materialize_daily_missions_v1($1, date '2026-10-21', 'praxe-missions-v1', $2::jsonb)",
    [userId, restPayload],
  );
  const second = await db.query(
    "select * from public.materialize_daily_missions_v1($1, date '2026-10-21', 'praxe-missions-v1', $2::jsonb)",
    [userId, restPayload],
  );
  assert.equal(first.rows.length, 1);
  assert.deepEqual(second.rows, first.rows);

  await db.query(
    "select * from public.materialize_daily_missions_v1($1, date '2026-10-21', 'praxe-missions-v1', $2::jsonb)",
    [otherUserId, restPayload],
  );
  const isolated = await db.query('select user_id, count(*)::int as count from public.daily_missions group by user_id order by user_id');
  assert.deepEqual(isolated.rows, [
    { user_id: userId, count: 1 },
    { user_id: otherUserId, count: 1 },
  ]);

  const occurrence = await db.query(
    "insert into public.workout_schedule_occurrences (user_id, scheduled_for_date) values ($1, date '2026-10-22') returning id",
    [userId],
  );
  const capabilityPayload = JSON.stringify(mission('COMPLETE_TRAINING', 'TRAINING', occurrence.rows[0].id));
  const capability = await db.query(
    "select * from public.materialize_daily_missions_v1($1, date '2026-10-22', 'praxe-missions-v1', $2::jsonb)",
    [userId, capabilityPayload],
  );
  assert.equal(capability.rows.length, 1);
  assert.equal(capability.rows[0].mission_code, 'COMPLETE_TRAINING');
  const total = await db.query('select count(*)::int as count from public.daily_missions');
  assert.equal(total.rows[0].count, 3);
});
