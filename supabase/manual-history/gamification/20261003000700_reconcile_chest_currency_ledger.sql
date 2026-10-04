begin;

set local lock_timeout = '5s';

do $preflight$
declare
  chest_function_oid oid := to_regprocedure('public.open_user_chest(uuid)');
  chest_function record;
  relation_name text;
  public_execute boolean;
begin
  if chest_function_oid is null then
    raise exception 'Required function public.open_user_chest(uuid) is missing';
  end if;

  select
    function_record.prosecdef as security_definer,
    pg_catalog.pg_get_userbyid(function_record.proowner)::text as owner_name,
    function_record.proconfig as configuration,
    function_record.proallargtypes as all_argument_types,
    function_record.proargmodes as argument_modes,
    function_record.proargnames as argument_names,
    language_record.lanname as language_name,
    md5(pg_catalog.pg_get_functiondef(function_record.oid)::text) as definition_md5
  into chest_function
  from pg_catalog.pg_proc as function_record
  join pg_catalog.pg_language as language_record
    on language_record.oid = function_record.prolang
  where function_record.oid = chest_function_oid;

  if chest_function.definition_md5 <> 'e0e2b37869940e51cf02e3af0ae0ec23' then
    raise exception 'open_user_chest definition fingerprint is not the reviewed pre-00700 value';
  end if;

  if chest_function.language_name <> 'plpgsql'
    or not chest_function.security_definer
    or chest_function.owner_name in ('anon', 'authenticated', 'service_role')
  then
    raise exception 'open_user_chest language, SECURITY DEFINER, or owner contract is incompatible';
  end if;

  if chest_function.configuration is distinct from array['search_path=""']::text[] then
    raise exception 'open_user_chest must have the hardened empty search_path';
  end if;

  if chest_function.all_argument_types is distinct from array[
      'uuid'::regtype::oid,
      'uuid'::regtype::oid,
      'text'::regtype::oid,
      'text'::regtype::oid,
      'text'::regtype::oid,
      'text'::regtype::oid,
      'integer'::regtype::oid,
      'uuid'::regtype::oid
    ]::oid[]
    or chest_function.argument_modes is distinct from array[
      'i', 't', 't', 't', 't', 't', 't', 't'
    ]::"char"[]
    or chest_function.argument_names is distinct from array[
      'p_chest_id', 'chest_id', 'chest_slug', 'chest_name', 'chest_rarity',
      'reward_type', 'amount', 'item_id'
    ]::text[]
  then
    raise exception 'open_user_chest argument or RETURNS TABLE contract is incompatible';
  end if;

  select coalesce(bool_or(expanded.grantee = 0), false)
  into public_execute
  from pg_catalog.pg_proc as function_record
  cross join lateral aclexplode(
    coalesce(function_record.proacl, acldefault('f', function_record.proowner))
  ) as expanded
  where function_record.oid = chest_function_oid
    and expanded.privilege_type = 'EXECUTE';

  if public_execute
    or has_function_privilege('anon', chest_function_oid, 'EXECUTE')
    or not has_function_privilege('authenticated', chest_function_oid, 'EXECUTE')
  then
    raise exception 'open_user_chest ACL is not the reviewed authenticated-only client contract';
  end if;

  foreach relation_name in array array[
    'public.currency_transactions',
    'public.user_wallets',
    'public.reward_transactions',
    'public.user_chests',
    'public.chest_definitions',
    'public.loot_tables',
    'public.loot_table_entries',
    'public.profiles'
  ] loop
    if to_regclass(relation_name) is null then
      raise exception 'Required relation % is missing', relation_name;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'public.currency_transactions'::regclass
      and attribute.attname = 'balance_after'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception 'currency_transactions.balance_after must be absent before 00700';
  end if;

  if exists (
    select 1
    from (
      values
        ('user_id'::text, 'uuid'::regtype::oid, true),
        ('currency'::text, 'text'::regtype::oid, true),
        ('amount'::text, 'bigint'::regtype::oid, true),
        ('transaction_type'::text, 'text'::regtype::oid, true),
        ('source_type'::text, 'text'::regtype::oid, true),
        ('source_id'::text, 'text'::regtype::oid, false),
        ('idempotency_key'::text, 'text'::regtype::oid, true),
        ('metadata'::text, 'jsonb'::regtype::oid, true)
    ) as expected(column_name, type_oid, required_not_null)
    left join pg_catalog.pg_attribute as attribute
      on attribute.attrelid = 'public.currency_transactions'::regclass
      and attribute.attname = expected.column_name
      and attribute.attnum > 0
      and not attribute.attisdropped
    where attribute.attnum is null
      or attribute.atttypid <> expected.type_oid
      or attribute.attnotnull <> expected.required_not_null
  ) then
    raise exception 'currency_transactions amount-only column contract is incompatible';
  end if;

  if exists (
    select 1
    from (
      values
        ('public.user_wallets'::text, 'user_id'::text, 'uuid'::regtype::oid),
        ('public.user_wallets', 'crystals', 'bigint'::regtype::oid),
        ('public.reward_transactions', 'user_id', 'uuid'::regtype::oid),
        ('public.reward_transactions', 'reward_type', 'text'::regtype::oid),
        ('public.reward_transactions', 'source_type', 'text'::regtype::oid),
        ('public.reward_transactions', 'source_id', 'text'::regtype::oid),
        ('public.reward_transactions', 'idempotency_key', 'text'::regtype::oid),
        ('public.reward_transactions', 'payload', 'jsonb'::regtype::oid),
        ('public.user_chests', 'id', 'uuid'::regtype::oid),
        ('public.user_chests', 'user_id', 'uuid'::regtype::oid),
        ('public.user_chests', 'chest_definition_id', 'uuid'::regtype::oid),
        ('public.user_chests', 'status', 'text'::regtype::oid),
        ('public.user_chests', 'opened_at', 'timestamp with time zone'::regtype::oid),
        ('public.chest_definitions', 'id', 'uuid'::regtype::oid),
        ('public.chest_definitions', 'slug', 'text'::regtype::oid),
        ('public.chest_definitions', 'name', 'text'::regtype::oid),
        ('public.chest_definitions', 'rarity', 'text'::regtype::oid),
        ('public.loot_tables', 'id', 'uuid'::regtype::oid),
        ('public.loot_tables', 'chest_definition_id', 'uuid'::regtype::oid),
        ('public.loot_tables', 'active', 'boolean'::regtype::oid),
        ('public.loot_table_entries', 'id', 'uuid'::regtype::oid),
        ('public.loot_table_entries', 'loot_table_id', 'uuid'::regtype::oid),
        ('public.loot_table_entries', 'reward_type', 'text'::regtype::oid),
        ('public.loot_table_entries', 'item_id', 'uuid'::regtype::oid),
        ('public.loot_table_entries', 'min_quantity', 'integer'::regtype::oid),
        ('public.loot_table_entries', 'max_quantity', 'integer'::regtype::oid),
        ('public.loot_table_entries', 'relative_weight', 'numeric'::regtype::oid),
        ('public.loot_table_entries', 'active', 'boolean'::regtype::oid),
        ('public.profiles', 'user_id', 'uuid'::regtype::oid),
        ('public.profiles', 'total_xp', 'integer'::regtype::oid)
    ) as expected(relation_name, column_name, type_oid)
    left join pg_catalog.pg_attribute as attribute
      on attribute.attrelid = to_regclass(expected.relation_name)
      and attribute.attname = expected.column_name
      and attribute.attnum > 0
      and not attribute.attisdropped
    where attribute.attnum is null
      or attribute.atttypid <> expected.type_oid
  ) then
    raise exception 'A required wallet/reward/chest column contract is incompatible';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.user_wallets'::regclass
      and constraint_record.contype = 'p'
      and replace(lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)), ' ', '')
        = 'primarykey(user_id)'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.user_chests'::regclass
      and constraint_record.contype = 'p'
      and replace(lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)), ' ', '')
        = 'primarykey(id)'
  ) then
    raise exception 'Required wallet or chest primary-key contract is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.currency_transactions'::regclass
      and constraint_record.contype = 'u'
      and replace(lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)), ' ', '')
        = 'unique(user_id,idempotency_key)'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.reward_transactions'::regclass
      and constraint_record.contype = 'u'
      and replace(lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)), ' ', '')
        = 'unique(user_id,idempotency_key)'
  ) then
    raise exception 'Required currency or reward idempotency constraint is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index as index_record
    where index_record.indexrelid = to_regclass(
      'public.reward_transactions_source_reward_unique'
    )
      and index_record.indisunique
      and index_record.indisvalid
      and index_record.indpred is not null
  ) then
    raise exception 'Required semantic reward uniqueness index is missing or invalid';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.user_wallets'::regclass
      and constraint_record.contype = 'c'
      and lower(pg_catalog.pg_get_constraintdef(constraint_record.oid))
        like '%crystals >= 0%'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.currency_transactions'::regclass
      and constraint_record.contype = 'c'
      and lower(pg_catalog.pg_get_constraintdef(constraint_record.oid))
        like '%amount <> 0%'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.currency_transactions'::regclass
      and constraint_record.contype = 'c'
      and lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)) like '%transaction_type%'
      and lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)) like '%credit%'
      and lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)) like '%debit%'
      and lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)) like '%adjustment%'
  ) then
    raise exception 'Required wallet or amount-direction check constraint is missing';
  end if;
