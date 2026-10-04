begin;

insert into public.chest_definitions (slug, name, description, rarity, active)
values
  ('common_chest', 'Baú Comum', 'Recompensa por progresso diário.', 'common', true),
  ('rare_chest', 'Baú Raro', 'Recompensa por consistência.', 'rare', true),
  ('epic_chest', 'Baú Épico', 'Recompensa por um ciclo excepcional.', 'epic', true);

insert into public.loot_tables (chest_definition_id, name, active)
select
  chest.id,
  case chest.slug
    when 'common_chest' then 'Loot do Baú Comum'
    when 'rare_chest' then 'Loot do Baú Raro'
    when 'epic_chest' then 'Loot do Baú Épico'
  end,
  true
from public.chest_definitions as chest
where chest.slug in ('common_chest', 'rare_chest', 'epic_chest');

create unique index loot_table_entries_currency_reward_unique
  on public.loot_table_entries (
    loot_table_id,
    reward_type,
    min_quantity,
    max_quantity
  )
  where item_id is null;

create unique index loot_table_entries_item_reward_unique
  on public.loot_table_entries (
    loot_table_id,
    item_id,
    min_quantity,
    max_quantity
  )
  where item_id is not null;

with loot_seed (chest_slug, reward_type, amount, relative_weight) as (
  values
    ('common_chest', 'crystals', 5, 35::numeric),
    ('common_chest', 'crystals', 10, 25::numeric),
    ('common_chest', 'crystals', 15, 10::numeric),
    ('common_chest', 'energy', 25, 20::numeric),
    ('common_chest', 'energy', 50, 10::numeric),
    ('rare_chest', 'crystals', 20, 25::numeric),
    ('rare_chest', 'crystals', 30, 20::numeric),
    ('rare_chest', 'crystals', 50, 10::numeric),
    ('rare_chest', 'energy', 75, 25::numeric),
    ('rare_chest', 'energy', 100, 20::numeric),
    ('epic_chest', 'crystals', 50, 20::numeric),
    ('epic_chest', 'crystals', 75, 20::numeric),
    ('epic_chest', 'crystals', 100, 15::numeric),
    ('epic_chest', 'crystals', 150, 5::numeric),
    ('epic_chest', 'energy', 100, 20::numeric),
    ('epic_chest', 'energy', 150, 15::numeric),
    ('epic_chest', 'energy', 200, 5::numeric)
)
insert into public.loot_table_entries (
  loot_table_id,
  reward_type,
  min_quantity,
  max_quantity,
  relative_weight,
  active
)
select
  loot_table.id,
  loot_seed.reward_type,
  loot_seed.amount,
  loot_seed.amount,
  loot_seed.relative_weight,
  true
from loot_seed
join public.chest_definitions as chest
  on chest.slug = loot_seed.chest_slug
join public.loot_tables as loot_table
  on loot_table.chest_definition_id = chest.id;

create function public.grant_user_chest(
  p_user_id uuid,
  p_chest_slug text,
  p_source_type text,
  p_source_id text,
  p_idempotency_key text
)
returns table (
  chest_id uuid,
  chest_slug text,
  chest_status text,
  granted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chest_definition_id uuid;
  v_chest_id uuid;
  v_chest_status text;
  v_granted_at timestamptz;
  v_existing_slug text;
  v_existing_source_type text;
  v_existing_source_id text;
begin
  if p_user_id is null
    or nullif(btrim(p_chest_slug), '') is null
    or nullif(btrim(p_source_type), '') is null
    or nullif(btrim(p_source_id), '') is null
    or nullif(btrim(p_idempotency_key), '') is null
  then
    raise exception using
      errcode = '22023',
      message = 'All chest grant arguments are required';
  end if;

  select definition.id
  into v_chest_definition_id
  from public.chest_definitions as definition
  where definition.slug = p_chest_slug
    and definition.active = true;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Active chest definition not found';
  end if;

  begin
    insert into public.user_chests (
      user_id,
      chest_definition_id,
      source_type,
      source_id,
      idempotency_key
    )
    values (
      p_user_id,
      v_chest_definition_id,
      p_source_type,
      p_source_id,
      p_idempotency_key
    )
    returning id, status, user_chests.granted_at
    into v_chest_id, v_chest_status, v_granted_at;
  exception
    when unique_violation then
      select
        user_chest.id,
        definition.slug,
        user_chest.status,
        user_chest.source_type,
        user_chest.source_id,
        user_chest.granted_at
      into
        v_chest_id,
        v_existing_slug,
        v_chest_status,
        v_existing_source_type,
        v_existing_source_id,
        v_granted_at
      from public.user_chests as user_chest
      join public.chest_definitions as definition
        on definition.id = user_chest.chest_definition_id
      where user_chest.user_id = p_user_id
        and (
          user_chest.idempotency_key = p_idempotency_key
          or (
            user_chest.chest_definition_id = v_chest_definition_id
            and user_chest.source_type = p_source_type
            and user_chest.source_id = p_source_id
          )
        )
      order by (user_chest.idempotency_key = p_idempotency_key) desc
      limit 1;

      if not found
        or v_existing_slug <> p_chest_slug
        or v_existing_source_type <> p_source_type
        or v_existing_source_id <> p_source_id
      then
        raise exception using
          errcode = '23505',
          message = 'Chest idempotency key conflicts with a different grant';
      end if;
  end;

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
    'chest',
    p_source_type,
    p_source_id,
    'chest_grant:' || p_idempotency_key,
    jsonb_build_object(
      'chest_id', v_chest_id,
      'chest_slug', p_chest_slug
    )
  )
  on conflict do nothing;

  return query
  select v_chest_id, p_chest_slug, v_chest_status, v_granted_at;
