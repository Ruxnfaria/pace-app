begin;

do $preflight$
declare
  missing_object text;
begin
  select expected.object_name
  into missing_object
  from (
    values
      ('public.user_wallets'),
      ('public.currency_transactions'),
      ('public.chest_definitions'),
      ('public.user_chests'),
      ('public.loot_tables'),
      ('public.loot_table_entries'),
      ('public.reward_transactions')
  ) as expected(object_name)
  where pg_catalog.to_regclass(expected.object_name) is null
  limit 1;

  if missing_object is not null then
    raise exception 'Authoritative chest V1 requires %', missing_object;
  end if;

  if pg_catalog.to_regprocedure('auth.uid()') is null then
    raise exception 'Authoritative chest V1 requires auth.uid()';
  end if;

  if exists (
    select 1
    from (values ('anon'), ('authenticated'), ('service_role')) as expected(role_name)
    where not exists (
      select 1
      from pg_catalog.pg_roles as role_record
      where role_record.rolname = expected.role_name
    )
  ) then
    raise exception 'Authoritative chest V1 requires the Supabase API roles';
  end if;

  if (
    select pg_catalog.count(*)
    from public.chest_definitions as definition
    where definition.slug in ('common_chest', 'rare_chest', 'epic_chest')
  ) <> 3 then
    raise exception 'Authoritative chest V1 requires all three chest definitions';
  end if;
end
$preflight$;

insert into public.loot_tables (chest_definition_id, name, metadata, active)
select
  definition.id,
  case definition.slug
    when 'common_chest' then 'Loot V1 do Baú Comum'
    when 'rare_chest' then 'Loot V1 do Baú Raro'
    when 'epic_chest' then 'Loot V1 do Baú Épico'
  end,
  pg_catalog.jsonb_build_object('contract_version', 'praxe_chest_v1'),
  true
from public.chest_definitions as definition
where definition.slug in ('common_chest', 'rare_chest', 'epic_chest')
on conflict (chest_definition_id) do update
set
  name = excluded.name,
  metadata = excluded.metadata,
  active = true;

update public.loot_table_entries as entry
set active = false
from public.loot_tables as loot_table
join public.chest_definitions as definition
  on definition.id = loot_table.chest_definition_id
where entry.loot_table_id = loot_table.id
  and definition.slug in ('common_chest', 'rare_chest', 'epic_chest');

delete from public.loot_table_entries as entry
using public.loot_tables as loot_table,
      public.chest_definitions as definition
where entry.loot_table_id = loot_table.id
  and loot_table.chest_definition_id = definition.id
  and definition.slug in ('common_chest', 'rare_chest', 'epic_chest')
  and entry.metadata ->> 'contract_version' = 'praxe_chest_v1';

with authoritative_loot (
  chest_slug,
  amount,
  relative_weight
) as (
  values
    ('common_chest'::text, 3, 55::numeric),
    ('common_chest'::text, 5, 35::numeric),
    ('common_chest'::text, 8, 10::numeric),
    ('rare_chest'::text, 8, 50::numeric),
    ('rare_chest'::text, 12, 35::numeric),
    ('rare_chest'::text, 20, 15::numeric),
    ('epic_chest'::text, 30, 45::numeric),
    ('epic_chest'::text, 50, 40::numeric),
    ('epic_chest'::text, 80, 15::numeric)
)
insert into public.loot_table_entries (
  loot_table_id,
  reward_type,
  item_id,
  min_quantity,
  max_quantity,
  relative_weight,
  metadata,
  active
)
select
  loot_table.id,
  'crystals',
  null,
  authoritative_loot.amount,
  authoritative_loot.amount,
  authoritative_loot.relative_weight,
  pg_catalog.jsonb_build_object('contract_version', 'praxe_chest_v1'),
  true
from authoritative_loot
join public.chest_definitions as definition
  on definition.slug = authoritative_loot.chest_slug
join public.loot_tables as loot_table
  on loot_table.chest_definition_id = definition.id;

create or replace function public.open_user_chest(p_chest_id uuid)
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
as $function$
declare
  v_user_id uuid := auth.uid();
  v_chest_status text;
  v_chest_slug text;
  v_chest_name text;
  v_chest_rarity text;
  v_loot_table_id uuid;
  v_reward_type text;
  v_amount integer;
  v_total_weight numeric;
  v_roll numeric;
  v_payload jsonb;
