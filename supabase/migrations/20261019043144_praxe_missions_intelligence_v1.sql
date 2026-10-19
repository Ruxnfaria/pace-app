begin;

alter table public.daily_missions
  add column mission_code text,
  add column algorithm_version text,
  add column completion_rule text,
  add column difficulty text,
  add column source_workout_occurrence_id uuid
    references public.workout_schedule_occurrences(id) on delete set null;

alter table public.daily_missions
  add constraint daily_missions_intelligence_fields_check check (
    (mission_code is null and algorithm_version is null
      and completion_rule is null and difficulty is null
      and source_workout_occurrence_id is null)
    or
    (mission_code is not null and btrim(mission_code) <> ''
      and algorithm_version is not null and btrim(algorithm_version) <> ''
      and completion_rule is not null and btrim(completion_rule) <> ''
      and difficulty in ('EASY', 'MODERATE', 'HARD')
      and category in ('TRAINING', 'CARDIO', 'CONSISTENCY', 'NUTRITION', 'ACTIVITY', 'RECOVERY'))
  ),
  add constraint daily_missions_intelligence_identity_unique
    unique (user_id, for_date, algorithm_version, mission_code);

create index daily_missions_intelligence_history_idx
  on public.daily_missions (user_id, algorithm_version, for_date desc)
  where mission_code is not null;

create function public.guard_intelligent_daily_mission_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_is_intelligent boolean;
begin
  v_is_intelligent := case tg_op
    when 'INSERT' then new.algorithm_version is not null
    when 'DELETE' then old.algorithm_version is not null
    else old.algorithm_version is not null or new.algorithm_version is not null
  end;
  if v_is_intelligent and v_role <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Intelligent missions are server-managed';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

create trigger daily_missions_guard_intelligent_mutation
before insert or update or delete on public.daily_missions
for each row execute function public.guard_intelligent_daily_mission_mutation();

create function public.materialize_daily_missions_v1(
  p_user_id uuid,
  p_for_date date,
  p_algorithm_version text,
  p_missions jsonb
)
returns table (id uuid, mission_code text, completed boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
begin
  if p_user_id is null or p_for_date is null then
    raise exception using errcode = '22004', message = 'User and date are required';
  end if;
  if p_algorithm_version <> 'praxe-missions-v1' then
    raise exception using errcode = '22023', message = 'Unsupported mission algorithm version';
  end if;
  if jsonb_typeof(p_missions) <> 'array' then
    raise exception using errcode = '22023', message = 'Missions must be a JSON array';
  end if;
  v_count := jsonb_array_length(p_missions);
  if v_count > 3 then
    raise exception using errcode = '22023', message = 'At most three missions may be materialized';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_missions) as item(
      code text, category text, title text, description text,
      completion_rule text, energy_reward integer, difficulty text,
      target_value integer, current_value integer,
      source_workout_occurrence_id uuid
    )
    where item.code is null or btrim(item.code) = ''
       or item.category not in ('TRAINING', 'CARDIO', 'CONSISTENCY', 'NUTRITION', 'ACTIVITY', 'RECOVERY')
       or item.title is null or btrim(item.title) = '' or char_length(item.title) > 160
       or item.completion_rule is null or btrim(item.completion_rule) = ''
       or item.energy_reward is null or item.energy_reward < 1 or item.energy_reward > 500
       or item.difficulty not in ('EASY', 'MODERATE', 'HARD')
       or item.target_value is null or item.target_value < 1
       or item.current_value is null or item.current_value < 0 or item.current_value > item.target_value
  ) then
    raise exception using errcode = '22023', message = 'Mission payload is invalid';
  end if;
  if (
    select count(distinct item.code)
    from jsonb_to_recordset(p_missions) as item(code text)
  ) <> v_count then
    raise exception using errcode = '22023', message = 'Mission codes must be unique';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_missions) as item(source_workout_occurrence_id uuid)
    where item.source_workout_occurrence_id is not null
      and not exists (
        select 1
        from public.workout_schedule_occurrences as occurrence
        where occurrence.id = item.source_workout_occurrence_id
          and occurrence.user_id = p_user_id
          and occurrence.scheduled_for_date = p_for_date
          and occurrence.skipped_at is null
      )
  ) then
    raise exception using errcode = '22023', message = 'Mission source occurrence is invalid';
  end if;

  insert into public.daily_missions (
    user_id, for_date, mission_code, algorithm_version, completion_rule,
    difficulty, source_workout_occurrence_id, title, description, category,
    xp_reward, target_value, current_value, completed, completed_at
  )
  select
    p_user_id, p_for_date, item.code, p_algorithm_version,
    item.completion_rule, item.difficulty, item.source_workout_occurrence_id,
    item.title, item.description, item.category, item.energy_reward,
    item.target_value, item.current_value, false, null
  from jsonb_to_recordset(p_missions) as item(
    code text, category text, title text, description text,
    completion_rule text, energy_reward integer, difficulty text,
    target_value integer, current_value integer,
    source_workout_occurrence_id uuid
  )
  on conflict (user_id, for_date, algorithm_version, mission_code) do nothing;

  return query
  select mission.id, mission.mission_code, mission.completed
  from public.daily_missions as mission
  where mission.user_id = p_user_id
    and mission.for_date = p_for_date
    and mission.algorithm_version = p_algorithm_version
  order by mission.created_at, mission.id;