end;
$$;

create function public.sync_user_mission_rewards(
  p_user_id uuid,
  p_for_date date
)
returns table (
  chest_id uuid,
  chest_slug text,
  chest_status text,
  granted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_daily_count integer;
  v_weekly_count integer;
  v_monthly_active_days integer;
  v_week_start date;
  v_week_end date;
  v_month_start date;
  v_month_end date;
  v_week_id text;
  v_month_id text;
begin
  if p_user_id is null or p_for_date is null then
    raise exception using
      errcode = '22004',
      message = 'User id and logical date are required';
  end if;

  v_week_start := date_trunc('week', p_for_date::timestamp)::date;
  v_week_end := v_week_start + 6;
  v_month_start := date_trunc('month', p_for_date::timestamp)::date;
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;
  v_week_id := to_char(v_week_start, 'YYYY-MM-DD');
  v_month_id := to_char(v_month_start, 'YYYY-MM');

  select count(*)::integer
  into v_daily_count
  from public.daily_missions as mission
  where mission.user_id = p_user_id
    and mission.for_date = p_for_date
    and mission.category in ('workout', 'nutrition', 'protein')
    and mission.completed = true;

  select count(*)::integer
  into v_weekly_count
  from public.daily_missions as mission
  where mission.user_id = p_user_id
    and mission.for_date between v_week_start and v_week_end
    and mission.category in ('workout', 'nutrition', 'protein')
    and mission.completed = true;

  select count(distinct mission.for_date)::integer
  into v_monthly_active_days
  from public.daily_missions as mission
  where mission.user_id = p_user_id
    and mission.for_date between v_month_start and v_month_end
    and mission.category in ('workout', 'nutrition', 'protein')
    and mission.completed = true;

  if v_daily_count >= 2 then
    return query select * from public.grant_user_chest(
      p_user_id,
      'common_chest',
      'daily_mission_milestone',
      'daily-common:' || p_for_date::text,
      'daily-common:' || p_for_date::text
    );
  end if;

  if v_daily_count >= 3 then
    return query select * from public.grant_user_chest(
      p_user_id,
      'rare_chest',
      'daily_mission_milestone',
      'daily-rare:' || p_for_date::text,
      'daily-rare:' || p_for_date::text
    );
  end if;

  if v_weekly_count >= 15 then
    return query select * from public.grant_user_chest(
      p_user_id,
      'rare_chest',
      'weekly_mission',
      'weekly:' || v_week_id,
      'weekly:' || v_week_id
    );
  end if;

  if v_monthly_active_days >= 20 then
    return query select * from public.grant_user_chest(
      p_user_id,
      'epic_chest',
      'monthly_mission',
      'monthly:' || v_month_id,
      'monthly:' || v_month_id
    );
  end if;
end;
$$;

create function public.open_user_chest(p_chest_id uuid)
returns table (
  chest_id uuid,
  chest_slug text,
  chest_name text,
  chest_rarity text,
  reward_type text,
  amount integer,
  item_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_chest_status text;
  v_chest_slug text;
  v_chest_name text;
  v_chest_rarity text;
  v_loot_table_id uuid;
  v_reward_type text;
  v_item_id uuid;
  v_min_quantity integer;
  v_max_quantity integer;
  v_amount integer;
  v_total_weight numeric;
  v_roll numeric;
  v_balance_after bigint;
  v_payload jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if p_chest_id is null then
    raise exception using errcode = '22004', message = 'Chest id is required';
  end if;

  select
    user_chest.status,
    definition.slug,
    definition.name,
    definition.rarity,
    loot_table.id
  into
    v_chest_status,
    v_chest_slug,
    v_chest_name,
    v_chest_rarity,
    v_loot_table_id
  from public.user_chests as user_chest
  join public.chest_definitions as definition
    on definition.id = user_chest.chest_definition_id
  left join public.loot_tables as loot_table
    on loot_table.chest_definition_id = definition.id
    and loot_table.active = true
  where user_chest.id = p_chest_id
    and user_chest.user_id = v_user_id
  for update of user_chest;

  if not found then
    raise exception using errcode = 'P0002', message = 'Chest not found';
  end if;

  if v_chest_status = 'opened' then
    select
      transaction_record.reward_type,
      (transaction_record.payload ->> 'amount')::integer,
      nullif(transaction_record.payload ->> 'item_id', '')::uuid
    into v_reward_type, v_amount, v_item_id
    from public.reward_transactions as transaction_record
    where transaction_record.user_id = v_user_id
      and transaction_record.idempotency_key = 'chest_open:' || p_chest_id::text;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'Opened chest has no persisted reward';
    end if;

    return query select
      p_chest_id,
      v_chest_slug,
      v_chest_name,
      v_chest_rarity,
      v_reward_type,
      v_amount,
      v_item_id;
    return;
  end if;

  if v_chest_status <> 'granted' or v_loot_table_id is null then
    raise exception using errcode = 'P0001', message = 'Chest is not openable';
  end if;

  select sum(entry.relative_weight)
  into v_total_weight
  from public.loot_table_entries as entry
  where entry.loot_table_id = v_loot_table_id
    and entry.active = true;

  if v_total_weight is null or v_total_weight <= 0 then
    raise exception using errcode = 'P0001', message = 'Chest has no active loot';
  end if;

  v_roll := random() * v_total_weight;

  select
    weighted.reward_type,
    weighted.item_id,
    weighted.min_quantity,
    weighted.max_quantity
  into v_reward_type, v_item_id, v_min_quantity, v_max_quantity
  from (
    select
      entry.reward_type,
      entry.item_id,
      entry.min_quantity,
      entry.max_quantity,
      sum(entry.relative_weight) over (
        order by entry.id
        rows between unbounded preceding and current row
      ) as cumulative_weight
    from public.loot_table_entries as entry
    where entry.loot_table_id = v_loot_table_id
      and entry.active = true
  ) as weighted
  where weighted.cumulative_weight > v_roll
  order by weighted.cumulative_weight
  limit 1;

  if not found then
    raise exception using errcode = 'P0001', message = 'Unable to select reward';
  end if;

  v_amount := v_min_quantity
    + floor(random() * (v_max_quantity - v_min_quantity + 1))::integer;

  if v_reward_type = 'crystals' then
    insert into public.user_wallets as wallet (user_id, crystals)
    values (v_user_id, v_amount)
    on conflict (user_id) do update
      set crystals = wallet.crystals + excluded.crystals
    returning wallet.crystals into v_balance_after;

    insert into public.currency_transactions (
      user_id,
      currency,
      amount,
      balance_after,
      transaction_type,
      source_type,
      source_id,
      idempotency_key,
      metadata
    )
    values (
      v_user_id,
      'crystals',
      v_amount,
      v_balance_after,
      'credit',
      'chest_open',
      p_chest_id::text,
      'chest_open:' || p_chest_id::text || ':crystals',
      jsonb_build_object('chest_slug', v_chest_slug)
    );
  elsif v_reward_type = 'energy' then
    update public.profiles
    set total_xp = coalesce(total_xp, 0) + v_amount
    where user_id = v_user_id;

    if not found then
      raise exception using errcode = 'P0002', message = 'Profile not found';
    end if;
  elsif v_reward_type = 'item' then
    raise exception using errcode = '0A000', message = 'Item rewards are not enabled';
  else
    raise exception using errcode = '22023', message = 'Unsupported reward type';
  end if;

  v_payload := jsonb_build_object(
    'chest_id', p_chest_id,
    'chest_slug', v_chest_slug,
    'reward_type', v_reward_type,
    'amount', v_amount,
    'item_id', v_item_id
  );

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
    v_reward_type,
    'chest_open',
    p_chest_id::text,
    'chest_open:' || p_chest_id::text,
    v_payload
  );

  update public.user_chests
  set status = 'opened', opened_at = now()
  where id = p_chest_id
    and user_id = v_user_id
    and status = 'granted';

  if not found then
    raise exception using errcode = '40001', message = 'Chest state changed';
  end if;

  return query select
    p_chest_id,
    v_chest_slug,
    v_chest_name,
    v_chest_rarity,
    v_reward_type,
    v_amount,
    v_item_id;
end;
$$;

revoke all on function public.grant_user_chest(uuid, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.grant_user_chest(uuid, text, text, text, text)
to service_role;

revoke all on function public.sync_user_mission_rewards(uuid, date)
from public, anon, authenticated;
grant execute on function public.sync_user_mission_rewards(uuid, date)
to service_role;

revoke all on function public.open_user_chest(uuid)
from public, anon;
grant execute on function public.open_user_chest(uuid) to authenticated;

commit;
