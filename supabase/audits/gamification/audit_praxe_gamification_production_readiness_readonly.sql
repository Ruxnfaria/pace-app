-- PRODUCTION READINESS AUDIT ONLY. READ-ONLY. DO NOT APPLY AS A MIGRATION.
-- Copy manually into the Production SQL Editor only after confirming the project.
-- One statement, one compact result set. It invokes no business function and
-- returns only catalog metadata and aggregate counts (no user-level data).
with expected_functions(function_name, signature) as (
  values
    ('toggle_mission_with_xp'::text, 'public.toggle_mission_with_xp(uuid,boolean)'::text),
    ('record_user_streak_activity', 'public.record_user_streak_activity(uuid)'),
    ('open_user_chest', 'public.open_user_chest(uuid)'),
    ('complete_mission_with_energy', 'public.complete_mission_with_energy(uuid)')
),
function_metadata as (
  select
    expected.function_name,
    function_record.oid,
    function_record.prosecdef as security_definer,
    pg_catalog.pg_get_userbyid(function_record.proowner)::text as owner_name,
    coalesce(function_record.proconfig, array[]::text[]) as configuration,
    function_record.proallargtypes as all_argument_types,
    function_record.proargmodes as argument_modes,
    function_record.proargnames as argument_names,
    language_record.lanname::text as language_name,
    lower(coalesce(pg_catalog.pg_get_functiondef(function_record.oid)::text, '')) as definition,
    md5(coalesce(pg_catalog.pg_get_functiondef(function_record.oid)::text, '')) as definition_md5
  from expected_functions as expected
  left join pg_catalog.pg_proc as function_record
    on function_record.oid = to_regprocedure(expected.signature)
  left join pg_catalog.pg_language as language_record
    on language_record.oid = function_record.prolang
),
function_acl as (
  select
    metadata.function_name,
    coalesce(bool_or(expanded.grantee = 0) filter (
      where expanded.privilege_type = 'EXECUTE'
    ), false) as public_execute,
    coalesce(bool_or(expanded.grantee = to_regrole('anon')::oid) filter (
      where expanded.privilege_type = 'EXECUTE'
    ), false) as anon_execute,
    coalesce(bool_or(expanded.grantee = to_regrole('authenticated')::oid) filter (
      where expanded.privilege_type = 'EXECUTE'
    ), false) as authenticated_execute,
    coalesce(bool_or(expanded.grantee = to_regrole('service_role')::oid) filter (
      where expanded.privilege_type = 'EXECUTE'
    ), false) as service_execute
  from function_metadata as metadata
  left join pg_catalog.pg_proc as function_record on function_record.oid = metadata.oid
  left join lateral aclexplode(
    coalesce(function_record.proacl, acldefault('f', function_record.proowner))
  ) as expanded on true
  group by metadata.function_name
),
required_columns(table_name, column_name, type_oid, required_not_null) as (
  values
    ('profiles'::text, 'user_id'::text, 'uuid'::regtype::oid, true),
    ('profiles', 'total_xp', 'integer'::regtype::oid, false),
    ('profiles', 'level', 'integer'::regtype::oid, false),
    ('profiles', 'streak', 'integer'::regtype::oid, false),
    ('profiles', 'last_activity_date', 'date'::regtype::oid, false),
    ('daily_missions', 'id', 'uuid'::regtype::oid, true),
    ('daily_missions', 'user_id', 'uuid'::regtype::oid, true),
    ('daily_missions', 'completed', 'boolean'::regtype::oid, false),
    ('daily_missions', 'xp_reward', 'integer'::regtype::oid, false),
    ('daily_missions', 'current_value', 'integer'::regtype::oid, false),
    ('daily_missions', 'target_value', 'integer'::regtype::oid, false),
    ('daily_missions', 'completed_at', 'timestamp with time zone'::regtype::oid, false),
    ('daily_missions', 'category', 'text'::regtype::oid, true),
    ('daily_missions', 'for_date', 'date'::regtype::oid, true),
    ('reward_transactions', 'user_id', 'uuid'::regtype::oid, true),
    ('reward_transactions', 'reward_type', 'text'::regtype::oid, true),
    ('reward_transactions', 'source_type', 'text'::regtype::oid, true),
    ('reward_transactions', 'source_id', 'text'::regtype::oid, false),
    ('reward_transactions', 'idempotency_key', 'text'::regtype::oid, true),
    ('reward_transactions', 'payload', 'jsonb'::regtype::oid, true),
    ('user_streaks', 'user_id', 'uuid'::regtype::oid, true),
    ('user_streaks', 'current_streak', 'integer'::regtype::oid, true),
    ('user_streaks', 'longest_streak', 'integer'::regtype::oid, true),
    ('user_streaks', 'last_active_date', 'date'::regtype::oid, false),
    ('user_wallets', 'user_id', 'uuid'::regtype::oid, true),
    ('user_wallets', 'crystals', 'bigint'::regtype::oid, true),
    ('currency_transactions', 'user_id', 'uuid'::regtype::oid, true),
    ('currency_transactions', 'currency', 'text'::regtype::oid, true),
    ('currency_transactions', 'amount', 'bigint'::regtype::oid, true),
    ('currency_transactions', 'transaction_type', 'text'::regtype::oid, true),
    ('currency_transactions', 'source_type', 'text'::regtype::oid, true),
    ('currency_transactions', 'source_id', 'text'::regtype::oid, false),
    ('currency_transactions', 'idempotency_key', 'text'::regtype::oid, true),
    ('currency_transactions', 'metadata', 'jsonb'::regtype::oid, true),
    ('user_chests', 'id', 'uuid'::regtype::oid, true),
    ('user_chests', 'user_id', 'uuid'::regtype::oid, true),
    ('user_chests', 'chest_definition_id', 'uuid'::regtype::oid, true),
    ('user_chests', 'status', 'text'::regtype::oid, true),
    ('user_chests', 'opened_at', 'timestamp with time zone'::regtype::oid, false),
    ('chest_definitions', 'id', 'uuid'::regtype::oid, true),
    ('chest_definitions', 'slug', 'text'::regtype::oid, true),
    ('chest_definitions', 'name', 'text'::regtype::oid, true),
    ('chest_definitions', 'rarity', 'text'::regtype::oid, true),
    ('loot_tables', 'id', 'uuid'::regtype::oid, true),
    ('loot_tables', 'chest_definition_id', 'uuid'::regtype::oid, true),
    ('loot_tables', 'active', 'boolean'::regtype::oid, true),
    ('loot_table_entries', 'id', 'uuid'::regtype::oid, true),
    ('loot_table_entries', 'loot_table_id', 'uuid'::regtype::oid, true),
    ('loot_table_entries', 'reward_type', 'text'::regtype::oid, true),
    ('loot_table_entries', 'item_id', 'uuid'::regtype::oid, false),
    ('loot_table_entries', 'min_quantity', 'integer'::regtype::oid, true),
    ('loot_table_entries', 'max_quantity', 'integer'::regtype::oid, true),
    ('loot_table_entries', 'relative_weight', 'numeric'::regtype::oid, true),
    ('loot_table_entries', 'active', 'boolean'::regtype::oid, true)
),
column_contract as (
  select
    count(*) filter (where attribute.attnum is null)::integer as missing_count,
    count(*) filter (
      where attribute.attnum is not null and attribute.atttypid <> expected.type_oid
    )::integer as type_mismatch_count,
    count(*) filter (
      where attribute.attnum is not null
        and expected.required_not_null
        and not attribute.attnotnull
    )::integer as not_null_mismatch_count,
    jsonb_agg(jsonb_build_object(
      'table', expected.table_name,
      'column', expected.column_name,
      'present', attribute.attnum is not null,
      'expected_type', pg_catalog.format_type(expected.type_oid, null),
      'actual_type', case when attribute.attnum is not null
        then pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
        else null end,
      'required_not_null', expected.required_not_null,
      'actual_not_null', coalesce(attribute.attnotnull, false)
    ) order by expected.table_name, expected.column_name) as columns
  from required_columns as expected
  left join pg_catalog.pg_attribute as attribute
    on attribute.attrelid = to_regclass('public.' || expected.table_name)
    and attribute.attname = expected.column_name
    and attribute.attnum > 0
    and not attribute.attisdropped
),
relation_contract as (
  select
    count(*) filter (where relation.oid is null)::integer as missing_count,
    count(*) filter (
      where relation.oid is not null and not relation.relrowsecurity
    )::integer as rls_disabled_count,
    jsonb_agg(jsonb_build_object(
      'table', expected.table_name,
      'exists', relation.oid is not null,
      'rls', coalesce(relation.relrowsecurity, false)
    ) order by expected.table_name) as relations
  from (values
    ('profiles'::text), ('daily_missions'), ('reward_transactions'),
    ('user_streaks'), ('user_wallets'), ('currency_transactions'),
    ('user_inventory'), ('user_boosts'), ('user_chests'),
    ('chest_definitions'), ('loot_tables'), ('loot_table_entries')
  ) as expected(table_name)
  left join pg_catalog.pg_namespace as namespace on namespace.nspname = 'public'
  left join pg_catalog.pg_class as relation
    on relation.relnamespace = namespace.oid
    and relation.relname = expected.table_name
    and relation.relkind = 'r'
),
constraint_contract as (
  select
    exists (
      select 1 from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = to_regclass('public.user_streaks')
        and constraint_record.conname = 'user_streaks_pkey'
        and constraint_record.contype = 'p'
        and replace(lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)), ' ', '')
          = 'primarykey(user_id)'
    ) as streak_primary_key,
    exists (
      select 1 from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = to_regclass('public.user_wallets')
        and constraint_record.contype = 'p'
        and replace(lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)), ' ', '')
          = 'primarykey(user_id)'
    ) as wallet_primary_key,
    exists (
      select 1 from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = to_regclass('public.user_chests')
        and constraint_record.contype = 'p'
        and replace(lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)), ' ', '')
          = 'primarykey(id)'
    ) as chest_primary_key,
    exists (
      select 1 from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = to_regclass('public.currency_transactions')
        and constraint_record.contype = 'u'
        and replace(lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)), ' ', '')
          = 'unique(user_id,idempotency_key)'
    ) as currency_idempotency,
    exists (
      select 1 from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = to_regclass('public.reward_transactions')
        and constraint_record.contype = 'u'
        and replace(lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)), ' ', '')
          = 'unique(user_id,idempotency_key)'
    ) as reward_idempotency,
    exists (
      select 1 from pg_catalog.pg_index as index_record
      where index_record.indexrelid = to_regclass('public.reward_transactions_source_reward_unique')
        and index_record.indisunique and index_record.indisvalid
        and index_record.indpred is not null
    ) as semantic_reward_uniqueness,
    exists (
      select 1 from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = to_regclass('public.user_wallets')
        and constraint_record.contype = 'c'
        and lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)) like '%crystals >= 0%'
    ) as wallet_nonnegative,
    exists (
      select 1 from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = to_regclass('public.currency_transactions')
        and constraint_record.contype = 'c'
        and lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)) like '%amount <> 0%'
    ) as currency_nonzero,
    exists (
      select 1 from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = to_regclass('public.currency_transactions')
        and constraint_record.contype = 'c'
        and lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)) like '%transaction_type%'
        and lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)) like '%credit%'
        and lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)) like '%debit%'
        and lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)) like '%adjustment%'
    ) as currency_direction
),
profile_acl as (
  select
    has_column_privilege('anon', 'public.profiles', 'total_xp', 'INSERT,UPDATE')
      or has_column_privilege('anon', 'public.profiles', 'streak', 'INSERT,UPDATE') as anon_write,
    has_column_privilege('authenticated', 'public.profiles', 'total_xp', 'INSERT,UPDATE')
      or has_column_privilege('authenticated', 'public.profiles', 'streak', 'INSERT,UPDATE')
      as authenticated_write
),
data_health as (
  select
    (select count(*) from public.profiles
      where coalesce(total_xp, 0) < 0 or coalesce(streak, 0) < 0)::bigint
      as negative_profile_rows,
    (select count(*) from public.user_streaks
      where current_streak < 0 or longest_streak < 0
        or longest_streak < current_streak)::bigint as invalid_streak_rows,
    (select count(*) from public.user_wallets where crystals < 0)::bigint
      as negative_wallet_rows,
    (select count(*) from (
      select user_id, for_date, category
      from public.daily_missions
      where category in ('workout', 'nutrition', 'protein')
      group by user_id, for_date, category
      having count(*) > 1
    ) as duplicates)::bigint as duplicate_mission_groups,
    (select count(*) from (
      select user_id, idempotency_key
      from public.reward_transactions
      group by user_id, idempotency_key
      having count(*) > 1
    ) as duplicates)::bigint as duplicate_reward_idempotency_groups,
    (select count(*) from (
      select user_id, source_type, source_id, reward_type
      from public.reward_transactions
      where source_id is not null
      group by user_id, source_type, source_id, reward_type
      having count(*) > 1
    ) as duplicates)::bigint as duplicate_reward_source_groups,
    (select count(*) from (
      select user_id, idempotency_key
      from public.currency_transactions
      group by user_id, idempotency_key
      having count(*) > 1
    ) as duplicates)::bigint as duplicate_currency_idempotency_groups,
    (select count(*) from public.user_chests
      where status not in ('granted', 'opened')
        or (status = 'opened' and opened_at is null))::bigint
      as invalid_user_chest_rows,
    (select count(*) from public.loot_table_entries
      where relative_weight <= 0 or min_quantity <= 0
        or max_quantity < min_quantity)::bigint as invalid_loot_rows
),
checks(check_name, status, accepted_warning, details) as (
  select '005_legacy_toggle_contract',
    case
      when metadata.oid is null or metadata.language_name <> 'plpgsql'
        or not metadata.security_definer
        or metadata.owner_name in ('anon', 'authenticated', 'service_role')
        or not exists (
          select 1
          from unnest(metadata.configuration) as setting(value)
          where setting.value like 'search_path=%'
        )
        or not acl.authenticated_execute
        or metadata.definition not like '%auth.uid%'
        or metadata.definition not like '%user_id%'
        or metadata.definition not like '%for update%'
      then 'FAIL'
      when acl.public_execute or acl.anon_execute then 'WARN'
      else 'PASS'
    end,
    acl.public_execute or acl.anon_execute,
    jsonb_build_object(
      'exists', metadata.oid is not null,
      'security_definer', metadata.security_definer,
      'owner', metadata.owner_name,
      'configuration', metadata.configuration,
      'public_execute', acl.public_execute,
      'anon_execute', acl.anon_execute,
      'authenticated_execute', acl.authenticated_execute,
      'ownership_signal', metadata.definition like '%user_id%',
      'row_lock_signal', metadata.definition like '%for update%'
    )
  from function_metadata as metadata
  join function_acl as acl using (function_name)
  where metadata.function_name = 'toggle_mission_with_xp'
  union all
  select '005_replacement_collision',
    case when metadata.oid is null then 'PASS' else 'FAIL' end,
    false,
    jsonb_build_object('must_be_absent', true, 'exists', metadata.oid is not null,
      'definition_md5', metadata.definition_md5)
  from function_metadata as metadata
  where metadata.function_name = 'complete_mission_with_energy'
  union all
  select '006_recorder_contract',
    case
      when metadata.oid is null
        or metadata.all_argument_types is distinct from array[
          'uuid'::regtype::oid, 'uuid'::regtype::oid, 'integer'::regtype::oid,
          'integer'::regtype::oid, 'integer'::regtype::oid, 'date'::regtype::oid
        ]::oid[]
        or metadata.argument_modes is distinct from array[
          'i', 't', 't', 't', 't', 't'
        ]::"char"[]
        or metadata.argument_names is distinct from array[
          'p_user_id', 'user_id', 'current_streak', 'effective_streak',
          'longest_streak', 'last_active_date'
        ]::text[]
      then 'FAIL' else 'PASS'
    end,
    false,
    jsonb_build_object('exists', metadata.oid is not null,
      'argument_names', metadata.argument_names,
      'argument_modes', metadata.argument_modes)
  from function_metadata as metadata
  where metadata.function_name = 'record_user_streak_activity'
  union all
  select '006_recorder_security_and_body',
    case
      when metadata.oid is null or not metadata.security_definer
        or metadata.owner_name in ('anon', 'authenticated', 'service_role')
        or metadata.configuration is distinct from array['search_path=""']::text[]
        or acl.public_execute or acl.anon_execute or acl.authenticated_execute
        or not acl.service_execute
        or metadata.definition not like '%america/sao_paulo%'
        or metadata.definition not like '%for update%'
        or metadata.definition ~ 'on\s+conflict\s*\(\s*user_id\s*\)'
      then 'FAIL'
      when metadata.definition not like '%update public.profiles%' then 'WARN'
      else 'PASS'
    end,
    metadata.definition not like '%update public.profiles%',
    jsonb_build_object(
      'security_definer', metadata.security_definer,
      'owner', metadata.owner_name,
      'configuration', metadata.configuration,
      'service_only', acl.service_execute and not acl.public_execute
        and not acl.anon_execute and not acl.authenticated_execute,
      'brazil_date_signal', metadata.definition like '%america/sao_paulo%',
      'row_lock_signal', metadata.definition like '%for update%',
      'ambiguous_conflict_target',
        metadata.definition ~ 'on\s+conflict\s*\(\s*user_id\s*\)',
      'profiles_sync_signal', metadata.definition like '%update public.profiles%'
    )
  from function_metadata as metadata
  join function_acl as acl using (function_name)
  where metadata.function_name = 'record_user_streak_activity'
  union all
  select '007_old_rpc_contract_and_fingerprint',
    case
      when metadata.oid is null
        or metadata.definition_md5 <> 'e0e2b37869940e51cf02e3af0ae0ec23'
        or metadata.all_argument_types is distinct from array[
          'uuid'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid,
          'text'::regtype::oid, 'text'::regtype::oid, 'text'::regtype::oid,
          'integer'::regtype::oid, 'uuid'::regtype::oid
        ]::oid[]
        or metadata.argument_modes is distinct from array[
          'i', 't', 't', 't', 't', 't', 't', 't'
        ]::"char"[]
        or metadata.argument_names is distinct from array[
          'p_chest_id', 'chest_id', 'chest_slug', 'chest_name', 'chest_rarity',
          'reward_type', 'amount', 'item_id'
        ]::text[]
      then 'FAIL' else 'PASS'
    end,
    false,
    jsonb_build_object('exists', metadata.oid is not null,
      'expected_md5', 'e0e2b37869940e51cf02e3af0ae0ec23',
      'actual_md5', metadata.definition_md5,
      'argument_names', metadata.argument_names)
  from function_metadata as metadata
  where metadata.function_name = 'open_user_chest'
  union all
  select '007_rpc_security_acl_and_signals',
    case
      when metadata.oid is null or metadata.language_name <> 'plpgsql'
        or not metadata.security_definer
        or metadata.owner_name in ('anon', 'authenticated', 'service_role')
        or metadata.configuration is distinct from array['search_path=""']::text[]
        or acl.public_execute or acl.anon_execute or not acl.authenticated_execute
        or metadata.definition not like '%auth.uid%'
        or metadata.definition not like '%user_chest.user_id = v_user_id%'
        or metadata.definition not like '%for update of user_chest%'
        or metadata.definition not like '%idempotency%'
      then 'FAIL' else 'PASS'
    end,
    false,
    jsonb_build_object('security_definer', metadata.security_definer,
      'owner', metadata.owner_name, 'configuration', metadata.configuration,
      'public_execute', acl.public_execute, 'anon_execute', acl.anon_execute,
      'authenticated_execute', acl.authenticated_execute,
      'ownership_signal', metadata.definition like '%user_chest.user_id = v_user_id%',
      'row_lock_signal', metadata.definition like '%for update of user_chest%',
      'idempotency_signal', metadata.definition like '%idempotency%')
  from function_metadata as metadata
  join function_acl as acl using (function_name)
  where metadata.function_name = 'open_user_chest'
  union all
  select 'required_columns_and_amount_only_ledger',
    case when contract.missing_count > 0 or contract.type_mismatch_count > 0
      or contract.not_null_mismatch_count > 0 or exists (
        select 1 from pg_catalog.pg_attribute as attribute
        where attribute.attrelid = to_regclass('public.currency_transactions')
          and attribute.attname = 'balance_after'
          and attribute.attnum > 0 and not attribute.attisdropped
      ) then 'FAIL' else 'PASS' end,
    false,
    jsonb_build_object('missing', contract.missing_count,
      'type_mismatches', contract.type_mismatch_count,
      'not_null_mismatches', contract.not_null_mismatch_count,
      'balance_after_exists', exists (
        select 1 from pg_catalog.pg_attribute as attribute
        where attribute.attrelid = to_regclass('public.currency_transactions')
          and attribute.attname = 'balance_after'
          and attribute.attnum > 0 and not attribute.attisdropped
      ), 'columns', contract.columns)
  from column_contract as contract
  union all
  select 'required_relations_and_rls',
    case when missing_count > 0 or rls_disabled_count > 0 then 'FAIL' else 'PASS' end,
    false,
    jsonb_build_object('missing', missing_count, 'rls_disabled', rls_disabled_count,
      'relations', relations)
  from relation_contract
  union all
  select 'required_keys_and_constraints',
    case when streak_primary_key and wallet_primary_key and chest_primary_key
      and currency_idempotency and reward_idempotency
      and semantic_reward_uniqueness and wallet_nonnegative
      and currency_nonzero and currency_direction
      then 'PASS' else 'FAIL' end,
    false,
    to_jsonb(constraint_contract)
  from constraint_contract
  union all
  select 'profiles_direct_write_transition',
    case when anon_write then 'FAIL'
      when authenticated_write then 'WARN' else 'PASS' end,
    authenticated_write and not anon_write,
    jsonb_build_object('anon_write', anon_write,
      'authenticated_write', authenticated_write,
      'runtime_cutover_required_before_revocation', true)
  from profile_acl
  union all
  select 'aggregate_data_health',
    case when negative_profile_rows > 0 or invalid_streak_rows > 0
      or negative_wallet_rows > 0 or duplicate_mission_groups > 0
      or duplicate_reward_idempotency_groups > 0
      or duplicate_reward_source_groups > 0
      or duplicate_currency_idempotency_groups > 0
      or invalid_user_chest_rows > 0 or invalid_loot_rows > 0
      then 'FAIL' else 'PASS' end,
    false,
    to_jsonb(data_health)
  from data_health
),
summary as (
  select
    case
      when count(*) filter (where status = 'FAIL') > 0 then 'FAIL'
      when count(*) filter (where status = 'WARN' and not accepted_warning) > 0
        then 'FAIL'
      when count(*) filter (where status = 'WARN') > 0 then 'WARN'
      else 'PASS'
    end as overall_status,
    count(*) filter (where status = 'PASS')::integer as pass_count,
    count(*) filter (where status = 'WARN')::integer as warn_count,
    count(*) filter (where status = 'FAIL')::integer as fail_count,
    count(*) filter (where status = 'WARN' and not accepted_warning)::integer
      as unexpected_warn_count,
    jsonb_agg(jsonb_build_object(
      'check', check_name,
      'status', status,
      'accepted_warning', accepted_warning,
      'details', details
    ) order by check_name) as checks
  from checks
)
select overall_status, pass_count, warn_count, fail_count,
  unexpected_warn_count, checks
from summary;
