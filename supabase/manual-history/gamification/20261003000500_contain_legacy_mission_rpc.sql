begin;

set local lock_timeout = '5s';

do $preflight$
declare
  legacy_oid oid := to_regprocedure(
    'public.toggle_mission_with_xp(uuid,boolean)'
  );
  owner_name text;
begin
  if legacy_oid is null then
    raise exception 'Required legacy function public.toggle_mission_with_xp(uuid,boolean) is missing';
  end if;

  select pg_catalog.pg_get_userbyid(function_record.proowner)::text
  into owner_name
  from pg_catalog.pg_proc as function_record
  where function_record.oid = legacy_oid;

  if owner_name in ('anon', 'authenticated', 'service_role') then
    raise exception 'Legacy mission function has an untrusted owner: %', owner_name;
  end if;

  if to_regclass('public.daily_missions') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.reward_transactions') is null
  then
    raise exception 'Required mission reward relations are missing';
  end if;

  if to_regprocedure('public.record_user_streak_activity(uuid)') is null then
    raise exception 'Required streak recorder is missing';
  end if;
end
$preflight$;

-- Immediate, runtime-compatible containment. The browser Dashboard still calls
-- this legacy function, so authenticated remains temporarily authorized.
revoke execute on function public.toggle_mission_with_xp(uuid, boolean)
from public, anon;
grant execute on function public.toggle_mission_with_xp(uuid, boolean)
to authenticated;

-- Secure completion-only replacement for the subsequent runtime cutover.
-- It never accepts a user id, never reverses a completed mission, and applies
-- mission state, Energy, reward history and streak in one transaction.
create or replace function public.complete_mission_with_energy(
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
from public, anon;
grant execute on function public.complete_mission_with_energy(uuid)
to authenticated, service_role;

comment on function public.complete_mission_with_energy(uuid) is
  'Authenticated ownership-bound, completion-only mission Energy grant. Intended to replace toggle_mission_with_xp after runtime cutover.';

do $postcondition$
declare
  legacy_oid oid := to_regprocedure(
    'public.toggle_mission_with_xp(uuid,boolean)'
  );
  replacement_oid oid := to_regprocedure(
    'public.complete_mission_with_energy(uuid)'
  );
  legacy_public_execute boolean;
  replacement_public_execute boolean;
begin
  select coalesce(bool_or(expanded.grantee = 0), false)
  into legacy_public_execute
  from pg_catalog.pg_proc as function_record
  cross join lateral aclexplode(
    coalesce(function_record.proacl, acldefault('f', function_record.proowner))
  ) as expanded
  where function_record.oid = legacy_oid
    and expanded.privilege_type = 'EXECUTE';

  select coalesce(bool_or(expanded.grantee = 0), false)
  into replacement_public_execute
  from pg_catalog.pg_proc as function_record
  cross join lateral aclexplode(
    coalesce(function_record.proacl, acldefault('f', function_record.proowner))
  ) as expanded
  where function_record.oid = replacement_oid
    and expanded.privilege_type = 'EXECUTE';

  if has_function_privilege(
    'anon',
    'public.toggle_mission_with_xp(uuid,boolean)',
    'EXECUTE'
  ) or legacy_public_execute then
    raise exception 'Legacy mission function remains executable by an unauthenticated role';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.toggle_mission_with_xp(uuid,boolean)',
    'EXECUTE'
  ) then
    raise exception 'Legacy authenticated compatibility was not preserved';
  end if;

  if has_function_privilege(
    'anon',
    'public.complete_mission_with_energy(uuid)',
    'EXECUTE'
  ) or replacement_public_execute then
    raise exception 'Secure mission replacement has an unauthenticated grant';
  end if;
end
$postcondition$;

commit;
