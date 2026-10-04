create temporary table praxe_disposable_baseline_confirmation(
  token text primary key
);

insert into praxe_disposable_baseline_confirmation values
  ('I_CONFIRM_THIS_EMPTY_PROJECT_IS_NOT_PRODUCTION');

-- TEST/DISPOSABLE ONLY
-- DO NOT RUN IN PRODUCTION
-- DO NOT APPLY AS MIGRATION
--
-- Manual minimal reconstruction of the Production-relevant pre-00500 state.
-- It is NOT an authoritative Production dump. profiles, daily_missions and the
-- historical 20260907/20260909/20260911 migrations are absent from available
-- Git history; their contracts below are reconstructed from runtime use,
-- catalog audits and the disposable onboarding fixture.
--
-- Deliberate fidelity gate: currency_transactions does NOT contain
-- balance_after, matching the observed Production audit. open_user_chest is
-- reproduced without changing its locally reviewed body and still references
-- balance_after in its crystals branch. That branch is expected to fail until
-- disposable validation resolves the observed schema/function discrepancy.
--
-- Required same-session safety gate before opening this file:
--   create temporary table praxe_disposable_baseline_confirmation(
--     token text primary key
--   );
--   insert into praxe_disposable_baseline_confirmation values
--     ('I_CONFIRM_THIS_EMPTY_PROJECT_IS_NOT_PRODUCTION');

begin;

do $safety_gate$
declare
  confirmation text;
  collision_count integer;
begin
  if to_regclass('auth.users') is null then
    raise exception 'Hosted Supabase auth.users is required';
  end if;

  if to_regrole('anon') is null
    or to_regrole('authenticated') is null
    or to_regrole('service_role') is null
    or to_regprocedure('auth.uid()') is null
  then
    raise exception 'Required Supabase roles/auth.uid() are missing';
  end if;

  if to_regclass('pg_temp.praxe_disposable_baseline_confirmation') is null then
    raise exception 'Disposable baseline confirmation temp table is missing';
  end if;

  execute
    'select token from pg_temp.praxe_disposable_baseline_confirmation limit 1'
  into confirmation;

  if confirmation is distinct from
    'I_CONFIRM_THIS_EMPTY_PROJECT_IS_NOT_PRODUCTION'
  then
    raise exception 'Disposable baseline confirmation token is invalid';
  end if;

  select count(*)::integer
  into collision_count
  from (
    values
      ('profiles'::text),
      ('daily_missions'),
      ('user_wallets'),
      ('currency_transactions'),
      ('items'),
      ('user_inventory'),
      ('chest_definitions'),
      ('loot_tables'),
      ('loot_table_entries'),
      ('user_chests'),
      ('reward_transactions'),
      ('user_boosts'),
      ('user_streaks')
  ) as expected(table_name)
  where to_regclass('public.' || expected.table_name) is not null;

  if collision_count > 0 then
    raise exception
      'Baseline requires an empty public application schema; found % collisions',
      collision_count;
  end if;
end
$safety_gate$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text,
  peso numeric,
  altura numeric,
  objetivo text,
  status_assinatura text,
  created_at timestamptz not null default now(),
  total_xp integer not null default 0 check (total_xp >= 0),
  level integer not null default 1 check (level >= 1),
  streak integer not null default 0 check (streak >= 0),
  last_activity_date date,
  league text,
  weekly_xp integer not null default 0,
  best_league text,
  onboarding_completed boolean not null default false,
  onboarding_version integer,
  onboarding_completed_at timestamptz,
  nivel_experiencia text,
  idade integer,
  sexo text,
  dias_treino integer
);

create table public.daily_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  category text not null,
  target_value integer not null default 1 check (target_value > 0),
  current_value integer not null default 0 check (current_value >= 0),
  xp_reward integer not null default 50 check (
    xp_reward > 0 and xp_reward <= 500
  ),
  completed boolean not null default false,
  completed_at timestamptz,
  for_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index daily_missions_current_category_unique
  on public.daily_missions (user_id, for_date, category)
  where category in ('workout', 'nutrition', 'protein');

