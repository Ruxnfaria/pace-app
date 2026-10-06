-- PRAXE durable workout persistence.
-- Additive only: legacy workouts/workout_logs and Energy/streak functions are
-- dependencies, not migration targets. No data is backfilled.

begin;

set local lock_timeout = '5s';

do $preflight$
declare
  v_workouts_pk_count integer;
  v_workouts_user_fk_count integer;
  v_workout_logs_pk_count integer;
  v_log_workout_fk_count integer;
  v_log_triplet_unique_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'Workout persistence migration must run as postgres, got %', current_user;
  end if;

  if pg_catalog.to_regclass('public.workouts') is null
     or pg_catalog.to_regclass('public.workout_logs') is null then
    raise exception 'Required legacy workout relations are missing';
  end if;

  if pg_catalog.to_regprocedure('public.reward_system_set_updated_at()') is null then
    raise exception 'Required public.reward_system_set_updated_at() is missing';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('workouts', 'workout_logs')
      and (c.relkind <> 'r' or not c.relrowsecurity or c.relforcerowsecurity
           or pg_catalog.pg_get_userbyid(c.relowner) in ('anon', 'authenticated', 'service_role'))
  ) or (select count(*) from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('workouts', 'workout_logs')) <> 2 then
    raise exception 'Legacy workout relation owner/RLS contract drifted';
  end if;

  if exists (
    select 1
    from (values
      ('workout_sessions'),
      ('workout_session_exercises'),
      ('workout_session_legacy_log'),
      ('workout_weekly_schedule'),
      ('workout_schedule_occurrences'),
      ('workout_schedule_occurrence_exercises')
    ) as proposed(table_name)
    where pg_catalog.to_regclass('public.' || proposed.table_name) is not null
  ) then
    raise exception 'A proposed workout persistence table already exists';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'workout_persistence_parse_exercises',
        'workout_persistence_materialize_for_user',
        'workout_persistence_guard_session_update',
        'workout_persistence_guard_exercise_update',
        'workout_persistence_guard_occurrence_update',
        'workout_persistence_reject_update',
        'materialize_my_workout_schedule',
        'get_pending_workout_occurrence',
        'start_workout_session',
        'set_workout_session_exercise_completion',
        'update_workout_session_note',
        'abandon_workout_session',
        'skip_workout_schedule_occurrence',
        'update_workout_weekly_schedule',
        'restore_original_workout_schedule',
        'replace_user_workout_plan',
        'complete_workout_session'
      )
  ) then
    raise exception 'A proposed workout persistence function name already exists';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workouts'
      and column_name = 'id' and data_type = 'uuid' and is_nullable = 'NO'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workouts'
      and column_name = 'user_id' and data_type = 'uuid' and is_nullable = 'NO'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workouts'
      and column_name = 'title' and data_type = 'text' and is_nullable = 'NO'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workouts'
      and column_name = 'exercises' and data_type = 'text' and is_nullable = 'NO'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workouts'
      and column_name = 'created_at'
      and data_type = 'timestamp with time zone' and is_nullable = 'NO'
  ) then
    raise exception 'public.workouts drifted from the approved contract';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workout_logs'
      and column_name = 'id' and data_type = 'bigint'
      and is_nullable = 'NO' and is_identity = 'YES'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workout_logs'
      and column_name = 'user_id' and data_type = 'uuid' and is_nullable = 'YES'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workout_logs'
      and column_name = 'workout_id' and data_type = 'uuid' and is_nullable = 'YES'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workout_logs'
      and column_name = 'workout_date' and data_type = 'date' and is_nullable = 'YES'
  ) then
    raise exception 'public.workout_logs drifted from the approved contract';
  end if;

  select count(*) into v_workouts_pk_count
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.workouts'::regclass and c.contype = 'p'
    and (select pg_catalog.array_agg(a.attname::text order by k.ordinality)
         from pg_catalog.unnest(c.conkey) with ordinality k(attnum, ordinality)
         join pg_catalog.pg_attribute a
           on a.attrelid = c.conrelid and a.attnum = k.attnum)
        = array['id']::text[];
  if v_workouts_pk_count <> 1 then
    raise exception 'public.workouts.id is not the approved primary key';
  end if;

  select count(*) into v_workouts_user_fk_count
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.workouts'::regclass and c.contype = 'f'
    and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'c'
    and (select pg_catalog.array_agg(a.attname::text order by k.ordinality)
         from pg_catalog.unnest(c.conkey) with ordinality k(attnum, ordinality)
         join pg_catalog.pg_attribute a
           on a.attrelid = c.conrelid and a.attnum = k.attnum)
        = array['user_id']::text[];
  if v_workouts_user_fk_count <> 1 then
    raise exception 'public.workouts.user_id FK drifted from auth.users ON DELETE CASCADE';
  end if;

  select count(*) into v_workout_logs_pk_count
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.workout_logs'::regclass and c.contype = 'p'
    and (select pg_catalog.array_agg(a.attname::text order by k.ordinality)
         from pg_catalog.unnest(c.conkey) with ordinality k(attnum, ordinality)
         join pg_catalog.pg_attribute a
           on a.attrelid = c.conrelid and a.attnum = k.attnum)
        = array['id']::text[];
  if v_workout_logs_pk_count <> 1 then
    raise exception 'public.workout_logs.id is not the approved primary key';
  end if;

  select count(*) into v_log_workout_fk_count
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.workout_logs'::regclass and c.contype = 'f'
    and exists (
      select 1
      from pg_catalog.unnest(c.conkey) k(attnum)
      join pg_catalog.pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = k.attnum
      where a.attname = 'workout_id'
    );
  if v_log_workout_fk_count <> 0 then
    raise exception 'public.workout_logs.workout_id unexpectedly has a foreign key';
  end if;

  select count(*) into v_log_triplet_unique_count
  from pg_catalog.pg_index i
  where i.indrelid = 'public.workout_logs'::regclass and i.indisunique
    and (select pg_catalog.array_agg(a.attname::text order by k.ordinality)
         from pg_catalog.unnest(i.indkey) with ordinality k(attnum, ordinality)
         join pg_catalog.pg_attribute a
           on a.attrelid = i.indrelid and a.attnum = k.attnum
         where k.attnum > 0)
        @> array['user_id', 'workout_date']::text[];
  if v_log_triplet_unique_count <> 0 then
    raise exception 'public.workout_logs gained an incompatible completion uniqueness constraint';
  end if;

  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.complete_mission_with_energy(uuid)'::regprocedure
     )) <> '4a1deeecb318df2dd76a30a1cd4acb74'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.record_user_streak_activity(uuid)'::regprocedure
     )) <> '66a1d1b6ad6cdfd150ef06026410320c' then
    raise exception 'Energy/streak dependency fingerprints drifted from approved Production evidence';
  end if;
