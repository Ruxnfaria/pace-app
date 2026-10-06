begin;

create table public.user_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  crystals bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_wallets_crystals_nonnegative check (crystals >= 0)
);

create table public.currency_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  currency text not null default 'crystals',
  amount bigint not null,
  transaction_type text not null,
  source_type text not null,
  source_id text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint currency_transactions_currency_check
    check (currency in ('crystals')),
  constraint currency_transactions_amount_nonzero check (amount <> 0),
  constraint currency_transactions_type_check
    check (transaction_type in ('credit', 'debit', 'adjustment')),
  constraint currency_transactions_type_amount_check check (
    (transaction_type = 'credit' and amount > 0)
    or (transaction_type = 'debit' and amount < 0)
    or (transaction_type = 'adjustment' and amount <> 0)
  ),
  constraint currency_transactions_idempotency_not_blank
    check (btrim(idempotency_key) <> ''),
  constraint currency_transactions_user_idempotency_unique
    unique (user_id, idempotency_key)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  item_type text not null,
  rarity text not null,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_slug_not_blank check (btrim(slug) <> ''),
  constraint items_type_check check (
    item_type in (
      'core_fragment',
      'core_cosmetic',
      'streak_protection',
      'energy_boost'
    )
  ),
  constraint items_rarity_check check (rarity in ('common', 'rare', 'epic'))
);

create table public.user_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_inventory_quantity_nonnegative check (quantity >= 0),
  constraint user_inventory_user_item_unique unique (user_id, item_id)
);

create table public.chest_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  rarity text not null,
  description text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chest_definitions_slug_not_blank check (btrim(slug) <> ''),
  constraint chest_definitions_rarity_check
    check (rarity in ('common', 'rare', 'epic'))
);

create table public.user_chests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chest_definition_id uuid not null
    references public.chest_definitions(id) on delete restrict,
  status text not null default 'granted',
  source_type text not null,
  source_id text,
  idempotency_key text not null,
  granted_at timestamptz not null default now(),
  opened_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint user_chests_status_check check (status in ('granted', 'opened')),
  constraint user_chests_idempotency_not_blank
    check (btrim(idempotency_key) <> ''),
  constraint user_chests_opened_at_check check (
    (status = 'granted' and opened_at is null)
    or (status = 'opened' and opened_at is not null)
  ),
  constraint user_chests_user_idempotency_unique
    unique (user_id, idempotency_key)
);

create unique index user_chests_source_reward_unique
  on public.user_chests (
    user_id,
    chest_definition_id,
    source_type,
    source_id
  )
  where source_id is not null;

create table public.loot_tables (
  id uuid primary key default gen_random_uuid(),
  chest_definition_id uuid not null unique
    references public.chest_definitions(id) on delete cascade,
  name text not null,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loot_table_entries (
  id uuid primary key default gen_random_uuid(),
  loot_table_id uuid not null references public.loot_tables(id) on delete cascade,
  reward_type text not null,
  item_id uuid references public.items(id) on delete restrict,
  min_quantity integer not null,
  max_quantity integer not null,
  relative_weight numeric(12, 4) not null,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loot_table_entries_reward_type_check
    check (reward_type in ('crystals', 'energy', 'item')),
  constraint loot_table_entries_quantity_check
    check (min_quantity > 0 and max_quantity >= min_quantity),
  constraint loot_table_entries_weight_positive check (relative_weight > 0),
  constraint loot_table_entries_item_reference_check check (
    (reward_type = 'item' and item_id is not null)
    or (reward_type in ('crystals', 'energy') and item_id is null)
  )
);

create table public.user_boosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  boost_type text not null,
  multiplier numeric(8, 4) not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  source_type text not null,
  source_id text,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_boosts_type_check check (boost_type in ('energy_multiplier')),
  constraint user_boosts_multiplier_check check (multiplier > 1),
  constraint user_boosts_period_check check (expires_at > starts_at),
  constraint user_boosts_consumed_at_check
    check (consumed_at is null or consumed_at >= starts_at)
);

create table public.reward_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_type text not null,
  source_type text not null,
  source_id text,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint reward_transactions_type_check
    check (reward_type in ('energy', 'crystals', 'chest', 'item', 'boost')),
  constraint reward_transactions_idempotency_not_blank
    check (btrim(idempotency_key) <> ''),
  constraint reward_transactions_user_idempotency_unique
    unique (user_id, idempotency_key)
);

create unique index reward_transactions_source_reward_unique
  on public.reward_transactions (user_id, reward_type, source_type, source_id)
  where source_id is not null;

create index currency_transactions_user_created_idx
  on public.currency_transactions (user_id, created_at desc);
create index currency_transactions_source_idx
  on public.currency_transactions (source_type, source_id)
  where source_id is not null;
create index user_inventory_item_idx
  on public.user_inventory (item_id);
