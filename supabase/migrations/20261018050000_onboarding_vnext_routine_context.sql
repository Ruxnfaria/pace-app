-- Onboarding VNext: persist daily-routine context without changing Nutrition V1 math.
-- Forward-only preparation. Do not apply automatically to shared environments.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
  if pg_catalog.to_regclass('public.nutrition_profiles') is null
     or pg_catalog.to_regclass('public.training_profiles') is null
     or pg_catalog.to_regclass('public.onboarding_completion_receipts') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regprocedure('public.complete_onboarding_v2(jsonb)') is null
     or pg_catalog.to_regprocedure(
       'public.complete_onboarding_v2_with_nutrition_target(uuid,jsonb,jsonb,date)'
     ) is null
     or pg_catalog.to_regprocedure('auth.uid()') is null
     or pg_catalog.to_regprocedure('pg_catalog.sha256(bytea)') is null then
    raise exception 'Onboarding schema 5 requires the applied Nutrition V1 phase 2 foundation';
  end if;

  if pg_catalog.to_regprocedure('public.complete_onboarding_v24_internal(jsonb)') is not null then
    raise exception 'Internal schema-4 onboarding function already exists; audit before proceeding';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute
    where (
      (attrelid = 'public.nutrition_profiles'::regclass
       and attname in (
         'wake_time', 'sleep_time', 'routine_predictability', 'meal_break_availability'
       ))
      or (attrelid = 'public.training_profiles'::regclass
          and attname = 'preferred_training_period')
    )
      and attnum > 0 and not attisdropped
  ) then
    raise exception 'Onboarding schema-5 context columns already exist; audit before proceeding';
  end if;
end
$preflight$;

lock table public.nutrition_profiles, public.training_profiles,
  public.onboarding_completion_receipts in access exclusive mode;

alter table public.nutrition_profiles
  add column wake_time time without time zone,
  add column sleep_time time without time zone,
  add column routine_predictability text,
  add column meal_break_availability text,
  add constraint nutrition_profiles_daily_routine_context_check check (
    (
      wake_time is null
      and sleep_time is null
      and routine_predictability is null
      and meal_break_availability is null
    )
    or
    (
      wake_time is not null
      and sleep_time is not null
      and wake_time <> sleep_time
      and routine_predictability in ('predictable', 'variable')
      and meal_break_availability in ('flexible', 'limited', 'difficult')
    )
  );

alter table public.training_profiles
  add column preferred_training_period text,
  add constraint training_profiles_preferred_training_period_check check (
    preferred_training_period is null
    or preferred_training_period in ('morning', 'afternoon', 'evening', 'variable')
  );

comment on column public.nutrition_profiles.wake_time is
  'Approximate local wake time declared as routine context; not an absolute timestamp.';
comment on column public.nutrition_profiles.sleep_time is
  'Approximate local sleep time declared as routine context; overnight schedules are supported.';
comment on column public.nutrition_profiles.routine_predictability is
  'Declared daily-routine predictability. Context only; never a nutrition recommendation.';
comment on column public.nutrition_profiles.meal_break_availability is
  'Declared availability for meal breaks. Context for a future meal-plan writer.';
comment on column public.training_profiles.preferred_training_period is
  'Declared habitual training period. Context only; it does not alter Nutrition V1 targets.';

alter function public.complete_onboarding_v2(jsonb)
  rename to complete_onboarding_v24_internal;

revoke all on function public.complete_onboarding_v24_internal(jsonb)
  from public, anon, authenticated, service_role;

