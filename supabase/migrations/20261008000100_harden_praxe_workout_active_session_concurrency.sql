-- Phase-2 hardening for the still-dormant Workout persistence contract.
-- This migration adds global per-user active-session exclusivity and reconciles
-- start_workout_session without activating any Workout RPC.

begin;

do $preflight$
declare
  v_duplicate_users integer;
begin
  select pg_catalog.count(*)::integer
    into v_duplicate_users
  from (
    select s.user_id
    from public.workout_sessions s
    where s.status = 'in_progress'
    group by s.user_id
    having pg_catalog.count(*) > 1
  ) duplicates;

  if v_duplicate_users <> 0 then
    raise exception using
      errcode = '23505',
      message = pg_catalog.format(
        'Workout active-session hardening blocked: %s user(s) have multiple in-progress sessions; reconcile them explicitly before retrying',
        v_duplicate_users
      );
  end if;
end
$preflight$;

create unique index if not exists workout_sessions_one_in_progress_per_user_unique
  on public.workout_sessions (user_id)
  where status = 'in_progress';

create or replace function public.start_workout_session(
  p_workout_id uuid,
  p_schedule_occurrence_id uuid,
  p_client_request_id uuid
)
returns table (
  session_id uuid,
  status text,
  workout_id uuid,
  schedule_occurrence_id uuid,
  scheduled_for_date date,
  workout_title text,
  started_at timestamptz,
  completed_at timestamptz,
  note text,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_today date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  v_existing public.workout_sessions%rowtype;
  v_active public.workout_sessions%rowtype;
  v_occurrence public.workout_schedule_occurrences%rowtype;
  v_title text;
  v_exercises text;
  v_session_id uuid;
  v_source_workout_id uuid;
  v_scheduled_date date;
  v_child_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_client_request_id is null then
    raise exception using errcode = '22023', message = 'client_request_id is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('praxe:workout:' || v_user_id::text, 0)
  );

  select s.* into v_existing
  from public.workout_sessions s
  where s.user_id = v_user_id and s.client_request_id = p_client_request_id
  for update;
  if found then
    return query select v_existing.id, v_existing.status,
      v_existing.workout_id, v_existing.schedule_occurrence_id,
      v_existing.scheduled_for_date, v_existing.workout_title::text,
      v_existing.started_at, v_existing.completed_at, v_existing.note, true;
    return;
  end if;

  select s.* into v_active
  from public.workout_sessions s
  where s.user_id = v_user_id and s.status = 'in_progress'
  for update;
  if found then
    return query select v_active.id, v_active.status,
      v_active.workout_id, v_active.schedule_occurrence_id,
      v_active.scheduled_for_date, v_active.workout_title::text,
      v_active.started_at, v_active.completed_at, v_active.note, true;
    return;
  end if;

  if p_schedule_occurrence_id is not null then
    select o.* into v_occurrence
    from public.workout_schedule_occurrences o
    where o.id = p_schedule_occurrence_id and o.user_id = v_user_id
    for update;
    if not found then
      raise exception using errcode = '42501', message = 'Owned schedule occurrence not found';
    end if;
    if v_occurrence.skipped_at is not null or v_occurrence.scheduled_for_date > v_today then
      raise exception using errcode = '22023', message = 'Occurrence is skipped or not yet due';
    end if;
    if exists (
      select 1 from public.workout_sessions s
      where s.schedule_occurrence_id = v_occurrence.id
        and s.status in ('in_progress', 'completed')
    ) then
      raise exception using errcode = '23505', message = 'Occurrence is already reserved or completed';
    end if;
    if p_workout_id is not null
       and p_workout_id is distinct from v_occurrence.source_workout_id then
      raise exception using errcode = '22023', message = 'Workout does not match occurrence source';
    end if;
    if v_occurrence.source_workout_id is not null
       and not exists (
         select 1 from public.workouts w
         where w.id = v_occurrence.source_workout_id and w.user_id = v_user_id
       ) then
      raise exception using errcode = '42501', message = 'Occurrence source ownership mismatch';
    end if;
    select pg_catalog.count(*) into v_child_count
    from public.workout_schedule_occurrence_exercises e
    where e.occurrence_id = v_occurrence.id;
    if v_child_count not between 1 and 40 then
      raise exception 'Occurrence exercise snapshot count is invalid';
    end if;
    v_title := v_occurrence.workout_title_snapshot;
    v_source_workout_id := v_occurrence.source_workout_id;
    v_scheduled_date := v_occurrence.scheduled_for_date;
  else
    if p_workout_id is null then
      raise exception using errcode = '22023', message = 'Ad-hoc start requires workout_id';
    end if;
    select w.title, w.exercises into v_title, v_exercises
    from public.workouts w
    where w.id = p_workout_id and w.user_id = v_user_id
    for share;
    if not found then
      raise exception using errcode = '42501', message = 'Owned workout not found';
    end if;
    v_title := pg_catalog.btrim(v_title);
    if v_title = '' or pg_catalog.char_length(v_title) > 160 then
      raise exception using errcode = '22023', message = 'Workout title is blank or oversized';
    end if;
    perform 1 from public.workout_persistence_parse_exercises(v_exercises);
    v_source_workout_id := p_workout_id;
    v_scheduled_date := null;
  end if;

  insert into public.workout_sessions (
    user_id, workout_id, schedule_occurrence_id, workout_title,
    scheduled_for_date, client_request_id
  ) values (
    v_user_id, v_source_workout_id, p_schedule_occurrence_id, v_title,
    v_scheduled_date, p_client_request_id
  ) returning id into v_session_id;

  if p_schedule_occurrence_id is not null then
    insert into public.workout_session_exercises (
      session_id, exercise_key, name, exercise_position, sets, reps, rest, tip_snapshot
    )
    select v_session_id, e.exercise_key, e.name, e.exercise_position,
           e.sets, e.reps, e.rest, e.tip_snapshot
    from public.workout_schedule_occurrence_exercises e
    where e.occurrence_id = p_schedule_occurrence_id
    order by e.exercise_position;
  else
    insert into public.workout_session_exercises (
      session_id, exercise_key, name, exercise_position, sets, reps, rest, tip_snapshot
    )
    select v_session_id, parsed.exercise_key, parsed.name, parsed.exercise_position,
           parsed.sets, parsed.reps, parsed.rest, parsed.tip_snapshot
    from public.workout_persistence_parse_exercises(v_exercises) parsed;
  end if;

  return query
  select s.id, s.status, s.workout_id, s.schedule_occurrence_id,
         s.scheduled_for_date, s.workout_title::text, s.started_at,
         s.completed_at, s.note, false
  from public.workout_sessions s where s.id = v_session_id;
