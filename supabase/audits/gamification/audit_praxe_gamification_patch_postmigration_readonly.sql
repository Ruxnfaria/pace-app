-- Manual patch postmigration audit. Read-only, one statement, one result set.
-- It does not invoke business functions and returns aggregate/catalog metadata only.
with expected_functions(signature, function_name) as (
  values
    ('public.toggle_mission_with_xp(uuid,boolean)'::text, 'toggle_mission_with_xp'::text),
    ('public.complete_mission_with_energy(uuid)'::text, 'complete_mission_with_energy'::text),
    ('public.record_user_streak_activity(uuid)'::text, 'record_user_streak_activity'::text),
    ('public.open_user_chest(uuid)'::text, 'open_user_chest'::text)
),
function_metadata as (
  select
    expected.signature,
    expected.function_name,
    function_record.oid,
    function_record.prosecdef as security_definer,
    pg_catalog.pg_get_userbyid(function_record.proowner)::text as owner_name,
    coalesce(function_record.proconfig, array[]::text[]) as configuration,
    function_record.proallargtypes as all_argument_types,
    function_record.proargmodes as argument_modes,
    function_record.proargnames as argument_names,
    pg_catalog.obj_description(function_record.oid, 'pg_proc') as description,
    lower(coalesce(pg_catalog.pg_get_functiondef(function_record.oid)::text, ''))
      as definition,
    md5(coalesce(pg_catalog.pg_get_functiondef(function_record.oid)::text, ''))
      as definition_md5
  from expected_functions as expected
  left join pg_catalog.pg_proc as function_record
    on function_record.oid = to_regprocedure(expected.signature)
),
function_acl as (
  select
    metadata.signature,
    coalesce(
      bool_or(expanded.grantee = 0) filter (
        where expanded.privilege_type = 'EXECUTE'
      ),
      false
    ) as public_execute,
    coalesce(
      bool_or(expanded.grantee = to_regrole('anon')::oid) filter (
        where expanded.privilege_type = 'EXECUTE'
      ),
      false
    ) as anon_execute,
    coalesce(
      bool_or(expanded.grantee = to_regrole('authenticated')::oid) filter (
        where expanded.privilege_type = 'EXECUTE'
      ),
      false
    ) as authenticated_execute,
    coalesce(
      bool_or(expanded.grantee = to_regrole('service_role')::oid) filter (
        where expanded.privilege_type = 'EXECUTE'
      ),
      false
    ) as service_execute
  from function_metadata as metadata
  left join pg_catalog.pg_proc as function_record
    on function_record.oid = metadata.oid
  left join lateral aclexplode(
    coalesce(function_record.proacl, acldefault('f', function_record.proowner))
  ) as expanded on function_record.oid is not null
  group by metadata.signature
),
chest_ledger_contract as (
  select
    to_regclass('public.currency_transactions') is not null as relation_exists,
    exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid = to_regclass('public.currency_transactions')
        and attribute.attname = 'balance_after'
        and attribute.attnum > 0
        and not attribute.attisdropped
    ) as balance_after_exists,
    count(*) filter (
      where attribute.attnum is null
        or attribute.atttypid <> expected.type_oid
        or attribute.attnotnull <> expected.required_not_null
    )::integer as incompatible_column_count
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
    on attribute.attrelid = to_regclass('public.currency_transactions')
    and attribute.attname = expected.column_name
    and attribute.attnum > 0
    and not attribute.attisdropped
),
profile_acl as (
  select
    target.column_name,
    role_name.role_name,
    has_column_privilege(
      role_name.role_name, 'public.profiles', target.column_name, 'INSERT'
    ) as can_insert,
    has_column_privilege(
      role_name.role_name, 'public.profiles', target.column_name, 'UPDATE'
    ) as can_update
  from (values ('total_xp'::text), ('streak'::text)) as target(column_name)
  cross join (values ('anon'::text), ('authenticated'::text)) as role_name(role_name)
),
rls_state as (
  select
    count(*) filter (where relation.oid is null)::integer as missing_count,
    count(*) filter (where relation.oid is not null and not relation.relrowsecurity)::integer
      as disabled_count,
    jsonb_agg(jsonb_build_object(
      'table', names.table_name,
      'exists', relation.oid is not null,
      'rls', coalesce(relation.relrowsecurity, false)
    ) order by names.table_name) as tables
  from (
    values
      ('profiles'::text), ('daily_missions'::text),
      ('reward_transactions'::text), ('user_streaks'::text),
      ('user_wallets'::text), ('currency_transactions'::text),
      ('user_chests'::text), ('chest_definitions'::text),
      ('loot_tables'::text), ('loot_table_entries'::text)
  ) as names(table_name)
  left join pg_catalog.pg_namespace as namespace on namespace.nspname = 'public'
  left join pg_catalog.pg_class as relation
    on relation.relnamespace = namespace.oid
    and relation.relname = names.table_name
    and relation.relkind = 'r'
),
data_health as (
  select
    (select count(*) from public.profiles where total_xp < 0)::bigint
      as negative_energy_rows,
    (select count(*) from public.profiles where streak < 0)::bigint
      as negative_profile_streak_rows,
    (select count(*) from public.user_streaks
      where current_streak < 0 or longest_streak < current_streak)::bigint
      as invalid_streak_rows,
    (select count(*) from public.user_wallets where crystals < 0)::bigint
      as negative_wallet_rows,
    (select count(*) from (
      select user_id, for_date, category
      from public.daily_missions
      where category in ('workout', 'nutrition', 'protein')
      group by user_id, for_date, category
      having count(*) > 1
    ) as duplicates)::bigint as duplicate_mission_groups,
    (select count(*) from public.user_chests
      where status not in ('granted', 'opened')
        or (status = 'opened' and opened_at is null))::bigint
      as invalid_user_chest_rows,
    (select count(*) from public.loot_table_entries
      where relative_weight <= 0 or min_quantity <= 0 or max_quantity < min_quantity)::bigint
      as invalid_loot_rows,
    (select count(*) from public.reward_transactions)::bigint
      as reward_transaction_rows,
    (select count(*) from public.reward_transactions where reward_type = 'energy')::bigint
      as energy_reward_rows,
    (select count(*) from public.reward_transactions where reward_type = 'crystal')::bigint
      as crystal_reward_rows
),
checks(check_name, status, details) as (
  select 'required_functions',
    case when count(*) filter (where oid is null) > 0 then 'FAIL' else 'PASS' end,
    jsonb_build_object(
      'functions', jsonb_agg(jsonb_build_object(
        'signature', signature,
        'exists', oid is not null
      ) order by signature)
    )
  from function_metadata
  union all
  select 'legacy_toggle_contained',
    case
      when metadata.oid is null then 'FAIL'
      when coalesce(acl.public_execute, false) or coalesce(acl.anon_execute, false)
        or not coalesce(acl.authenticated_execute, false)
      then 'FAIL'
      else 'PASS'
    end,
    jsonb_build_object(
      'public_execute', acl.public_execute,
      'anon_execute', acl.anon_execute,
      'authenticated_execute', acl.authenticated_execute,
      'security_definer', metadata.security_definer,
      'configuration', metadata.configuration,
      'remaining_authenticated_compatibility_debt', true
    )
  from function_metadata as metadata
  join function_acl as acl using (signature)
  where metadata.function_name = 'toggle_mission_with_xp'
  union all
  select 'legacy_toggle_runtime_debt',
    case
      when metadata.oid is null then 'FAIL'
      when coalesce(acl.authenticated_execute, false) then 'WARN'
      else 'PASS'
    end,
    jsonb_build_object(
      'authenticated_execute_retained_for_dashboard',
        acl.authenticated_execute,
      'configuration', metadata.configuration,
      'replacement_cutover_required', acl.authenticated_execute,
      'final_authenticated_revoke_required', acl.authenticated_execute
    )
  from function_metadata as metadata
  join function_acl as acl using (signature)
  where metadata.function_name = 'toggle_mission_with_xp'
  union all
  select 'secure_mission_replacement',
    case
      when metadata.oid is null or not metadata.security_definer then 'FAIL'
      when metadata.owner_name in ('anon', 'authenticated', 'service_role') then 'FAIL'
      when coalesce(acl.public_execute, false) or coalesce(acl.anon_execute, false)
        or not coalesce(acl.authenticated_execute, false)
      then 'FAIL'
      when array_to_string(metadata.configuration, ',') not like '%search_path=%'
        or metadata.definition not like '%auth.uid%'
        or metadata.definition not like '%for update%'
        or metadata.definition not like '%mission.user_id = v_user_id%'
        or metadata.definition not like '%mission.completed = false%'
        or metadata.definition not like '%idempotency_key%'
        or metadata.definition not like '%record_user_streak_activity%'
      then 'FAIL'
      else 'PASS'
    end,
    jsonb_build_object(
      'security_definer', metadata.security_definer,
      'owner', metadata.owner_name,
      'configuration', metadata.configuration,
      'public_execute', acl.public_execute,
      'anon_execute', acl.anon_execute,
      'authenticated_execute', acl.authenticated_execute,
      'auth_bound', metadata.definition like '%auth.uid%',
      'ownership_bound', metadata.definition like '%mission.user_id = v_user_id%',
      'row_locked', metadata.definition like '%for update%',
      'completion_only', metadata.definition like '%mission.completed = false%',
      'idempotency_key_written', metadata.definition like '%idempotency_key%',
      'streak_called', metadata.definition like '%record_user_streak_activity%'
    )
  from function_metadata as metadata
  join function_acl as acl using (signature)
  where metadata.function_name = 'complete_mission_with_energy'
  union all
  select 'streak_compatibility',
    case
      when metadata.oid is null or not metadata.security_definer then 'FAIL'
      when coalesce(acl.public_execute, false)
        or coalesce(acl.anon_execute, false)
        or coalesce(acl.authenticated_execute, false)
        or not coalesce(acl.service_execute, false)
      then 'FAIL'
      when array_to_string(metadata.configuration, ',') not like '%search_path=%'
        or metadata.definition not like '%america/sao_paulo%'
        or metadata.definition not like '%for update%'
        or metadata.definition not like '%on conflict on constraint user_streaks_pkey%'
        or metadata.definition not like '%update public.user_streaks%'
        or metadata.definition not like '%update public.profiles%'
      then 'FAIL'
      else 'PASS'
    end,
    jsonb_build_object(
      'service_only', acl.service_execute
        and not acl.public_execute and not acl.anon_execute
        and not acl.authenticated_execute,
      'configuration', metadata.configuration,
      'brazil_date', metadata.definition like '%america/sao_paulo%',
      'row_lock', metadata.definition like '%for update%',
      'unambiguous_conflict_target',
        metadata.definition like '%on conflict on constraint user_streaks_pkey%',
      'dedicated_sync', metadata.definition like '%update public.user_streaks%',
      'legacy_sync', metadata.definition like '%update public.profiles%'
    )
  from function_metadata as metadata
  join function_acl as acl using (signature)
  where metadata.function_name = 'record_user_streak_activity'
  union all
  select 'profiles_direct_write_transition',
    case when bool_or(can_insert or can_update) then 'WARN' else 'PASS' end,
    jsonb_build_object(
      'total_xp_fully_protected', not (
        bool_or(can_insert or can_update) filter (where column_name = 'total_xp')
      ),
      'streak_fully_protected', not (
        bool_or(can_insert or can_update) filter (where column_name = 'streak')
      ),
      'deferred_until_runtime_cutover', bool_or(can_insert or can_update),
      'grants', jsonb_agg(jsonb_build_object(
        'column', column_name,
        'role', role_name,
        'insert', can_insert,
        'update', can_update
      ) order by column_name, role_name)
    )
  from profile_acl
  union all
  select 'rls_intact',
    case when missing_count > 0 or disabled_count > 0 then 'FAIL' else 'PASS' end,
    jsonb_build_object(
      'missing', missing_count,
      'disabled', disabled_count,
      'tables', tables
    )
  from rls_state
  union all
  select 'open_user_chest_reconciled',
    case
      when metadata.oid is null or not metadata.security_definer then 'FAIL'
      when metadata.owner_name in ('anon', 'authenticated', 'service_role') then 'FAIL'
      when metadata.configuration is distinct from array['search_path=""']::text[]
      then 'FAIL'
      when coalesce(acl.public_execute, false)
        or coalesce(acl.anon_execute, false)
        or not coalesce(acl.authenticated_execute, false)
      then 'FAIL'
      when metadata.all_argument_types is distinct from array[
          'uuid'::regtype::oid,
          'uuid'::regtype::oid,
          'text'::regtype::oid,
          'text'::regtype::oid,
          'text'::regtype::oid,
          'text'::regtype::oid,
          'integer'::regtype::oid,
          'uuid'::regtype::oid
        ]::oid[]
        or metadata.argument_modes is distinct from array[
          'i', 't', 't', 't', 't', 't', 't', 't'
        ]::"char"[]
        or metadata.argument_names is distinct from array[
          'p_chest_id', 'chest_id', 'chest_slug', 'chest_name', 'chest_rarity',
          'reward_type', 'amount', 'item_id'
        ]::text[]
      then 'FAIL'
      when metadata.definition_md5 = 'e0e2b37869940e51cf02e3af0ae0ec23'
        or metadata.definition like '%balance_after%'
        or metadata.definition not like '%00700: currency_transactions is amount-only%'
        or metadata.definition not like '%auth.uid%'
        or metadata.definition not like '%user_chest.user_id = v_user_id%'
        or metadata.definition not like '%for update of user_chest%'
        or metadata.definition not like '%opened chest has no persisted reward%'
        or metadata.definition not like '%insert into public.user_wallets%'
        or metadata.definition not like '%insert into public.currency_transactions%'
        or metadata.definition not like '%insert into public.reward_transactions%'
        or metadata.definition not like '%update public.user_chests%'
        or metadata.definition not like '%idempotency_key%'
        or metadata.description is distinct from
          'PRAXE 00700 amount-only ledger; definition_md5='
            || metadata.definition_md5
        or not ledger.relation_exists
        or ledger.balance_after_exists
        or ledger.incompatible_column_count > 0
      then 'FAIL'
      else 'PASS'
    end,
    jsonb_build_object(
      'definition_md5', metadata.definition_md5,
      'reviewed_old_md5', 'e0e2b37869940e51cf02e3af0ae0ec23',
      'security_definer', metadata.security_definer,
      'owner', metadata.owner_name,
      'configuration', metadata.configuration,
      'public_execute', acl.public_execute,
      'anon_execute', acl.anon_execute,
      'authenticated_execute', acl.authenticated_execute,
      'row_lock_signal', metadata.definition like '%for update of user_chest%',
      'ownership_signal', metadata.definition like '%user_chest.user_id = v_user_id%',
      'idempotency_signal', metadata.definition like '%idempotency_key%',
      'amount_only_marker',
        metadata.definition like '%00700: currency_transactions is amount-only%',
      'references_balance_after', metadata.definition like '%balance_after%',
      'stored_fingerprint_pin', metadata.description,
      'ledger_balance_after_exists', ledger.balance_after_exists,
      'ledger_incompatible_columns', ledger.incompatible_column_count
    )
  from function_metadata as metadata
  join function_acl as acl using (signature)
  cross join chest_ledger_contract as ledger
  where metadata.function_name = 'open_user_chest'
  union all
  select 'open_user_chest_fingerprint_pin',
    case
      when metadata.definition_md5 = 'e0e2b37869940e51cf02e3af0ae0ec23'
        then 'FAIL'
      when metadata.description is distinct from
        'PRAXE 00700 amount-only ledger; definition_md5='
          || metadata.definition_md5
        then 'FAIL'
      else 'PASS'
    end,
    jsonb_build_object(
      'definition_md5', metadata.definition_md5,
      'stored_pin', metadata.description,
      'pin_matches_definition',
        metadata.description = 'PRAXE 00700 amount-only ledger; definition_md5='
          || metadata.definition_md5,
      'capture_for_review_before_production', true
    )
  from function_metadata as metadata
  where metadata.function_name = 'open_user_chest'
  union all
  select 'aggregate_data_health',
    case
      when negative_energy_rows > 0
        or negative_profile_streak_rows > 0
        or invalid_streak_rows > 0
        or negative_wallet_rows > 0
        or duplicate_mission_groups > 0
        or invalid_user_chest_rows > 0
        or invalid_loot_rows > 0
      then 'FAIL' else 'PASS'
    end,
    to_jsonb(data_health)
  from data_health
),
summary as (
  select
    case
      when count(*) filter (where status = 'FAIL') > 0 then 'FAIL'
      when count(*) filter (where status = 'WARN') > 0 then 'WARN'
      else 'PASS'
    end as overall_status,
    count(*) filter (where status = 'PASS')::integer as pass_count,
    count(*) filter (where status = 'WARN')::integer as warn_count,
    count(*) filter (where status = 'FAIL')::integer as fail_count,
    jsonb_agg(jsonb_build_object(
      'check', check_name,
      'status', status,
      'details', details
    ) order by check_name) as checks
  from checks
)
select overall_status, pass_count, warn_count, fail_count, checks
from summary;