end
$function$;

create function public.sync_intelligent_mission_progress_v1(
  p_user_id uuid,
  p_mission_id uuid,
  p_current_value integer,
  p_verified_complete boolean
)
returns table (
  mission_id uuid,
  completed_now boolean,
  energy_awarded integer,
  total_energy integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_mission public.daily_missions%rowtype;
  v_total_energy integer;
  v_completed_now boolean := false;
  v_energy_awarded integer := 0;
begin
  if p_user_id is null or p_mission_id is null or p_current_value is null
     or p_current_value < 0 or p_verified_complete is null then
    raise exception using errcode = '22023', message = 'Mission progress input is invalid';
  end if;
  select * into v_mission
  from public.daily_missions as mission
  where mission.id = p_mission_id
    and mission.user_id = p_user_id
    and mission.algorithm_version = 'praxe-missions-v1'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Intelligent mission not found';
  end if;

  update public.daily_missions as mission
  set current_value = least(
    greatest(coalesce(mission.current_value, 0), p_current_value, 0),
    coalesce(mission.target_value, 1)
  )
  where mission.id = p_mission_id;

  if p_verified_complete and not v_mission.completed then
    if coalesce(v_mission.xp_reward, 0) < 1 or v_mission.xp_reward > 500 then
      raise exception using errcode = '22023', message = 'Mission Energy reward is invalid';
    end if;
    update public.profiles as profile
    set
      total_xp = greatest(coalesce(profile.total_xp, 0) + v_mission.xp_reward, 0),
      level = greatest(1, floor(greatest(coalesce(profile.total_xp, 0) + v_mission.xp_reward, 0)::numeric / 500)::integer + 1)
    where profile.user_id = p_user_id
    returning profile.total_xp into v_total_energy;
    if not found then
      raise exception using errcode = 'P0002', message = 'Profile not found';
    end if;

    update public.daily_missions as mission
    set completed = true,
        current_value = coalesce(mission.target_value, 1),
        completed_at = coalesce(mission.completed_at, now())
    where mission.id = p_mission_id;

    insert into public.reward_transactions (
      user_id, reward_type, source_type, source_id, idempotency_key, payload
    ) values (
      p_user_id, 'energy', 'daily_mission_completion', p_mission_id::text,
      'daily_mission_completion:' || p_mission_id::text,
      jsonb_build_object('mission_id', p_mission_id, 'amount', v_mission.xp_reward)
    );
    perform public.record_user_streak_activity(p_user_id);
    v_completed_now := true;
    v_energy_awarded := v_mission.xp_reward;
  else
    select greatest(coalesce(profile.total_xp, 0), 0)
    into v_total_energy
    from public.profiles as profile
    where profile.user_id = p_user_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Profile not found';
    end if;
  end if;

  return query select p_mission_id, v_completed_now, v_energy_awarded, v_total_energy;
end
$function$;

revoke all on function public.materialize_daily_missions_v1(uuid, date, text, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.materialize_daily_missions_v1(uuid, date, text, jsonb)
to service_role;

revoke all on function public.sync_intelligent_mission_progress_v1(uuid, uuid, integer, boolean)
from public, anon, authenticated, service_role;
grant execute on function public.sync_intelligent_mission_progress_v1(uuid, uuid, integer, boolean)
to service_role;

revoke all on function public.guard_intelligent_daily_mission_mutation()
from public, anon, authenticated, service_role;

comment on function public.materialize_daily_missions_v1(uuid, date, text, jsonb) is
  'Service-only, atomic and idempotent PRAXE Missions Intelligence V1 materialization.';
comment on function public.sync_intelligent_mission_progress_v1(uuid, uuid, integer, boolean) is
  'Service-only synchronization of server-verified mission progress and idempotent Energy reward.';

commit;