end
$function$;

alter function public.start_workout_session(uuid, uuid, uuid) owner to postgres;

revoke all on function public.start_workout_session(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

do $postconditions$
declare
  v_function_oid oid;
  v_index_count integer;
  v_duplicate_users integer;
  v_owner text;
  v_security_definer boolean;
  v_configuration text;
  v_unexpected_execute_grantees text[];
begin
  select pg_catalog.count(*)::integer
    into v_duplicate_users
  from (
    select s.user_id
    from public.workout_sessions s
    where s.status = 'in_progress'
    group by s.user_id
    having pg_catalog.count(*) > 1
  ) duplicates;
  if v_duplicate_users <> 0 then
    raise exception 'Workout active-session postcondition failed: duplicate in-progress sessions remain';
  end if;

  select pg_catalog.count(*)::integer
    into v_index_count
  from pg_catalog.pg_index i
  join pg_catalog.pg_class index_relation on index_relation.oid = i.indexrelid
  join pg_catalog.pg_class table_relation on table_relation.oid = i.indrelid
  join pg_catalog.pg_namespace namespace on namespace.oid = table_relation.relnamespace
  where namespace.nspname = 'public'
    and table_relation.relname = 'workout_sessions'
    and index_relation.relname = 'workout_sessions_one_in_progress_per_user_unique'
    and i.indisunique
    and i.indisvalid
    and i.indisready
    and i.indnkeyatts = 1
    and i.indkey[0] = (
      select attribute.attnum
      from pg_catalog.pg_attribute attribute
      where attribute.attrelid = table_relation.oid
        and attribute.attname = 'user_id'
        and not attribute.attisdropped
    )
    and pg_catalog.pg_get_expr(i.indpred, i.indrelid) = '(status = ''in_progress''::text)';
  if v_index_count <> 1 then
    raise exception 'Workout active-session postcondition failed: exact unique partial index is missing or invalid';
  end if;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.start_workout_session(uuid,uuid,uuid)'
  );
  if v_function_oid is null then
    raise exception 'Workout active-session postcondition failed: start_workout_session is missing';
  end if;

  select pg_catalog.pg_get_userbyid(p.proowner)::text,
         p.prosecdef,
         pg_catalog.array_to_string(p.proconfig, ',')::text,
         (
           select pg_catalog.array_agg(
             case when acl.grantee = 0 then 'PUBLIC'
                  else pg_catalog.pg_get_userbyid(acl.grantee)::text end
             order by acl.grantee
           )
           from pg_catalog.aclexplode(
             coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
           ) acl
           where acl.privilege_type = 'EXECUTE'
             and (acl.grantee = 0 or acl.grantee <> p.proowner)
         )
    into v_owner, v_security_definer, v_configuration,
         v_unexpected_execute_grantees
  from pg_catalog.pg_proc p
  where p.oid = v_function_oid;

  if v_owner <> 'postgres'
     or not v_security_definer
     or v_configuration is null
     or v_configuration not in ('search_path=', 'search_path=""') then
    raise exception 'Workout active-session postcondition failed: start RPC security metadata changed';
  end if;

  if pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE')
     or v_unexpected_execute_grantees is not null then
    raise exception 'Workout active-session postcondition failed: start RPC is not DORMANT';
  end if;
end
$postconditions$;

commit;