end
$preflight$;

create table public.workout_sessions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete set null,
  schedule_occurrence_id uuid,
  workout_title varchar(160) not null check (btrim(workout_title) <> ''),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned')),
  scheduled_for_date date,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  note text check (note is null or char_length(note) <= 2000),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_sessions_user_request_unique unique (user_id, client_request_id),
  constraint workout_sessions_occurrence_date_pair_check check (
    (schedule_occurrence_id is null and scheduled_for_date is null)
    or (schedule_occurrence_id is not null and scheduled_for_date is not null)
  ),
  constraint workout_sessions_completion_check check (
    (status = 'completed' and completed_at is not null and completed_at >= started_at)
    or (status in ('in_progress', 'abandoned') and completed_at is null)
  )
);

create table public.workout_session_exercises (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_key varchar(160),
  name varchar(160) not null check (btrim(name) <> ''),
  exercise_position smallint not null check (exercise_position between 0 and 39),
  sets varchar(40) not null check (btrim(sets) <> ''),
  reps varchar(80) not null check (btrim(reps) <> ''),
  rest varchar(80),
  tip_snapshot varchar(500),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint workout_session_exercises_exercise_position_unique
    unique (session_id, exercise_position),
  constraint workout_session_exercises_key_not_blank
    check (exercise_key is null or btrim(exercise_key) <> ''),
  constraint workout_session_exercises_completion_time_check
    check (completed_at is null or completed_at >= created_at)
);