create table public.user_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  crystals bigint not null default 0 check (crystals >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Observed Production-compatible variant: balance_after is intentionally absent.
create table public.currency_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  currency text not null check (currency = 'crystals'),
  amount bigint not null check (amount <> 0),
  transaction_type text not null check (
    transaction_type in ('credit', 'debit', 'adjustment')
  ),
  source_type text not null,
  source_id text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
  ),
  created_at timestamptz not null default now(),
  constraint currency_transactions_amount_direction_check check (
    (transaction_type = 'credit' and amount > 0)
    or (transaction_type = 'debit' and amount < 0)
    or transaction_type = 'adjustment'
  ),
  constraint currency_transactions_user_idempotency_key unique (
    user_id,
    idempotency_key
  )
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  item_type text not null check (
    item_type in (
      'core_fragment', 'core_cosmetic', 'streak_protection', 'energy_boost'
    )
  ),
  rarity text not null check (rarity in ('common', 'rare', 'epic')),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Observed richer Production contract: created_at + metadata represent acquisition.
create table public.user_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_inventory_user_item_unique unique (user_id, item_id)
);

create table public.chest_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  rarity text not null check (rarity in ('common', 'rare', 'epic')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loot_tables (
  id uuid primary key default gen_random_uuid(),
  chest_definition_id uuid not null unique
    references public.chest_definitions(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loot_table_entries (
  id uuid primary key default gen_random_uuid(),
  loot_table_id uuid not null references public.loot_tables(id) on delete cascade,
  reward_type text not null check (
    reward_type in ('crystals', 'energy', 'item')
  ),
  item_id uuid references public.items(id) on delete restrict,
  min_quantity integer not null check (min_quantity > 0),
  max_quantity integer not null check (max_quantity >= min_quantity),
  relative_weight numeric(12, 4) not null check (relative_weight > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loot_table_entries_item_shape_check check (
    (reward_type = 'item' and item_id is not null)
    or (reward_type <> 'item' and item_id is null)
  )
);

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

create table public.user_chests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chest_definition_id uuid not null
    references public.chest_definitions(id) on delete restrict,
  status text not null default 'granted' check (
    status in ('granted', 'opened')
  ),
  source_type text not null,
  source_id text not null,
  idempotency_key text not null,
  granted_at timestamptz not null default now(),
  opened_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
  ),
  updated_at timestamptz not null default now(),
  constraint user_chests_opened_state_check check (
    (status = 'granted' and opened_at is null)
    or (status = 'opened' and opened_at is not null)
  ),
  constraint user_chests_user_idempotency_key unique (
    user_id,
    idempotency_key
  )
);

create unique index user_chests_reward_source_unique
  on public.user_chests (
    user_id,
    chest_definition_id,
    source_type,
    source_id
  );

create table public.reward_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_type text not null check (
    reward_type in ('energy', 'crystals', 'chest', 'item', 'boost')
  ),
  source_type text not null,
  source_id text,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb check (
    jsonb_typeof(payload) = 'object'
  ),
  created_at timestamptz not null default now(),
  constraint reward_transactions_user_idempotency_key unique (
    user_id,
    idempotency_key
  )
);

create unique index reward_transactions_source_reward_unique
  on public.reward_transactions (user_id, reward_type, source_type, source_id)
  where source_id is not null;

-- Observed Production timed-multiplier contract, not the proposed item model.
create table public.user_boosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  boost_type text not null check (boost_type = 'energy_multiplier'),
  multiplier numeric(8, 4) not null check (multiplier > 1),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  source_type text,
  source_id text,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
  ),
  created_at timestamptz not null default now(),
  constraint user_boosts_time_order_check check (expires_at > starts_at),
  constraint user_boosts_consumed_time_check check (
    consumed_at is null
    or (consumed_at >= starts_at and consumed_at <= expires_at)
  )
);

