-- Nutrição V1 phase 2: authoritative server-only target writer.
-- Forward-only preparation. Do not apply automatically to shared environments.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
  if pg_catalog.to_regclass('public.nutrition_target_snapshots') is null
     or pg_catalog.to_regclass('public.user_health_profiles') is null
     or pg_catalog.to_regclass('public.nutrition_profiles') is null
     or pg_catalog.to_regclass('public.onboarding_completion_receipts') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regprocedure('public.complete_onboarding_v2(jsonb)') is null
     or pg_catalog.to_regprocedure('public.complete_onboarding_v22(jsonb)') is null
     or pg_catalog.to_regprocedure('auth.uid()') is null
     or pg_catalog.to_regprocedure('pg_catalog.sha256(bytea)') is null then
    raise exception 'Nutrição V1 phase 2 requires the applied phase 1 foundation';
  end if;

  if pg_catalog.to_regprocedure(
       'public.write_nutrition_target_v1_internal(uuid,uuid,text,date,jsonb,jsonb)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.complete_onboarding_v2_with_nutrition_target(uuid,jsonb,jsonb,date)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.write_nutrition_target_v1(uuid,uuid,date,jsonb)'
     ) is not null then
    raise exception 'Nutrição V1 phase 2 functions already exist; audit before proceeding';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.nutrition_target_snapshots'::regclass
      and attname = 'writer_event_id'
      and attnum > 0 and not attisdropped
  ) then
    raise exception 'nutrition_target_snapshots.writer_event_id already exists; audit before proceeding';
  end if;
end
$preflight$;

alter table public.nutrition_target_snapshots
  add column writer_event_id uuid;

comment on column public.nutrition_target_snapshots.writer_event_id is
  'Server-issued logical event identifier. Replays for one user return the same immutable snapshot.';

alter table public.nutrition_target_snapshots
  drop constraint nutrition_target_snapshots_source_check,
  add constraint nutrition_target_snapshots_source_check check (
    source in ('calculated', 'onboarding', 'manual_review', 'recalculation')
  ),
  drop constraint nutrition_target_snapshots_effective_range_check,
  add constraint nutrition_target_snapshots_effective_range_check check (
    effective_until is null or effective_until >= effective_from
  );

create unique index nutrition_target_snapshots_writer_event_unique
  on public.nutrition_target_snapshots (user_id, writer_event_id)
  where writer_event_id is not null;

create function public.write_nutrition_target_v1_internal(
  p_user_id uuid,
  p_event_id uuid,
  p_source text,
  p_effective_date date,
  p_target jsonb,
  p_metadata jsonb
)
returns public.nutrition_target_snapshots
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile_user_id uuid;
  v_birth_date date;
  v_biological_sex text;
  v_height_cm numeric;
  v_weight_kg numeric;
  v_goal text;
  v_activity_level text;
  v_expected_sex_basis text;
  v_target_hash text;
  v_existing public.nutrition_target_snapshots%rowtype;
  v_active public.nutrition_target_snapshots%rowtype;
  v_next_version integer;
  v_inserted public.nutrition_target_snapshots%rowtype;