create table public.workout_session_legacy_log (
  session_id uuid primary key references public.workout_sessions(id) on delete cascade,
  workout_log_id bigint not null unique
    references public.workout_logs(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.workout_weekly_schedule (
  user_id uuid not null references auth.users(id) on delete cascade,
  iso_weekday smallint not null check (iso_weekday between 1 and 7),
  original_workout_id uuid references public.workouts(id) on delete restrict,
  workout_id uuid references public.workouts(id) on delete restrict,
  effective_from_date date not null,
  materialized_through_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_weekly_schedule_pk primary key (user_id, iso_weekday),
  constraint workout_weekly_schedule_cursor_check
    check (materialized_through_date >= effective_from_date - 1)
);

create table public.workout_schedule_occurrences (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_for_date date not null,
  source_workout_id uuid references public.workouts(id) on delete set null,
  workout_title_snapshot varchar(160) not null
    check (btrim(workout_title_snapshot) <> ''),
  skipped_at timestamptz,
  skip_reason varchar(240),
  created_at timestamptz not null default now(),
  constraint workout_schedule_occurrences_user_date_unique
    unique (user_id, scheduled_for_date),
  constraint workout_schedule_occurrences_skip_check check (
    (skipped_at is null and skip_reason is null)
    or (skipped_at is not null and skip_reason is not null and btrim(skip_reason) <> '')
  )
);

create table public.workout_schedule_occurrence_exercises (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  occurrence_id uuid not null
    references public.workout_schedule_occurrences(id) on delete cascade,
  exercise_key varchar(160),
  name varchar(160) not null check (btrim(name) <> ''),
  exercise_position smallint not null check (exercise_position between 0 and 39),
  sets varchar(40) not null check (btrim(sets) <> ''),
  reps varchar(80) not null check (btrim(reps) <> ''),
  rest varchar(80),
  tip_snapshot varchar(500),
  created_at timestamptz not null default now(),
  constraint workout_occurrence_exercises_exercise_position_unique
    unique (occurrence_id, exercise_position),
  constraint workout_occurrence_exercises_key_not_blank
    check (exercise_key is null or btrim(exercise_key) <> '')
);

alter table public.workout_sessions
  add constraint workout_sessions_occurrence_fk
  foreign key (schedule_occurrence_id)
  references public.workout_schedule_occurrences(id) on delete restrict;

create index workout_sessions_user_status_started_idx
  on public.workout_sessions (user_id, status, started_at desc);
create index workout_sessions_user_workout_completed_idx
  on public.workout_sessions (user_id, workout_id, completed_at desc)
  where status = 'completed';
create unique index workout_sessions_completed_occurrence_unique
  on public.workout_sessions (schedule_occurrence_id)
  where schedule_occurrence_id is not null and status = 'completed';
create unique index workout_sessions_live_occurrence_unique
  on public.workout_sessions (schedule_occurrence_id)
  where schedule_occurrence_id is not null and status in ('in_progress', 'completed');
create index workout_schedule_occurrences_pending_idx
  on public.workout_schedule_occurrences (user_id, scheduled_for_date, id)
  where skipped_at is null;
create index workout_weekly_schedule_current_workout_idx
  on public.workout_weekly_schedule (workout_id) where workout_id is not null;
create index workout_weekly_schedule_original_workout_idx
  on public.workout_weekly_schedule (original_workout_id)
  where original_workout_id is not null;

create function public.workout_persistence_parse_exercises(p_exercises text)
returns table (
  exercise_position smallint,
  exercise_key text,
  name text,
  sets text,
  reps text,
  rest text,
  tip_snapshot text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payload jsonb;
  v_item jsonb;
  v_ordinality bigint;
  v_candidate_key text;
begin
  if p_exercises is null then
    raise exception using errcode = '22023', message = 'Exercises payload is required';
  end if;

  begin
    v_payload := p_exercises::jsonb;
  exception when others then
    raise exception using errcode = '22023', message = 'Exercises must be valid JSON';
  end;

  if pg_catalog.jsonb_typeof(v_payload) <> 'array'
     or pg_catalog.jsonb_array_length(v_payload) not between 1 and 40 then
    raise exception using errcode = '22023',
      message = 'Exercises must be a JSON array containing 1 to 40 items';
  end if;

  for v_item, v_ordinality in
    select item.value, item.ordinality
    from pg_catalog.jsonb_array_elements(v_payload) with ordinality as item(value, ordinality)
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'Every exercise must be an object';
    end if;
    if pg_catalog.jsonb_typeof(v_item -> 'name') <> 'string'
       or pg_catalog.jsonb_typeof(v_item -> 'sets') <> 'string'
       or pg_catalog.jsonb_typeof(v_item -> 'reps') <> 'string' then
      raise exception using errcode = '22023',
        message = 'Exercise name, sets and reps must be strings';
    end if;

    name := pg_catalog.btrim(v_item ->> 'name');
    sets := pg_catalog.btrim(v_item ->> 'sets');
    reps := pg_catalog.btrim(v_item ->> 'reps');
    if name = '' or pg_catalog.char_length(name) > 160
       or sets = '' or pg_catalog.char_length(sets) > 40
       or reps = '' or pg_catalog.char_length(reps) > 80 then
      raise exception using errcode = '22023', message = 'Exercise required fields are blank or oversized';
    end if;

    if v_item ? 'rest' and pg_catalog.jsonb_typeof(v_item -> 'rest') not in ('string', 'null') then
      raise exception using errcode = '22023', message = 'Exercise rest must be a string or null';
    end if;
    if v_item ? 'tip' and pg_catalog.jsonb_typeof(v_item -> 'tip') not in ('string', 'null') then
      raise exception using errcode = '22023', message = 'Exercise tip must be a string or null';
    end if;
    rest := nullif(pg_catalog.btrim(v_item ->> 'rest'), '');
    tip_snapshot := nullif(pg_catalog.btrim(v_item ->> 'tip'), '');
    if pg_catalog.char_length(rest) > 80 or pg_catalog.char_length(tip_snapshot) > 500 then
      raise exception using errcode = '22023', message = 'Exercise optional fields are oversized';
    end if;

    v_candidate_key := null;
    if pg_catalog.jsonb_typeof(v_item -> 'exercise_id') = 'string' then
      v_candidate_key := nullif(pg_catalog.btrim(v_item ->> 'exercise_id'), '');
    end if;
    if (v_candidate_key is null or pg_catalog.char_length(v_candidate_key) > 160)
       and pg_catalog.jsonb_typeof(v_item -> 'id') = 'string' then
      v_candidate_key := nullif(pg_catalog.btrim(v_item ->> 'id'), '');
    end if;
    if v_candidate_key is null or pg_catalog.char_length(v_candidate_key) > 160 then
      v_candidate_key := 'derived:' || pg_catalog.md5(
        pg_catalog.lower(pg_catalog.regexp_replace(name, '\s+', ' ', 'g'))
        || ':' || (v_ordinality - 1)::text
      );
    end if;

    exercise_position := (v_ordinality - 1)::smallint;
    exercise_key := v_candidate_key;
    return next;
  end loop;
end
$function$;

create function public.workout_persistence_materialize_for_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  v_schedule_count integer;
  v_created integer := 0;
  v_row record;
  v_date date;
  v_workout_title text;
  v_workout_exercises text;
  v_occurrence_id uuid;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'User id is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('praxe:workout:' || p_user_id::text, 0)
  );

  select count(*) into v_schedule_count
  from public.workout_weekly_schedule s
  where s.user_id = p_user_id;
  if v_schedule_count = 0 then
    return 0;
  elsif v_schedule_count <> 7 then
    raise exception 'Workout schedule drift: expected seven rows, found %', v_schedule_count;
  end if;

  for v_row in
    select s.*
    from public.workout_weekly_schedule s
    where s.user_id = p_user_id
    order by s.iso_weekday
    for update
  loop
    v_date := greatest(
      v_row.materialized_through_date + 1,
      v_row.effective_from_date
    );
    while v_date <= v_today loop
      if extract(isodow from v_date)::smallint = v_row.iso_weekday
         and v_row.workout_id is not null then
        select w.title, w.exercises
          into v_workout_title, v_workout_exercises
        from public.workouts w
        where w.id = v_row.workout_id and w.user_id = p_user_id
        for share;
        if not found then
          raise exception 'Scheduled workout % is missing or not owned', v_row.workout_id;
        end if;
        v_workout_title := pg_catalog.btrim(v_workout_title);
        if v_workout_title = '' or pg_catalog.char_length(v_workout_title) > 160 then
          raise exception 'Scheduled workout title is blank or oversized';
        end if;

        insert into public.workout_schedule_occurrences (
          user_id, scheduled_for_date, source_workout_id, workout_title_snapshot
        ) values (
          p_user_id, v_date, v_row.workout_id, v_workout_title
        ) returning id into v_occurrence_id;

        insert into public.workout_schedule_occurrence_exercises (
          occurrence_id, exercise_key, name, exercise_position, sets, reps, rest, tip_snapshot
        )
        select v_occurrence_id, parsed.exercise_key, parsed.name, parsed.exercise_position,
               parsed.sets, parsed.reps, parsed.rest, parsed.tip_snapshot
        from public.workout_persistence_parse_exercises(v_workout_exercises) parsed;
        v_created := v_created + 1;
      end if;
      v_date := v_date + 1;
    end loop;

    update public.workout_weekly_schedule s
    set materialized_through_date = v_today
    where s.user_id = p_user_id and s.iso_weekday = v_row.iso_weekday;
  end loop;

  return v_created;
end
$function$;

create function public.workout_persistence_guard_session_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.schedule_occurrence_id is distinct from old.schedule_occurrence_id
     or new.workout_title is distinct from old.workout_title
     or new.scheduled_for_date is distinct from old.scheduled_for_date
     or new.started_at is distinct from old.started_at
     or new.client_request_id is distinct from old.client_request_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Workout session identity and snapshots are immutable';
  end if;
  if new.workout_id is distinct from old.workout_id
     and not (old.workout_id is not null and new.workout_id is null) then
    raise exception 'Workout source may only be cleared by ON DELETE SET NULL';
  end if;
  if new.status is distinct from old.status
     and not (old.status = 'in_progress' and new.status in ('completed', 'abandoned')) then
    raise exception 'Invalid workout session lifecycle transition';
  end if;
  if new.completed_at is distinct from old.completed_at
     and not (old.status = 'in_progress' and new.status = 'completed'
              and old.completed_at is null and new.completed_at is not null) then
    raise exception 'Workout completion timestamp is immutable';
  end if;
  if old.status = 'completed'
     and (new.status is distinct from old.status or new.completed_at is distinct from old.completed_at) then
    raise exception 'Completed workout sessions are immutable except for note';
  end if;
  return new;
end
$function$;

create function public.workout_persistence_guard_exercise_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
begin
  if new.id is distinct from old.id
     or new.session_id is distinct from old.session_id
     or new.exercise_key is distinct from old.exercise_key
     or new.name is distinct from old.name
     or new.exercise_position is distinct from old.exercise_position
     or new.sets is distinct from old.sets
     or new.reps is distinct from old.reps
     or new.rest is distinct from old.rest
     or new.tip_snapshot is distinct from old.tip_snapshot
     or new.created_at is distinct from old.created_at then
    raise exception 'Workout exercise snapshots are immutable';
  end if;
  select s.status into v_status
  from public.workout_sessions s where s.id = old.session_id;
  if v_status <> 'in_progress' then
    raise exception 'Exercise completion may change only while session is in progress';
  end if;
  return new;
end
$function$;

create function public.workout_persistence_guard_occurrence_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.scheduled_for_date is distinct from old.scheduled_for_date
     or new.workout_title_snapshot is distinct from old.workout_title_snapshot
     or new.created_at is distinct from old.created_at then
    raise exception 'Workout occurrence facts are immutable';
  end if;
  if new.source_workout_id is distinct from old.source_workout_id
     and not (old.source_workout_id is not null and new.source_workout_id is null) then
    raise exception 'Occurrence source may only be cleared by ON DELETE SET NULL';
  end if;
  if old.skipped_at is not null
     and (new.skipped_at is distinct from old.skipped_at
          or new.skip_reason is distinct from old.skip_reason) then
    raise exception 'Skipped occurrence decision is immutable';
  end if;
  if old.skipped_at is null
     and ((new.skipped_at is null) <> (new.skip_reason is null)) then
    raise exception 'Skip timestamp and reason must be set together';
  end if;
  return new;
end
$function$;

create function public.workout_persistence_reject_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'This workout persistence row is immutable';
end
$function$;

create trigger workout_sessions_guard_update
before update on public.workout_sessions
for each row execute function public.workout_persistence_guard_session_update();
create trigger workout_sessions_set_updated_at
before update on public.workout_sessions
for each row execute function public.reward_system_set_updated_at();
create trigger workout_session_exercises_guard_update
before update on public.workout_session_exercises
for each row execute function public.workout_persistence_guard_exercise_update();
create trigger workout_session_legacy_log_reject_update
before update on public.workout_session_legacy_log
for each row execute function public.workout_persistence_reject_update();
create trigger workout_weekly_schedule_set_updated_at
before update on public.workout_weekly_schedule
for each row execute function public.reward_system_set_updated_at();
create trigger workout_occurrences_guard_update
before update on public.workout_schedule_occurrences
for each row execute function public.workout_persistence_guard_occurrence_update();
create trigger workout_occurrence_exercises_reject_update
before update on public.workout_schedule_occurrence_exercises
for each row execute function public.workout_persistence_reject_update();

create function public.materialize_my_workout_schedule()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  return public.workout_persistence_materialize_for_user(v_user_id);
end
$function$;

create function public.get_pending_workout_occurrence()
returns table (
  occurrence_id uuid,
  scheduled_for_date date,
  source_workout_id uuid,
  workout_title text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_today date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  return query
  select o.id, o.scheduled_for_date, o.source_workout_id,
         o.workout_title_snapshot::text
  from public.workout_schedule_occurrences o
  where o.user_id = v_user_id
    and o.scheduled_for_date <= v_today
    and o.skipped_at is null
    and not exists (
      select 1 from public.workout_sessions s
      where s.schedule_occurrence_id = o.id
        and s.status in ('in_progress', 'completed')
    )
  order by o.scheduled_for_date, o.id
  limit 1;
end
$function$;

create function public.start_workout_session(
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
    select count(*) into v_child_count
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

create function public.set_workout_session_exercise_completion(
  p_session_id uuid,
  p_exercise_id uuid,
  p_completed boolean
)
returns table (exercise_id uuid, completed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_status text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_session_id is null or p_exercise_id is null or p_completed is null then
    raise exception using errcode = '22023', message = 'Session, exercise and completed are required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('praxe:workout:' || v_user_id::text, 0)
  );
  select s.status into v_status
  from public.workout_sessions s
  where s.id = p_session_id and s.user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Owned session not found';
  end if;
  if v_status <> 'in_progress' then
    raise exception using errcode = '22023', message = 'Session is not in progress';
  end if;
  perform 1 from public.workout_session_exercises e
  where e.id = p_exercise_id and e.session_id = p_session_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Owned session exercise not found';
  end if;
  update public.workout_session_exercises e
  set completed_at = case
    when p_completed then coalesce(e.completed_at, pg_catalog.now())
    else null
  end
  where e.id = p_exercise_id
  returning e.id, e.completed_at into exercise_id, completed_at;
  return next;
end
$function$;

create function public.update_workout_session_note(p_session_id uuid, p_note text)
returns table (session_id uuid, note text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_note text := nullif(pg_catalog.btrim(p_note), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if pg_catalog.char_length(v_note) > 2000 then
    raise exception using errcode = '22023', message = 'Note exceeds 2000 characters';
  end if;
  update public.workout_sessions s
  set note = v_note
  where s.id = p_session_id and s.user_id = v_user_id
    and s.status in ('in_progress', 'completed')
  returning s.id, s.note, s.updated_at into session_id, note, updated_at;
  if not found then
    raise exception using errcode = '42501',
      message = 'Owned editable session not found';
  end if;
  return next;
end
$function$;

create function public.abandon_workout_session(p_session_id uuid)
returns table (session_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_status text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('praxe:workout:' || v_user_id::text, 0)
  );
  select s.status into v_status from public.workout_sessions s
  where s.id = p_session_id and s.user_id = v_user_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Owned session not found';
  end if;
  if v_status = 'abandoned' then
    session_id := p_session_id;
    status := v_status;
    return next;
    return;
  elsif v_status <> 'in_progress' then
    raise exception using errcode = '22023', message = 'Only an in-progress session can be abandoned';
  end if;
  update public.workout_sessions s set status = 'abandoned'
  where s.id = p_session_id returning s.id, s.status into session_id, status;
  return next;
end
$function$;

create function public.skip_workout_schedule_occurrence(
  p_occurrence_id uuid,
  p_reason text
)
returns table (occurrence_id uuid, skipped_at timestamptz, skip_reason text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_today date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  v_reason text := pg_catalog.btrim(p_reason);
  v_occurrence public.workout_schedule_occurrences%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if v_reason is null or v_reason = '' or pg_catalog.char_length(v_reason) > 240 then
    raise exception using errcode = '22023', message = 'Skip reason must contain 1 to 240 characters';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('praxe:workout:' || v_user_id::text, 0)
  );
  select o.* into v_occurrence
  from public.workout_schedule_occurrences o
  where o.id = p_occurrence_id and o.user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Owned occurrence not found';
  end if;
  if v_occurrence.skipped_at is not null then
    return query select v_occurrence.id, v_occurrence.skipped_at,
      v_occurrence.skip_reason::text;
    return;
  end if;
  if v_occurrence.scheduled_for_date > v_today then
    raise exception using errcode = '22023', message = 'Future occurrence cannot be skipped';
  end if;
  if exists (
    select 1 from public.workout_sessions s
    where s.schedule_occurrence_id = p_occurrence_id
      and s.status in ('in_progress', 'completed')
  ) then
    raise exception using errcode = '22023', message = 'Reserved or completed occurrence cannot be skipped';
  end if;
  update public.workout_schedule_occurrences o
  set skipped_at = pg_catalog.now(), skip_reason = v_reason
  where o.id = p_occurrence_id
  returning o.id, o.skipped_at, o.skip_reason::text
  into occurrence_id, skipped_at, skip_reason;
  return next;
end
$function$;

create function public.update_workout_weekly_schedule(p_assignments jsonb)
returns table (effective_from_date date, updated_rows integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_today date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  v_item jsonb;
  v_weekday smallint;
  v_workout_id uuid;
  v_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if pg_catalog.jsonb_typeof(p_assignments) <> 'array'
     or pg_catalog.jsonb_array_length(p_assignments) <> 7 then
    raise exception using errcode = '22023', message = 'Assignments must contain exactly seven rows';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_assignments) a(item)
    where pg_catalog.jsonb_typeof(a.item) <> 'object'
       or exists (
         select 1 from pg_catalog.jsonb_object_keys(a.item) k(key)
         where k.key not in ('iso_weekday', 'workout_id')
       )
       or pg_catalog.jsonb_typeof(a.item -> 'iso_weekday') <> 'number'
       or (a.item ? 'workout_id'
           and pg_catalog.jsonb_typeof(a.item -> 'workout_id') not in ('string', 'null'))
  ) then
    raise exception using errcode = '22023', message = 'Assignment shape is invalid';
  end if;
  begin
    if (select count(distinct (a.item ->> 'iso_weekday')::smallint)
        from pg_catalog.jsonb_array_elements(p_assignments) a(item)) <> 7
       or exists (
         select 1 from pg_catalog.jsonb_array_elements(p_assignments) a(item)
         where (a.item ->> 'iso_weekday')::smallint not between 1 and 7
       ) then
      raise exception using errcode = '22023', message = 'ISO weekdays must be exactly 1 through 7';
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'ISO weekday is invalid';
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('praxe:workout:' || v_user_id::text, 0)
  );
  select count(*) into v_count
  from public.workout_weekly_schedule s where s.user_id = v_user_id;
  if v_count <> 7 then
    raise exception 'Owned schedule must contain exactly seven rows';
  end if;
  perform 1 from public.workout_weekly_schedule s
  where s.user_id = v_user_id order by s.iso_weekday for update;

  for v_item in select a.item from pg_catalog.jsonb_array_elements(p_assignments) a(item)
  loop
    v_weekday := (v_item ->> 'iso_weekday')::smallint;
    begin
      v_workout_id := case
        when pg_catalog.jsonb_typeof(v_item -> 'workout_id') = 'string'
          then (v_item ->> 'workout_id')::uuid
        else null
      end;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'workout_id is not a UUID';
    end;
    if v_workout_id is not null and not exists (
      select 1 from public.workouts w where w.id = v_workout_id and w.user_id = v_user_id
    ) then
      raise exception using errcode = '42501', message = 'Schedule workout is not owned';
    end if;
  end loop;

  perform public.workout_persistence_materialize_for_user(v_user_id);
  for v_item in select a.item from pg_catalog.jsonb_array_elements(p_assignments) a(item)
  loop
    v_weekday := (v_item ->> 'iso_weekday')::smallint;
    v_workout_id := case
      when pg_catalog.jsonb_typeof(v_item -> 'workout_id') = 'string'
        then (v_item ->> 'workout_id')::uuid
      else null
    end;
    update public.workout_weekly_schedule s
    set workout_id = v_workout_id,
        effective_from_date = v_today + 1,
        materialized_through_date = v_today
    where s.user_id = v_user_id and s.iso_weekday = v_weekday;
  end loop;

  effective_from_date := v_today + 1;
  updated_rows := 7;
  return next;
end
$function$;

create function public.restore_original_workout_schedule()
returns table (effective_from_date date, updated_rows integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_today date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  v_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('praxe:workout:' || v_user_id::text, 0)
  );
  select count(*) into v_count
  from public.workout_weekly_schedule s where s.user_id = v_user_id;
  if v_count <> 7 then
    raise exception 'Owned schedule must contain exactly seven rows';
  end if;
  perform 1 from public.workout_weekly_schedule s
  where s.user_id = v_user_id order by s.iso_weekday for update;
  perform public.workout_persistence_materialize_for_user(v_user_id);
  update public.workout_weekly_schedule s
  set workout_id = s.original_workout_id,
      effective_from_date = v_today + 1,
      materialized_through_date = v_today
  where s.user_id = v_user_id;
  effective_from_date := v_today + 1;
  updated_rows := 7;
  return next;
end
$function$;

create function public.replace_user_workout_plan(p_plan jsonb)
returns table (workouts_created integer, schedule_effective_from date)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_today date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  v_had_schedule boolean;
  v_schedule_count integer;
  v_workout_count integer;
  v_item jsonb;
  v_client_key text;
  v_title text;
  v_exercises jsonb;
  v_workout_id uuid;
  v_workout_ids jsonb := '{}'::jsonb;
  v_weekday smallint;
  v_workout_key text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_plan is null or pg_catalog.jsonb_typeof(p_plan) <> 'object'
     or pg_catalog.octet_length(p_plan::text) > 262144
     or not (p_plan ? 'workouts' and p_plan ? 'schedule')
     or exists (
       select 1 from pg_catalog.jsonb_object_keys(p_plan) k(key)
       where k.key not in ('workouts', 'schedule')
     ) then
    raise exception using errcode = '22023', message = 'Plan object shape or size is invalid';
  end if;
  if pg_catalog.jsonb_typeof(p_plan -> 'workouts') <> 'array'
     or pg_catalog.jsonb_array_length(p_plan -> 'workouts') not between 1 and 14 then
    raise exception using errcode = '22023', message = 'Plan must contain 1 to 14 workouts';
  end if;
  if pg_catalog.jsonb_typeof(p_plan -> 'schedule') <> 'array'
     or pg_catalog.jsonb_array_length(p_plan -> 'schedule') <> 7 then
    raise exception using errcode = '22023', message = 'Plan schedule must contain exactly seven rows';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_plan -> 'workouts') w(item)
    where pg_catalog.jsonb_typeof(w.item) <> 'object'
       or exists (
         select 1 from pg_catalog.jsonb_object_keys(w.item) k(key)
         where k.key not in ('client_key', 'title', 'exercises')
       )
       or pg_catalog.jsonb_typeof(w.item -> 'client_key') <> 'string'
       or pg_catalog.jsonb_typeof(w.item -> 'title') <> 'string'
       or pg_catalog.jsonb_typeof(w.item -> 'exercises') <> 'array'
  ) then
    raise exception using errcode = '22023', message = 'Workout payload shape is invalid';
  end if;
  if (select count(distinct pg_catalog.btrim(w.item ->> 'client_key'))
      from pg_catalog.jsonb_array_elements(p_plan -> 'workouts') w(item))
     <> pg_catalog.jsonb_array_length(p_plan -> 'workouts') then
    raise exception using errcode = '22023', message = 'Workout client keys must be unique';
  end if;
  for v_item in select w.item from pg_catalog.jsonb_array_elements(p_plan -> 'workouts') w(item)
  loop
    v_client_key := pg_catalog.btrim(v_item ->> 'client_key');
    v_title := pg_catalog.btrim(v_item ->> 'title');
    v_exercises := v_item -> 'exercises';
    if v_client_key = '' or pg_catalog.char_length(v_client_key) > 80
       or v_title = '' or pg_catalog.char_length(v_title) > 160 then
      raise exception using errcode = '22023', message = 'Workout client key or title is blank or oversized';
    end if;
    perform 1 from public.workout_persistence_parse_exercises(v_exercises::text);
  end loop;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_plan -> 'schedule') s(item)
    where pg_catalog.jsonb_typeof(s.item) <> 'object'
       or exists (
         select 1 from pg_catalog.jsonb_object_keys(s.item) k(key)
         where k.key not in ('iso_weekday', 'workout_key')
       )
       or pg_catalog.jsonb_typeof(s.item -> 'iso_weekday') <> 'number'
       or (s.item ? 'workout_key'
           and pg_catalog.jsonb_typeof(s.item -> 'workout_key') not in ('string', 'null'))
  ) then
    raise exception using errcode = '22023', message = 'Plan schedule row shape is invalid';
  end if;
  begin
    if (select count(distinct (s.item ->> 'iso_weekday')::smallint)
        from pg_catalog.jsonb_array_elements(p_plan -> 'schedule') s(item)) <> 7
       or exists (
         select 1 from pg_catalog.jsonb_array_elements(p_plan -> 'schedule') s(item)
         where (s.item ->> 'iso_weekday')::smallint not between 1 and 7
       ) then
      raise exception using errcode = '22023', message = 'Plan weekdays must be exactly 1 through 7';
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'Plan weekday is invalid';
  end;
  for v_item in select s.item from pg_catalog.jsonb_array_elements(p_plan -> 'schedule') s(item)
  loop
    if pg_catalog.jsonb_typeof(v_item -> 'workout_key') = 'string'
       and pg_catalog.btrim(v_item ->> 'workout_key') = '' then
      raise exception using errcode = '22023',
        message = 'Schedule workout_key must be nonblank or null';
    end if;
    v_workout_key := case
      when pg_catalog.jsonb_typeof(v_item -> 'workout_key') = 'string'
        then nullif(pg_catalog.btrim(v_item ->> 'workout_key'), '')
      else null
    end;
    if v_workout_key is not null and not exists (
      select 1 from pg_catalog.jsonb_array_elements(p_plan -> 'workouts') w(item)
      where pg_catalog.btrim(w.item ->> 'client_key') = v_workout_key
    ) then
      raise exception using errcode = '22023', message = 'Schedule references an unknown workout key';
    end if;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('praxe:workout:' || v_user_id::text, 0)
  );
  select count(*) into v_schedule_count
  from public.workout_weekly_schedule s where s.user_id = v_user_id;
  if v_schedule_count not in (0, 7) then
    raise exception 'Owned schedule drift: expected zero or seven rows';
  end if;
  v_had_schedule := v_schedule_count = 7;
  if v_had_schedule then
    perform 1 from public.workout_weekly_schedule s
    where s.user_id = v_user_id order by s.iso_weekday for update;
    perform public.workout_persistence_materialize_for_user(v_user_id);
  end if;

  delete from public.workout_weekly_schedule s where s.user_id = v_user_id;
  delete from public.workouts w where w.user_id = v_user_id;

  v_workout_count := 0;
  for v_item in select w.item from pg_catalog.jsonb_array_elements(p_plan -> 'workouts') w(item)
  loop
    v_client_key := pg_catalog.btrim(v_item ->> 'client_key');
    v_workout_id := pg_catalog.gen_random_uuid();
    insert into public.workouts (id, user_id, title, exercises, created_at)
    values (
      v_workout_id, v_user_id, pg_catalog.btrim(v_item ->> 'title'),
      (v_item -> 'exercises')::text, pg_catalog.now()
    );
    v_workout_ids := v_workout_ids || pg_catalog.jsonb_build_object(v_client_key, v_workout_id::text);
    v_workout_count := v_workout_count + 1;
  end loop;

  for v_item in select s.item from pg_catalog.jsonb_array_elements(p_plan -> 'schedule') s(item)
  loop
    v_weekday := (v_item ->> 'iso_weekday')::smallint;
    v_workout_key := case
      when pg_catalog.jsonb_typeof(v_item -> 'workout_key') = 'string'
        then nullif(pg_catalog.btrim(v_item ->> 'workout_key'), '')
      else null
    end;
    v_workout_id := case when v_workout_key is null then null
                         else (v_workout_ids ->> v_workout_key)::uuid end;
    insert into public.workout_weekly_schedule (
      user_id, iso_weekday, original_workout_id, workout_id,
      effective_from_date, materialized_through_date
    ) values (
      v_user_id, v_weekday, v_workout_id, v_workout_id,
      case when v_had_schedule then v_today + 1 else v_today end,
      case when v_had_schedule then v_today else v_today - 1 end
    );
  end loop;

  workouts_created := v_workout_count;
  schedule_effective_from := case when v_had_schedule then v_today + 1 else v_today end;
  return next;
