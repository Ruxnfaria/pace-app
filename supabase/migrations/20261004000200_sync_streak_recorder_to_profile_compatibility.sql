begin;

set local lock_timeout = '5s';

do $preflight$
declare
  v_recorder_oid oid := pg_catalog.to_regprocedure(
    'public.record_user_streak_activity(uuid)'
  );
  v_expected_definition_md5 constant text :=
    '9df16246c3eae94cef1c4fdacdaf009c';
  v_expected_normalized_definition_md5 constant text :=
    'c9c89cfffd1a97a15c532600e787c11e';
  v_actual_definition_md5 text;
  v_actual_normalized_definition_md5 text;
  v_definition text;
  v_owner text;
  v_result_type text;
  v_configuration text[];
  v_security_definer boolean;
  v_volatility text;
  v_public_execute boolean;
  v_unexpected_execute boolean;
begin
  if v_recorder_oid is null then
    raise exception
      'Required function public.record_user_streak_activity(uuid) is missing';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = function_record.pronamespace
    where namespace.nspname = 'public'
      and function_record.proname = 'record_user_streak_activity'
  ) <> 1 then
    raise exception 'Unexpected record_user_streak_activity overload set';
  end if;

  select
    pg_catalog.md5(
      pg_catalog.pg_get_functiondef(function_record.oid)::text
    ),
    pg_catalog.md5(
      pg_catalog.regexp_replace(
        lower(pg_catalog.pg_get_functiondef(function_record.oid)::text),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ),
    pg_catalog.regexp_replace(
      lower(pg_catalog.pg_get_functiondef(function_record.oid)::text),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    pg_catalog.pg_get_userbyid(function_record.proowner)::text,
    pg_catalog.pg_get_function_result(function_record.oid)::text,
    coalesce(function_record.proconfig, array[]::text[]),
    function_record.prosecdef,
    function_record.provolatile::text
  into
    v_actual_definition_md5,
    v_actual_normalized_definition_md5,
    v_definition,
    v_owner,
    v_result_type,
    v_configuration,
    v_security_definer,
    v_volatility
  from pg_catalog.pg_proc as function_record
  where function_record.oid = v_recorder_oid;

  if v_actual_definition_md5 <> v_expected_definition_md5
    or v_actual_normalized_definition_md5 <>
      v_expected_normalized_definition_md5
  then
    raise exception
      'Recorder definition changed after the approved Production preflight';
  end if;

  if v_owner <> 'postgres'
    or not v_security_definer
    or v_volatility <> 'v'
    or coalesce(array_to_string(v_configuration, ','), '') not in (
      'search_path=',
      'search_path=""'
    )
    or lower(v_result_type) <> lower(
      'TABLE(user_id uuid, current_streak integer, effective_streak integer, longest_streak integer, last_active_date date)'
    )
  then
    raise exception 'Recorder metadata no longer matches the reviewed contract';
  end if;

  if v_definition not like '%insert into public.user_streaks%'
    or v_definition !~
      'on conflict[ ]*[(][ ]*user_id[ ]*[)][ ]*do nothing'
    or v_definition not like '%for update%'
    or v_definition not like '%america/sao_paulo%'
    or v_definition not like '%update public.user_streaks%'
    or v_definition not like '%current_streak =%'
    or v_definition not like '%longest_streak =%'
    or v_definition not like '%last_active_date =%'
    or v_definition not like '%return query%'
    or v_definition like '%update public.profiles%'
  then
    raise exception 'Current recorder body is not the reviewed pre-sync state';
  end if;

  if exists (
    select 1
    from (values
      ('profiles'::text, 'user_id'::text, 'uuid'::text, true),
      ('profiles', 'streak', 'integer', false),
      ('profiles', 'last_activity_date', 'date', false),
      ('user_streaks', 'user_id', 'uuid', true),
      ('user_streaks', 'current_streak', 'integer', true),
      ('user_streaks', 'longest_streak', 'integer', true),
      ('user_streaks', 'last_active_date', 'date', false)
    ) as required(table_name, column_name, data_type, not_null)
    left join information_schema.columns as actual
      on actual.table_schema = 'public'
      and actual.table_name = required.table_name
      and actual.column_name = required.column_name
    where actual.column_name is null
      or actual.data_type <> required.data_type
      or (required.not_null and actual.is_nullable <> 'NO')
  ) then
    raise exception 'Required streak/profile column contract changed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.profiles'::regclass
      and constraint_record.contype in ('p', 'u')
      and (
        select array_agg(
          attribute.attname::text
          order by key_column.key_order
        )
        from unnest(constraint_record.conkey) with ordinality
          as key_column(attribute_number, key_order)
        join pg_catalog.pg_attribute as attribute
          on attribute.attrelid = constraint_record.conrelid
          and attribute.attnum = key_column.attribute_number
      ) = array['user_id']::text[]
  ) then
    raise exception 'profiles.user_id is not protected by a unique ownership key';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.user_streaks'::regclass
      and constraint_record.contype = 'p'
      and constraint_record.conname = 'user_streaks_pkey'
      and (
        select array_agg(
          attribute.attname::text
          order by key_column.key_order
        )
        from unnest(constraint_record.conkey) with ordinality
          as key_column(attribute_number, key_order)
        join pg_catalog.pg_attribute as attribute
          on attribute.attrelid = constraint_record.conrelid
          and attribute.attnum = key_column.attribute_number
      ) = array['user_id']::text[]
  ) then
    raise exception 'user_streaks_pkey(user_id) is missing or incompatible';
  end if;

  if exists (
    select 1
    from (values ('profiles'::text), ('user_streaks'))
      as required(relation_name)
    join pg_catalog.pg_class as relation
      on relation.oid = pg_catalog.to_regclass(
        'public.' || required.relation_name
      )
    where not relation.relrowsecurity
      or relation.relforcerowsecurity
      or pg_catalog.pg_get_userbyid(relation.relowner)::text
        in ('anon', 'authenticated', 'service_role')
  ) then
    raise exception 'Required relation RLS/ownership assumptions changed';
  end if;

  if not pg_catalog.has_schema_privilege(v_owner, 'public', 'USAGE')
    or not pg_catalog.has_table_privilege(
      v_owner, 'public.profiles', 'SELECT'
    )
    or not pg_catalog.has_table_privilege(
      v_owner, 'public.profiles', 'UPDATE'
    )
    or not pg_catalog.has_table_privilege(
      v_owner, 'public.user_streaks', 'SELECT'
    )
    or not pg_catalog.has_table_privilege(
      v_owner, 'public.user_streaks', 'INSERT'
    )
    or not pg_catalog.has_table_privilege(
      v_owner, 'public.user_streaks', 'UPDATE'
    )
  then
    raise exception 'Recorder owner lacks a required relation privilege';
  end if;

  select
    coalesce(bool_or(expanded.grantee = 0), false),
    coalesce(bool_or(
      expanded.grantee <> 0
      and expanded.grantee <> function_record.proowner
      and expanded.grantee <> 'service_role'::regrole::oid
    ), false)
  into v_public_execute, v_unexpected_execute
  from pg_catalog.pg_proc as function_record
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      function_record.proacl,
      pg_catalog.acldefault('f'::"char", function_record.proowner)
    )
  ) as expanded
  where function_record.oid = v_recorder_oid
    and expanded.privilege_type = 'EXECUTE';

  if v_public_execute
    or v_unexpected_execute
    or pg_catalog.has_function_privilege('anon', v_recorder_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege(
      'authenticated', v_recorder_oid, 'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'service_role', v_recorder_oid, 'EXECUTE'
    )
  then
    raise exception 'Recorder ACL no longer matches the service-only contract';
  end if;
end
$preflight$;

-- CREATE OR REPLACE retains the existing owner and ACL. The postcondition
-- block below fails the transaction if either security property changes.
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
  v_current_streak integer;
  v_longest_streak integer;
  v_last_active_date date;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  perform 1
  from public.profiles as profile
  where profile.user_id = p_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Profile not found';
  end if;

  insert into public.user_streaks (user_id)
  values (p_user_id)
  on conflict on constraint user_streaks_pkey do nothing;

  select
    streak.current_streak,
    streak.longest_streak,
    streak.last_active_date
  into
    v_current_streak,
    v_longest_streak,
    v_last_active_date
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
    raise exception 'last_active_date cannot be in the future';
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

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Profile not found during compatibility synchronization';
  end if;

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

do $postcondition$
declare
  v_recorder_oid oid := pg_catalog.to_regprocedure(
    'public.record_user_streak_activity(uuid)'
  );
  v_definition text;
  v_identity_arguments text;
  v_result_type text;
  v_owner text;
  v_configuration text[];
  v_public_execute boolean;
  v_unexpected_execute boolean;
begin
  if (
    select count(*)
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = function_record.pronamespace
    where namespace.nspname = 'public'
      and function_record.proname = 'record_user_streak_activity'
  ) <> 1 then
    raise exception 'Unexpected post-replacement recorder overload set';
  end if;

  select
    pg_catalog.regexp_replace(
      lower(pg_catalog.pg_get_functiondef(function_record.oid)::text),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    pg_catalog.pg_get_function_identity_arguments(
      function_record.oid
    )::text,
    pg_catalog.pg_get_function_result(function_record.oid)::text,
    pg_catalog.pg_get_userbyid(function_record.proowner)::text,
    coalesce(function_record.proconfig, array[]::text[])
  into
    v_definition,
    v_identity_arguments,
    v_result_type,
    v_owner,
    v_configuration
  from pg_catalog.pg_proc as function_record
  where function_record.oid = v_recorder_oid
    and function_record.prosecdef
    and function_record.provolatile::text = 'v';

  if not found
    or v_owner <> 'postgres'
    or v_identity_arguments <> 'p_user_id uuid'
    or coalesce(array_to_string(v_configuration, ','), '') not in (
      'search_path=',
      'search_path=""'
    )
    or lower(v_result_type) <> lower(
      'TABLE(user_id uuid, current_streak integer, effective_streak integer, longest_streak integer, last_active_date date)'
    )
    or v_definition not like '%america/sao_paulo%'
    or v_definition not like '%perform 1 from public.profiles%for update%'
    or v_definition not like '%insert into public.user_streaks%'
    or v_definition not like '%for update%'
    or v_definition not like
      '%on conflict on constraint user_streaks_pkey do nothing%'
    or v_definition not like '%update public.user_streaks%'
    or v_definition not like '%update public.profiles%'
    or v_definition not like '%streak = v_current_streak%'
    or v_definition not like '%last_activity_date = v_today%'
    or pg_catalog.strpos(
      v_definition,
      'perform 1 from public.profiles'
    ) >= pg_catalog.strpos(
      v_definition,
      'insert into public.user_streaks'
    )
    or pg_catalog.strpos(v_definition, 'update public.profiles') <=
      pg_catalog.strpos(v_definition, 'update public.user_streaks')
  then
    raise exception 'Recorder semantic postconditions were not met';
  end if;

  select
    coalesce(bool_or(expanded.grantee = 0), false),
    coalesce(bool_or(
      expanded.grantee <> 0
      and expanded.grantee <> function_record.proowner
      and expanded.grantee <> 'service_role'::regrole::oid
    ), false)
  into v_public_execute, v_unexpected_execute
  from pg_catalog.pg_proc as function_record
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      function_record.proacl,
      pg_catalog.acldefault('f'::"char", function_record.proowner)
    )
  ) as expanded
  where function_record.oid = v_recorder_oid
    and expanded.privilege_type = 'EXECUTE';

  if v_public_execute
    or v_unexpected_execute
    or pg_catalog.has_function_privilege('anon', v_recorder_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege(
      'authenticated', v_recorder_oid, 'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'service_role', v_recorder_oid, 'EXECUTE'
    )
  then
    raise exception 'Recorder ACL changed during replacement';
  end if;
end
$postcondition$;

commit;
