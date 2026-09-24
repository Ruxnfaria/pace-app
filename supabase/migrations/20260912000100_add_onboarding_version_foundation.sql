-- Preparation only: do not apply before reviewing the remote profiles policies,
-- privileges, triggers, and constraints. No V1 data or completion flag is changed.
begin;

set local lock_timeout = '5s';

alter table public.profiles
  add column if not exists onboarding_version smallint
    constraint profiles_onboarding_version_positive
    check (onboarding_version > 0),
  add column if not exists onboarding_completed_at timestamptz;

-- IF NOT EXISTS must not silently accept an incompatible existing definition.
-- Reapplication is accepted only for the expected nullable, default-free columns
-- and the validated positive-version constraint created above.
do $migration$
declare
  v_column record;
  v_constraint record;
begin
  for v_column in
    select a.attname, a.atttypid, a.attnotnull, a.atthasdef,
           a.attidentity, a.attgenerated
    from pg_catalog.pg_attribute as a
    where a.attrelid = 'public.profiles'::regclass
      and a.attname in ('onboarding_version', 'onboarding_completed_at')
      and a.attnum > 0
      and not a.attisdropped
  loop
    if v_column.attnotnull or v_column.atthasdef
       or v_column.attidentity <> '' or v_column.attgenerated <> ''
       or (v_column.attname = 'onboarding_version'
           and v_column.atttypid <> 'smallint'::regtype)
       or (v_column.attname = 'onboarding_completed_at'
           and v_column.atttypid <> 'timestamptz'::regtype) then
      raise exception 'Incompatible existing profiles column: %',
        v_column.attname;
    end if;
  end loop;

  select c.contype, c.convalidated, c.connoinherit,
         pg_catalog.pg_get_constraintdef(c.oid) as definition
  into v_constraint
  from pg_catalog.pg_constraint as c
  where c.conrelid = 'public.profiles'::regclass
    and c.conname = 'profiles_onboarding_version_positive';

  if not found then
    raise exception 'Expected profiles_onboarding_version_positive constraint is missing';
  end if;

  if v_constraint.contype <> 'c' or not v_constraint.convalidated
     or v_constraint.connoinherit
     or pg_catalog.regexp_replace(
          pg_catalog.lower(v_constraint.definition), '[[:space:]()]', '', 'g'
        ) <> 'checkonboarding_version>0' then
    raise exception 'Incompatible profiles_onboarding_version_positive constraint';
  end if;
end
$migration$;

commit;