begin
  if p_user_id is null or p_event_id is null or p_effective_date is null then
    raise exception using errcode = '22023', message = 'Writer identity, event, and effective date are required';
  end if;

  if p_source not in ('onboarding', 'recalculation') then
    raise exception using errcode = '22023', message = 'Unsupported nutrition target writer source';
  end if;

  if pg_catalog.jsonb_typeof(p_target) <> 'object'
     or pg_catalog.jsonb_typeof(p_target->'reasons') <> 'array'
     or pg_catalog.jsonb_typeof(p_metadata) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid nutrition target writer payload';
  end if;

  if not (p_target ?& array[
    'algorithmVersion', 'status', 'reasons', 'effectiveDate', 'ageYears',
    'weightKg', 'heightCm', 'biologicalSexBasis', 'activityLevel',
    'activityMultiplier', 'goal', 'goalAdjustment', 'bmr', 'tdee',
    'calories', 'proteinG', 'carbsG', 'fatG', 'fiberG',
    'macroCalories', 'macroCalorieDelta'
  ]) then
    raise exception using errcode = '22023', message = 'Incomplete nutrition target writer payload';
  end if;

  if p_target->>'algorithmVersion' <> 'praxe-nutrition-target-msj-v1'
     or p_target->>'status' not in ('active', 'requires_review')
     or p_target->>'effectiveDate' <> p_effective_date::text then
    raise exception using errcode = '22023', message = 'Unsupported nutrition target calculation contract';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements_text(p_target->'reasons') as reason(value)
    where reason.value not in (
      'invalid_effective_date', 'invalid_birth_date', 'under_18',
      'age_outside_auto_domain', 'pregnancy', 'lactation',
      'pregnancy_status_unknown', 'lactation_status_unknown',
      'clinical_review_required', 'invalid_weight',
      'weight_outside_auto_domain', 'invalid_height',
      'height_outside_auto_domain', 'undefined_metabolic_sex',
      'missing_activity_level', 'unsupported_goal',
      'target_calories_outside_auto_domain', 'negative_carbohydrate_budget'
    )
  ) then
    raise exception using errcode = '22023', message = 'Unknown nutrition target review reason';
  end if;

  if (p_target->>'status' = 'active' and pg_catalog.jsonb_array_length(p_target->'reasons') <> 0)
     or (p_target->>'status' = 'requires_review' and pg_catalog.jsonb_array_length(p_target->'reasons') = 0) then
    raise exception using errcode = '22023', message = 'Nutrition target status and reasons disagree';
  end if;

  -- This row is the per-user serialization point shared by onboarding and
  -- recalculation. The phase-1 onboarding RPC already takes the same lock.
  select p.user_id, h.birth_date, h.biological_sex, h.height_cm, h.weight_kg,
         h.primary_goal, n.activity_level
  into v_profile_user_id, v_birth_date, v_biological_sex, v_height_cm,
       v_weight_kg, v_goal, v_activity_level
  from public.profiles as p
  join public.user_health_profiles as h on h.user_id = p.user_id
  join public.nutrition_profiles as n on n.user_id = p.user_id
  where p.user_id = p_user_id
  for update of p;

  if not found then
    raise exception using errcode = '23503', message = 'Persisted nutrition target inputs are incomplete';
  end if;

  v_expected_sex_basis := case
    when v_biological_sex in ('male', 'female') then v_biological_sex
    else null
  end;

  if (p_target->>'weightKg')::numeric is distinct from v_weight_kg
     or (p_target->>'heightCm')::numeric is distinct from v_height_cm
     or (p_target->>'biologicalSexBasis') is distinct from v_expected_sex_basis
     or (p_target->>'activityLevel') is distinct from v_activity_level
     or (p_target->>'goal') is distinct from v_goal then
    raise exception using errcode = '22023', message = 'Calculated target does not match persisted inputs';
  end if;

  v_target_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_target::text, 'UTF8')),
    'hex'
  );

  select t.* into v_existing
  from public.nutrition_target_snapshots as t
  where t.user_id = p_user_id and t.writer_event_id = p_event_id;

  if found then
    if v_existing.source <> p_source
       or v_existing.metadata->>'calculation_hash' is distinct from v_target_hash then
      raise exception using errcode = '23505', message = 'Nutrition target event conflicts with its original calculation';
    end if;
    return v_existing;
  end if;

  select t.* into v_active
  from public.nutrition_target_snapshots as t
  where t.user_id = p_user_id
    and t.status = 'active'
    and t.effective_until is null
  for update;

  if found then
    if p_effective_date < v_active.effective_from then
      raise exception using errcode = '22023', message = 'Nutrition target effective date cannot move backwards';
    end if;

    update public.nutrition_target_snapshots
    set status = 'superseded', effective_until = p_effective_date
    where id = v_active.id;
  end if;

  select coalesce(max(t.version), 0) + 1
  into v_next_version
  from public.nutrition_target_snapshots as t
  where t.user_id = p_user_id;

  insert into public.nutrition_target_snapshots (
    user_id, version, writer_event_id, algorithm_version, source, status,
    effective_from, weight_kg, height_cm, age_years, biological_sex_basis,
    activity_level, activity_multiplier, goal, goal_adjustment, bmr, tdee,
    calories, protein_g, carbs_g, fat_g, fiber_g, metadata
  ) values (
    p_user_id,
    v_next_version,
    p_event_id,
    p_target->>'algorithmVersion',
    p_source,
    p_target->>'status',
    p_effective_date,
    (p_target->>'weightKg')::numeric,
    (p_target->>'heightCm')::numeric,
    (p_target->>'ageYears')::smallint,
    p_target->>'biologicalSexBasis',
    p_target->>'activityLevel',
    (p_target->>'activityMultiplier')::numeric,
    p_target->>'goal',
    (p_target->>'goalAdjustment')::numeric,
    (p_target->>'bmr')::numeric,
    (p_target->>'tdee')::numeric,
    (p_target->>'calories')::numeric,
    (p_target->>'proteinG')::numeric,
    (p_target->>'carbsG')::numeric,
    (p_target->>'fatG')::numeric,
    (p_target->>'fiberG')::numeric,
    p_metadata || pg_catalog.jsonb_build_object(
      'reasons', p_target->'reasons',
      'calculation_hash', v_target_hash
    )
  )
  returning * into v_inserted;

  return v_inserted;