begin
  if v_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  if p_chest_id is null then
    raise exception using
      errcode = '22004',
      message = 'Chest id is required';
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
    raise exception using
      errcode = 'P0002',
      message = 'Chest not found';
  end if;

  if v_chest_status = 'opened' then
    select
      transaction_record.reward_type,
      (transaction_record.payload ->> 'amount')::integer
    into
      v_reward_type,
      v_amount
    from public.reward_transactions as transaction_record
    where transaction_record.user_id = v_user_id
      and transaction_record.idempotency_key =
        'chest_open:' || p_chest_id::text;

    if not found
      or v_reward_type is distinct from 'crystals'
      or v_amount is null
      or v_amount <= 0
    then
      raise exception using
        errcode = 'P0001',
        message = 'Opened chest has no valid persisted V1 reward';
    end if;

    return query select
      p_chest_id,
      v_chest_slug,
      v_chest_name,
      v_chest_rarity,
      v_reward_type,
      v_amount,
      null::uuid;
    return;
  end if;

  if v_chest_status <> 'granted' then
    raise exception using
      errcode = 'P0001',
      message = 'Chest is not available to open';
  end if;

  if v_loot_table_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Chest has no active loot table';
  end if;

  select pg_catalog.sum(entry.relative_weight)
  into v_total_weight
  from public.loot_table_entries as entry
  where entry.loot_table_id = v_loot_table_id
    and entry.active = true
    and entry.reward_type = 'crystals'
    and entry.item_id is null
    and entry.min_quantity = entry.max_quantity
    and entry.metadata ->> 'contract_version' = 'praxe_chest_v1';

  if v_total_weight is distinct from 100::numeric then
    raise exception using
      errcode = 'P0001',
      message = 'Chest V1 loot contract is invalid';
  end if;

  v_roll := pg_catalog.random() * v_total_weight;

  select weighted.reward_type, weighted.amount
  into v_reward_type, v_amount
  from (
    select
      entry.reward_type,
      entry.min_quantity as amount,
      pg_catalog.sum(entry.relative_weight) over (
        order by entry.min_quantity
        rows between unbounded preceding and current row
      ) as cumulative_weight
    from public.loot_table_entries as entry
    where entry.loot_table_id = v_loot_table_id
      and entry.active = true
      and entry.reward_type = 'crystals'
      and entry.item_id is null
      and entry.min_quantity = entry.max_quantity
      and entry.metadata ->> 'contract_version' = 'praxe_chest_v1'
  ) as weighted
  where weighted.cumulative_weight > v_roll
  order by weighted.cumulative_weight
  limit 1;

  if not found or v_reward_type is distinct from 'crystals' or v_amount <= 0 then
    raise exception using
      errcode = 'P0001',
      message = 'Unable to select a valid chest V1 reward';
  end if;

  insert into public.user_wallets as wallet (user_id, crystals)
  values (v_user_id, v_amount)
  on conflict (user_id) do update
    set crystals = wallet.crystals + excluded.crystals;

  insert into public.currency_transactions (
    user_id,
    currency,
    amount,
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
    'credit',
    'chest_open',
    p_chest_id::text,
    'chest_open:' || p_chest_id::text || ':crystals',
    pg_catalog.jsonb_build_object(
      'chest_slug', v_chest_slug,
      'contract_version', 'praxe_chest_v1'
    )
  );

  v_payload := pg_catalog.jsonb_build_object(
    'chest_id', p_chest_id,
    'chest_slug', v_chest_slug,
    'reward_type', v_reward_type,
    'amount', v_amount,
    'item_id', null,
    'contract_version', 'praxe_chest_v1'
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

  update public.user_chests as user_chest
  set
    status = 'opened',
    opened_at = pg_catalog.now(),
    metadata = user_chest.metadata || pg_catalog.jsonb_build_object(
      'opened_reward', v_payload
    )
  where user_chest.id = p_chest_id
    and user_chest.user_id = v_user_id
    and user_chest.status = 'granted';

  if not found then
    raise exception using
      errcode = '40001',
      message = 'Chest state changed during opening';
  end if;

  return query select
    p_chest_id,
    v_chest_slug,
    v_chest_name,
    v_chest_rarity,
    v_reward_type,
    v_amount,
    null::uuid;
end;
$function$;

alter function public.open_user_chest(uuid) owner to postgres;

revoke execute on function public.open_user_chest(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.open_user_chest(uuid) to authenticated;

do $postcondition$
declare
  function_oid oid := pg_catalog.to_regprocedure('public.open_user_chest(uuid)');
  function_record record;
  public_execute boolean;
begin
  if exists (
    with expected(chest_slug, amount, relative_weight) as (
      values
        ('common_chest'::text, 3, 55::numeric),
        ('common_chest'::text, 5, 35::numeric),
        ('common_chest'::text, 8, 10::numeric),
        ('rare_chest'::text, 8, 50::numeric),
        ('rare_chest'::text, 12, 35::numeric),
        ('rare_chest'::text, 20, 15::numeric),
        ('epic_chest'::text, 30, 45::numeric),
        ('epic_chest'::text, 50, 40::numeric),
        ('epic_chest'::text, 80, 15::numeric)
    ), actual as (
      select
        definition.slug as chest_slug,
        entry.min_quantity as amount,
        entry.relative_weight
      from public.loot_table_entries as entry
      join public.loot_tables as loot_table
        on loot_table.id = entry.loot_table_id
      join public.chest_definitions as definition
        on definition.id = loot_table.chest_definition_id
      where definition.slug in ('common_chest', 'rare_chest', 'epic_chest')
        and entry.active = true
        and entry.reward_type = 'crystals'
        and entry.item_id is null
        and entry.min_quantity = entry.max_quantity
        and entry.metadata ->> 'contract_version' = 'praxe_chest_v1'
    )
    (select * from expected except select * from actual)
    union all
    (select * from actual except select * from expected)
  ) then
    raise exception 'Authoritative chest V1 loot snapshot does not match';
  end if;

  if exists (
    select 1
    from public.loot_table_entries as entry
    join public.loot_tables as loot_table
      on loot_table.id = entry.loot_table_id
    join public.chest_definitions as definition
      on definition.id = loot_table.chest_definition_id
    where definition.slug in ('common_chest', 'rare_chest', 'epic_chest')
      and entry.active = true
      and (
        entry.reward_type <> 'crystals'
        or entry.item_id is not null
        or entry.min_quantity <> entry.max_quantity
        or entry.metadata ->> 'contract_version' is distinct from 'praxe_chest_v1'
      )
  ) then
    raise exception 'Authoritative chest V1 has an unexpected active reward';
  end if;

  if exists (
    select 1
    from public.loot_table_entries as entry
    join public.loot_tables as loot_table
      on loot_table.id = entry.loot_table_id
    join public.chest_definitions as definition
      on definition.id = loot_table.chest_definition_id
    where definition.slug in ('common_chest', 'rare_chest', 'epic_chest')
      and entry.active = true
    group by definition.slug
    having pg_catalog.count(*) <> 3
      or pg_catalog.sum(entry.relative_weight) <> 100::numeric
  ) then
    raise exception 'Authoritative chest V1 weight totals are invalid';
  end if;

  if function_oid is null then
    raise exception 'open_user_chest(uuid) was not created';
  end if;

  select
    function_definition.prosecdef as security_definer,
    pg_catalog.pg_get_userbyid(function_definition.proowner)::text as owner_name,
    function_definition.proconfig as configuration,
    function_definition.proallargtypes as all_argument_types,
    function_definition.proargmodes as argument_modes,
    function_definition.proargnames as argument_names,
    pg_catalog.lower(pg_catalog.pg_get_functiondef(function_definition.oid)) as definition
  into function_record
  from pg_catalog.pg_proc as function_definition
  where function_definition.oid = function_oid;

  if not function_record.security_definer
    or function_record.owner_name <> 'postgres'
    or function_record.configuration is distinct from
      array['search_path=""']::text[]
  then
    raise exception 'open_user_chest owner/security/search_path contract failed';
  end if;

  if function_record.all_argument_types is distinct from array[
      'uuid'::pg_catalog.regtype::oid,
      'uuid'::pg_catalog.regtype::oid,
      'text'::pg_catalog.regtype::oid,
      'text'::pg_catalog.regtype::oid,
      'text'::pg_catalog.regtype::oid,
      'text'::pg_catalog.regtype::oid,
      'integer'::pg_catalog.regtype::oid,
      'uuid'::pg_catalog.regtype::oid
    ]::oid[]
    or function_record.argument_modes is distinct from array[
      'i', 't', 't', 't', 't', 't', 't', 't'
    ]::"char"[]
    or function_record.argument_names is distinct from array[
      'p_chest_id', 'chest_id', 'chest_slug', 'chest_name', 'chest_rarity',
      'reward_type', 'amount', 'item_id'
    ]::text[]
  then
    raise exception 'open_user_chest public contract changed unexpectedly';
  end if;

  select coalesce(pg_catalog.bool_or(expanded.grantee = 0), false)
  into public_execute
  from pg_catalog.pg_proc as function_definition
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      function_definition.proacl,
      pg_catalog.acldefault('f', function_definition.proowner)
    )
  ) as expanded
  where function_definition.oid = function_oid
    and expanded.privilege_type = 'EXECUTE';

  if public_execute
    or pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
    or not pg_catalog.has_function_privilege(
      'authenticated', function_oid, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE')
  then
    raise exception 'open_user_chest authenticated-only ACL failed';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_definition
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        function_definition.proacl,
        pg_catalog.acldefault('f', function_definition.proowner)
      )
    ) as expanded
    join pg_catalog.pg_roles as grantee
      on grantee.oid = expanded.grantee
    where function_definition.oid = function_oid
      and expanded.privilege_type = 'EXECUTE'
      and grantee.rolname not in ('postgres', 'authenticated')
  ) then
    raise exception 'open_user_chest has an unexpected EXECUTE grantee';
  end if;

  if function_record.definition not like '%auth.uid%'
    or function_record.definition not like '%for update of user_chest%'
    or function_record.definition not like '%user_chest.user_id = v_user_id%'
    or function_record.definition not like '%praxe_chest_v1%'
    or function_record.definition not like '%insert into public.user_wallets%'
    or function_record.definition not like '%insert into public.currency_transactions%'
    or function_record.definition not like '%insert into public.reward_transactions%'
    or function_record.definition not like '%update public.user_chests%'
    or function_record.definition like '%update public.profiles%'
  then
    raise exception 'open_user_chest semantic postconditions failed';
  end if;
end
$postcondition$;

commit;
