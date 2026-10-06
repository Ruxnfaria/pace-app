begin;

set local lock_timeout = '5s';

do $preflight$
declare
  v_legacy_oid oid := pg_catalog.to_regprocedure(
    'public.toggle_mission_with_xp(uuid,boolean)'
  );
  v_recorder_oid oid := pg_catalog.to_regprocedure(
    'public.record_user_streak_activity(uuid)'
  );
  v_legacy_owner text;
  v_recorder_owner text;
  v_recorder_definition text;
  v_recorder_config text[];
  v_column_mismatches integer;
begin
  if exists (
    select 1
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = function_record.pronamespace
    where namespace.nspname = 'public'
      and function_record.proname = 'complete_mission_with_energy'
  ) then
    raise exception 'Successor now exists or has a conflicting overload; stop and review current state';
  end if;

  if v_legacy_oid is null then
    raise exception 'Required legacy function public.toggle_mission_with_xp(uuid,boolean) is missing';
  end if;

  if v_recorder_oid is null then
    raise exception 'Required function public.record_user_streak_activity(uuid) is missing';
  end if;

  if pg_catalog.to_regclass('public.daily_missions') is null
    or pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.reward_transactions') is null
    or pg_catalog.to_regclass('public.user_streaks') is null
  then
    raise exception 'One or more required mission/Energy relations are missing';
  end if;

  with required_columns(
    table_name, column_name, expected_type, required_not_null
  ) as (
    values
      ('daily_missions'::text, 'id'::text, 'uuid'::text, true),
      ('daily_missions', 'user_id', 'uuid', true),
      ('daily_missions', 'completed', 'boolean', false),
      ('daily_missions', 'xp_reward', 'integer', false),
      ('daily_missions', 'current_value', 'integer', false),
      ('daily_missions', 'target_value', 'integer', false),
      ('daily_missions', 'completed_at', 'timestamp with time zone', false),
      ('profiles', 'user_id', 'uuid', true),
      ('profiles', 'total_xp', 'integer', false),
      ('profiles', 'level', 'integer', false),
      ('profiles', 'streak', 'integer', false),
      ('profiles', 'last_activity_date', 'date', false),
      ('reward_transactions', 'user_id', 'uuid', true),
      ('reward_transactions', 'reward_type', 'text', true),
      ('reward_transactions', 'source_type', 'text', true),
      ('reward_transactions', 'source_id', 'text', false),
      ('reward_transactions', 'idempotency_key', 'text', true),
      ('reward_transactions', 'payload', 'jsonb', true),
      ('user_streaks', 'user_id', 'uuid', true),
      ('user_streaks', 'current_streak', 'integer', true),
      ('user_streaks', 'longest_streak', 'integer', true),
      ('user_streaks', 'last_active_date', 'date', false)
  )
  select count(*)
  into v_column_mismatches
  from required_columns as required
  left join information_schema.columns as actual
    on actual.table_schema = 'public'
    and actual.table_name = required.table_name
    and actual.column_name = required.column_name
  where actual.column_name is null
    or (
      actual.data_type <> required.expected_type
      and not (
        required.table_name = 'profiles'
        and required.column_name = 'last_activity_date'
        and actual.data_type in (
          'timestamp with time zone',
          'timestamp without time zone'
        )
      )
    )
    or (
      required.required_not_null
      and actual.is_nullable <> 'NO'
    );

  if v_column_mismatches <> 0 then
    raise exception 'Required mission/Energy column contract changed: % mismatches', v_column_mismatches;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.daily_missions'::regclass
      and constraint_record.contype in ('p', 'u')
      and pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
        ilike '%(id)%'
  ) then
    raise exception 'daily_missions.id is not protected by the expected key';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.profiles'::regclass
      and constraint_record.contype in ('p', 'u')
      and pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
        ilike '%(user_id)%'
  ) then
    raise exception 'profiles.user_id is not protected by the expected key';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.reward_transactions'::regclass
      and constraint_record.contype = 'u'
      and pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
        ilike '%(user_id, idempotency_key)%'
  ) then
    raise exception 'Required reward transaction idempotency constraint is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.reward_transactions'::regclass
      and constraint_record.contype = 'c'
      and lower(pg_catalog.pg_get_constraintdef(constraint_record.oid, true))
        like '%reward_type%'
      and lower(pg_catalog.pg_get_constraintdef(constraint_record.oid, true))
        like '%energy%'
  ) then
    raise exception 'reward_transactions does not accept the required energy reward type';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index as index_record
    where index_record.indrelid = 'public.reward_transactions'::regclass
      and index_record.indisunique
      and index_record.indisvalid
      and index_record.indisready
      and pg_catalog.pg_get_indexdef(index_record.indexrelid)
        ilike '%(user_id, reward_type, source_type, source_id)%'
  ) then
    raise exception 'Required reward source/reward uniqueness is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.user_streaks'::regclass
      and constraint_record.conname = 'user_streaks_pkey'
      and constraint_record.contype = 'p'
      and pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
        ilike '%(user_id)%'
  ) then
    raise exception 'Required user_streaks_pkey(user_id) is missing';
  end if;

  if exists (
    select 1
    from (values
      ('daily_missions'::text),
      ('profiles'),
      ('reward_transactions'),
      ('user_streaks')
    ) as required_relation(relation_name)
    join pg_catalog.pg_class as relation
      on relation.oid = pg_catalog.to_regclass(
        'public.' || required_relation.relation_name
      )
    where not relation.relrowsecurity
      or relation.relforcerowsecurity
      or pg_catalog.pg_get_userbyid(relation.relowner)::text
        in ('anon', 'authenticated', 'service_role')
  ) then
    raise exception 'Required relation RLS/ownership assumptions changed';
  end if;

  select pg_catalog.pg_get_userbyid(function_record.proowner)::text
  into v_legacy_owner
  from pg_catalog.pg_proc as function_record
  where function_record.oid = v_legacy_oid;

  select
    pg_catalog.pg_get_userbyid(function_record.proowner)::text,
    pg_catalog.regexp_replace(
      lower(pg_catalog.pg_get_functiondef(function_record.oid)::text),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    coalesce(function_record.proconfig, array[]::text[])
  into v_recorder_owner, v_recorder_definition, v_recorder_config
  from pg_catalog.pg_proc as function_record
  where function_record.oid = v_recorder_oid;

  if v_legacy_owner in ('anon', 'authenticated', 'service_role')
    or v_recorder_owner in ('anon', 'authenticated', 'service_role')
    or current_user in ('anon', 'authenticated', 'service_role')
  then
    raise exception 'A required function or proposed successor would have an untrusted owner';
  end if;

  if v_recorder_definition not like '%security definer%'
    or array_to_string(v_recorder_config, ',') not in (
      'search_path=',
      'search_path=""'
    )
    or v_recorder_definition not like '%for update%'
    or not (
      v_recorder_definition like
        '%on conflict on constraint user_streaks_pkey do nothing%'
      or v_recorder_definition ~
        'on conflict[ ]*[(][ ]*user_id[ ]*[)][ ]*do nothing'
    )
    or v_recorder_definition not like '%update public.user_streaks%'
    or v_recorder_definition not like '%update public.profiles%'
  then
    raise exception 'Streak recorder does not match the reviewed dependency contract';
  end if;

  if not pg_catalog.has_table_privilege(
    current_user, 'public.daily_missions', 'SELECT'
  ) or not pg_catalog.has_table_privilege(
    current_user, 'public.daily_missions', 'UPDATE'
  ) or not pg_catalog.has_table_privilege(
    current_user, 'public.profiles', 'SELECT'
  ) or not pg_catalog.has_table_privilege(
    current_user, 'public.profiles', 'UPDATE'
  ) or not pg_catalog.has_table_privilege(
    current_user, 'public.reward_transactions', 'INSERT'
  ) or not pg_catalog.has_function_privilege(
    current_user, v_recorder_oid, 'EXECUTE'
  ) then
    raise exception 'Proposed successor owner lacks a required dependency privilege';
  end if;

  if not pg_catalog.has_function_privilege(
    'authenticated',
    'public.toggle_mission_with_xp(uuid,boolean)',
    'EXECUTE'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.toggle_mission_with_xp(uuid,boolean)',
    'EXECUTE'
  ) then
    raise exception 'Legacy authenticated/service compatibility changed';
  end if;
end
$preflight$;

create function public.complete_mission_with_energy(
  p_mission_id uuid
)
returns table (
  mission_id uuid,
  completed_now boolean,
  energy_awarded integer,
  total_energy integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_mission_completed boolean;
  v_energy_reward integer;
  v_total_energy integer;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  if p_mission_id is null then
    raise exception using
      errcode = '22004',
      message = 'Mission id is required';
  end if;

  select
    mission.completed,
    greatest(coalesce(mission.xp_reward, 0), 0)
  into v_mission_completed, v_energy_reward
  from public.daily_missions as mission
  where mission.id = p_mission_id
    and mission.user_id = v_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Mission not found';
  end if;

  if v_mission_completed then
    select greatest(coalesce(profile.total_xp, 0), 0)
    into v_total_energy
    from public.profiles as profile
    where profile.user_id = v_user_id;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'Profile not found';
    end if;

    return query select p_mission_id, false, 0, v_total_energy;
    return;
  end if;

  if v_energy_reward <= 0 or v_energy_reward > 500 then
    raise exception using
      errcode = '22023',
      message = 'Mission Energy reward is invalid';
  end if;

  update public.profiles as profile
  set
    total_xp = greatest(coalesce(profile.total_xp, 0) + v_energy_reward, 0),
    level = greatest(
      1,
      floor(
        greatest(coalesce(profile.total_xp, 0) + v_energy_reward, 0)::numeric
        / 500
      )::integer + 1
    )
  where profile.user_id = v_user_id
  returning profile.total_xp into v_total_energy;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Profile not found';
  end if;

  update public.daily_missions as mission
  set
    completed = true,
    current_value = greatest(
      coalesce(mission.current_value, 0),
      coalesce(mission.target_value, 1)
    ),
    completed_at = coalesce(mission.completed_at, now())
  where mission.id = p_mission_id
    and mission.user_id = v_user_id
    and mission.completed = false;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'Mission state changed during completion';
  end if;

  insert into public.reward_transactions (
    user_id,
    reward_type,
    source_type,
    source_id,
    idempotency_key,
    payload
  )
  values (
    v_user_id,
    'energy',
    'daily_mission_completion',
    p_mission_id::text,
    'daily_mission_completion:' || p_mission_id::text,
    jsonb_build_object(
      'mission_id', p_mission_id,
      'amount', v_energy_reward
    )
  );

  perform public.record_user_streak_activity(v_user_id);

  return query select
    p_mission_id,
    true,
    v_energy_reward,
    v_total_energy;
end;
$$;

revoke all on function public.complete_mission_with_energy(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.complete_mission_with_energy(uuid)
to authenticated, service_role;

comment on function public.complete_mission_with_energy(uuid) is
  'Authenticated ownership-bound, completion-only mission Energy grant.';

revoke execute on function public.toggle_mission_with_xp(uuid, boolean)
from public, anon;
grant execute on function public.toggle_mission_with_xp(uuid, boolean)
to authenticated, service_role;

do $postcondition$
declare
  v_successor_oid oid := pg_catalog.to_regprocedure(
    'public.complete_mission_with_energy(uuid)'
  );
  v_legacy_oid oid := pg_catalog.to_regprocedure(
    'public.toggle_mission_with_xp(uuid,boolean)'
  );
  v_successor_public_execute boolean;
  v_legacy_public_execute boolean;
  v_successor_definition text;
  v_successor_config text[];
  v_successor_unexpected_execute boolean;
  v_legacy_unexpected_execute boolean;
begin
  if v_successor_oid is null or v_legacy_oid is null then
    raise exception 'Required successor or legacy signature is missing after remediation';
  end if;

  select
    lower(pg_catalog.pg_get_functiondef(function_record.oid)::text),
    coalesce(function_record.proconfig, array[]::text[])
  into v_successor_definition, v_successor_config
  from pg_catalog.pg_proc as function_record
  where function_record.oid = v_successor_oid
    and function_record.prosecdef
    and pg_catalog.pg_get_userbyid(function_record.proowner)::text
      not in ('anon', 'authenticated', 'service_role');

  if not found
    or array_to_string(v_successor_config, ',') not in (
      'search_path=',
      'search_path=""'
    )
    or v_successor_definition not like '%v_user_id uuid := auth.uid()%'
    or v_successor_definition not like '%for update%'
    or v_successor_definition not like '%mission.user_id = v_user_id%'
    or v_successor_definition not like '%mission.completed = false%'
    or v_successor_definition not like '%idempotency_key%'
    or v_successor_definition not like '%record_user_streak_activity%'
    or v_successor_definition not like '%/ 500%'
  then
    raise exception 'Successor security or semantic postcondition failed';
  end if;

  select coalesce(bool_or(expanded.grantee = 0), false)
  into v_successor_public_execute
  from pg_catalog.pg_proc as function_record
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      function_record.proacl,
      pg_catalog.acldefault('f'::"char", function_record.proowner)
    )
  ) as expanded
  where function_record.oid = v_successor_oid
    and expanded.privilege_type = 'EXECUTE';

  select coalesce(bool_or(
    expanded.grantee <> function_record.proowner
    and expanded.grantee not in (
      'authenticated'::regrole::oid,
      'service_role'::regrole::oid
    )
  ), false)
  into v_successor_unexpected_execute
  from pg_catalog.pg_proc as function_record
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      function_record.proacl,
      pg_catalog.acldefault('f'::"char", function_record.proowner)
    )
  ) as expanded
  where function_record.oid = v_successor_oid
    and expanded.grantee <> 0
    and expanded.privilege_type = 'EXECUTE';

  select coalesce(bool_or(
    expanded.grantee <> function_record.proowner
    and expanded.grantee not in (
      'authenticated'::regrole::oid,
      'service_role'::regrole::oid
    )
  ), false)
  into v_legacy_unexpected_execute
  from pg_catalog.pg_proc as function_record
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      function_record.proacl,
      pg_catalog.acldefault('f'::"char", function_record.proowner)
    )
  ) as expanded
  where function_record.oid = v_legacy_oid
    and expanded.grantee <> 0
    and expanded.privilege_type = 'EXECUTE';

  select coalesce(bool_or(expanded.grantee = 0), false)
  into v_legacy_public_execute
  from pg_catalog.pg_proc as function_record
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      function_record.proacl,
      pg_catalog.acldefault('f'::"char", function_record.proowner)
    )
  ) as expanded
  where function_record.oid = v_legacy_oid
    and expanded.privilege_type = 'EXECUTE';

  if v_successor_public_execute
    or v_successor_unexpected_execute
    or pg_catalog.has_function_privilege(
      'anon', 'public.complete_mission_with_energy(uuid)', 'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'authenticated', 'public.complete_mission_with_energy(uuid)', 'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'service_role', 'public.complete_mission_with_energy(uuid)', 'EXECUTE'
    )
  then
    raise exception 'Successor ACL does not match the approved allowlist';
  end if;

  if v_legacy_public_execute
    or v_legacy_unexpected_execute
    or pg_catalog.has_function_privilege(
      'anon', 'public.toggle_mission_with_xp(uuid,boolean)', 'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'authenticated', 'public.toggle_mission_with_xp(uuid,boolean)', 'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'service_role', 'public.toggle_mission_with_xp(uuid,boolean)', 'EXECUTE'
    )
  then
    raise exception 'Legacy containment or compatibility postcondition failed';
  end if;
end
$postcondition$;

commit;