end
$function$;

revoke all on function public.write_nutrition_target_v1_internal(
  uuid, uuid, text, date, jsonb, jsonb
) from public, anon, authenticated, service_role;

create function public.complete_onboarding_v2_with_nutrition_target(
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
  v_completion record;
  v_receipt public.onboarding_completion_receipts%rowtype;
  v_target public.nutrition_target_snapshots%rowtype;
begin
  if p_user_id is null
     or p_payload->'payload_schema_version' <> '4'::jsonb then
    raise exception using errcode = '22023', message = 'Atomic nutrition onboarding requires schema 4 and a verified user';
  end if;

  begin
    v_idempotency_key := (p_payload->>'idempotency_key')::uuid;
  exception when invalid_text_representation or null_value_not_allowed then
    raise exception using errcode = '22023', message = 'Invalid idempotency key';
  end;

  -- The caller is a server-only service-role endpoint. It derives p_user_id
  -- from a verified session; the client payload has no user_id field.
  perform pg_catalog.set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', p_user_id,
      'role', 'authenticated'
    )::text,
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
    and r.payload_schema_version = 4
    and r.canonicalization_version = 4;

  v_target := public.write_nutrition_target_v1_internal(
    p_user_id,
    v_idempotency_key,
    'onboarding',
    p_effective_date,
    p_target,
    pg_catalog.jsonb_build_object(
      'trigger', 'onboarding',
      'onboarding_version', 2,
      'payload_schema_version', 4,
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
) is 'Server-only atomic schema-4 onboarding completion and nutrition target persistence.';

create function public.write_nutrition_target_v1(
  p_user_id uuid,
  p_event_id uuid,
  p_effective_date date,
  p_target jsonb
)
returns public.nutrition_target_snapshots
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return public.write_nutrition_target_v1_internal(
    p_user_id,
    p_event_id,
    'recalculation',
    p_effective_date,
    p_target,
    pg_catalog.jsonb_build_object(
      'trigger', 'recalculation',
      'writer_event_id', p_event_id
    )
  );
end
$function$;

revoke all on function public.write_nutrition_target_v1(
  uuid, uuid, date, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.write_nutrition_target_v1(
  uuid, uuid, date, jsonb
) to service_role;

comment on function public.write_nutrition_target_v1(uuid, uuid, date, jsonb) is
  'Server-only reusable nutrition target recalculation writer. Inputs must be calculated by the authoritative TypeScript calculator.';

do $postcondition$
begin
  if pg_catalog.has_function_privilege(
       'public',
       'public.complete_onboarding_v2_with_nutrition_target(uuid,jsonb,jsonb,date)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.complete_onboarding_v2_with_nutrition_target(uuid,jsonb,jsonb,date)',
       'EXECUTE'
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
    raise exception 'Unexpected atomic onboarding writer privileges';
  end if;

  if pg_catalog.has_function_privilege(
       'authenticated', 'public.write_nutrition_target_v1(uuid,uuid,date,jsonb)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.write_nutrition_target_v1_internal(uuid,uuid,text,date,jsonb,jsonb)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.write_nutrition_target_v1(uuid,uuid,date,jsonb)', 'EXECUTE'
     ) then
    raise exception 'Unexpected nutrition target writer privileges';
  end if;
end
$postcondition$;

commit;
