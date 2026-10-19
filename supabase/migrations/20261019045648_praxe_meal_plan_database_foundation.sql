-- PRAXE Intelligence 3B4–3B6: trusted food catalog, server-managed
-- meal-plan persistence, validated activation, and generation lifecycle. Local migration only.
begin;

set local lock_timeout = '5s';

do $preflight$
begin
  if pg_catalog.to_regclass('public.nutrition_target_snapshots') is null
     or pg_catalog.to_regprocedure('public.reward_system_set_updated_at()') is null
     or pg_catalog.to_regprocedure('auth.uid()') is null then
    raise exception 'Meal-plan foundation requires nutrition targets, auth.uid(), and updated_at helper';
  end if;

  if pg_catalog.to_regclass('public.nutrition_food_catalog') is not null
     or pg_catalog.to_regclass('public.nutrition_food_aliases') is not null
     or pg_catalog.to_regclass('public.nutrition_food_portions') is not null
     or pg_catalog.to_regclass('public.nutrition_meal_plans') is not null
     or pg_catalog.to_regclass('public.nutrition_meal_plan_meals') is not null
     or pg_catalog.to_regclass('public.nutrition_meal_plan_items') is not null
     or pg_catalog.to_regclass('public.nutrition_plan_generation_jobs') is not null then
    raise exception 'Meal-plan foundation already exists; audit before proceeding';
  end if;
end
$preflight$;

alter table public.nutrition_target_snapshots
  add constraint nutrition_target_snapshots_id_user_unique unique (id, user_id);

create table public.nutrition_food_catalog (
  id uuid constraint nutrition_food_catalog_pkey primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text not null,
  source text not null,
  source_food_id text not null,
  source_version text not null,
  source_reference text not null,
  food_group text not null,
  preparation_state text not null,
  calories_per_100g numeric(9,3),
  protein_g_per_100g numeric(8,3),
  carbs_g_per_100g numeric(8,3),
  fat_g_per_100g numeric(8,3),
  fiber_g_per_100g numeric(8,3),
  nutrient_completeness text not null,
  edible_portion numeric(6,5),
  density_g_per_ml numeric(7,4),
  data_quality text not null,
  catalog_scope text not null default 'PRODUCTION',
  dietary_tags text[] not null default '{}'::text[],
  allergen_tags text[] not null default '{}'::text[],
  allergen_data_complete boolean not null default false,
  food_role text,
  budget_tier text,
  preparation_complexity text,
  source_metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nutrition_food_catalog_source_version_unique
    unique (source, source_food_id, source_version),
  constraint nutrition_food_catalog_id_source_version_unique
    unique (id, source, source_version),
  constraint nutrition_food_catalog_names_check check (
    btrim(canonical_name) <> '' and btrim(normalized_name) <> ''
  ),
  constraint nutrition_food_catalog_source_check check (
    source in ('TBCA', 'TACO', 'MANUAL_CURATED', 'FUTURE_PROVIDER')
  ),
  constraint nutrition_food_catalog_provenance_check check (
    btrim(source_food_id) <> '' and btrim(source_version) <> '' and btrim(source_reference) <> ''
  ),
  constraint nutrition_food_catalog_classification_check check (
    btrim(food_group) <> '' and btrim(preparation_state) <> ''
  ),
  constraint nutrition_food_catalog_nutrients_check check (
    (calories_per_100g is null or calories_per_100g between 0 and 1000)
    and (protein_g_per_100g is null or protein_g_per_100g between 0 and 100)
    and (carbs_g_per_100g is null or carbs_g_per_100g between 0 and 100)
    and (fat_g_per_100g is null or fat_g_per_100g between 0 and 100)
    and (fiber_g_per_100g is null or fiber_g_per_100g between 0 and 100)
  ),
  constraint nutrition_food_catalog_completeness_check check (
    (nutrient_completeness = 'COMPLETE' and num_nonnulls(
      calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, fiber_g_per_100g
    ) = 5)
    or (nutrient_completeness = 'PARTIAL' and num_nonnulls(
      calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, fiber_g_per_100g
    ) = 4)
    or (nutrient_completeness = 'INSUFFICIENT' and num_nonnulls(
      calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, fiber_g_per_100g
    ) < 4)
  ),
  constraint nutrition_food_catalog_portion_density_check check (
    (edible_portion is null or edible_portion > 0 and edible_portion <= 1)
    and (density_g_per_ml is null or density_g_per_ml > 0 and density_g_per_ml <= 5)
  ),
  constraint nutrition_food_catalog_data_quality_check check (
    data_quality in ('ANALYTICAL', 'CALCULATED', 'ATTRIBUTED', 'IMPORTED')
  ),
  constraint nutrition_food_catalog_scope_check check (catalog_scope in ('PRODUCTION', 'TEST_ONLY')),
  constraint nutrition_food_catalog_dietary_tags_check check (
    dietary_tags <@ array['vegan', 'vegetarian']::text[]
  ),
  constraint nutrition_food_catalog_allergen_tags_check check (
    allergen_tags <@ array[
      'contains_milk', 'contains_gluten', 'contains_egg', 'contains_fish',
      'contains_shellfish', 'contains_peanut', 'contains_tree_nut', 'contains_soy'
    ]::text[]
  ),
  constraint nutrition_food_catalog_optional_metadata_check check (
    (food_role is null or food_role in ('protein', 'carb', 'fat', 'fruit', 'vegetable', 'mixed'))
    and (budget_tier is null or budget_tier in ('economical', 'standard', 'premium'))
    and (preparation_complexity is null or preparation_complexity in ('low', 'medium', 'high'))
  ),
  constraint nutrition_food_catalog_source_metadata_check check (jsonb_typeof(source_metadata) = 'object')
);

