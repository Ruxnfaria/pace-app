begin;

create or replace function public.materialize_daily_missions_v1(
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
  on conflict on constraint daily_missions_intelligence_identity_unique do nothing;

  return query
  select mission.id, mission.mission_code, mission.completed
  from public.daily_missions as mission
  where mission.user_id = p_user_id
    and mission.for_date = p_for_date
    and mission.algorithm_version = p_algorithm_version
  order by mission.created_at, mission.id;
end
$function$;

comment on function public.materialize_daily_missions_v1(uuid, date, text, jsonb) is
  'Service-only, atomic and idempotent PRAXE Missions Intelligence V1 materialization.';

commit;
