-- Preparation only: manual review required; do not run automatically.
-- Additive detail tables; no backfill or parent-summary synchronization.
begin;

set local lock_timeout = '5s';

do $preflight$
declare
  candidate_name text;
  parent_oid oid;
  parent_user_attnum smallint;
begin
  foreach candidate_name in array array[
    'nutrition_profile_restrictions',
    'nutrition_profile_disliked_foods',
    'nutrition_profile_preferred_foods',
    'nutrition_profile_supplements'
  ] loop
    if pg_catalog.to_regclass('public.' || candidate_name) is not null then
      raise exception 'Relation public.% already exists; audit before proceeding', candidate_name;
    end if;
  end loop;

  parent_oid := pg_catalog.to_regclass('public.nutrition_profiles');
  if parent_oid is null or not exists (
    select 1 from pg_catalog.pg_class
    where oid = parent_oid and relkind in ('r', 'p')
  ) then
    raise exception 'Required parent table public.nutrition_profiles is missing or incompatible';
  end if;

  select a.attnum into parent_user_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = parent_oid
    and a.attname = 'user_id'
    and a.attnum > 0 and not a.attisdropped
    and a.atttypid = 'pg_catalog.uuid'::regtype
    and a.attnotnull;

  if parent_user_attnum is null then
    raise exception 'public.nutrition_profiles.user_id must exist as uuid NOT NULL';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_index i
    where i.indrelid = parent_oid
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indpred is null and i.indexprs is null
      and i.indnkeyatts = 1 and i.indkey[0] = parent_user_attnum
  ) then
    raise exception 'public.nutrition_profiles.user_id requires a valid non-partial immediate UNIQUE key suitable for a foreign key';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'reward_system_set_updated_at'
      and p.prokind = 'f' and p.pronargs = 0
      and p.prorettype = 'pg_catalog.trigger'::regtype
  ) then
    raise exception 'Required public.reward_system_set_updated_at() trigger function is missing or incompatible';
  end if;
end
$preflight$;

create table public.nutrition_profile_restrictions (
  id uuid constraint nutrition_profile_restrictions_pkey primary key default gen_random_uuid(),
  user_id uuid not null,
  restriction_type text not null,
  restriction_code text,
  declared_label varchar(160) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nutrition_profile_restrictions_user_fk foreign key (user_id)
    references public.nutrition_profiles(user_id) on delete cascade,
  constraint nutrition_profile_restrictions_type_check check (
    restriction_type in ('allergy', 'intolerance', 'dietary_restriction', 'other')
  ),
  constraint nutrition_profile_restrictions_code_check check (
    restriction_code is null or restriction_code in (
      'lactose', 'gluten', 'milk', 'egg', 'peanut',
      'tree_nuts', 'soy', 'fish', 'shellfish'
    )
  ),
  constraint nutrition_profile_restrictions_label_check check (
    btrim(declared_label) <> ''
  )
);

create unique index nutrition_profile_restrictions_label_unique
  on public.nutrition_profile_restrictions (user_id, lower(btrim(declared_label)));

create trigger nutrition_profile_restrictions_set_updated_at
  before update on public.nutrition_profile_restrictions
  for each row execute function public.reward_system_set_updated_at();

alter table public.nutrition_profile_restrictions enable row level security;

create policy nutrition_profile_restrictions_select_own
  on public.nutrition_profile_restrictions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy nutrition_profile_restrictions_insert_own
  on public.nutrition_profile_restrictions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy nutrition_profile_restrictions_update_own
  on public.nutrition_profile_restrictions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.nutrition_profile_restrictions from public, anon, authenticated;

grant select on table public.nutrition_profile_restrictions to authenticated;

grant insert (user_id, restriction_type, restriction_code, declared_label)
  on public.nutrition_profile_restrictions to authenticated;

grant update (restriction_type, restriction_code, declared_label)
  on public.nutrition_profile_restrictions to authenticated;

grant select, insert, update, delete
  on public.nutrition_profile_restrictions to service_role;

create table public.nutrition_profile_disliked_foods (
  id uuid constraint nutrition_profile_disliked_foods_pkey primary key default gen_random_uuid(),
  user_id uuid not null,
  food_code text,
  declared_label varchar(160) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nutrition_profile_disliked_foods_user_fk foreign key (user_id)
    references public.nutrition_profiles(user_id) on delete cascade,
  constraint nutrition_profile_disliked_foods_label_check check (
    btrim(declared_label) <> ''
  )
);

create unique index nutrition_profile_disliked_foods_label_unique
  on public.nutrition_profile_disliked_foods (user_id, lower(btrim(declared_label)));