end
$function$;

create function public.complete_workout_session(p_session_id uuid)
returns table (
  session_id uuid,
  status text,
  completed_at timestamptz,
  completion_date date,
  workout_log_id bigint,
  energy_awarded integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.workout_sessions%rowtype;
  v_log_id bigint;
  v_date date;
  v_count integer;
  v_incomplete integer;
  v_log_workout_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('praxe:workout:' || v_user_id::text, 0)
  );
  select s.* into v_session
  from public.workout_sessions s
  where s.id = p_session_id and s.user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Owned session not found';
  end if;

  if v_session.status = 'completed' then
    select b.workout_log_id into v_log_id
    from public.workout_session_legacy_log b
    where b.session_id = v_session.id;
    if not found then
      raise exception 'Completed session is missing its legacy log bridge';
    end if;
    session_id := v_session.id;
    status := v_session.status;
    completed_at := v_session.completed_at;
    completion_date := (v_session.completed_at at time zone 'America/Sao_Paulo')::date;
    workout_log_id := v_log_id;
    energy_awarded := 0;
    replayed := true;
    return next;
    return;
  elsif v_session.status <> 'in_progress' then
    raise exception using errcode = '22023', message = 'Session is not in progress';
  end if;

  perform 1 from public.workout_session_exercises e
  where e.session_id = v_session.id order by e.exercise_position for update;
  select count(*), count(*) filter (where e.completed_at is null)
    into v_count, v_incomplete
  from public.workout_session_exercises e where e.session_id = v_session.id;
  if v_count = 0 or v_incomplete <> 0 then
    raise exception using errcode = '22023', message = 'All session exercises must be complete';
  end if;

  v_session.completed_at := pg_catalog.now();
  v_date := (v_session.completed_at at time zone 'America/Sao_Paulo')::date;
  v_log_workout_id := null;
  if v_session.workout_id is not null then
    perform 1 from public.workouts w
    where w.id = v_session.workout_id and w.user_id = v_user_id
    for key share;
  end if;
  if found then
    v_log_workout_id := v_session.workout_id;
  end if;

  update public.workout_sessions s
  set status = 'completed', completed_at = v_session.completed_at
  where s.id = v_session.id;
  insert into public.workout_logs (user_id, workout_id, workout_date)
  values (v_user_id, v_log_workout_id, v_date)
  returning id into v_log_id;
  insert into public.workout_session_legacy_log (session_id, workout_log_id)
  values (v_session.id, v_log_id);

  session_id := v_session.id;
  status := 'completed';
  completed_at := v_session.completed_at;
  completion_date := v_date;
  workout_log_id := v_log_id;
  energy_awarded := 0;
  replayed := false;
  return next;
