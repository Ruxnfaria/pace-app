begin;

create table public.user_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  crystals bigint not null default 0 check (crystals >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.currency_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  currency text not null check (currency = 'crystals'),
  amount bigint not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  transaction_type text not null
    check (transaction_type in ('credit', 'debit', 'adjustment')),
  source_type text not null,
  source_id text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
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
      'core_fragment',
      'core_cosmetic',
      'streak_protection',
      'energy_boost'
    )
  ),
  rarity text not null check (rarity in ('common', 'rare', 'epic')),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  acquired_at timestamptz not null default now(),
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

create table public.user_chests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chest_definition_id uuid not null
    references public.chest_definitions(id) on delete restrict,
  status text not null default 'granted'
    check (status in ('granted', 'opened')),
  source_type text not null,
  source_id text not null,
  idempotency_key text not null,
  granted_at timestamptz not null default now(),
  opened_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
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
  loot_table_id uuid not null
    references public.loot_tables(id) on delete cascade,
  reward_type text not null
    check (reward_type in ('crystals', 'energy', 'item')),
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

create table public.user_boosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  status text not null default 'available'
    check (status in ('available', 'active', 'consumed', 'expired')),
  quantity integer not null default 1 check (quantity > 0),
  starts_at timestamptz,
  expires_at timestamptz,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_boosts_time_order_check check (
    expires_at is null or starts_at is null or expires_at > starts_at
  )
);

create table public.reward_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_type text not null
    check (reward_type in ('energy', 'crystals', 'chest', 'item', 'boost')),
  source_type text not null,
  source_id text,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  constraint reward_transactions_user_idempotency_key unique (
    user_id,
    idempotency_key
  )
);

create unique index reward_transactions_source_reward_unique
  on public.reward_transactions (user_id, reward_type, source_type, source_id)
  where source_id is not null;

create index currency_transactions_user_created_idx
  on public.currency_transactions (user_id, created_at desc);
create index user_chests_user_status_idx
  on public.user_chests (user_id, status, granted_at desc);
create index user_inventory_user_idx
  on public.user_inventory (user_id);
create index user_boosts_user_status_idx
  on public.user_boosts (user_id, status);
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
create trigger user_boosts_set_updated_at
before update on public.user_boosts
for each row execute function public.set_gamification_updated_at();
create trigger user_chests_prevent_reversion
before update on public.user_chests
for each row execute function public.prevent_user_chest_reversion();

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

create policy user_wallets_select_own on public.user_wallets
for select to authenticated using ((select auth.uid()) = user_id);
create policy currency_transactions_select_own on public.currency_transactions
for select to authenticated using ((select auth.uid()) = user_id);
create policy user_inventory_select_own on public.user_inventory
for select to authenticated using ((select auth.uid()) = user_id);
create policy user_chests_select_own on public.user_chests
for select to authenticated using ((select auth.uid()) = user_id);
create policy user_boosts_select_own on public.user_boosts
for select to authenticated using ((select auth.uid()) = user_id);
create policy reward_transactions_select_own on public.reward_transactions
for select to authenticated using ((select auth.uid()) = user_id);
create policy items_select_active on public.items
for select to authenticated using (active);
create policy chest_definitions_select_active on public.chest_definitions
for select to authenticated using (active);
create policy loot_tables_select_active on public.loot_tables
for select to authenticated using (active);
create policy loot_table_entries_select_active on public.loot_table_entries
for select to authenticated using (active);

revoke all on table
  public.user_wallets,
  public.currency_transactions,
  public.items,
  public.user_inventory,
  public.chest_definitions,
  public.user_chests,
  public.loot_tables,
  public.loot_table_entries,
  public.user_boosts,
  public.reward_transactions
from public, anon, authenticated;

grant select on table
  public.user_wallets,
  public.currency_transactions,
  public.items,
  public.user_inventory,
  public.chest_definitions,
  public.user_chests,
  public.loot_tables,
  public.loot_table_entries,
  public.user_boosts,
  public.reward_transactions
to authenticated;

grant all on table
  public.user_wallets,
  public.currency_transactions,
  public.items,
  public.user_inventory,
  public.chest_definitions,
  public.user_chests,
  public.loot_tables,
  public.loot_table_entries,
  public.user_boosts,
  public.reward_transactions
to service_role;

revoke all on function public.set_gamification_updated_at() from public, anon, authenticated;
revoke all on function public.prevent_user_chest_reversion() from public, anon, authenticated;

commit;
