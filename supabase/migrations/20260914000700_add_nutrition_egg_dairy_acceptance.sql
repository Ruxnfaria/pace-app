-- Preparation only: manual review required before applying.
-- Nullable acceptance fields; no defaults, inferred answers, or backfill.
-- NULL is allowed for existing/V1 users and while V2 is not yet completed.
-- For non-vegan users, future public.complete_onboarding_v2 must require
-- explicit TRUE/FALSE answers; NULL or missing answers must be rejected.
-- An absent answer never means acceptance or refusal.
-- Vegan profiles must keep both acceptance fields NULL.
begin;

set local lock_timeout = '5s';

do $preflight$
declare
  nutrition_oid oid;
begin
  nutrition_oid := pg_catalog.to_regclass('public.nutrition_profiles');
  if nutrition_oid is null or not exists (
    select 1 from pg_catalog.pg_class
    where oid = nutrition_oid and relkind in ('r', 'p')
  ) then
    raise exception 'Required table public.nutrition_profiles is missing or incompatible';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = nutrition_oid and attname = 'dietary_pattern'
      and attnum > 0 and not attisdropped
      and atttypid = 'pg_catalog.text'::regtype and attnotnull
  ) then
    raise exception 'public.nutrition_profiles.dietary_pattern must exist as text NOT NULL';
  end if;

  if exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = nutrition_oid
      and attname in ('accepts_eggs', 'accepts_dairy')
      and attnum > 0 and not attisdropped
  ) then
    raise exception 'Egg or dairy acceptance column already exists; audit before proceeding';
  end if;

  if exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = nutrition_oid
      and conname = 'nutrition_profiles_egg_dairy_acceptance_check'
  ) then
    raise exception 'nutrition_profiles_egg_dairy_acceptance_check already exists; audit before proceeding';
  end if;
end
$preflight$;

-- Keep the schema change protected from concurrent writes.
lock table public.nutrition_profiles in access exclusive mode;

alter table public.nutrition_profiles
  add column accepts_eggs boolean,
  add column accepts_dairy boolean,
  add constraint nutrition_profiles_egg_dairy_acceptance_check check (
    dietary_pattern <> 'vegan'
    or (accepts_eggs is null and accepts_dairy is null)
  );

grant insert (accepts_eggs, accepts_dairy)
  on public.nutrition_profiles to authenticated;

grant update (accepts_eggs, accepts_dairy)
  on public.nutrition_profiles to authenticated;

commit;