end
$preflight$;

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
      set crystals = wallet.crystals + excluded.crystals;

    -- 00700: currency_transactions is amount-only; the wallet is authoritative.
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

revoke all on function public.open_user_chest(uuid) from public, anon;
grant execute on function public.open_user_chest(uuid) to authenticated;

do $postcondition$
declare
  chest_function_oid oid := to_regprocedure('public.open_user_chest(uuid)');
  chest_function record;
  public_execute boolean;
begin
  if chest_function_oid is null then
    raise exception 'open_user_chest disappeared during 00700';
  end if;

  select
    function_record.prosecdef as security_definer,
    pg_catalog.pg_get_userbyid(function_record.proowner)::text as owner_name,
    function_record.proconfig as configuration,
    function_record.proallargtypes as all_argument_types,
    function_record.proargmodes as argument_modes,
    function_record.proargnames as argument_names,
    lower(pg_catalog.pg_get_functiondef(function_record.oid)::text) as definition,
    md5(pg_catalog.pg_get_functiondef(function_record.oid)::text) as definition_md5
  into chest_function
  from pg_catalog.pg_proc as function_record
  where function_record.oid = chest_function_oid;

  if not chest_function.security_definer
    or chest_function.owner_name in ('anon', 'authenticated', 'service_role')
    or chest_function.configuration is distinct from array['search_path=""']::text[]
  then
    raise exception '00700 did not preserve owner, SECURITY DEFINER, or empty search_path';
  end if;

  if chest_function.all_argument_types is distinct from array[
      'uuid'::regtype::oid,
      'uuid'::regtype::oid,
      'text'::regtype::oid,
      'text'::regtype::oid,
      'text'::regtype::oid,
      'text'::regtype::oid,
      'integer'::regtype::oid,
      'uuid'::regtype::oid
    ]::oid[]
    or chest_function.argument_modes is distinct from array[
      'i', 't', 't', 't', 't', 't', 't', 't'
    ]::"char"[]
    or chest_function.argument_names is distinct from array[
      'p_chest_id', 'chest_id', 'chest_slug', 'chest_name', 'chest_rarity',
      'reward_type', 'amount', 'item_id'
    ]::text[]
  then
    raise exception '00700 changed the public open_user_chest contract';
  end if;

  select coalesce(bool_or(expanded.grantee = 0), false)
  into public_execute
  from pg_catalog.pg_proc as function_record
  cross join lateral aclexplode(
    coalesce(function_record.proacl, acldefault('f', function_record.proowner))
  ) as expanded
  where function_record.oid = chest_function_oid
    and expanded.privilege_type = 'EXECUTE';

  if public_execute
    or has_function_privilege('anon', chest_function_oid, 'EXECUTE')
    or not has_function_privilege('authenticated', chest_function_oid, 'EXECUTE')
  then
    raise exception '00700 did not preserve the authenticated-only client ACL';
  end if;

  if chest_function.definition_md5 = 'e0e2b37869940e51cf02e3af0ae0ec23'
    or chest_function.definition like '%balance_after%'
    or chest_function.definition not like '%00700: currency_transactions is amount-only%'
    or chest_function.definition not like '%auth.uid%'
    or chest_function.definition not like '%user_chest.user_id = v_user_id%'
    or chest_function.definition not like '%for update of user_chest%'
    or chest_function.definition not like '%opened chest has no persisted reward%'
    or chest_function.definition not like '%insert into public.user_wallets%'
    or chest_function.definition not like '%insert into public.currency_transactions%'
    or chest_function.definition not like '%insert into public.reward_transactions%'
    or chest_function.definition not like '%update public.user_chests%'
    or chest_function.definition not like '%idempotency_key%'
  then
    raise exception '00700 semantic postconditions were not met';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'public.currency_transactions'::regclass
      and attribute.attname = 'balance_after'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception '00700 unexpectedly changed the amount-only ledger schema';
  end if;

  if exists (
    select 1
    from (
      values
        ('user_id'::text, 'uuid'::regtype::oid, true),
        ('currency'::text, 'text'::regtype::oid, true),
        ('amount'::text, 'bigint'::regtype::oid, true),
        ('transaction_type'::text, 'text'::regtype::oid, true),
        ('source_type'::text, 'text'::regtype::oid, true),
        ('source_id'::text, 'text'::regtype::oid, false),
        ('idempotency_key'::text, 'text'::regtype::oid, true),
        ('metadata'::text, 'jsonb'::regtype::oid, true)
    ) as expected(column_name, type_oid, required_not_null)
    left join pg_catalog.pg_attribute as attribute
      on attribute.attrelid = 'public.currency_transactions'::regclass
      and attribute.attname = expected.column_name
      and attribute.attnum > 0
      and not attribute.attisdropped
    where attribute.attnum is null
      or attribute.atttypid <> expected.type_oid
      or attribute.attnotnull <> expected.required_not_null
  ) then
    raise exception '00700 did not preserve the amount-only ledger columns';
  end if;

  execute format(
    'comment on function public.open_user_chest(uuid) is %L',
    'PRAXE 00700 amount-only ledger; definition_md5='
      || chest_function.definition_md5
  );

  if pg_catalog.obj_description(chest_function_oid, 'pg_proc') is distinct from
    'PRAXE 00700 amount-only ledger; definition_md5='
      || chest_function.definition_md5
  then
    raise exception '00700 could not pin the derived function fingerprint';
  end if;

  raise notice 'open_user_chest definition fingerprint after 00700: %',
    chest_function.definition_md5;
end
$postcondition$;

commit;