end
$function$;

alter table public.workout_sessions enable row level security;
alter table public.workout_session_exercises enable row level security;
alter table public.workout_session_legacy_log enable row level security;
alter table public.workout_weekly_schedule enable row level security;
alter table public.workout_schedule_occurrences enable row level security;
alter table public.workout_schedule_occurrence_exercises enable row level security;

create policy workout_sessions_select_own
  on public.workout_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy workout_session_exercises_select_own
  on public.workout_session_exercises for select to authenticated
  using (exists (
    select 1 from public.workout_sessions s
    where s.id = session_id and s.user_id = (select auth.uid())
  ));
create policy workout_session_legacy_log_select_own
  on public.workout_session_legacy_log for select to authenticated
  using (exists (
    select 1 from public.workout_sessions s
    where s.id = session_id and s.user_id = (select auth.uid())
  ));
create policy workout_weekly_schedule_select_own
  on public.workout_weekly_schedule for select to authenticated
  using ((select auth.uid()) = user_id);
create policy workout_schedule_occurrences_select_own
  on public.workout_schedule_occurrences for select to authenticated
  using ((select auth.uid()) = user_id);
create policy workout_schedule_occurrence_exercises_select_own
  on public.workout_schedule_occurrence_exercises for select to authenticated
  using (exists (
    select 1 from public.workout_schedule_occurrences o
    where o.id = occurrence_id and o.user_id = (select auth.uid())
  ));

