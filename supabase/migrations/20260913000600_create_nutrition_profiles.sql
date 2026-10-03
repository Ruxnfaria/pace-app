-- Preparation only: review manually before applying.
-- Additive foundation; no legacy rows, plans, macros, or onboarding state change.
begin;

set local lock_timeout = '5s';

do $preflight$
begin
  if pg_catalog.to_regclass('public.nutrition_profiles') is not null then
    raise exception 'public.nutrition_profiles already exists; audit before proceeding';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'reward_system_set_updated_at'
      and p.prokind = 'f'
      and p.pronargs = 0
      and p.prorettype = 'pg_catalog.trigger'::regtype
  ) then
    raise exception 'Required public.reward_system_set_updated_at() trigger function is missing or incompatible';
  end if;
end
$preflight$;

create table public.nutrition_profiles (
  id uuid constraint nutrition_profiles_pkey primary key default gen_random_uuid(),
  user_id uuid not null,
  meals_per_day smallint not null,
  food_preparation_style text not null,
  food_budget_style text not null,
  dietary_pattern text not null,
  dietary_pattern_other_label varchar(80),
  has_food_restrictions boolean not null,
  uses_supplements boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nutrition_profiles_user_unique unique (user_id),
  constraint nutrition_profiles_user_fk foreign key (user_id)
    references auth.users(id) on delete cascade,
  constraint nutrition_profiles_meals_per_day_check check (
    meals_per_day between 2 and 6
  ),
  constraint nutrition_profiles_preparation_style_check check (
    food_preparation_style in ('very_quick', 'cook_some', 'meal_prep', 'flexible')
  ),
  constraint nutrition_profiles_budget_style_check check (
    food_budget_style in ('economic', 'balanced', 'varied')
  ),
  constraint nutrition_profiles_dietary_pattern_check check (
    dietary_pattern in ('omnivore', 'vegetarian', 'vegan', 'pescatarian', 'other')
  ),
  constraint nutrition_profiles_other_pattern_check check (
    (dietary_pattern = 'other'
      and dietary_pattern_other_label is not null
      and btrim(dietary_pattern_other_label) <> '')
    or (dietary_pattern <> 'other' and dietary_pattern_other_label is null)
  )
);

create trigger nutrition_profiles_set_updated_at
before update on public.nutrition_profiles
for each row execute function public.reward_system_set_updated_at();

alter table public.nutrition_profiles enable row level security;

create policy nutrition_profiles_select_own
  on public.nutrition_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy nutrition_profiles_insert_own
  on public.nutrition_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy nutrition_profiles_update_own
  on public.nutrition_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.nutrition_profiles from public, anon, authenticated;

grant select on table public.nutrition_profiles to authenticated;

grant insert (
  user_id, meals_per_day, food_preparation_style, food_budget_style,
  dietary_pattern, dietary_pattern_other_label, has_food_restrictions,
  uses_supplements
) on public.nutrition_profiles to authenticated;

grant update (
  meals_per_day, food_preparation_style, food_budget_style,
  dietary_pattern, dietary_pattern_other_label, has_food_restrictions,
  uses_supplements
) on public.nutrition_profiles to authenticated;

-- Explicit administrative access avoids relying on PUBLIC/default grants.
-- No service_role privileges on any existing object are revoked or changed.
grant select, insert, update, delete on table public.nutrition_profiles to service_role;

commit;
