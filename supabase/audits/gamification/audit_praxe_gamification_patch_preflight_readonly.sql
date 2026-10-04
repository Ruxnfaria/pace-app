-- Manual patch preflight. Read-only, one statement, one consolidated result set.
-- It does not invoke business functions and returns aggregate/catalog metadata only.
with required_columns(table_name, column_name, data_type, not_null) as (
  values
    ('profiles'::text, 'user_id'::text, 'uuid'::text, true),
    ('profiles', 'total_xp', 'integer', false),
    ('profiles', 'level', 'integer', false),
    ('profiles', 'streak', 'integer', false),
    ('profiles', 'last_activity_date', 'date', false),
    ('daily_missions', 'id', 'uuid', true),
    ('daily_missions', 'user_id', 'uuid', true),
    ('daily_missions', 'completed', 'boolean', false),
    ('daily_missions', 'xp_reward', 'integer', false),
    ('daily_missions', 'current_value', 'integer', false),
    ('daily_missions', 'target_value', 'integer', false),
    ('daily_missions', 'completed_at', 'timestamp with time zone', false),
    ('reward_transactions', 'user_id', 'uuid', true),
    ('reward_transactions', 'reward_type', 'text', true),
    ('reward_transactions', 'source_type', 'text', true),
    ('reward_transactions', 'source_id', 'text', false),
    ('reward_transactions', 'idempotency_key', 'text', true),
    ('reward_transactions', 'payload', 'jsonb', true),
    ('user_streaks', 'user_id', 'uuid', true),
    ('user_streaks', 'current_streak', 'integer', true),
    ('user_streaks', 'longest_streak', 'integer', true),
    ('user_streaks', 'last_active_date', 'date', false)
),
actual_columns as (
  select
    columns.table_name::text,
    columns.column_name::text,
    columns.data_type::text,
    columns.is_nullable = 'NO' as not_null
  from information_schema.columns
  where columns.table_schema = 'public'
),
column_contract as (
  select
    count(*) filter (where actual.column_name is null)::integer as missing_count,
    count(*) filter (
      where actual.column_name is not null
        and not (
          actual.data_type = required.data_type
          or (
            required.data_type = 'integer'
            and actual.data_type in ('smallint', 'integer', 'bigint')
          )
          or (
            required.table_name = 'profiles'
            and required.column_name = 'last_activity_date'
            and actual.data_type in ('date', 'timestamp with time zone', 'timestamp without time zone')
          )
        )
    )::integer as type_mismatch_count,
    count(*) filter (
      where actual.column_name is not null
        and required.not_null
        and not actual.not_null
    )::integer as required_not_null_mismatch_count,
    jsonb_agg(
      jsonb_build_object(
        'table', required.table_name,
        'column', required.column_name,
        'expected_type', required.data_type,
        'actual_type', actual.data_type,
        'expected_not_null', required.not_null,
        'actual_not_null', actual.not_null
      ) order by required.table_name, required.column_name
    ) as columns
  from required_columns as required
  left join actual_columns as actual
    on actual.table_name = required.table_name
    and actual.column_name = required.column_name
),
relation_contract as (
  select
    count(*) filter (where relation.oid is null)::integer as missing_count,
    count(*) filter (
      where relation.oid is not null and not relation.relrowsecurity
    )::integer as rls_disabled_count,
    jsonb_agg(jsonb_build_object(
      'table', names.table_name,
      'exists', relation.oid is not null,
      'rls', coalesce(relation.relrowsecurity, false)
    ) order by names.table_name) as relations
  from (
    values
      ('profiles'::text),
      ('daily_missions'::text),
      ('reward_transactions'::text),
      ('user_streaks'::text),
      ('user_wallets'::text),
      ('currency_transactions'::text),
      ('user_inventory'::text),
      ('user_boosts'::text),
      ('user_chests'::text),
      ('chest_definitions'::text),
      ('loot_tables'::text),
      ('loot_table_entries'::text)
  ) as names(table_name)
  left join pg_catalog.pg_namespace as namespace
    on namespace.nspname = 'public'
  left join pg_catalog.pg_class as relation
    on relation.relnamespace = namespace.oid
    and relation.relname = names.table_name
    and relation.relkind = 'r'
),
streak_key_contract as (
  select exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    join pg_catalog.pg_attribute as attribute
      on attribute.attrelid = constraint_record.conrelid
      and attribute.attnum = constraint_record.conkey[1]
      and not attribute.attisdropped
    where constraint_record.conrelid = to_regclass('public.user_streaks')
      and constraint_record.conname = 'user_streaks_pkey'
      and constraint_record.contype = 'p'
      and cardinality(constraint_record.conkey) = 1
      and attribute.attname = 'user_id'
  ) as valid
),
function_metadata as (
  select
    function_record.oid,
    function_record.proname::text as function_name,
    pg_catalog.pg_get_function_identity_arguments(function_record.oid)::text
      as identity_arguments,
    function_record.prosecdef as security_definer,
    pg_catalog.pg_get_userbyid(function_record.proowner)::text as owner_name,
    coalesce(function_record.proconfig, array[]::text[]) as configuration,
    lower(pg_catalog.pg_get_functiondef(function_record.oid)::text) as definition,
    md5(pg_catalog.pg_get_functiondef(function_record.oid)::text) as definition_md5
  from pg_catalog.pg_proc as function_record
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = function_record.pronamespace
  where namespace.nspname = 'public'
    and function_record.oid in (
      to_regprocedure('public.toggle_mission_with_xp(uuid,boolean)'),
      to_regprocedure('public.record_user_streak_activity(uuid)'),
      to_regprocedure('public.open_user_chest(uuid)'),
      to_regprocedure('public.get_my_streak()'),
      to_regprocedure('public.complete_mission_with_energy(uuid)')
    )
),
function_acl as (
  select
    metadata.function_name,
    metadata.identity_arguments,
    coalesce(
      bool_or(expanded.grantee = 0) filter (
        where expanded.privilege_type = 'EXECUTE'
      ),
      false
    ) as public_execute,
    coalesce(
      bool_or(
        expanded.grantee = to_regrole('anon')::oid
      ) filter (where expanded.privilege_type = 'EXECUTE'),
      false
    ) as anon_execute,
    coalesce(
      bool_or(
        expanded.grantee = to_regrole('authenticated')::oid
      ) filter (where expanded.privilege_type = 'EXECUTE'),
      false
    ) as authenticated_execute,
    coalesce(
      bool_or(
        expanded.grantee = to_regrole('service_role')::oid
      ) filter (where expanded.privilege_type = 'EXECUTE'),
      false
    ) as service_execute
  from function_metadata as metadata
  cross join lateral aclexplode(
    coalesce(
      (select function_record.proacl from pg_catalog.pg_proc as function_record
       where function_record.oid = metadata.oid),
      acldefault(
        'f',
        (select function_record.proowner from pg_catalog.pg_proc as function_record
         where function_record.oid = metadata.oid)
      )
    )
  ) as expanded
  group by metadata.function_name, metadata.identity_arguments
),
profile_acl as (
  select
    target.column_name,
    role_name.role_name,
    has_column_privilege(
      role_name.role_name,
      'public.profiles',
      target.column_name,
      'INSERT'
    ) as can_insert,
    has_column_privilege(
      role_name.role_name,
      'public.profiles',
      target.column_name,
      'UPDATE'
    ) as can_update
  from (values ('total_xp'::text), ('streak'::text)) as target(column_name)
  cross join (values ('anon'::text), ('authenticated'::text)) as role_name(role_name)
),
inventory_contract as (
  select
    count(*) filter (
      where column_name in ('id', 'user_id', 'item_id', 'quantity', 'metadata', 'created_at', 'updated_at')
    ) = 7 as production_shape_supported,
    count(*) filter (where column_name = 'acquired_at') > 0 as acquired_at_exists,
    jsonb_agg(jsonb_build_object(
      'column', column_name,
      'type', data_type,
      'nullable', is_nullable,
      'default', column_default
    ) order by ordinal_position) as columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'user_inventory'
),
boost_contract as (
  select
    count(*) filter (
      where column_name in (
        'id', 'user_id', 'boost_type', 'multiplier', 'starts_at', 'expires_at',
        'source_type', 'source_id', 'consumed_at', 'metadata', 'created_at'
      )
    ) = 11 as production_shape_supported,
    coalesce(jsonb_agg(column_name order by column_name) filter (
      where column_name in ('item_id', 'status', 'quantity', 'updated_at')
    ), '[]'::jsonb) as desired_extra_columns_present,
    bool_and(is_nullable = 'NO') filter (
      where column_name in ('starts_at', 'expires_at')
    ) as bounded_interval_required,
    jsonb_agg(jsonb_build_object(
      'column', column_name,
      'type', data_type,
      'nullable', is_nullable,
      'default', column_default
    ) order by ordinal_position) as columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'user_boosts'
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
      as invalid_loot_rows
),
checks(check_name, status, details) as (
  select 'required_function_signatures',
    case
      when to_regprocedure('public.toggle_mission_with_xp(uuid,boolean)') is null
        or to_regprocedure('public.record_user_streak_activity(uuid)') is null
        or to_regprocedure('public.open_user_chest(uuid)') is null
      then 'FAIL' else 'PASS'
    end,
    jsonb_build_object(
      'toggle_mission_with_xp',
        to_regprocedure('public.toggle_mission_with_xp(uuid,boolean)') is not null,
      'record_user_streak_activity',
        to_regprocedure('public.record_user_streak_activity(uuid)') is not null,
      'open_user_chest',
        to_regprocedure('public.open_user_chest(uuid)') is not null
    )
  union all
  select 'required_relations',
    case when missing_count > 0 or rls_disabled_count > 0 then 'FAIL' else 'PASS' end,
    jsonb_build_object(
      'missing', missing_count,
      'rls_disabled', rls_disabled_count,
      'relations', relations
    )
  from relation_contract
  union all
  select 'user_streaks_primary_key',
    case when valid then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'constraint', 'user_streaks_pkey',
      'primary_key', true,
      'columns', jsonb_build_array('user_id'),
      'valid', valid
    )
  from streak_key_contract
  union all
  select 'patch_column_contract',
    case when missing_count > 0 or type_mismatch_count > 0
      or required_not_null_mismatch_count > 0 then 'FAIL' else 'PASS' end,
    jsonb_build_object(
      'missing', missing_count,
      'type_mismatches', type_mismatch_count,
      'required_not_null_mismatches', required_not_null_mismatch_count,
      'columns', columns
    )
  from column_contract
  union all
  select 'legacy_toggle_containment_precondition',
    case
      when metadata.oid is null or not metadata.security_definer then 'FAIL'
      when metadata.owner_name in ('anon', 'authenticated', 'service_role') then 'FAIL'
      when metadata.definition not like '%auth.uid%'
        or metadata.definition not like '%user_id%'
        or metadata.definition not like '%for update%'
      then 'FAIL'
      when coalesce(acl.public_execute, false) or coalesce(acl.anon_execute, false)
      then 'WARN'
      else 'PASS'
    end,
    jsonb_build_object(
      'exists', metadata.oid is not null,
      'security_definer', metadata.security_definer,
      'owner', metadata.owner_name,
      'configuration', metadata.configuration,
      'public_execute', acl.public_execute,
      'anon_execute', acl.anon_execute,
      'authenticated_execute', acl.authenticated_execute,
      'auth_uid_signal', metadata.definition like '%auth.uid%',
      'ownership_signal', metadata.definition like '%user_id%',
      'row_lock_signal', metadata.definition like '%for update%'
    )
  from function_metadata as metadata
  left join function_acl as acl
    on acl.function_name = metadata.function_name
    and acl.identity_arguments = metadata.identity_arguments
  where metadata.function_name = 'toggle_mission_with_xp'
  union all
  select 'replacement_name_collision',
    case
      when metadata.oid is null then 'PASS'
      when metadata.security_definer
        and array_to_string(metadata.configuration, ',') like '%search_path=%'
        and not coalesce(acl.public_execute, false)
        and not coalesce(acl.anon_execute, false)
      then 'WARN'
      else 'FAIL'
    end,
    jsonb_build_object(
      'already_exists', metadata.oid is not null,
      'security_definer', metadata.security_definer,
      'configuration', metadata.configuration,
      'public_execute', acl.public_execute,
      'anon_execute', acl.anon_execute
    )
  from (select 1) as anchor
  left join function_metadata as metadata
    on metadata.function_name = 'complete_mission_with_energy'
  left join function_acl as acl
    on acl.function_name = metadata.function_name
    and acl.identity_arguments = metadata.identity_arguments
  union all
  select 'streak_recorder_precondition',
    case
      when metadata.oid is null or not metadata.security_definer then 'FAIL'
      when not coalesce(acl.service_execute, false)
        or coalesce(acl.public_execute, false)
        or coalesce(acl.anon_execute, false)
        or coalesce(acl.authenticated_execute, false)
      then 'FAIL'
      when metadata.definition not like '%america/sao_paulo%'
        or metadata.definition not like '%for update%'
      then 'FAIL'
      when metadata.definition not like '%update public.profiles%' then 'WARN'
      else 'PASS'
    end,
    jsonb_build_object(
      'exists', metadata.oid is not null,
      'security_definer', metadata.security_definer,
      'configuration', metadata.configuration,
      'service_execute', acl.service_execute,
      'public_execute', acl.public_execute,
      'anon_execute', acl.anon_execute,
      'authenticated_execute', acl.authenticated_execute,
      'brazil_date_signal', metadata.definition like '%america/sao_paulo%',
      'row_lock_signal', metadata.definition like '%for update%',
      'profiles_sync_signal', metadata.definition like '%update public.profiles%'
    )
  from function_metadata as metadata
  left join function_acl as acl
    on acl.function_name = metadata.function_name
    and acl.identity_arguments = metadata.identity_arguments
  where metadata.function_name = 'record_user_streak_activity'
  union all
  select 'profiles_legacy_client_writes', 'WARN',
    jsonb_build_object(
      'transition_required_before_revocation', true,
      'grants', jsonb_agg(jsonb_build_object(
        'column', column_name,
        'role', role_name,
        'insert', can_insert,
        'update', can_update
      ) order by column_name, role_name)
    )
  from profile_acl
  union all
  select 'user_inventory_contract',
    case when production_shape_supported then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'production_shape_supported', production_shape_supported,
      'acquired_at_exists', acquired_at_exists,
      'created_at_is_acquisition_timestamp', true,
      'columns', columns
    )
  from inventory_contract
  union all
  select 'user_boosts_contract',
    case when production_shape_supported and bounded_interval_required then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'production_timed_multiplier_shape_supported', production_shape_supported,
      'desired_extra_columns_present', desired_extra_columns_present,
      'bounded_interval_required', bounded_interval_required,
      'columns', columns
    )
  from boost_contract
  union all
  select 'chest_rpc_fingerprint',
    case
      when metadata.oid is null or not metadata.security_definer then 'FAIL'
      when metadata.definition not like '%for update%'
        or metadata.definition not like '%idempotency%'
      then 'FAIL'
      else 'PASS'
    end,
    jsonb_build_object(
      'definition_md5', metadata.definition_md5,
      'security_definer', metadata.security_definer,
      'configuration', metadata.configuration,
      'row_lock_signal', metadata.definition like '%for update%',
      'idempotency_signal', metadata.definition like '%idempotency%'
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
