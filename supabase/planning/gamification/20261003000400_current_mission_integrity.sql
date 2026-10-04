begin;

lock table public.daily_missions in share row exclusive mode;

do $$
begin
  if exists (
    select 1
    from public.daily_missions as mission
    where mission.category in ('workout', 'nutrition', 'protein')
    group by mission.user_id, mission.for_date, mission.category
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Duplicate current daily missions must be reconciled before migration';
  end if;
end;
$$;

create unique index daily_missions_current_category_unique
  on public.daily_missions (user_id, for_date, category)
  where category in ('workout', 'nutrition', 'protein');

create function public.upsert_current_daily_mission(
  p_user_id uuid,
  p_for_date date,
  p_category text,
  p_title text,
  p_description text,
  p_target_value integer,
  p_current_value integer,
  p_energy_reward integer
)
returns table (
  mission_id uuid,
  completed boolean,
  completed_now boolean,
  energy_awarded integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mission_id uuid;
  v_was_completed boolean;
  v_is_completed boolean;
  v_completed_now boolean := false;
  v_energy_awarded integer := 0;
begin
  if p_user_id is null
    or p_for_date is null
    or p_category is null
    or p_category not in ('workout', 'nutrition', 'protein')
    or nullif(btrim(p_title), '') is null
    or p_target_value is null
    or p_target_value <= 0
    or p_current_value is null
    or p_current_value < 0
    or p_energy_reward is null
    or p_energy_reward <= 0
    or p_energy_reward > 500
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid current mission arguments';
  end if;

  v_is_completed := p_current_value >= p_target_value;

  select mission.id, mission.completed
  into v_mission_id, v_was_completed
  from public.daily_missions as mission
  where mission.user_id = p_user_id
    and mission.for_date = p_for_date
    and mission.category = p_category
  for update;

  if not found then
    begin
      insert into public.daily_missions (
        user_id,
        title,
        description,
        category,
        target_value,
        current_value,
        xp_reward,
        completed,
        completed_at,
        for_date
      )
      values (
        p_user_id,
        p_title,
        p_description,
        p_category,
        p_target_value,
        least(p_current_value, p_target_value),
        p_energy_reward,
        v_is_completed,
        case when v_is_completed then now() else null end,
        p_for_date
      )
      returning id, daily_missions.completed
      into v_mission_id, v_was_completed;

      v_completed_now := v_was_completed;
    exception
      when unique_violation then
        select mission.id, mission.completed
        into v_mission_id, v_was_completed
        from public.daily_missions as mission
        where mission.user_id = p_user_id
          and mission.for_date = p_for_date
          and mission.category = p_category
        for update;

        if not found then
          raise;
        end if;
    end;
  end if;

  if not v_completed_now then
    v_completed_now := not v_was_completed and v_is_completed;

    update public.daily_missions as mission
    set
      title = p_title,
      description = p_description,
      target_value = p_target_value,
      current_value = least(p_current_value, p_target_value),
      xp_reward = p_energy_reward,
      completed = mission.completed or v_is_completed,
      completed_at = case
        when mission.completed then mission.completed_at
        when v_is_completed then now()
        else null
      end
    where mission.id = v_mission_id;
  end if;

  if v_completed_now then
    update public.profiles as profile
    set total_xp = coalesce(profile.total_xp, 0) + p_energy_reward
    where profile.user_id = p_user_id;

    if not found then
      raise exception using errcode = 'P0002', message = 'Profile not found';
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
      p_user_id,
      'energy',
      'daily_mission_completion',
      v_mission_id::text,
      'daily_mission_completion:' || v_mission_id::text,
      jsonb_build_object(
        'mission_id', v_mission_id,
        'category', p_category,
        'logical_date', p_for_date,
        'amount', p_energy_reward
      )
    );

    v_energy_awarded := p_energy_reward;

    perform public.sync_user_mission_rewards(p_user_id, p_for_date);
    perform public.record_user_streak_activity(p_user_id);
  end if;

  return query select
    v_mission_id,
    v_was_completed or v_is_completed,
    v_completed_now,
    v_energy_awarded;
end;
$$;

revoke all on function public.upsert_current_daily_mission(
  uuid,
  date,
  text,
  text,
  text,
  integer,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.upsert_current_daily_mission(
  uuid,
  date,
  text,
  text,
  text,
  integer,
  integer,
  integer
) to service_role;

commit;