create function public.complete_onboarding_v2(p_payload jsonb)
returns table (
  result text,
  onboarding_version smallint,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_idempotency_key uuid;
  v_profile_completed boolean;
  v_profile_version smallint;
  v_profile_completed_at timestamptz;
  v_receipt public.onboarding_completion_receipts%rowtype;
  v_routine jsonb;
  v_wake_time time without time zone;
  v_sleep_time time without time zone;
  v_routine_predictability text;
  v_meal_break_availability text;
  v_preferred_training_period text;
  v_schema5_payload jsonb;
  v_schema4_payload jsonb;
  v_payload_hash bytea;
  v_schema4_result record;
begin
  if pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Payload must be an object';
  end if;

  if p_payload->'payload_schema_version' in ('2'::jsonb, '4'::jsonb) then
    return query
      select legacy.result, legacy.onboarding_version, legacy.completed_at
      from public.complete_onboarding_v24_internal(p_payload) as legacy;
    return;
  end if;

  if p_payload->'payload_schema_version' <> '5'::jsonb then
    raise exception using errcode = '22023', message = 'Unsupported onboarding payload schema';
  end if;

  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required to complete onboarding';
  end if;

  begin
    v_idempotency_key := (p_payload->>'idempotency_key')::uuid;
  exception when invalid_text_representation or null_value_not_allowed then
    raise exception using errcode = '22023', message = 'Invalid idempotency key';
  end;

  v_schema5_payload := p_payload;
  if pg_catalog.jsonb_typeof(v_schema5_payload->'nutrition') = 'object'
     and not (v_schema5_payload->'nutrition' ? 'preferred_meals_per_day') then
    v_schema5_payload := pg_catalog.jsonb_set(
      v_schema5_payload,
      '{nutrition,preferred_meals_per_day}',
      'null'::jsonb,
      true
    );
  end if;

  v_routine := v_schema5_payload->'routine';
  if pg_catalog.jsonb_typeof(v_routine) <> 'object'
     or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(v_routine)) <> 5
     or not (v_routine ?& array[
       'wake_time', 'sleep_time', 'routine_predictability',
       'meal_break_availability', 'preferred_training_period'
     ]) then
    raise exception using errcode = '22023', message = 'Invalid routine context shape';
  end if;

  if pg_catalog.jsonb_typeof(v_routine->'wake_time') <> 'string'
     or (v_routine->>'wake_time') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
     or pg_catalog.jsonb_typeof(v_routine->'sleep_time') <> 'string'
     or (v_routine->>'sleep_time') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception using errcode = '22023', message = 'Invalid routine local time';
  end if;

  v_wake_time := (v_routine->>'wake_time')::time;
  v_sleep_time := (v_routine->>'sleep_time')::time;
  if v_wake_time = v_sleep_time then
    raise exception using errcode = '22023', message = 'Wake and sleep times must differ';
  end if;

  v_routine_predictability := v_routine->>'routine_predictability';
  v_meal_break_availability := v_routine->>'meal_break_availability';
  v_preferred_training_period := v_routine->>'preferred_training_period';
  if pg_catalog.jsonb_typeof(v_routine->'routine_predictability') <> 'string'
     or pg_catalog.jsonb_typeof(v_routine->'meal_break_availability') <> 'string'
     or pg_catalog.jsonb_typeof(v_routine->'preferred_training_period') <> 'string'
     or v_routine_predictability not in ('predictable', 'variable')
     or v_meal_break_availability not in ('flexible', 'limited', 'difficult')
     or v_preferred_training_period not in ('morning', 'afternoon', 'evening', 'variable') then
    raise exception using errcode = '22023', message = 'Invalid routine context value';
  end if;

  select p.onboarding_completed, p.onboarding_version, p.onboarding_completed_at
  into v_profile_completed, v_profile_version, v_profile_completed_at
  from public.profiles p
  where p.user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = '23503', message = 'Authenticated user has no profile row';
  end if;

  v_payload_hash := pg_catalog.sha256(
    pg_catalog.convert_to((v_schema5_payload - 'idempotency_key')::text, 'UTF8')
  );

  select r.* into v_receipt
  from public.onboarding_completion_receipts r
  where r.user_id = v_user_id and r.onboarding_version = 2;

  if found then
    if v_profile_completed is true
       and v_profile_version = 2
       and v_profile_completed_at is not null
       and v_profile_completed_at = v_receipt.completed_at
       and v_receipt.payload_schema_version = 5
       and v_receipt.canonicalization_version = 5
       and v_receipt.idempotency_key = v_idempotency_key
       and v_receipt.payload_hash = v_payload_hash then
      return query select 'replay'::text, 2::smallint, v_receipt.completed_at;
      return;
    end if;
    raise exception using errcode = '23505', message = 'Onboarding V2 already has a conflicting completion receipt';
  end if;

  v_schema4_payload := pg_catalog.jsonb_set(
    v_schema5_payload - 'routine',
    '{payload_schema_version}',
    '4'::jsonb
  );

  select legacy.result, legacy.onboarding_version, legacy.completed_at
  into strict v_schema4_result
  from public.complete_onboarding_v24_internal(v_schema4_payload) as legacy;

  if v_schema4_result.result <> 'completed' then
    raise exception using errcode = '55000', message = 'Unexpected schema-4 onboarding completion state';
  end if;

  update public.nutrition_profiles n
  set wake_time = v_wake_time,
      sleep_time = v_sleep_time,
      routine_predictability = v_routine_predictability,
      meal_break_availability = v_meal_break_availability
  where n.user_id = v_user_id;
  if not found then
    raise exception using errcode = '55000', message = 'Nutrition profile was not created';
  end if;

  update public.training_profiles t
  set preferred_training_period = v_preferred_training_period
  where t.user_id = v_user_id;
  if not found then
    raise exception using errcode = '55000', message = 'Training profile was not created';
  end if;

  update public.onboarding_completion_receipts r
  set payload_hash = v_payload_hash,
      payload_schema_version = 5,
      canonicalization_version = 5
  where r.user_id = v_user_id
    and r.onboarding_version = 2
    and r.idempotency_key = v_idempotency_key
    and r.payload_schema_version = 4
    and r.canonicalization_version = 4;
  if not found then
    raise exception using errcode = '55000', message = 'Onboarding receipt schema-5 upgrade failed';
  end if;

  return query
    select 'completed'::text, 2::smallint, v_schema4_result.completed_at::timestamptz;