create table public.user_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (
    longest_streak >= current_streak
  ),
  last_active_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_streaks_activity_shape_check check (
    (current_streak = 0 and last_active_date is null)
    or (current_streak > 0 and last_active_date is not null)
  )
);

create index currency_transactions_user_created_idx
  on public.currency_transactions (user_id, created_at desc);
create index user_chests_user_status_idx
  on public.user_chests (user_id, status, granted_at desc);
create index user_inventory_user_idx
  on public.user_inventory (user_id);
create index user_boosts_user_expiration_idx
  on public.user_boosts (user_id, expires_at desc);
create index reward_transactions_user_created_idx
  on public.reward_transactions (user_id, created_at desc);
create index loot_table_entries_active_idx
  on public.loot_table_entries (loot_table_id, active);

create function public.set_gamification_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.prevent_user_chest_reversion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'opened' and (
    new.status <> old.status
    or new.opened_at is distinct from old.opened_at
  ) then
    raise exception using
      errcode = '23514',
      message = 'An opened chest is immutable';
  end if;

  return new;
end;
$$;

create trigger daily_missions_set_updated_at
before update on public.daily_missions
for each row execute function public.set_gamification_updated_at();
create trigger user_wallets_set_updated_at
before update on public.user_wallets
for each row execute function public.set_gamification_updated_at();
create trigger items_set_updated_at
before update on public.items
for each row execute function public.set_gamification_updated_at();
create trigger user_inventory_set_updated_at
before update on public.user_inventory
for each row execute function public.set_gamification_updated_at();
create trigger chest_definitions_set_updated_at
before update on public.chest_definitions
for each row execute function public.set_gamification_updated_at();
create trigger loot_tables_set_updated_at
before update on public.loot_tables
for each row execute function public.set_gamification_updated_at();
create trigger loot_table_entries_set_updated_at
before update on public.loot_table_entries
for each row execute function public.set_gamification_updated_at();
create trigger user_chests_set_updated_at
before update on public.user_chests
for each row execute function public.set_gamification_updated_at();
create trigger user_chests_prevent_reversion
before update on public.user_chests
for each row execute function public.prevent_user_chest_reversion();
create trigger user_streaks_set_updated_at
before update on public.user_streaks
for each row execute function public.set_gamification_updated_at();

alter table public.profiles enable row level security;
alter table public.daily_missions enable row level security;
alter table public.user_wallets enable row level security;
alter table public.currency_transactions enable row level security;
alter table public.items enable row level security;
alter table public.user_inventory enable row level security;
alter table public.chest_definitions enable row level security;
alter table public.loot_tables enable row level security;
alter table public.loot_table_entries enable row level security;
alter table public.user_chests enable row level security;
alter table public.reward_transactions enable row level security;
alter table public.user_boosts enable row level security;
alter table public.user_streaks enable row level security;

create policy profiles_select_own on public.profiles
for select to anon, authenticated using (auth.uid() = user_id);
create policy profiles_insert_own on public.profiles
for insert to anon, authenticated with check (auth.uid() = user_id);
create policy profiles_update_own on public.profiles
for update to anon, authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy daily_missions_select_own on public.daily_missions
for select to authenticated using (auth.uid() = user_id);
create policy daily_missions_insert_own on public.daily_missions
for insert to authenticated with check (auth.uid() = user_id);
create policy daily_missions_update_own on public.daily_missions
for update to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy daily_missions_delete_own on public.daily_missions
for delete to authenticated using (auth.uid() = user_id);