revoke all on table public.workout_sessions from public, anon, authenticated, service_role;
revoke all on table public.workout_session_exercises from public, anon, authenticated, service_role;
revoke all on table public.workout_session_legacy_log from public, anon, authenticated, service_role;
revoke all on table public.workout_weekly_schedule from public, anon, authenticated, service_role;
revoke all on table public.workout_schedule_occurrences from public, anon, authenticated, service_role;
revoke all on table public.workout_schedule_occurrence_exercises from public, anon, authenticated, service_role;
grant select on table public.workout_sessions to authenticated;
grant select on table public.workout_session_exercises to authenticated;
grant select on table public.workout_session_legacy_log to authenticated;
grant select on table public.workout_weekly_schedule to authenticated;
grant select on table public.workout_schedule_occurrences to authenticated;
grant select on table public.workout_schedule_occurrence_exercises to authenticated;

alter function public.workout_persistence_parse_exercises(text) owner to postgres;
alter function public.workout_persistence_materialize_for_user(uuid) owner to postgres;
alter function public.workout_persistence_guard_session_update() owner to postgres;
alter function public.workout_persistence_guard_exercise_update() owner to postgres;
alter function public.workout_persistence_guard_occurrence_update() owner to postgres;
alter function public.workout_persistence_reject_update() owner to postgres;
alter function public.materialize_my_workout_schedule() owner to postgres;
alter function public.get_pending_workout_occurrence() owner to postgres;
alter function public.start_workout_session(uuid, uuid, uuid) owner to postgres;
alter function public.set_workout_session_exercise_completion(uuid, uuid, boolean) owner to postgres;
alter function public.update_workout_session_note(uuid, text) owner to postgres;
alter function public.abandon_workout_session(uuid) owner to postgres;
alter function public.skip_workout_schedule_occurrence(uuid, text) owner to postgres;
alter function public.update_workout_weekly_schedule(jsonb) owner to postgres;
alter function public.restore_original_workout_schedule() owner to postgres;
alter function public.replace_user_workout_plan(jsonb) owner to postgres;
alter function public.complete_workout_session(uuid) owner to postgres;