create index user_chests_user_status_granted_idx
  on public.user_chests (user_id, status, granted_at desc);
create index user_chests_definition_idx
  on public.user_chests (chest_definition_id);
create index loot_table_entries_table_active_idx
  on public.loot_table_entries (loot_table_id, active);
create index loot_table_entries_item_idx
  on public.loot_table_entries (item_id)
  where item_id is not null;
create index user_boosts_user_expiration_idx
  on public.user_boosts (user_id, expires_at desc);
create index user_boosts_source_idx
  on public.user_boosts (source_type, source_id)
  where source_id is not null;
create index reward_transactions_user_created_idx
  on public.reward_transactions (user_id, created_at desc);
create index reward_transactions_source_idx
  on public.reward_transactions (source_type, source_id)
  where source_id is not null;

create function public.reward_system_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_wallets_set_updated_at
before update on public.user_wallets
for each row execute function public.reward_system_set_updated_at();

create trigger items_set_updated_at
before update on public.items
for each row execute function public.reward_system_set_updated_at();

create trigger user_inventory_set_updated_at
before update on public.user_inventory
for each row execute function public.reward_system_set_updated_at();

create trigger chest_definitions_set_updated_at
before update on public.chest_definitions
for each row execute function public.reward_system_set_updated_at();

create trigger loot_tables_set_updated_at
before update on public.loot_tables
for each row execute function public.reward_system_set_updated_at();

create trigger loot_table_entries_set_updated_at
before update on public.loot_table_entries
for each row execute function public.reward_system_set_updated_at();

create function public.prevent_user_chest_reversion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'opened' and new.status <> 'opened' then
    raise exception 'An opened chest cannot return to granted';
  end if;

  return new;
end;
$$;

create trigger user_chests_prevent_reversion
before update of status on public.user_chests
for each row execute function public.prevent_user_chest_reversion();

revoke execute on function public.reward_system_set_updated_at() from public, anon, authenticated;
revoke execute on function public.prevent_user_chest_reversion() from public, anon, authenticated;

alter table public.user_wallets enable row level security;
alter table public.currency_transactions enable row level security;
alter table public.items enable row level security;
alter table public.user_inventory enable row level security;
alter table public.chest_definitions enable row level security;
alter table public.user_chests enable row level security;
alter table public.loot_tables enable row level security;
alter table public.loot_table_entries enable row level security;
alter table public.user_boosts enable row level security;
alter table public.reward_transactions enable row level security;

create policy user_wallets_select_own
  on public.user_wallets for select to authenticated
  using ((select auth.uid()) = user_id);

create policy currency_transactions_select_own
  on public.currency_transactions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy user_inventory_select_own
  on public.user_inventory for select to authenticated
  using ((select auth.uid()) = user_id);

create policy user_chests_select_own
  on public.user_chests for select to authenticated
  using ((select auth.uid()) = user_id);

create policy user_boosts_select_own
  on public.user_boosts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy reward_transactions_select_own
  on public.reward_transactions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy items_select_authenticated
  on public.items for select to authenticated
  using (true);

create policy chest_definitions_select_authenticated
  on public.chest_definitions for select to authenticated
  using (true);

create policy loot_tables_select_authenticated
  on public.loot_tables for select to authenticated
  using (true);

create policy loot_table_entries_select_authenticated
  on public.loot_table_entries for select to authenticated
  using (true);

revoke all on table public.user_wallets from anon, authenticated;
revoke all on table public.currency_transactions from anon, authenticated;
revoke all on table public.items from anon, authenticated;
revoke all on table public.user_inventory from anon, authenticated;
revoke all on table public.chest_definitions from anon, authenticated;
revoke all on table public.user_chests from anon, authenticated;
revoke all on table public.loot_tables from anon, authenticated;
revoke all on table public.loot_table_entries from anon, authenticated;
revoke all on table public.user_boosts from anon, authenticated;
revoke all on table public.reward_transactions from anon, authenticated;

grant select on table public.user_wallets to authenticated;
grant select on table public.currency_transactions to authenticated;
grant select on table public.items to authenticated;
grant select on table public.user_inventory to authenticated;
grant select on table public.chest_definitions to authenticated;
grant select on table public.user_chests to authenticated;
grant select on table public.loot_tables to authenticated;
grant select on table public.loot_table_entries to authenticated;
grant select on table public.user_boosts to authenticated;
grant select on table public.reward_transactions to authenticated;

insert into public.chest_definitions (slug, name, rarity, description)
values
  ('common_chest', 'Baú Comum', 'common', 'Recompensa comum do PRAXE.'),
  ('rare_chest', 'Baú Raro', 'rare', 'Recompensa rara do PRAXE.'),
  ('epic_chest', 'Baú Épico', 'epic', 'Recompensa épica do PRAXE.')
on conflict (slug) do nothing;

commit;