create policy user_wallets_select_own on public.user_wallets
for select to authenticated using (auth.uid() = user_id);
create policy currency_transactions_select_own on public.currency_transactions
for select to authenticated using (auth.uid() = user_id);
create policy user_inventory_select_own on public.user_inventory
for select to authenticated using (auth.uid() = user_id);
create policy user_chests_select_own on public.user_chests
for select to authenticated using (auth.uid() = user_id);
create policy user_boosts_select_own on public.user_boosts
for select to authenticated using (auth.uid() = user_id);
create policy reward_transactions_select_own on public.reward_transactions
for select to authenticated using (auth.uid() = user_id);
create policy user_streaks_select_own on public.user_streaks
for select to authenticated using (auth.uid() = user_id);
create policy items_select_active on public.items
for select to authenticated using (active);
create policy chest_definitions_select_active on public.chest_definitions
for select to authenticated using (active);
create policy loot_tables_select_active on public.loot_tables
for select to authenticated using (active);
create policy loot_table_entries_select_active on public.loot_table_entries
for select to authenticated using (active);

revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant insert (
  id, user_id, nome, peso, altura, objetivo, status_assinatura, created_at,
  total_xp, level, streak, last_activity_date, league, weekly_xp,
  best_league, onboarding_completed, nivel_experiencia, idade, sexo, dias_treino
) on public.profiles to anon;
grant update (
  id, user_id, nome, peso, altura, objetivo, status_assinatura, created_at,
  total_xp, level, streak, last_activity_date, league, weekly_xp,
  best_league, onboarding_completed, nivel_experiencia, idade, sexo, dias_treino
) on public.profiles to anon;
grant insert (
  user_id, total_xp, level, streak, last_activity_date
) on public.profiles to authenticated;
grant update (
  user_id, nome, peso, altura, objetivo, total_xp, level, streak,
  last_activity_date, league, weekly_xp, best_league,
  onboarding_completed, nivel_experiencia, idade, sexo, dias_treino
) on public.profiles to authenticated;
grant all on table public.profiles to service_role;

revoke all on table public.daily_missions from public, anon, authenticated;
grant select, insert, update, delete on table public.daily_missions
to authenticated;
grant all on table public.daily_missions to service_role;

revoke all on table
  public.user_wallets,
  public.currency_transactions,
  public.items,
  public.user_inventory,
  public.chest_definitions,
  public.loot_tables,
  public.loot_table_entries,
  public.user_chests,
  public.reward_transactions,
  public.user_boosts,
  public.user_streaks
from public, anon, authenticated;

grant select on table
  public.user_wallets,
  public.currency_transactions,
  public.items,
  public.user_inventory,
  public.chest_definitions,
  public.loot_tables,
  public.loot_table_entries,
  public.user_chests,
  public.reward_transactions,
  public.user_boosts,
  public.user_streaks
to authenticated;

grant all on table
  public.user_wallets,
  public.currency_transactions,
  public.items,
  public.user_inventory,
  public.chest_definitions,
  public.loot_tables,
  public.loot_table_entries,
  public.user_chests,
  public.reward_transactions,
  public.user_boosts,
  public.user_streaks
to service_role;