revoke all on function public.workout_persistence_parse_exercises(text)
  from public, anon, authenticated, service_role;
revoke all on function public.workout_persistence_materialize_for_user(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.workout_persistence_guard_session_update()
  from public, anon, authenticated, service_role;
revoke all on function public.workout_persistence_guard_exercise_update()
  from public, anon, authenticated, service_role;
revoke all on function public.workout_persistence_guard_occurrence_update()
  from public, anon, authenticated, service_role;
revoke all on function public.workout_persistence_reject_update()
  from public, anon, authenticated, service_role;

revoke all on function public.materialize_my_workout_schedule()
  from public, anon, authenticated, service_role;
revoke all on function public.get_pending_workout_occurrence()
  from public, anon, authenticated, service_role;
revoke all on function public.start_workout_session(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.set_workout_session_exercise_completion(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.update_workout_session_note(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.abandon_workout_session(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.skip_workout_schedule_occurrence(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.update_workout_weekly_schedule(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.restore_original_workout_schedule()
  from public, anon, authenticated, service_role;
revoke all on function public.replace_user_workout_plan(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_workout_session(uuid)
  from public, anon, authenticated, service_role;

-- Phase 1 is intentionally dormant. The 11 user-facing RPC definitions are
-- installed, but only their postgres owner has inherent EXECUTE. Runtime
-- activation requires a separately reviewed ACL cutover after compatible
-- application code is deployed and remains disabled until that cutover.

comment on table public.workout_sessions is
  'Durable user-owned workout attempts; note remains editable after completion.';
comment on table public.workout_session_exercises is
  'Bounded immutable exercise snapshot plus in-progress completion timestamp.';
comment on table public.workout_schedule_occurrences is
  'Immutable dated schedule facts; pending state is derived, never stored.';
comment on function public.complete_workout_session(uuid) is
  'Completes a workout and writes one legacy log atomically; intentionally awards zero Energy.';

do $postconditions$
declare
  v_table_count integer;
  v_function_count integer;
  v_policy_count integer;
begin
  select count(*) into v_table_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname in (
      'workout_sessions', 'workout_session_exercises',
      'workout_session_legacy_log', 'workout_weekly_schedule',
      'workout_schedule_occurrences', 'workout_schedule_occurrence_exercises'
    ) and c.relrowsecurity
    and pg_catalog.pg_get_userbyid(c.relowner) = 'postgres';
  if v_table_count <> 6 then
    raise exception 'Workout persistence table/RLS/owner postcondition failed';
  end if;

  select count(*) into v_function_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.oid in (
      'public.materialize_my_workout_schedule()'::regprocedure,
      'public.get_pending_workout_occurrence()'::regprocedure,
      'public.start_workout_session(uuid,uuid,uuid)'::regprocedure,
      'public.set_workout_session_exercise_completion(uuid,uuid,boolean)'::regprocedure,
      'public.update_workout_session_note(uuid,text)'::regprocedure,
      'public.abandon_workout_session(uuid)'::regprocedure,
      'public.skip_workout_schedule_occurrence(uuid,text)'::regprocedure,
      'public.update_workout_weekly_schedule(jsonb)'::regprocedure,
      'public.restore_original_workout_schedule()'::regprocedure,
      'public.replace_user_workout_plan(jsonb)'::regprocedure,
      'public.complete_workout_session(uuid)'::regprocedure
    )
    and p.prosecdef
    and pg_catalog.array_to_string(p.proconfig, ',') in ('search_path=', 'search_path=""')
    and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
    and not exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) acl
      where acl.privilege_type = 'EXECUTE'
        and (acl.grantee = 0 or acl.grantee <> p.proowner)
    );
  if v_function_count <> 11 then
    raise exception 'Workout persistence RPC DORMANT security postcondition failed';
  end if;

  select count(*) into v_policy_count
  from pg_catalog.pg_policy p
  where p.polrelid in (
    'public.workout_sessions'::regclass,
    'public.workout_session_exercises'::regclass,
    'public.workout_session_legacy_log'::regclass,
    'public.workout_weekly_schedule'::regclass,
    'public.workout_schedule_occurrences'::regclass,
    'public.workout_schedule_occurrence_exercises'::regclass
  );
  if v_policy_count <> 6 then
    raise exception 'Workout persistence policy postcondition failed';
  end if;

  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.complete_mission_with_energy(uuid)'::regprocedure
     )) <> '4a1deeecb318df2dd76a30a1cd4acb74'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.record_user_streak_activity(uuid)'::regprocedure
     )) <> '66a1d1b6ad6cdfd150ef06026410320c' then
    raise exception 'Energy/streak functions changed during workout migration';
  end if;
end
$postconditions$;

commit;
