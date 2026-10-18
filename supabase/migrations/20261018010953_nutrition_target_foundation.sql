-- Nutrição V1 phase 1: onboarding inputs and server-managed target snapshots.
-- Forward-only preparation. Review before applying to any shared environment.
begin;

set local lock_timeout = '5s';

do $preflight$
begin
  if pg_catalog.to_regclass('public.nutrition_target_snapshots') is not null then
    raise exception 'public.nutrition_target_snapshots already exists; audit before proceeding';
  end if;

  if pg_catalog.to_regclass('public.nutrition_profiles') is null
     or pg_catalog.to_regclass('public.onboarding_completion_receipts') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regprocedure('public.complete_onboarding_v2(jsonb)') is null
     or pg_catalog.to_regprocedure('auth.uid()') is null
     or pg_catalog.to_regprocedure('pg_catalog.sha256(bytea)') is null then
    raise exception 'Nutrição V1 requires the reviewed Onboarding V2.1 foundation';
  end if;

  if pg_catalog.to_regprocedure('public.complete_onboarding_v21_internal(jsonb)') is not null then
    raise exception 'Internal V2.1 completion function already exists; audit before proceeding';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.nutrition_profiles'::regclass
      and attname in ('activity_level', 'preferred_meals_per_day')
      and attnum > 0 and not attisdropped
  ) then
    raise exception 'Nutrição V1 onboarding columns already exist; audit before proceeding';
  end if;
end
$preflight$;

lock table public.nutrition_profiles, public.onboarding_completion_receipts
  in access exclusive mode;

alter table public.nutrition_profiles
  add column activity_level text,
  add column preferred_meals_per_day smallint,
  add constraint nutrition_profiles_activity_level_check check (
    activity_level is null or activity_level in ('sedentary', 'light', 'moderate', 'high')
  ),
  add constraint nutrition_profiles_preferred_meals_per_day_check check (
    preferred_meals_per_day is null or preferred_meals_per_day between 2 and 6
  );

comment on column public.nutrition_profiles.activity_level is
  'Total daily activity declared by the user; distinct from training frequency.';
comment on column public.nutrition_profiles.preferred_meals_per_day is
  'Nullable user preference. NULL is not a declared preference and must not be relabeled as one.';

