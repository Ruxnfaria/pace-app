begin;

set local lock_timeout = '5s';

do $preflight$
declare
  recorder_oid oid := to_regprocedure(
    'public.record_user_streak_activity(uuid)'
  );
  owner_name text;
begin
  if recorder_oid is null then
    raise exception 'Required function public.record_user_streak_activity(uuid) is missing';
  end if;

  select pg_catalog.pg_get_userbyid(function_record.proowner)::text
  into owner_name
  from pg_catalog.pg_proc as function_record
  where function_record.oid = recorder_oid;

  if owner_name in ('anon', 'authenticated', 'service_role') then
    raise exception 'Streak recorder has an untrusted owner: %', owner_name;
  end if;

  if to_regclass('public.profiles') is null
    or to_regclass('public.user_streaks') is null
  then
    raise exception 'Required streak relations are missing';
  end if;

  if (
    select count(*)
    from information_schema.columns as column_record
    where column_record.table_schema = 'public'
      and (
        (
          column_record.table_name = 'profiles'
          and column_record.column_name in (
            'user_id', 'streak', 'last_activity_date'
          )
        )
        or (
          column_record.table_name = 'user_streaks'
          and column_record.column_name in (
            'user_id', 'current_streak', 'longest_streak',
            'last_active_date'
          )
        )
      )
  ) <> 7 then
    raise exception 'Required streak columns are missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    join pg_catalog.pg_attribute as attribute
      on attribute.attrelid = constraint_record.conrelid
      and attribute.attnum = constraint_record.conkey[1]
      and not attribute.attisdropped
    where constraint_record.conrelid = 'public.user_streaks'::regclass
      and constraint_record.conname = 'user_streaks_pkey'
      and constraint_record.contype = 'p'
      and cardinality(constraint_record.conkey) = 1
      and attribute.attname = 'user_id'
  ) then
    raise exception 'Required primary key user_streaks_pkey(user_id) is missing or incompatible';
  end if;
end
$preflight$;

-- Keep the deployed signature and result contract exactly unchanged while
-- synchronizing the dedicated streak back to the legacy profile fields.
create or replace function public.record_user_streak_activity(p_user_id uuid)
returns table (
  user_id uuid,
  current_streak integer,
  effective_streak integer,
  longest_streak integer,
  last_active_date date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_legacy_streak integer;
  v_legacy_last_active_date date;
  v_current_streak integer;
  v_longest_streak integer;
  v_last_active_date date;
begin
  if p_user_id is null then
    raise exception using
      errcode = '22004',
      message = 'User id is required';
  end if;

  select
    greatest(coalesce(profile.streak, 0), 0),
    profile.last_activity_date::date
  into v_legacy_streak, v_legacy_last_active_date
  from public.profiles as profile
  where profile.user_id = p_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Profile not found';
  end if;

  insert into public.user_streaks (
    user_id,
    current_streak,
    longest_streak,
    last_active_date
  )
  values (
    p_user_id,
    case
      when v_legacy_streak > 0 and v_legacy_last_active_date is not null
        then v_legacy_streak
      else 0
    end,
    case
      when v_legacy_streak > 0 and v_legacy_last_active_date is not null
        then v_legacy_streak
      else 0
    end,
    case
      when v_legacy_streak > 0 and v_legacy_last_active_date is not null
        then v_legacy_last_active_date
      else null
    end
  )
  on conflict on constraint user_streaks_pkey do nothing;

  select
    streak.current_streak,
    streak.longest_streak,
    streak.last_active_date
  into v_current_streak, v_longest_streak, v_last_active_date
  from public.user_streaks as streak
  where streak.user_id = p_user_id
  for update;

  if v_last_active_date is null then
    v_current_streak := 1;
  elsif v_last_active_date = v_today then
    null;
  elsif v_last_active_date = v_today - 1 then
    v_current_streak := v_current_streak + 1;
  elsif v_last_active_date < v_today - 1 then
    v_current_streak := 1;
  else
    raise exception using
      errcode = '22008',
      message = 'Streak activity date cannot be in the future';
  end if;

  v_longest_streak := greatest(v_longest_streak, v_current_streak);

  update public.user_streaks as streak
  set
    current_streak = v_current_streak,
    longest_streak = v_longest_streak,
    last_active_date = v_today
  where streak.user_id = p_user_id;

  update public.profiles as profile
  set
    streak = v_current_streak,
    last_activity_date = v_today
  where profile.user_id = p_user_id;

  return query
  select
    streak.user_id,
    streak.current_streak,
    streak.current_streak as effective_streak,
    streak.longest_streak,
    streak.last_active_date
  from public.user_streaks as streak
  where streak.user_id = p_user_id;
end;
$$;

revoke all on function public.record_user_streak_activity(uuid)
from public, anon, authenticated;
grant execute on function public.record_user_streak_activity(uuid)
to service_role;

comment on function public.record_user_streak_activity(uuid) is
  'Service-only atomic Brazil-date streak registration with profiles.streak compatibility synchronization.';

do $postcondition$
declare
  recorder_oid oid := to_regprocedure(
    'public.record_user_streak_activity(uuid)'
  );
  public_execute boolean;
  recorder_definition text;
  recorder_configuration text[];
begin
  select
    lower(pg_catalog.pg_get_functiondef(function_record.oid)::text),
    coalesce(function_record.proconfig, array[]::text[])
  into recorder_definition, recorder_configuration
  from pg_catalog.pg_proc as function_record
  where function_record.oid = recorder_oid;

  select coalesce(bool_or(expanded.grantee = 0), false)
  into public_execute
  from pg_catalog.pg_proc as function_record
  cross join lateral aclexplode(
    coalesce(function_record.proacl, acldefault('f', function_record.proowner))
  ) as expanded
  where function_record.oid = recorder_oid
    and expanded.privilege_type = 'EXECUTE';

  if public_execute
    or has_function_privilege(
      'anon', 'public.record_user_streak_activity(uuid)', 'EXECUTE'
    )
    or has_function_privilege(
      'authenticated', 'public.record_user_streak_activity(uuid)', 'EXECUTE'
    )
    or not has_function_privilege(
      'service_role', 'public.record_user_streak_activity(uuid)', 'EXECUTE'
    )
  then
    raise exception 'Streak recorder grants do not match the service-only contract';
  end if;

  if array_to_string(recorder_configuration, ',') not like '%search_path=%'
    or recorder_definition not like '%america/sao_paulo%'
    or recorder_definition not like '%for update%'
    or recorder_definition not like '%on conflict on constraint user_streaks_pkey%'
    or recorder_definition not like '%update public.user_streaks%'
    or recorder_definition not like '%update public.profiles%'
  then
    raise exception 'Streak recorder semantic postconditions were not met';
  end if;
end
$postcondition$;

commit;