create trigger nutrition_profile_disliked_foods_set_updated_at
  before update on public.nutrition_profile_disliked_foods
  for each row execute function public.reward_system_set_updated_at();

alter table public.nutrition_profile_disliked_foods enable row level security;

create policy nutrition_profile_disliked_foods_select_own
  on public.nutrition_profile_disliked_foods for select to authenticated
  using ((select auth.uid()) = user_id);

create policy nutrition_profile_disliked_foods_insert_own
  on public.nutrition_profile_disliked_foods for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy nutrition_profile_disliked_foods_update_own
  on public.nutrition_profile_disliked_foods for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.nutrition_profile_disliked_foods from public, anon, authenticated;

grant select on table public.nutrition_profile_disliked_foods to authenticated;

grant insert (user_id, declared_label)
  on public.nutrition_profile_disliked_foods to authenticated;

grant update (declared_label)
  on public.nutrition_profile_disliked_foods to authenticated;

grant select, insert, update, delete
  on public.nutrition_profile_disliked_foods to service_role;

create table public.nutrition_profile_preferred_foods (
  id uuid constraint nutrition_profile_preferred_foods_pkey primary key default gen_random_uuid(),
  user_id uuid not null,
  food_code text,
  declared_label varchar(160) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nutrition_profile_preferred_foods_user_fk foreign key (user_id)
    references public.nutrition_profiles(user_id) on delete cascade,
  constraint nutrition_profile_preferred_foods_label_check check (
    btrim(declared_label) <> ''
  )
);

create unique index nutrition_profile_preferred_foods_label_unique
  on public.nutrition_profile_preferred_foods (user_id, lower(btrim(declared_label)));

create trigger nutrition_profile_preferred_foods_set_updated_at
  before update on public.nutrition_profile_preferred_foods
  for each row execute function public.reward_system_set_updated_at();

alter table public.nutrition_profile_preferred_foods enable row level security;

create policy nutrition_profile_preferred_foods_select_own
  on public.nutrition_profile_preferred_foods for select to authenticated
  using ((select auth.uid()) = user_id);

create policy nutrition_profile_preferred_foods_insert_own
  on public.nutrition_profile_preferred_foods for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy nutrition_profile_preferred_foods_update_own
  on public.nutrition_profile_preferred_foods for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.nutrition_profile_preferred_foods from public, anon, authenticated;

grant select on table public.nutrition_profile_preferred_foods to authenticated;

grant insert (user_id, declared_label)
  on public.nutrition_profile_preferred_foods to authenticated;

grant update (declared_label)
  on public.nutrition_profile_preferred_foods to authenticated;

grant select, insert, update, delete
  on public.nutrition_profile_preferred_foods to service_role;

create table public.nutrition_profile_supplements (
  id uuid constraint nutrition_profile_supplements_pkey primary key default gen_random_uuid(),
  user_id uuid not null,
  supplement_code text,
  declared_label varchar(160) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nutrition_profile_supplements_user_fk foreign key (user_id)
    references public.nutrition_profiles(user_id) on delete cascade,
  constraint nutrition_profile_supplements_code_check check (
    supplement_code is null or supplement_code in (
      'whey_protein', 'creatine', 'mass_gainer',
      'protein_powder_other', 'multivitamin'
    )
  ),
  constraint nutrition_profile_supplements_label_check check (
    btrim(declared_label) <> ''
  )
);

create unique index nutrition_profile_supplements_label_unique
  on public.nutrition_profile_supplements (user_id, lower(btrim(declared_label)));

create trigger nutrition_profile_supplements_set_updated_at
  before update on public.nutrition_profile_supplements
  for each row execute function public.reward_system_set_updated_at();

alter table public.nutrition_profile_supplements enable row level security;

create policy nutrition_profile_supplements_select_own
  on public.nutrition_profile_supplements for select to authenticated
  using ((select auth.uid()) = user_id);

create policy nutrition_profile_supplements_insert_own
  on public.nutrition_profile_supplements for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy nutrition_profile_supplements_update_own
  on public.nutrition_profile_supplements for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.nutrition_profile_supplements from public, anon, authenticated;

grant select on table public.nutrition_profile_supplements to authenticated;

grant insert (user_id, supplement_code, declared_label)
  on public.nutrition_profile_supplements to authenticated;

grant update (supplement_code, declared_label)
  on public.nutrition_profile_supplements to authenticated;

grant select, insert, update, delete
  on public.nutrition_profile_supplements to service_role;

commit;
