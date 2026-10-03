-- Preparation only: manual review required before applying.
-- Canonical V2 foundation; no legacy synchronization or backfill.
begin;

set local lock_timeout = '5s';

do $preflight$
declare
  users_oid oid;
  users_id_attnum smallint;
begin
  if pg_catalog.to_regclass('public.user_health_profiles') is not null then
    raise exception 'Relation public.user_health_profiles already exists; audit before proceeding';
  end if;

  users_oid := pg_catalog.to_regclass('auth.users');
  if users_oid is null or not exists (
    select 1 from pg_catalog.pg_class
    where oid = users_oid and relkind in ('r', 'p')
  ) then
    raise exception 'Required parent table auth.users is missing or incompatible';
  end if;

  select a.attnum into users_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = users_oid and a.attname = 'id'
    and a.attnum > 0 and not a.attisdropped
    and a.atttypid = 'pg_catalog.uuid'::regtype and a.attnotnull;

  if users_id_attnum is null then
    raise exception 'auth.users.id must exist as uuid NOT NULL';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_index i
    where i.indrelid = users_oid
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indpred is null and i.indexprs is null
      and i.indnkeyatts = 1 and i.indkey[0] = users_id_attnum
  ) then
    raise exception 'auth.users.id requires a valid non-partial immediate UNIQUE key suitable for a foreign key';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reward_system_set_updated_at'
      and p.prokind = 'f' and p.pronargs = 0
      and p.prorettype = 'pg_catalog.trigger'::regtype
  ) then
    raise exception 'Required public.reward_system_set_updated_at() trigger function is missing or incompatible';
  end if;
end
$preflight$;

create table public.user_health_profiles (
  id uuid constraint user_health_profiles_pkey primary key default gen_random_uuid(),
  user_id uuid not null,
  birth_date date not null,
  biological_sex text not null,
  height_cm numeric not null,
  weight_kg numeric not null,
  target_weight_kg numeric,
  primary_goal text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_health_profiles_user_unique unique (user_id),
  constraint user_health_profiles_user_fk foreign key (user_id)
    references auth.users(id) on delete cascade,
  constraint user_health_profiles_biological_sex_check check (
    biological_sex in ('male', 'female', 'not_specified')
  ),
  constraint user_health_profiles_goal_check check (
    primary_goal in (
      'hypertrophy', 'fat_loss', 'body_recomposition',
      'strength', 'conditioning', 'health'
    )
  ),
  constraint user_health_profiles_height_check check (
    height_cm > 0 and height_cm <= 300
  ),
  constraint user_health_profiles_weight_check check (
    weight_kg > 0 and weight_kg <= 500
  ),
  constraint user_health_profiles_target_weight_check check (
    target_weight_kg is null or (target_weight_kg > 0 and target_weight_kg <= 500)
  )
);

-- Minimum age is validated by the future onboarding operation, not a time-dependent CHECK.
create trigger user_health_profiles_set_updated_at
  before update on public.user_health_profiles
  for each row execute function public.reward_system_set_updated_at();

alter table public.user_health_profiles enable row level security;

create policy user_health_profiles_select_own
  on public.user_health_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy user_health_profiles_insert_own
  on public.user_health_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_health_profiles_update_own
  on public.user_health_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.user_health_profiles from public, anon, authenticated;

grant select on table public.user_health_profiles to authenticated;

grant insert (
  user_id, birth_date, biological_sex, height_cm,
  weight_kg, target_weight_kg, primary_goal
) on public.user_health_profiles to authenticated;

grant update (
  birth_date, biological_sex, height_cm,
  weight_kg, target_weight_kg, primary_goal
) on public.user_health_profiles to authenticated;

grant select, insert, update, delete
  on public.user_health_profiles to service_role;

commit;