-- Reconstructed legacy Dashboard contract. Its body is not present in Git.
-- PUBLIC/anon execution and search_path=public intentionally reproduce the
-- observed pre-00500 blocker; ownership still derives from auth.uid().
create function public.toggle_mission_with_xp(
  p_mission_id uuid,
  p_completed boolean
)
returns table (
  mission_id uuid,
  completed boolean,
  total_xp integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_was_completed boolean;
  v_reward integer;
  v_total_xp integer;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select mission.completed, greatest(coalesce(mission.xp_reward, 0), 0)
  into v_was_completed, v_reward
  from public.daily_missions as mission
  where mission.id = p_mission_id and mission.user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Mission not found';
  end if;

  if v_was_completed is distinct from p_completed then
    update public.profiles as profile
    set total_xp = greatest(
          coalesce(profile.total_xp, 0)
          + case when p_completed then v_reward else -v_reward end,
          0
        ),
        level = greatest(
          floor(
            greatest(
              coalesce(profile.total_xp, 0)
              + case when p_completed then v_reward else -v_reward end,
              0
            )::numeric / 500
          )::integer + 1,
          1
        )
    where profile.user_id = v_user_id
    returning profile.total_xp into v_total_xp;

    update public.daily_missions as mission
    set completed = p_completed,
        current_value = case
          when p_completed then greatest(mission.current_value, mission.target_value)
          else 0
        end,
        completed_at = case when p_completed then now() else null end
    where mission.id = p_mission_id and mission.user_id = v_user_id;
  else
    select profile.total_xp into v_total_xp
    from public.profiles as profile
    where profile.user_id = v_user_id;
  end if;

  return query select p_mission_id, p_completed, v_total_xp;
end;
$$;

grant execute on function public.toggle_mission_with_xp(uuid, boolean)
to public, anon, authenticated;

-- Reconstructed observed recorder: Brazil date, row locking and service-only,
-- but intentionally no profiles.streak synchronization before 00600.
create function public.record_user_streak_activity(p_user_id uuid)
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
  v_current integer;
  v_longest integer;
  v_last date;
begin
  if p_user_id is null then
    raise exception using errcode = '22004', message = 'User id is required';
  end if;

  perform 1 from public.profiles as profile
  where profile.user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  select streak.current_streak, streak.longest_streak, streak.last_active_date
  into v_current, v_longest, v_last
  from public.user_streaks as streak
  where streak.user_id = p_user_id
  for update;

  if not found then
    v_current := 1;
    v_longest := 1;
  elsif v_last = v_today then
    null;
  elsif v_last = v_today - 1 then
    v_current := v_current + 1;
    v_longest := greatest(v_longest, v_current);
  else
    v_current := 1;
  end if;

  insert into public.user_streaks (
    user_id, current_streak, longest_streak, last_active_date
  )
  values (p_user_id, v_current, v_longest, v_today)
  on conflict on constraint user_streaks_pkey do update
  set current_streak = excluded.current_streak,
      longest_streak = excluded.longest_streak,
      last_active_date = excluded.last_active_date;

  return query select p_user_id, v_current, v_current, v_longest, v_today;
end;
$$;

create function public.get_my_streak()
returns table (
  user_id uuid,
  current_streak integer,
  longest_streak integer,
  last_active_date date,
  source text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    profile.user_id,
    coalesce(streak.current_streak, greatest(coalesce(profile.streak, 0), 0)),
    coalesce(streak.longest_streak, greatest(coalesce(profile.streak, 0), 0)),
    streak.last_active_date,
    case when streak.user_id is null then 'profiles_legacy' else 'user_streaks' end
  from public.profiles as profile
  left join public.user_streaks as streak on streak.user_id = profile.user_id
  where profile.user_id = auth.uid()
$$;

revoke all on function public.record_user_streak_activity(uuid)
from public, anon, authenticated;
grant execute on function public.record_user_streak_activity(uuid)
to service_role;
revoke all on function public.get_my_streak() from public, anon;
grant execute on function public.get_my_streak() to authenticated;

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
      and transaction_record.idempotency_key =
        'chest_open:' || p_chest_id::text;

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
  where entry.loot_table_id = v_loot_table_id and entry.active = true;

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
        order by entry.id rows between unbounded preceding and current row
      ) as cumulative_weight
    from public.loot_table_entries as entry
    where entry.loot_table_id = v_loot_table_id and entry.active = true
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

    -- EXPECTED FAILURE GATE: observed table has no balance_after column.
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
  where id = p_chest_id and user_id = v_user_id and status = 'granted';

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

revoke all on function public.open_user_chest(uuid) from public, anon;
grant execute on function public.open_user_chest(uuid) to authenticated;
revoke all on function public.set_gamification_updated_at()
from public, anon, authenticated;
revoke all on function public.prevent_user_chest_reversion()
from public, anon, authenticated;

commit;

select
  'DISPOSABLE_BASELINE_CREATED'::text as status,
  false as currency_transactions_has_balance_after,
  true as open_user_chest_references_balance_after,
  'EXPECTED_FAILURE_GATE'::text as crystal_branch_state;