end
$function$;

revoke all on function public.complete_onboarding_v2(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_onboarding_v2(jsonb) to authenticated;
grant execute on function public.complete_onboarding_v2(jsonb) to service_role;

create or replace function public.complete_onboarding_v2_with_nutrition_target(
  p_user_id uuid,
  p_payload jsonb,
  p_target jsonb,
  p_effective_date date
)
returns table (
  result text,
  onboarding_version smallint,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_idempotency_key uuid;
  v_schema_version smallint;
  v_completion record;
  v_receipt public.onboarding_completion_receipts%rowtype;
  v_target public.nutrition_target_snapshots%rowtype;
begin
  begin
    v_schema_version := (p_payload->>'payload_schema_version')::smallint;
  exception when invalid_text_representation or null_value_not_allowed then
    raise exception using errcode = '22023', message = 'Invalid onboarding payload schema';
  end;

  if p_user_id is null or v_schema_version not in (4, 5) then
    raise exception using errcode = '22023', message = 'Atomic nutrition onboarding requires schema 4 or 5 and a verified user';
  end if;

  begin
    v_idempotency_key := (p_payload->>'idempotency_key')::uuid;
  exception when invalid_text_representation or null_value_not_allowed then
    raise exception using errcode = '22023', message = 'Invalid idempotency key';
  end;

  perform pg_catalog.set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );

  select completion.result, completion.onboarding_version, completion.completed_at
  into strict v_completion
  from public.complete_onboarding_v2(p_payload) as completion;

  select r.* into strict v_receipt
  from public.onboarding_completion_receipts as r
  where r.user_id = p_user_id
    and r.onboarding_version = 2
    and r.idempotency_key = v_idempotency_key
    and r.payload_schema_version = v_schema_version
    and r.canonicalization_version = v_schema_version;

  v_target := public.write_nutrition_target_v1_internal(
    p_user_id,
    v_idempotency_key,
    'onboarding',
    p_effective_date,
    p_target,
    pg_catalog.jsonb_build_object(
      'trigger', 'onboarding',
      'onboarding_version', 2,
      'payload_schema_version', v_schema_version,
      'receipt_idempotency_key', v_idempotency_key
    )
  );

  if v_target.id is null then
    raise exception using errcode = '55000', message = 'Nutrition target writer returned no snapshot';
  end if;

  return query select
    v_completion.result::text,
    v_completion.onboarding_version::smallint,
    v_completion.completed_at::timestamptz;
end
$function$;

revoke all on function public.complete_onboarding_v2_with_nutrition_target(
  uuid, jsonb, jsonb, date
) from public, anon, authenticated, service_role;
grant execute on function public.complete_onboarding_v2_with_nutrition_target(
  uuid, jsonb, jsonb, date
) to service_role;

comment on function public.complete_onboarding_v2_with_nutrition_target(
  uuid, jsonb, jsonb, date
) is 'Server-only atomic schema-4/schema-5 onboarding completion and Nutrition V1 target persistence.';

do $postcondition$
begin
  if pg_catalog.has_function_privilege('anon', 'public.complete_onboarding_v2(jsonb)', 'EXECUTE')
     or not pg_catalog.has_function_privilege(
       'authenticated', 'public.complete_onboarding_v2(jsonb)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.complete_onboarding_v24_internal(jsonb)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role', 'public.complete_onboarding_v24_internal(jsonb)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.complete_onboarding_v2_with_nutrition_target(uuid,jsonb,jsonb,date)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.complete_onboarding_v2_with_nutrition_target(uuid,jsonb,jsonb,date)',
       'EXECUTE'
     ) then
    raise exception 'Unexpected onboarding schema-5 function privileges';
  end if;
end
$postcondition$;

commit;