create unique index nutrition_food_catalog_one_active_source_entry_unique
  on public.nutrition_food_catalog (source, source_food_id)
  where is_active;

create index nutrition_food_catalog_normalized_name_idx
  on public.nutrition_food_catalog (normalized_name)
  where is_active;

create index nutrition_food_catalog_group_idx
  on public.nutrition_food_catalog (food_group)
  where is_active and catalog_scope = 'PRODUCTION';

create table public.nutrition_food_aliases (
  id uuid constraint nutrition_food_aliases_pkey primary key default gen_random_uuid(),
  food_id uuid not null references public.nutrition_food_catalog(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  locale text not null default 'pt-BR',
  source text not null,
  confidence text not null,
  created_at timestamptz not null default now(),

  constraint nutrition_food_aliases_food_normalized_unique unique (food_id, normalized_alias, locale),
  constraint nutrition_food_aliases_text_check check (
    btrim(alias) <> '' and btrim(normalized_alias) <> '' and btrim(locale) <> ''
  ),
  constraint nutrition_food_aliases_source_check check (
    source in ('TBCA', 'TACO', 'MANUAL_CURATED', 'FUTURE_PROVIDER')
  ),
  constraint nutrition_food_aliases_confidence_check check (
    confidence in ('CURATED', 'SOURCE_PROVIDED')
  )
);

create index nutrition_food_aliases_lookup_idx
  on public.nutrition_food_aliases (normalized_alias, locale);

create table public.nutrition_food_portions (
  id uuid constraint nutrition_food_portions_pkey primary key default gen_random_uuid(),
  food_id uuid not null references public.nutrition_food_catalog(id) on delete cascade,
  label text not null,
  grams numeric(10,3) not null,
  locale text not null default 'pt-BR',
  source text not null,
  source_reference text not null,
  created_at timestamptz not null default now(),

  constraint nutrition_food_portions_food_label_unique unique (food_id, label, locale),
  constraint nutrition_food_portions_label_check check (btrim(label) <> '' and btrim(locale) <> ''),
  constraint nutrition_food_portions_grams_check check (grams > 0 and grams <= 5000),
  constraint nutrition_food_portions_source_check check (
    source in ('TBCA', 'TACO', 'MANUAL_CURATED', 'FUTURE_PROVIDER') and btrim(source_reference) <> ''
  )
);

create index nutrition_food_portions_food_idx
  on public.nutrition_food_portions (food_id);

create table public.nutrition_meal_plans (
  id uuid constraint nutrition_meal_plans_pkey primary key default gen_random_uuid(),
  user_id uuid not null,
  nutrition_target_snapshot_id uuid not null,
  version integer not null,
  status text not null,
  strategy_version text not null,
  meal_distribution_version text not null,
  generator_version text not null,
  validator_version text not null,
  validation_policy_version text not null,
  generation_source text not null,
  recommended_meals_per_day smallint not null,
  valid_from date,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nutrition_meal_plans_id_user_unique unique (id, user_id),
  constraint nutrition_meal_plans_user_version_unique unique (user_id, version),
  constraint nutrition_meal_plans_target_strategy_unique
    unique (nutrition_target_snapshot_id, strategy_version, generator_version),
  constraint nutrition_meal_plans_user_fk foreign key (user_id)
    references auth.users(id) on delete cascade,
  constraint nutrition_meal_plans_target_user_fk
    foreign key (nutrition_target_snapshot_id, user_id)
    references public.nutrition_target_snapshots (id, user_id) on delete cascade,
  constraint nutrition_meal_plans_version_check check (version > 0),
  constraint nutrition_meal_plans_status_check check (
    status in ('pending', 'generating', 'active', 'failed_retryable', 'requires_review', 'superseded')
  ),
  constraint nutrition_meal_plans_strategy_version_check check (
    btrim(strategy_version) <> '' and btrim(generator_version) <> ''
    and btrim(validator_version) <> '' and btrim(validation_policy_version) <> ''
  ),
  constraint nutrition_meal_plans_distribution_version_check check (btrim(meal_distribution_version) <> ''),
  constraint nutrition_meal_plans_generation_source_check check (
    generation_source in ('deterministic_engine', 'manual_review', 'ai_assisted')
  ),
  constraint nutrition_meal_plans_meal_count_check check (recommended_meals_per_day between 3 and 5),
  constraint nutrition_meal_plans_lifecycle_check check (
    (status = 'active' and valid_from is not null and superseded_at is null)
    or (status = 'superseded' and superseded_at is not null)
    or (status not in ('active', 'superseded') and superseded_at is null)
  )
);

create unique index nutrition_meal_plans_one_active_per_user_unique
  on public.nutrition_meal_plans (user_id)
  where status = 'active';

create index nutrition_meal_plans_user_history_idx
  on public.nutrition_meal_plans (user_id, version desc, created_at desc);

create index nutrition_meal_plans_target_idx
  on public.nutrition_meal_plans (nutrition_target_snapshot_id);

create table public.nutrition_meal_plan_meals (
  id uuid constraint nutrition_meal_plan_meals_pkey primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.nutrition_meal_plans(id) on delete cascade,
  position smallint not null,
  role text not null,
  label text not null,
  window_start time not null,
  window_end time not null,
  window_start_day_offset smallint not null default 0,
  window_end_day_offset smallint not null default 0,
  target_calories numeric(9,2) not null,
  target_protein_g numeric(8,2) not null,
  target_carbs_g numeric(8,2) not null,
  target_fat_g numeric(8,2) not null,
  target_fiber_g numeric(8,2) not null,
  created_at timestamptz not null default now(),

  constraint nutrition_meal_plan_meals_position_unique unique (meal_plan_id, position),
  constraint nutrition_meal_plan_meals_position_check check (position between 1 and 5),
  constraint nutrition_meal_plan_meals_role_check check (
    role in ('BREAKFAST', 'MAIN_MEAL', 'PRE_WORKOUT', 'POST_WORKOUT', 'SNACK', 'EVENING_MEAL')
  ),
  constraint nutrition_meal_plan_meals_label_check check (btrim(label) <> '' and char_length(label) <= 120),
  constraint nutrition_meal_plan_meals_window_offset_check check (
    window_start_day_offset between 0 and 1
    and window_end_day_offset between 0 and 1
    and (
      window_end_day_offset > window_start_day_offset
      or (window_end_day_offset = window_start_day_offset and window_end > window_start)
    )
  ),
  constraint nutrition_meal_plan_meals_macro_check check (
    target_calories > 0 and target_protein_g > 0 and target_carbs_g >= 0
    and target_fat_g > 0 and target_fiber_g >= 0
  )
);

create index nutrition_meal_plan_meals_plan_idx
  on public.nutrition_meal_plan_meals (meal_plan_id, position);

create table public.nutrition_meal_plan_items (
  id uuid constraint nutrition_meal_plan_items_pkey primary key default gen_random_uuid(),
  meal_id uuid not null references public.nutrition_meal_plan_meals(id) on delete cascade,
  food_catalog_entry_id uuid not null,
  position smallint not null,
  food_name text not null,
  quantity_value numeric(10,3) not null,
  quantity_unit text not null,
  quantity_grams numeric(10,3) not null,
  catalog_source text not null,
  catalog_source_version text not null,
  calories numeric(9,2) not null,
  protein_g numeric(8,2) not null,
  carbs_g numeric(8,2) not null,
  fat_g numeric(8,2) not null,
  fiber_g numeric(8,2) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint nutrition_meal_plan_items_position_unique unique (meal_id, position),
  constraint nutrition_meal_plan_items_catalog_version_fk
    foreign key (food_catalog_entry_id, catalog_source, catalog_source_version)
    references public.nutrition_food_catalog (id, source, source_version) on delete restrict,
  constraint nutrition_meal_plan_items_position_check check (position > 0),
  constraint nutrition_meal_plan_items_food_name_check check (btrim(food_name) <> '' and char_length(food_name) <= 200),
  constraint nutrition_meal_plan_items_quantity_check check (
    quantity_value > 0 and quantity_unit in ('g', 'kg', 'ml', 'known_portion')
    and quantity_grams > 0 and quantity_grams <= 5000
  ),
  constraint nutrition_meal_plan_items_catalog_snapshot_check check (
    catalog_source in ('TBCA', 'TACO', 'MANUAL_CURATED', 'FUTURE_PROVIDER')
    and btrim(catalog_source_version) <> ''
  ),
  constraint nutrition_meal_plan_items_macro_check check (
    calories >= 0 and protein_g >= 0 and carbs_g >= 0 and fat_g >= 0 and fiber_g >= 0
  ),
  constraint nutrition_meal_plan_items_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index nutrition_meal_plan_items_meal_idx
  on public.nutrition_meal_plan_items (meal_id, position);

create index nutrition_meal_plan_items_catalog_entry_idx
  on public.nutrition_meal_plan_items (food_catalog_entry_id);

create table public.nutrition_plan_generation_jobs (
  id uuid constraint nutrition_plan_generation_jobs_pkey primary key default gen_random_uuid(),
  user_id uuid not null,
  nutrition_target_snapshot_id uuid not null,
  meal_plan_id uuid,
  strategy_version text not null,
  meal_distribution_version text not null,
  generator_version text not null,
  status text not null,
  attempt_count smallint not null default 0,
  last_error_code text,
  last_error_message_safe text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint nutrition_plan_generation_jobs_idempotency_unique unique (idempotency_key),
  constraint nutrition_plan_generation_jobs_target_strategy_unique
    unique (nutrition_target_snapshot_id, strategy_version, generator_version),
  constraint nutrition_plan_generation_jobs_user_fk foreign key (user_id)
    references auth.users(id) on delete cascade,
  constraint nutrition_plan_generation_jobs_target_user_fk
    foreign key (nutrition_target_snapshot_id, user_id)
    references public.nutrition_target_snapshots (id, user_id) on delete cascade,
  constraint nutrition_plan_generation_jobs_plan_user_fk
    foreign key (meal_plan_id, user_id)
    references public.nutrition_meal_plans (id, user_id) on delete cascade,
  constraint nutrition_plan_generation_jobs_status_check check (
    status in ('pending', 'generating', 'succeeded', 'failed_retryable', 'requires_review', 'cancelled')
  ),
  constraint nutrition_plan_generation_jobs_attempt_count_check check (attempt_count >= 0),
  constraint nutrition_plan_generation_jobs_versions_check check (
    btrim(strategy_version) <> '' and btrim(meal_distribution_version) <> '' and btrim(generator_version) <> ''
  ),
  constraint nutrition_plan_generation_jobs_error_check check (
    (last_error_code is null or (btrim(last_error_code) <> '' and char_length(last_error_code) <= 100))
    and (last_error_message_safe is null or char_length(last_error_message_safe) <= 500)
  ),
  constraint nutrition_plan_generation_jobs_idempotency_key_check check (
    btrim(idempotency_key) <> '' and char_length(idempotency_key) <= 300
  ),
  constraint nutrition_plan_generation_jobs_timestamps_check check (
    (started_at is null or started_at >= created_at)
    and (completed_at is null or completed_at >= coalesce(started_at, created_at))
    and (status <> 'generating' or started_at is not null)
    and (status not in ('succeeded', 'cancelled') or completed_at is not null)
    and (status <> 'succeeded' or meal_plan_id is not null)
  )
);

create index nutrition_plan_generation_jobs_user_status_idx
  on public.nutrition_plan_generation_jobs (user_id, status, created_at desc);

create index nutrition_plan_generation_jobs_target_idx
  on public.nutrition_plan_generation_jobs (nutrition_target_snapshot_id);

create trigger nutrition_meal_plans_set_updated_at
before update on public.nutrition_meal_plans
for each row execute function public.reward_system_set_updated_at();

create trigger nutrition_food_catalog_set_updated_at
before update on public.nutrition_food_catalog
for each row execute function public.reward_system_set_updated_at();

create trigger nutrition_plan_generation_jobs_set_updated_at
before update on public.nutrition_plan_generation_jobs
for each row execute function public.reward_system_set_updated_at();

create function public.nutrition_meal_plan_validate_target_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_target_status text;
begin
  select target.status into v_target_status
  from public.nutrition_target_snapshots as target
  where target.id = new.nutrition_target_snapshot_id
    and target.user_id = new.user_id;
  if not found then
    raise exception using errcode = '23503', message = 'Nutrition target snapshot does not belong to meal-plan user';
  end if;
  if new.status = 'active' and v_target_status <> 'active' then
    raise exception using errcode = '23514', message = 'Nutrition target requires review before meal-plan activation';
  end if;
  if v_target_status = 'requires_review' and new.status <> 'requires_review' then
    raise exception using errcode = '23514', message = 'Nutrition target requires review before meal-plan activation';
  end if;
  if v_target_status = 'superseded' and new.status <> 'superseded' then
    raise exception using errcode = '23514', message = 'Superseded nutrition target cannot create a current meal plan';
  end if;
  return new;
end
$function$;

create function public.nutrition_generation_job_validate_target_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_target_status text;
begin
  select target.status into v_target_status
  from public.nutrition_target_snapshots as target
  where target.id = new.nutrition_target_snapshot_id
    and target.user_id = new.user_id;
  if not found then
    raise exception using errcode = '23503', message = 'Nutrition target snapshot does not belong to generation-job user';
  end if;
  if v_target_status = 'requires_review' and new.status <> 'requires_review' then
    raise exception using errcode = '23514', message = 'Review-required target must keep generation job in requires_review';
  end if;
  if v_target_status = 'superseded' and new.status <> 'cancelled' then
    raise exception using errcode = '23514', message = 'Superseded nutrition target cannot start a generation job';
  end if;
  return new;
end
$function$;

create function public.nutrition_supersede_plans_with_target()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.status = 'superseded' and old.status is distinct from new.status then
    update public.nutrition_meal_plans
    set status = 'superseded', superseded_at = coalesce(superseded_at, now())
    where nutrition_target_snapshot_id = new.id and status = 'active';

    update public.nutrition_plan_generation_jobs
    set status = 'cancelled', completed_at = coalesce(completed_at, now())
    where nutrition_target_snapshot_id = new.id and status in ('pending', 'generating');
  end if;
  return new;
end
$function$;

create trigger nutrition_meal_plans_validate_target_state
before insert or update of user_id, nutrition_target_snapshot_id, status
on public.nutrition_meal_plans
for each row execute function public.nutrition_meal_plan_validate_target_state();

create trigger nutrition_generation_jobs_validate_target_state
before insert or update of user_id, nutrition_target_snapshot_id, status
on public.nutrition_plan_generation_jobs
for each row execute function public.nutrition_generation_job_validate_target_state();

create trigger nutrition_targets_supersede_meal_plans
after update of status on public.nutrition_target_snapshots
for each row execute function public.nutrition_supersede_plans_with_target();

create function public.begin_nutrition_plan_generation_job_v1(
  p_user_id uuid, p_target_snapshot_id uuid, p_strategy_version text,
  p_meal_distribution_version text, p_generator_version text, p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.nutrition_plan_generation_jobs (
    user_id, nutrition_target_snapshot_id, strategy_version, meal_distribution_version,
    generator_version, status, attempt_count, idempotency_key, started_at
  ) values (
    p_user_id, p_target_snapshot_id, p_strategy_version, p_meal_distribution_version,
    p_generator_version, 'generating', 1, p_idempotency_key, now()
  )
  on conflict (idempotency_key) do update set
    status = case when nutrition_plan_generation_jobs.status = 'succeeded' then 'succeeded' else 'generating' end,
    attempt_count = case when nutrition_plan_generation_jobs.status = 'succeeded'
      then nutrition_plan_generation_jobs.attempt_count else nutrition_plan_generation_jobs.attempt_count + 1 end,
    last_error_code = null, last_error_message_safe = null,
    started_at = case when nutrition_plan_generation_jobs.status = 'succeeded'
      then nutrition_plan_generation_jobs.started_at else now() end,
    completed_at = case when nutrition_plan_generation_jobs.status = 'succeeded'
      then nutrition_plan_generation_jobs.completed_at else null end;
end
$function$;

create function public.finish_nutrition_plan_generation_job_v1(
  p_idempotency_key text, p_status text, p_safe_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_status not in ('failed_retryable', 'requires_review')
     or p_safe_error_code is null or btrim(p_safe_error_code) = '' or char_length(p_safe_error_code) > 100 then
    raise exception using errcode = '22023', message = 'Invalid safe generation-job outcome';
  end if;
  update public.nutrition_plan_generation_jobs
  set status = p_status, last_error_code = p_safe_error_code,
      last_error_message_safe = null, completed_at = now()
  where idempotency_key = p_idempotency_key and status <> 'succeeded';
  if not found then
    raise exception using errcode = 'P0002', message = 'Generation job not found or already succeeded';
  end if;
end
$function$;

create function public.activate_nutrition_meal_plan_v1(
  p_user_id uuid,
  p_target_snapshot_id uuid,
  p_strategy_version text,
  p_meal_distribution_version text,
  p_generator_version text,
  p_validator_version text,
  p_validation_policy_version text,
  p_idempotency_key text,
  p_recommended_meals_per_day smallint,
  p_meals jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan_id uuid;
  v_meal_id uuid;
  v_version integer;
  v_meal jsonb;
  v_item jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  if pg_catalog.jsonb_typeof(p_meals) <> 'array'
     or pg_catalog.jsonb_array_length(p_meals) <> p_recommended_meals_per_day then
    raise exception using errcode = '22023', message = 'Validated meal payload does not match prescribed meal count';
  end if;
  if not exists (
    select 1 from public.nutrition_target_snapshots t
    where t.id = p_target_snapshot_id and t.user_id = p_user_id and t.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'Active nutrition target is required';
  end if;

  select p.id into v_plan_id
  from public.nutrition_meal_plans p
  where p.nutrition_target_snapshot_id = p_target_snapshot_id
    and p.strategy_version = p_strategy_version
    and p.generator_version = p_generator_version
    and p.status = 'active';
  if found then return v_plan_id; end if;

  insert into public.nutrition_plan_generation_jobs (
    user_id, nutrition_target_snapshot_id, strategy_version, meal_distribution_version,
    generator_version, status, attempt_count, idempotency_key, started_at
  ) values (
    p_user_id, p_target_snapshot_id, p_strategy_version, p_meal_distribution_version,
    p_generator_version, 'generating', 1, p_idempotency_key, now()
  )
  on conflict (idempotency_key) do update set
    status = 'generating',
    last_error_code = null, last_error_message_safe = null, started_at = now(), completed_at = null;

  update public.nutrition_meal_plans
  set status = 'superseded', superseded_at = now()
  where user_id = p_user_id and status = 'active';

  select coalesce(max(p.version), 0) + 1 into v_version
  from public.nutrition_meal_plans p where p.user_id = p_user_id;

  insert into public.nutrition_meal_plans (
    user_id, nutrition_target_snapshot_id, version, status, strategy_version,
    meal_distribution_version, generator_version, validator_version, validation_policy_version,
    generation_source, recommended_meals_per_day, valid_from
  ) values (
    p_user_id, p_target_snapshot_id, v_version, 'active', p_strategy_version,
    p_meal_distribution_version, p_generator_version, p_validator_version, p_validation_policy_version,
    'ai_assisted', p_recommended_meals_per_day, current_date
  ) returning id into v_plan_id;

  for v_meal in select value from pg_catalog.jsonb_array_elements(p_meals) loop
    insert into public.nutrition_meal_plan_meals (
      meal_plan_id, position, role, label, window_start, window_end,
      window_start_day_offset, window_end_day_offset, target_calories,
      target_protein_g, target_carbs_g, target_fat_g, target_fiber_g
    ) values (
      v_plan_id, (v_meal->>'position')::smallint, v_meal->>'role', v_meal->>'label',
      (v_meal->>'window_start')::time, (v_meal->>'window_end')::time,
      (v_meal->>'window_start_day_offset')::smallint, (v_meal->>'window_end_day_offset')::smallint,
      (v_meal->>'target_calories')::numeric, (v_meal->>'target_protein_g')::numeric,
      (v_meal->>'target_carbs_g')::numeric, (v_meal->>'target_fat_g')::numeric,
      (v_meal->>'target_fiber_g')::numeric
    ) returning id into v_meal_id;

    for v_item in select value from pg_catalog.jsonb_array_elements(v_meal->'items') loop
      insert into public.nutrition_meal_plan_items (
        meal_id, food_catalog_entry_id, position, food_name, quantity_value, quantity_unit,
        quantity_grams, catalog_source, catalog_source_version, calories, protein_g,
        carbs_g, fat_g, fiber_g, metadata
      ) values (
        v_meal_id, (v_item->>'food_catalog_entry_id')::uuid, (v_item->>'position')::smallint,
        v_item->>'food_name', (v_item->>'quantity_grams')::numeric, 'g',
        (v_item->>'quantity_grams')::numeric, v_item->>'catalog_source', v_item->>'catalog_source_version',
        (v_item->>'calories')::numeric, (v_item->>'protein_g')::numeric,
        (v_item->>'carbs_g')::numeric, (v_item->>'fat_g')::numeric,
        (v_item->>'fiber_g')::numeric, coalesce(v_item->'metadata', '{}'::jsonb)
      );
    end loop;
  end loop;

  update public.nutrition_plan_generation_jobs
  set status = 'succeeded', meal_plan_id = v_plan_id, completed_at = now()
  where idempotency_key = p_idempotency_key;
  return v_plan_id;
exception when others then
  raise;
end
$function$;

alter table public.nutrition_food_catalog enable row level security;
alter table public.nutrition_food_aliases enable row level security;
alter table public.nutrition_food_portions enable row level security;
alter table public.nutrition_meal_plans enable row level security;
alter table public.nutrition_meal_plan_meals enable row level security;
alter table public.nutrition_meal_plan_items enable row level security;
alter table public.nutrition_plan_generation_jobs enable row level security;

create policy nutrition_meal_plans_select_own
  on public.nutrition_meal_plans for select to authenticated
  using ((select auth.uid()) = user_id);

create policy nutrition_food_catalog_select_active
  on public.nutrition_food_catalog for select to authenticated
  using (is_active and catalog_scope = 'PRODUCTION');

create policy nutrition_food_aliases_select_active
  on public.nutrition_food_aliases for select to authenticated
  using (exists (
    select 1 from public.nutrition_food_catalog as food
    where food.id = food_id and food.is_active and food.catalog_scope = 'PRODUCTION'
  ));

create policy nutrition_food_portions_select_active
  on public.nutrition_food_portions for select to authenticated
  using (exists (
    select 1 from public.nutrition_food_catalog as food
    where food.id = food_id and food.is_active and food.catalog_scope = 'PRODUCTION'
  ));

create policy nutrition_meal_plan_meals_select_own
  on public.nutrition_meal_plan_meals for select to authenticated
  using (exists (
    select 1 from public.nutrition_meal_plans as plan
    where plan.id = meal_plan_id and plan.user_id = (select auth.uid())
  ));

create policy nutrition_meal_plan_items_select_own
  on public.nutrition_meal_plan_items for select to authenticated
  using (exists (
    select 1
    from public.nutrition_meal_plan_meals as meal
    join public.nutrition_meal_plans as plan on plan.id = meal.meal_plan_id
    where meal.id = meal_id and plan.user_id = (select auth.uid())
  ));

create policy nutrition_plan_generation_jobs_select_own
  on public.nutrition_plan_generation_jobs for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.nutrition_food_catalog from public, anon, authenticated;
revoke all on table public.nutrition_food_aliases from public, anon, authenticated;
revoke all on table public.nutrition_food_portions from public, anon, authenticated;
revoke all on table public.nutrition_meal_plans from public, anon, authenticated;
revoke all on table public.nutrition_meal_plan_meals from public, anon, authenticated;
revoke all on table public.nutrition_meal_plan_items from public, anon, authenticated;
revoke all on table public.nutrition_plan_generation_jobs from public, anon, authenticated;

grant select on table public.nutrition_food_catalog to authenticated;
grant select on table public.nutrition_food_aliases to authenticated;
grant select on table public.nutrition_food_portions to authenticated;
grant select on table public.nutrition_meal_plans to authenticated;
grant select on table public.nutrition_meal_plan_meals to authenticated;
grant select on table public.nutrition_meal_plan_items to authenticated;
grant select on table public.nutrition_plan_generation_jobs to authenticated;

grant select, insert, update, delete on table public.nutrition_food_catalog to service_role;
grant select, insert, update, delete on table public.nutrition_food_aliases to service_role;
grant select, insert, update, delete on table public.nutrition_food_portions to service_role;
grant select, insert, update, delete on table public.nutrition_meal_plans to service_role;
grant select, insert, update, delete on table public.nutrition_meal_plan_meals to service_role;
grant select, insert, update, delete on table public.nutrition_meal_plan_items to service_role;
grant select, insert, update, delete on table public.nutrition_plan_generation_jobs to service_role;

revoke all on function public.nutrition_meal_plan_validate_target_state()
  from public, anon, authenticated, service_role;
revoke all on function public.nutrition_generation_job_validate_target_state()
  from public, anon, authenticated, service_role;
revoke all on function public.nutrition_supersede_plans_with_target()
  from public, anon, authenticated, service_role;
revoke all on function public.activate_nutrition_meal_plan_v1(uuid, uuid, text, text, text, text, text, text, smallint, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.activate_nutrition_meal_plan_v1(uuid, uuid, text, text, text, text, text, text, smallint, jsonb)
  to service_role;
revoke all on function public.begin_nutrition_plan_generation_job_v1(uuid, uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_nutrition_plan_generation_job_v1(uuid, uuid, text, text, text, text)
  to service_role;
revoke all on function public.finish_nutrition_plan_generation_job_v1(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.finish_nutrition_plan_generation_job_v1(text, text, text)
  to service_role;

comment on table public.nutrition_meal_plans is
  'Server-managed distribution of one immutable nutrition target. It never changes target calories or macros.';
comment on table public.nutrition_food_catalog is
  'Versioned server-managed nutrient authority. AI estimates and runtime scraping are not catalog sources.';
comment on column public.nutrition_food_catalog.catalog_scope is
  'TEST_ONLY records are synthetic fixtures and are never exposed to authenticated clients.';
comment on table public.nutrition_meal_plan_items is
  'Future meal-item foundation. 3B4 creates no food rows and implements no AI generation.';
comment on column public.nutrition_plan_generation_jobs.last_error_message_safe is
  'Sanitized operational message only; secrets, prompts, provider payloads, and personal data are forbidden.';

do $postcondition$
declare
  v_table text;
begin
  foreach v_table in array array[
    'nutrition_food_catalog', 'nutrition_food_aliases', 'nutrition_food_portions',
    'nutrition_meal_plans', 'nutrition_meal_plan_meals',
    'nutrition_meal_plan_items', 'nutrition_plan_generation_jobs'
  ] loop
    if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = ('public.' || v_table)::regclass) then
      raise exception 'RLS must be enabled on public.%', v_table;
    end if;
    if pg_catalog.has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       or pg_catalog.has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
       or pg_catalog.has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
       or pg_catalog.has_table_privilege('authenticated', 'public.' || v_table, 'DELETE')
       or not pg_catalog.has_table_privilege('authenticated', 'public.' || v_table, 'SELECT') then
      raise exception 'Unexpected client grants on public.%', v_table;
    end if;
  end loop;
end
$postcondition$;

commit;