create table public.nutrition_target_snapshots (
  id uuid constraint nutrition_target_snapshots_pkey primary key default gen_random_uuid(),
  user_id uuid not null,
  version integer not null,
  algorithm_version text not null,
  source text not null,
  status text not null,
  effective_from date not null,
  effective_until date,
  weight_kg numeric(7,2),
  height_cm numeric(6,2),
  age_years smallint,
  biological_sex_basis text,
  activity_level text,
  activity_multiplier numeric(6,4),
  goal text,
  goal_adjustment numeric(6,4),
  bmr numeric(9,2),
  tdee numeric(9,2),
  calories numeric(9,2),
  protein_g numeric(8,2),
  carbs_g numeric(8,2),
  fat_g numeric(8,2),
  fiber_g numeric(8,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint nutrition_target_snapshots_user_version_unique unique (user_id, version),
  constraint nutrition_target_snapshots_user_fk foreign key (user_id)
    references auth.users(id) on delete cascade,
  constraint nutrition_target_snapshots_version_check check (version > 0),
  constraint nutrition_target_snapshots_algorithm_check check (btrim(algorithm_version) <> ''),
  constraint nutrition_target_snapshots_source_check check (
    source in ('calculated', 'manual_review', 'recalculation')
  ),
  constraint nutrition_target_snapshots_status_check check (
    status in ('active', 'requires_review', 'superseded')
  ),
  constraint nutrition_target_snapshots_effective_range_check check (
    effective_until is null or effective_until > effective_from
  ),
  constraint nutrition_target_snapshots_active_open_check check (
    status <> 'active' or effective_until is null
  ),
  constraint nutrition_target_snapshots_superseded_closed_check check (
    status <> 'superseded' or effective_until is not null
  ),
  constraint nutrition_target_snapshots_sex_basis_check check (
    biological_sex_basis is null or biological_sex_basis in ('male', 'female')
  ),
  constraint nutrition_target_snapshots_activity_check check (
    activity_level is null or activity_level in ('sedentary', 'light', 'moderate', 'high')
  ),
  constraint nutrition_target_snapshots_goal_check check (
    goal is null or goal in (
      'fat_loss', 'body_recomposition', 'hypertrophy',
      'strength', 'conditioning', 'health'
    )
  ),
  constraint nutrition_target_snapshots_positive_inputs_check check (
    (weight_kg is null or weight_kg > 0)
    and (height_cm is null or height_cm > 0)
    and (age_years is null or age_years >= 0)
    and (activity_multiplier is null or activity_multiplier > 0)
    and (goal_adjustment is null or goal_adjustment > 0)
  ),
  constraint nutrition_target_snapshots_positive_outputs_check check (
    (bmr is null or bmr > 0)
    and (tdee is null or tdee > 0)
    and (calories is null or calories > 0)
    and (protein_g is null or protein_g > 0)
    and (carbs_g is null or carbs_g >= 0)
    and (fat_g is null or fat_g > 0)
    and (fiber_g is null or fiber_g > 0)
  ),
  constraint nutrition_target_snapshots_active_complete_check check (
    status <> 'active' or (
      weight_kg is not null and height_cm is not null and age_years is not null
      and biological_sex_basis is not null and activity_level is not null
      and activity_multiplier is not null and goal is not null and goal_adjustment is not null
      and bmr is not null and tdee is not null and calories is not null
      and protein_g is not null and carbs_g is not null and fat_g is not null
      and fiber_g is not null
    )
  ),
  constraint nutrition_target_snapshots_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create index nutrition_target_snapshots_user_effective_idx
  on public.nutrition_target_snapshots (user_id, effective_from desc, version desc);

create unique index nutrition_target_snapshots_one_active_per_user_unique
  on public.nutrition_target_snapshots (user_id)
  where status = 'active' and effective_until is null;

comment on table public.nutrition_target_snapshots is
  'Append-oriented, versioned nutrition targets. Recalculation closes the prior active row and inserts a new version in one server transaction.';
comment on column public.nutrition_target_snapshots.metadata is
  'Review reasons and calculation provenance. Review thresholds are routing gates, not clinical safety limits.';

alter table public.nutrition_target_snapshots enable row level security;

create policy nutrition_target_snapshots_select_own
  on public.nutrition_target_snapshots for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.nutrition_target_snapshots from public, anon, authenticated;
grant select on table public.nutrition_target_snapshots to authenticated;
grant select, insert, update, delete on table public.nutrition_target_snapshots to service_role;

-- Keep schema-2 clients working while schema 4 adds the two Nutrição V1
-- inputs. The wrapper owns replay semantics for schema 4 and delegates the
-- legacy domain writes to the already-reviewed V2.1 function atomically.
alter function public.complete_onboarding_v2(jsonb)
  rename to complete_onboarding_v21_internal;

revoke all on function public.complete_onboarding_v21_internal(jsonb)
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
  v_nutrition jsonb;
  v_activity_level text;
  v_preferred_meals_per_day smallint;
  v_legacy_payload jsonb;
  v_payload_hash bytea;
  v_legacy_result record;
begin
  if pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Payload must be an object';
  end if;

  if p_payload->'payload_schema_version' = '2'::jsonb then
    return query
      select legacy.result, legacy.onboarding_version, legacy.completed_at
      from public.complete_onboarding_v21_internal(p_payload) as legacy;
    return;
  end if;

  if p_payload->'payload_schema_version' <> '4'::jsonb then
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

  if pg_catalog.jsonb_typeof(p_payload->'health') <> 'object'
     or pg_catalog.jsonb_typeof(p_payload->'nutrition') <> 'object' then
    raise exception using errcode = '22023', message = 'Health and nutrition must be objects';
  end if;

  v_activity_level := p_payload->'health'->>'activity_level';
  if v_activity_level is null
     or v_activity_level not in ('sedentary', 'light', 'moderate', 'high') then
    raise exception using errcode = '22023', message = 'Invalid activity_level';
  end if;

  v_nutrition := p_payload->'nutrition';
  if not (v_nutrition ? 'preferred_meals_per_day') then
    raise exception using errcode = '22023', message = 'preferred_meals_per_day is required';
  end if;
  if v_nutrition->'preferred_meals_per_day' <> 'null'::jsonb then
    if pg_catalog.jsonb_typeof(v_nutrition->'preferred_meals_per_day') <> 'number'
       or (v_nutrition->>'preferred_meals_per_day') !~ '^[0-9]+$'
       or (v_nutrition->>'preferred_meals_per_day')::integer not between 2 and 6 then
      raise exception using errcode = '22023', message = 'Invalid preferred_meals_per_day';
    end if;
    v_preferred_meals_per_day := (v_nutrition->>'preferred_meals_per_day')::smallint;
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
    pg_catalog.convert_to((p_payload - 'idempotency_key')::text, 'UTF8')
  );

  select r.* into v_receipt
  from public.onboarding_completion_receipts r
  where r.user_id = v_user_id and r.onboarding_version = 2;

  if found then
    if v_profile_completed is true
       and v_profile_version = 2
       and v_profile_completed_at is not null
       and v_profile_completed_at = v_receipt.completed_at
       and v_receipt.payload_schema_version = 4
       and v_receipt.canonicalization_version = 4
       and v_receipt.idempotency_key = v_idempotency_key
       and v_receipt.payload_hash = v_payload_hash then
      return query select 'replay'::text, 2::smallint, v_receipt.completed_at;
      return;
    end if;
    raise exception using errcode = '23505', message = 'Onboarding V2 already has a conflicting completion receipt';
  end if;

  v_legacy_payload := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      p_payload,
      '{payload_schema_version}',
      '2'::jsonb
    ),
    '{health}',
    (p_payload->'health') - 'activity_level'
  );
  v_legacy_payload := pg_catalog.jsonb_set(
    v_legacy_payload,
    '{nutrition}',
    v_nutrition - 'preferred_meals_per_day'
  );

  select legacy.result, legacy.onboarding_version, legacy.completed_at
  into strict v_legacy_result
  from public.complete_onboarding_v21_internal(v_legacy_payload) as legacy;

  if v_legacy_result.result <> 'completed' then
    raise exception using errcode = '55000', message = 'Unexpected legacy onboarding completion state';
  end if;

  update public.nutrition_profiles n
  set activity_level = v_activity_level,
      preferred_meals_per_day = v_preferred_meals_per_day
  where n.user_id = v_user_id;
  if not found then
    raise exception using errcode = '55000', message = 'Nutrition profile was not created';
  end if;

  update public.onboarding_completion_receipts r
  set payload_hash = v_payload_hash,
      payload_schema_version = 4,
      canonicalization_version = 4
  where r.user_id = v_user_id
    and r.onboarding_version = 2
    and r.idempotency_key = v_idempotency_key
    and r.payload_schema_version = 2
    and r.canonicalization_version = 2;
  if not found then
    raise exception using errcode = '55000', message = 'Onboarding receipt upgrade failed';
  end if;

  return query
    select 'completed'::text, 2::smallint, v_legacy_result.completed_at::timestamptz;
end
$function$;

revoke all on function public.complete_onboarding_v2(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_onboarding_v2(jsonb) to authenticated;
grant execute on function public.complete_onboarding_v2(jsonb) to service_role;

do $postcondition$
begin
  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'public.nutrition_target_snapshots'::regclass
  ) then
    raise exception 'nutrition_target_snapshots must keep RLS enabled';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.nutrition_target_snapshots', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.nutrition_target_snapshots', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.nutrition_target_snapshots', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.nutrition_target_snapshots', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.nutrition_target_snapshots', 'DELETE')
     or not pg_catalog.has_table_privilege('authenticated', 'public.nutrition_target_snapshots', 'SELECT') then
    raise exception 'Unexpected nutrition target client privileges';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.complete_onboarding_v2(jsonb)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.complete_onboarding_v2(jsonb)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.complete_onboarding_v21_internal(jsonb)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.complete_onboarding_v21_internal(jsonb)', 'EXECUTE') then
    raise exception 'Unexpected onboarding completion function privileges';
  end if;
end
$postcondition$;

commit;
