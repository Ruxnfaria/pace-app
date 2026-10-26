-- Persist explicit reproductive context for Nutrition Target V1 safety.
-- Forward-only preparation. Do not apply automatically to shared environments.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
  if pg_catalog.to_regclass('public.user_health_profiles') is null
     or pg_catalog.to_regprocedure('public.complete_onboarding_v2(jsonb)') is null then
    raise exception 'Reproductive context requires the applied onboarding schema-5 foundation';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.user_health_profiles'::regclass
      and attname in ('pregnancy_status', 'lactation_status')
      and attnum > 0
      and not attisdropped
  ) then
    raise exception 'Reproductive context columns already exist; audit before proceeding';
  end if;
end
$preflight$;

lock table public.user_health_profiles in access exclusive mode;

alter table public.user_health_profiles
  add column pregnancy_status text,
  add column lactation_status text,
  add constraint user_health_profiles_reproductive_context_check check (
    (
      pregnancy_status is null
      and lactation_status is null
    )
    or
    (
      pregnancy_status is not null
      and lactation_status is not null
      and (
        (
          biological_sex = 'female'
          and pregnancy_status in ('yes', 'no', 'unknown', 'prefer_not_to_say')
          and lactation_status in ('yes', 'no', 'unknown', 'prefer_not_to_say')
        )
        or
        (
          biological_sex <> 'female'
          and pregnancy_status = 'not_applicable'
          and lactation_status = 'not_applicable'
        )
      )
    )
  );

comment on column public.user_health_profiles.pregnancy_status is
  'Explicit onboarding declaration used to gate automatic nutrition targets; null is retained only for legacy rows.';
comment on column public.user_health_profiles.lactation_status is
  'Explicit onboarding declaration used to gate automatic nutrition targets; null is retained only for legacy rows.';

create or replace function public.complete_onboarding_v2(p_payload jsonb)
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
  v_health jsonb;
  v_pregnancy_status text;
  v_lactation_status text;
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

  v_health := v_schema5_payload->'health';
  if pg_catalog.jsonb_typeof(v_health) <> 'object'
     or pg_catalog.jsonb_typeof(v_health->'pregnancy_status') <> 'string'
     or pg_catalog.jsonb_typeof(v_health->'lactation_status') <> 'string' then
    raise exception using errcode = '22023', message = 'Invalid reproductive context shape';
  end if;

  v_pregnancy_status := v_health->>'pregnancy_status';
  v_lactation_status := v_health->>'lactation_status';
  if (
    v_health->>'biological_sex' = 'female'
    and (
      v_pregnancy_status not in ('yes', 'no', 'unknown', 'prefer_not_to_say')
      or v_lactation_status not in ('yes', 'no', 'unknown', 'prefer_not_to_say')
    )
  ) or (
    v_health->>'biological_sex' <> 'female'
    and (
      v_pregnancy_status <> 'not_applicable'
      or v_lactation_status <> 'not_applicable'
    )
  ) then
    raise exception using errcode = '22023', message = 'Reproductive context violates the onboarding contract';
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
    ((v_schema5_payload - 'routine') #- '{health,pregnancy_status}') #- '{health,lactation_status}',
    '{payload_schema_version}',
    '4'::jsonb
  );

  select legacy.result, legacy.onboarding_version, legacy.completed_at
  into strict v_schema4_result
  from public.complete_onboarding_v24_internal(v_schema4_payload) as legacy;

  if v_schema4_result.result <> 'completed' then
    raise exception using errcode = '55000', message = 'Unexpected schema-4 onboarding completion state';
  end if;

  update public.user_health_profiles h
  set pregnancy_status = v_pregnancy_status,
      lactation_status = v_lactation_status
  where h.user_id = v_user_id;
  if not found then
    raise exception using errcode = '55000', message = 'Health profile was not created';
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

do $postcondition$
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.user_health_profiles'::regclass
      and attname = 'pregnancy_status'
      and atttypid = 'pg_catalog.text'::regtype
      and attnum > 0
      and not attisdropped
  ) or not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.user_health_profiles'::regclass
      and attname = 'lactation_status'
      and atttypid = 'pg_catalog.text'::regtype
      and attnum > 0
      and not attisdropped
  ) or pg_catalog.has_function_privilege('anon', 'public.complete_onboarding_v2(jsonb)', 'EXECUTE')
     or not pg_catalog.has_function_privilege(
       'authenticated', 'public.complete_onboarding_v2(jsonb)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.complete_onboarding_v2(jsonb)', 'EXECUTE'
     ) then
    raise exception 'Unexpected reproductive context migration postcondition';
  end if;
end
$postcondition$;

commit;
