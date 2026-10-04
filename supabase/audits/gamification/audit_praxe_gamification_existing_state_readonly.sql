-- Manual Production audit. Read-only, one statement, one consolidated result set.
-- It inspects catalog metadata and returns aggregate counts only.
with expected_tables(table_name) as (
  values
    ('user_wallets'::text),
    ('currency_transactions'::text),
    ('items'::text),
    ('user_inventory'::text),
    ('chest_definitions'::text),
    ('loot_tables'::text),
    ('loot_table_entries'::text),
    ('user_chests'::text),
    ('reward_transactions'::text),
    ('user_boosts'::text),
    ('user_streaks'::text)
),
expected_columns(table_name, column_name, data_type, not_null, needs_default) as (
  values
    ('user_wallets', 'user_id', 'uuid', true, false),
    ('user_wallets', 'crystals', 'bigint', true, true),
    ('user_wallets', 'created_at', 'timestamp with time zone', true, true),
    ('user_wallets', 'updated_at', 'timestamp with time zone', true, true),
    ('currency_transactions', 'id', 'uuid', true, true),
    ('currency_transactions', 'user_id', 'uuid', true, false),
    ('currency_transactions', 'currency', 'text', true, false),
    ('currency_transactions', 'amount', 'bigint', true, false),
    ('currency_transactions', 'balance_after', 'bigint', true, false),
    ('currency_transactions', 'transaction_type', 'text', true, false),
    ('currency_transactions', 'source_type', 'text', true, false),
    ('currency_transactions', 'source_id', 'text', false, false),
    ('currency_transactions', 'idempotency_key', 'text', true, false),
    ('currency_transactions', 'metadata', 'jsonb', true, true),
    ('currency_transactions', 'created_at', 'timestamp with time zone', true, true),
    ('items', 'id', 'uuid', true, true),
    ('items', 'slug', 'text', true, false),
    ('items', 'name', 'text', true, false),
    ('items', 'description', 'text', false, false),
    ('items', 'item_type', 'text', true, false),
    ('items', 'rarity', 'text', true, false),
    ('items', 'active', 'boolean', true, true),
    ('items', 'metadata', 'jsonb', true, true),
    ('items', 'created_at', 'timestamp with time zone', true, true),
    ('items', 'updated_at', 'timestamp with time zone', true, true),
    ('user_inventory', 'id', 'uuid', true, true),
    ('user_inventory', 'user_id', 'uuid', true, false),
    ('user_inventory', 'item_id', 'uuid', true, false),
    ('user_inventory', 'quantity', 'integer', true, true),
    ('user_inventory', 'acquired_at', 'timestamp with time zone', true, true),
    ('user_inventory', 'updated_at', 'timestamp with time zone', true, true),
    ('chest_definitions', 'id', 'uuid', true, true),
    ('chest_definitions', 'slug', 'text', true, false),
    ('chest_definitions', 'name', 'text', true, false),
    ('chest_definitions', 'description', 'text', false, false),
    ('chest_definitions', 'rarity', 'text', true, false),
    ('chest_definitions', 'active', 'boolean', true, true),
    ('chest_definitions', 'created_at', 'timestamp with time zone', true, true),
    ('chest_definitions', 'updated_at', 'timestamp with time zone', true, true),
    ('loot_tables', 'id', 'uuid', true, true),
    ('loot_tables', 'chest_definition_id', 'uuid', true, false),
    ('loot_tables', 'name', 'text', true, false),
    ('loot_tables', 'active', 'boolean', true, true),
    ('loot_tables', 'created_at', 'timestamp with time zone', true, true),
    ('loot_tables', 'updated_at', 'timestamp with time zone', true, true),
    ('loot_table_entries', 'id', 'uuid', true, true),
    ('loot_table_entries', 'loot_table_id', 'uuid', true, false),
    ('loot_table_entries', 'reward_type', 'text', true, false),
    ('loot_table_entries', 'item_id', 'uuid', false, false),
    ('loot_table_entries', 'min_quantity', 'integer', true, false),
    ('loot_table_entries', 'max_quantity', 'integer', true, false),
    ('loot_table_entries', 'relative_weight', 'numeric', true, false),
    ('loot_table_entries', 'active', 'boolean', true, true),
    ('loot_table_entries', 'created_at', 'timestamp with time zone', true, true),
    ('loot_table_entries', 'updated_at', 'timestamp with time zone', true, true),
    ('user_chests', 'id', 'uuid', true, true),
    ('user_chests', 'user_id', 'uuid', true, false),
    ('user_chests', 'chest_definition_id', 'uuid', true, false),
    ('user_chests', 'status', 'text', true, true),
    ('user_chests', 'source_type', 'text', true, false),
    ('user_chests', 'source_id', 'text', true, false),
    ('user_chests', 'idempotency_key', 'text', true, false),
    ('user_chests', 'granted_at', 'timestamp with time zone', true, true),
    ('user_chests', 'opened_at', 'timestamp with time zone', false, false),
    ('user_chests', 'metadata', 'jsonb', true, true),
    ('reward_transactions', 'id', 'uuid', true, true),
    ('reward_transactions', 'user_id', 'uuid', true, false),
    ('reward_transactions', 'reward_type', 'text', true, false),
    ('reward_transactions', 'source_type', 'text', true, false),
    ('reward_transactions', 'source_id', 'text', false, false),
    ('reward_transactions', 'idempotency_key', 'text', true, false),
    ('reward_transactions', 'payload', 'jsonb', true, true),
    ('reward_transactions', 'created_at', 'timestamp with time zone', true, true),
    ('user_boosts', 'id', 'uuid', true, true),
    ('user_boosts', 'user_id', 'uuid', true, false),
    ('user_boosts', 'item_id', 'uuid', true, false),
    ('user_boosts', 'status', 'text', true, true),
    ('user_boosts', 'quantity', 'integer', true, true),
    ('user_boosts', 'starts_at', 'timestamp with time zone', false, false),
    ('user_boosts', 'expires_at', 'timestamp with time zone', false, false),
    ('user_boosts', 'consumed_at', 'timestamp with time zone', false, false),
    ('user_boosts', 'metadata', 'jsonb', true, true),
    ('user_boosts', 'created_at', 'timestamp with time zone', true, true),
    ('user_boosts', 'updated_at', 'timestamp with time zone', true, true),
    ('user_streaks', 'user_id', 'uuid', true, false),
    ('user_streaks', 'current_streak', 'integer', true, true),
    ('user_streaks', 'longest_streak', 'integer', true, true),
    ('user_streaks', 'last_active_date', 'date', false, false),
    ('user_streaks', 'created_at', 'timestamp with time zone', true, true),
    ('user_streaks', 'updated_at', 'timestamp with time zone', true, true)
),
relations as (
  select
    expected.table_name,
    relation.oid as relation_oid,
    relation.relkind::text as relkind,
    pg_catalog.pg_get_userbyid(relation.relowner)::text as owner_name,
    coalesce(relation.relrowsecurity, false) as rls_enabled,
    coalesce(relation.relforcerowsecurity, false) as rls_forced
  from expected_tables as expected
  left join pg_catalog.pg_namespace as namespace
    on namespace.nspname = 'public'
  left join pg_catalog.pg_class as relation
    on relation.relnamespace = namespace.oid
    and relation.relname = expected.table_name
),
actual_columns as (
  select
    relation.relname::text as table_name,
    attribute.attname::text as column_name,
    pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)::text as data_type,
    attribute.attnotnull as not_null,
    pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid)::text as default_expression
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  join pg_catalog.pg_attribute as attribute
    on attribute.attrelid = relation.oid
    and attribute.attnum > 0
    and not attribute.attisdropped
  left join pg_catalog.pg_attrdef as default_value
    on default_value.adrelid = relation.oid
    and default_value.adnum = attribute.attnum
  where namespace.nspname = 'public'
    and relation.relname in (select table_name from expected_tables)
),
column_contract as (
  select
    expected.table_name,
    count(*)::integer as expected_count,
    count(*) filter (where actual.column_name is null)::integer as missing_count,
    count(*) filter (
      where actual.column_name is null
        and not (
          expected.table_name = 'currency_transactions'
          and expected.column_name = 'balance_after'
        )
    )::integer as critical_missing_count,
    count(*) filter (
      where actual.column_name is not null
        and not (
          actual.data_type = expected.data_type
          or (expected.data_type = 'numeric' and actual.data_type like 'numeric%')
          or (
            expected.data_type in ('integer', 'bigint')
            and actual.data_type in ('smallint', 'integer', 'bigint')
          )
        )
    )::integer as type_mismatch_count,
    count(*) filter (
      where actual.column_name is not null
        and actual.not_null is distinct from expected.not_null
    )::integer as nullability_mismatch_count,
    count(*) filter (
      where expected.needs_default
        and actual.column_name is not null
        and actual.default_expression is null
    )::integer as missing_default_count
  from expected_columns as expected
  left join actual_columns as actual
    on actual.table_name = expected.table_name
    and actual.column_name = expected.column_name
  group by expected.table_name
),
actual_column_counts as (
  select table_name, count(*)::integer as actual_count
  from actual_columns
  group by table_name
),
constraint_metadata as (
  select
    relation.relname::text as table_name,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', constraint_record.conname::text,
          'type', constraint_record.contype::text,
          'definition', pg_catalog.pg_get_constraintdef(constraint_record.oid, true)::text
        ) order by constraint_record.conname::text
      ) filter (where constraint_record.oid is not null),
      '[]'::jsonb
    ) as constraints,
    lower(coalesce(string_agg(
      constraint_record.conname::text || ' ' ||
      pg_catalog.pg_get_constraintdef(constraint_record.oid, true)::text,
      ' '
    ), '')) as searchable_definition,
    count(*) filter (where constraint_record.contype = 'p')::integer as primary_key_count,
    count(*) filter (where constraint_record.contype = 'f')::integer as foreign_key_count,
    count(*) filter (where constraint_record.contype = 'u')::integer as unique_count,
    count(*) filter (where constraint_record.contype = 'c')::integer as check_count
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  left join pg_catalog.pg_constraint as constraint_record
    on constraint_record.conrelid = relation.oid
  where namespace.nspname = 'public'
    and relation.relname in (select table_name from expected_tables)
  group by relation.relname
),
index_metadata as (
  select
    relation.relname::text as table_name,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', index_relation.relname::text,
          'unique', index_record.indisunique,
          'valid', index_record.indisvalid,
          'definition', pg_catalog.pg_get_indexdef(index_relation.oid)::text
        ) order by index_relation.relname::text
      ) filter (where index_relation.oid is not null),
      '[]'::jsonb
    ) as indexes,
    lower(coalesce(string_agg(
      index_relation.relname::text || ' ' ||
      pg_catalog.pg_get_indexdef(index_relation.oid)::text,
      ' '
    ), '')) as searchable_definition
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  left join pg_catalog.pg_index as index_record
    on index_record.indrelid = relation.oid
  left join pg_catalog.pg_class as index_relation
    on index_relation.oid = index_record.indexrelid
  where namespace.nspname = 'public'
    and relation.relname in (select table_name from expected_tables)
  group by relation.relname
),
trigger_metadata as (
  select
    relation.relname::text as table_name,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', trigger_record.tgname::text,
          'enabled', trigger_record.tgenabled::text,
          'function', function_record.proname::text
        ) order by trigger_record.tgname::text
      ) filter (where trigger_record.oid is not null),
      '[]'::jsonb
    ) as triggers,
    lower(coalesce(string_agg(
      trigger_record.tgname::text || ' ' || function_record.proname::text,
      ' '
    ), '')) as searchable_definition
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  left join pg_catalog.pg_trigger as trigger_record
    on trigger_record.tgrelid = relation.oid
    and not trigger_record.tgisinternal
  left join pg_catalog.pg_proc as function_record
    on function_record.oid = trigger_record.tgfoid
  where namespace.nspname = 'public'
    and relation.relname in (select table_name from expected_tables)
  group by relation.relname
),
policy_metadata as (
  select
    relation.relname::text as table_name,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', policy_record.polname::text,
          'command', policy_record.polcmd::text,
          'permissive', policy_record.polpermissive,
          'roles', (
            select coalesce(jsonb_agg(
              case
                when policy_role.role_oid = 0 then 'PUBLIC'
                else pg_catalog.pg_get_userbyid(policy_role.role_oid)::text
              end order by policy_role.role_oid
            ), '[]'::jsonb)
            from unnest(policy_record.polroles) as policy_role(role_oid)
          )
        ) order by policy_record.polname::text
      ) filter (where policy_record.oid is not null),
      '[]'::jsonb
    ) as policies,
    bool_or(
      policy_record.polcmd::text in ('*', 'a', 'w', 'd')
      and (
        0 = any(policy_record.polroles)
        or to_regrole('anon')::oid = any(policy_record.polroles)
        or to_regrole('authenticated')::oid = any(policy_record.polroles)
      )
    ) filter (where policy_record.oid is not null) as client_write_policy_present
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  left join pg_catalog.pg_policy as policy_record
    on policy_record.polrelid = relation.oid
  where namespace.nspname = 'public'
    and relation.relname in (select table_name from expected_tables)
  group by relation.relname
),
table_grant_metadata as (
  select
    relation.relname::text as table_name,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'grantee', case
          when expanded.grantee = 0 then 'PUBLIC'
          else pg_catalog.pg_get_userbyid(expanded.grantee)::text
        end,
        'privilege', expanded.privilege_type::text,
        'grantable', expanded.is_grantable
      ) order by expanded.grantee, expanded.privilege_type::text
    ), '[]'::jsonb) as grants
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  cross join lateral aclexplode(
    coalesce(relation.relacl, acldefault('r', relation.relowner))
  ) as expanded
  where namespace.nspname = 'public'
    and relation.relname in (select table_name from expected_tables)
  group by relation.relname
),
column_grant_metadata as (
  select
    relation.relname::text as table_name,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'column', attribute.attname::text,
        'grantee', case
          when expanded.grantee = 0 then 'PUBLIC'
          else pg_catalog.pg_get_userbyid(expanded.grantee)::text
        end,
        'privilege', expanded.privilege_type::text,
        'grantable', expanded.is_grantable
      ) order by attribute.attname::text, expanded.grantee, expanded.privilege_type::text
    ), '[]'::jsonb) as grants
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  join pg_catalog.pg_attribute as attribute
    on attribute.attrelid = relation.oid
    and attribute.attnum > 0
    and not attribute.attisdropped
    and attribute.attacl is not null
  cross join lateral aclexplode(attribute.attacl) as expanded
  where namespace.nspname = 'public'
    and relation.relname in (select table_name from expected_tables)
  group by relation.relname
),
required_table_signals(table_name, signal_name, signal_pattern) as (
  values
    ('user_wallets', 'non_negative_crystals', 'crystals >= 0'),
    ('currency_transactions', 'nonzero_amount', 'amount <> 0'),
    ('currency_transactions', 'user_idempotency_unique', 'user_id, idempotency_key'),
    ('items', 'slug_unique', '(slug)'),
    ('user_inventory', 'user_item_unique', 'user_id, item_id'),
    ('chest_definitions', 'slug_unique', '(slug)'),
    ('loot_tables', 'one_table_per_chest', '(chest_definition_id)'),
    ('loot_table_entries', 'positive_weight', 'relative_weight >'),
    ('loot_table_entries', 'currency_reward_unique', 'loot_table_entries_currency_reward_unique'),
    ('loot_table_entries', 'item_reward_unique', 'loot_table_entries_item_reward_unique'),
    ('user_chests', 'opened_state_check', 'opened_at'),
    ('user_chests', 'user_idempotency_unique', 'user_id, idempotency_key'),
    ('reward_transactions', 'user_idempotency_unique', 'user_id, idempotency_key'),
    ('reward_transactions', 'source_reward_unique', 'reward_transactions_source_reward_unique'),
    ('user_boosts', 'positive_quantity', 'quantity > 0'),
    ('user_streaks', 'non_negative_current', 'current_streak >= 0'),
    ('user_streaks', 'longest_not_below_current', 'longest_streak >= current_streak')
),
table_signal_analysis as (
  select
    required.table_name,
    coalesce(jsonb_agg(required.signal_name order by required.signal_name) filter (
      where position(required.signal_pattern in (
        coalesce(constraints.searchable_definition, '') || ' ' ||
        coalesce(indexes.searchable_definition, '')
      )) = 0
    ), '[]'::jsonb) as missing_signals,
    count(*) filter (
      where position(required.signal_pattern in (
        coalesce(constraints.searchable_definition, '') || ' ' ||
        coalesce(indexes.searchable_definition, '')
      )) = 0
    )::integer as missing_signal_count
  from required_table_signals as required
  left join constraint_metadata as constraints
    on constraints.table_name = required.table_name
  left join index_metadata as indexes
    on indexes.table_name = required.table_name
  group by required.table_name
),
table_analysis as (
  select
    relation.table_name,
    case
      when relation.relation_oid is null then 'MISSING'
      when relation.relkind <> 'r' then 'INCOMPATIBLE'
      when not relation.rls_enabled
        or columns.critical_missing_count > 0
        or columns.type_mismatch_count > 0
        or constraints.primary_key_count <> 1
      then 'INCOMPATIBLE'
      when columns.missing_count = 0
        and columns.nullability_mismatch_count = 0
        and columns.missing_default_count = 0
        and coalesce(signals.missing_signal_count, 0) = 0
        and column_counts.actual_count = columns.expected_count
      then 'EXACT_MATCH'
      when columns.missing_count = 0
        and columns.nullability_mismatch_count = 0
        and columns.missing_default_count = 0
        and coalesce(signals.missing_signal_count, 0) = 0
        and column_counts.actual_count > columns.expected_count
      then 'COMPATIBLE_SUPERSET'
      else 'COMPATIBLE_BUT_DIFFERENT'
    end as classification,
    jsonb_build_object(
      'exists', relation.relation_oid is not null,
      'relkind', relation.relkind,
      'owner', relation.owner_name,
      'rls_enabled', relation.rls_enabled,
      'rls_forced', relation.rls_forced,
      'expected_column_count', columns.expected_count,
      'actual_column_count', coalesce(column_counts.actual_count, 0),
      'missing_columns', columns.missing_count,
      'critical_missing_columns', columns.critical_missing_count,
      'type_mismatches', columns.type_mismatch_count,
      'nullability_mismatches', columns.nullability_mismatch_count,
      'missing_defaults', columns.missing_default_count,
      'missing_semantic_signals', coalesce(signals.missing_signals, '[]'::jsonb),
      'columns', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', actual.column_name,
          'type', actual.data_type,
          'not_null', actual.not_null,
          'default', actual.default_expression
        ) order by actual.column_name)
        from actual_columns as actual
        where actual.table_name = relation.table_name
      ), '[]'::jsonb),
      'primary_keys', coalesce(constraints.primary_key_count, 0),
      'foreign_keys', coalesce(constraints.foreign_key_count, 0),
      'unique_constraints', coalesce(constraints.unique_count, 0),
      'check_constraints', coalesce(constraints.check_count, 0),
      'constraints', coalesce(constraints.constraints, '[]'::jsonb),
      'indexes', coalesce(indexes.indexes, '[]'::jsonb),
      'triggers', coalesce(triggers.triggers, '[]'::jsonb),
      'policies', coalesce(policies.policies, '[]'::jsonb),
      'table_grants', coalesce(table_grants.grants, '[]'::jsonb),
      'column_grants', coalesce(column_grants.grants, '[]'::jsonb)
    ) as details
  from relations as relation
  left join column_contract as columns on columns.table_name = relation.table_name
  left join actual_column_counts as column_counts on column_counts.table_name = relation.table_name
  left join constraint_metadata as constraints on constraints.table_name = relation.table_name
  left join index_metadata as indexes on indexes.table_name = relation.table_name
  left join trigger_metadata as triggers on triggers.table_name = relation.table_name
  left join policy_metadata as policies on policies.table_name = relation.table_name
  left join table_grant_metadata as table_grants on table_grants.table_name = relation.table_name
  left join column_grant_metadata as column_grants on column_grants.table_name = relation.table_name
  left join table_signal_analysis as signals on signals.table_name = relation.table_name
),
relevant_functions as (
  select
    function_record.oid as function_oid,
    function_record.proname::text as function_name,
    pg_catalog.pg_get_function_identity_arguments(function_record.oid)::text as identity_arguments,
    pg_catalog.pg_get_function_result(function_record.oid)::text as return_type,
    language_record.lanname::text as language_name,
    function_record.prosecdef as security_definer,
    function_record.provolatile::text as volatility,
    pg_catalog.pg_get_userbyid(function_record.proowner)::text as owner_name,
    coalesce(function_record.proconfig, array[]::text[]) as configuration,
    lower(pg_catalog.pg_get_functiondef(function_record.oid)::text) as function_definition,
    exists (
      select 1
      from aclexplode(coalesce(
        function_record.proacl,
        acldefault('f', function_record.proowner)
      )) as privilege
      where privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    ) as public_execute,
    exists (
      select 1
      from aclexplode(coalesce(
        function_record.proacl,
        acldefault('f', function_record.proowner)
      )) as privilege
      where privilege.grantee = to_regrole('anon')::oid
        and privilege.privilege_type = 'EXECUTE'
    ) as anon_execute,
    exists (
      select 1
      from aclexplode(coalesce(
        function_record.proacl,
        acldefault('f', function_record.proowner)
      )) as privilege
      where privilege.grantee = to_regrole('authenticated')::oid
        and privilege.privilege_type = 'EXECUTE'
    ) as authenticated_execute,
    exists (
      select 1
      from aclexplode(coalesce(
        function_record.proacl,
        acldefault('f', function_record.proowner)
      )) as privilege
      where privilege.grantee = to_regrole('service_role')::oid
        and privilege.privilege_type = 'EXECUTE'
    ) as service_role_execute
  from pg_catalog.pg_proc as function_record
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = function_record.pronamespace
  join pg_catalog.pg_language as language_record
    on language_record.oid = function_record.prolang
  where namespace.nspname = 'public'
    and function_record.prokind = 'f'
    and (
      function_record.proname ~* '(reward|chest|wallet|currency|streak|mission)'
      or pg_catalog.pg_get_functiondef(function_record.oid)::text
        ~* '(user_wallets|currency_transactions|user_inventory|user_chests|reward_transactions|user_boosts|user_streaks|loot_table_entries|daily_missions)'
      or function_record.oid in (
        select trigger_record.tgfoid
        from pg_catalog.pg_trigger as trigger_record
        join pg_catalog.pg_class as trigger_relation
          on trigger_relation.oid = trigger_record.tgrelid
        join pg_catalog.pg_namespace as trigger_namespace
          on trigger_namespace.oid = trigger_relation.relnamespace
        where trigger_namespace.nspname = 'public'
          and trigger_relation.relname in (
            select table_name from expected_tables
          )
          and not trigger_record.tgisinternal
      )
    )
),
function_signals as (
  select
    function_record.*,
    exists (
      select 1
      from unnest(function_record.configuration) as setting(value)
      where setting.value in ('search_path=', 'search_path=""')
    )
      as has_explicit_search_path,
    position('auth.uid()' in function_record.function_definition) > 0 as uses_auth_uid,
    position('user_id = v_user_id' in function_record.function_definition) > 0
      or position('user_id = auth.uid()' in function_record.function_definition) > 0
      or position('auth.uid() = user_id' in function_record.function_definition) > 0
      as checks_ownership,
    position('for update' in function_record.function_definition) > 0 as uses_row_lock,
    position('reward_transactions' in function_record.function_definition) > 0
      as writes_reward_transaction,
    position('user_wallets' in function_record.function_definition) > 0 as updates_wallet,
    position('total_xp' in function_record.function_definition) > 0 as updates_energy,
    position('idempotency' in function_record.function_definition) > 0
      or position('status = ''opened''' in function_record.function_definition) > 0
      as has_idempotency_signal,
    position('opened chest has no persisted reward' in function_record.function_definition) > 0
      or (
        position('status = ''opened''' in function_record.function_definition) > 0
        and position('reward_transactions' in function_record.function_definition) > 0
      ) as has_replay_signal,
    position('america/sao_paulo' in function_record.function_definition) > 0
      as uses_brazil_timezone,
    position('profiles' in function_record.function_definition) > 0
      and position('streak' in function_record.function_definition) > 0
      as syncs_legacy_streak
  from relevant_functions as function_record
),
function_inventory as (
  select
    count(*) filter (
      where signal.security_definer
        and (signal.public_execute or signal.anon_execute)
    )::integer as unsafe_definer_count,
    count(*) filter (
      where not signal.security_definer
        and (signal.public_execute or signal.anon_execute)
    )::integer as exposed_invoker_count,
    4 - count(distinct signal.function_name) filter (
      where signal.function_name in (
        'prevent_user_chest_reversion',
        'open_user_chest',
        'record_user_streak_activity',
        'get_my_streak'
      )
    )::integer as missing_expected_count,
    coalesce(jsonb_agg(jsonb_build_object(
    'name', signal.function_name,
    'arguments', signal.identity_arguments,
    'return_type', signal.return_type,
    'language', signal.language_name,
    'security_definer', signal.security_definer,
    'owner', signal.owner_name,
    'volatility', signal.volatility,
    'configuration', signal.configuration,
    'public_execute', signal.public_execute,
    'anon_execute', signal.anon_execute,
    'authenticated_execute', signal.authenticated_execute,
    'service_role_execute', signal.service_role_execute,
    'compatible', case
      when signal.function_name = 'open_user_chest' then
        signal.security_definer
        and signal.has_explicit_search_path
        and signal.uses_auth_uid
        and signal.checks_ownership
        and signal.uses_row_lock
        and signal.writes_reward_transaction
        and not signal.public_execute
        and not signal.anon_execute
      when signal.function_name = 'record_user_streak_activity' then
        signal.security_definer
        and signal.has_explicit_search_path
        and signal.uses_row_lock
        and signal.uses_brazil_timezone
        and not signal.public_execute
        and not signal.anon_execute
        and not signal.authenticated_execute
      when signal.function_name = 'get_my_streak' then
        not signal.security_definer
        and signal.has_explicit_search_path
        and not signal.public_execute
        and not signal.anon_execute
        and signal.authenticated_execute
      when signal.function_name = 'prevent_user_chest_reversion' then
        signal.has_explicit_search_path
        and not signal.public_execute
        and not signal.anon_execute
        and not signal.authenticated_execute
      else
        (not signal.security_definer or signal.has_explicit_search_path)
        and not signal.public_execute
        and not signal.anon_execute
    end,
    'missing_semantic_signals', array_remove(array[
      case when signal.function_name = 'open_user_chest' and not signal.uses_auth_uid
        then 'auth_uid' end,
      case when signal.function_name = 'open_user_chest' and not signal.checks_ownership
        then 'ownership_check' end,
      case when signal.function_name = 'open_user_chest' and not signal.uses_row_lock
        then 'row_lock' end,
      case when signal.function_name = 'open_user_chest' and not signal.writes_reward_transaction
        then 'reward_transaction' end,
      case when signal.function_name = 'open_user_chest' and not signal.updates_wallet
        then 'wallet_update' end,
      case when signal.function_name = 'open_user_chest' and not signal.updates_energy
        then 'energy_update' end,
      case when signal.function_name = 'open_user_chest' and not signal.has_replay_signal
        then 'persisted_replay' end,
      case when signal.function_name = 'record_user_streak_activity' and not signal.uses_row_lock
        then 'row_lock' end,
      case when signal.function_name = 'record_user_streak_activity' and not signal.uses_brazil_timezone
        then 'brazil_timezone' end,
      case when signal.function_name = 'record_user_streak_activity' and not signal.syncs_legacy_streak
        then 'profiles_streak_sync' end
    ]::text[], null),
    'unexpected_semantic_signals', array_remove(array[
      case when signal.public_execute then 'public_execute' end,
      case when signal.anon_execute then 'anon_execute' end,
      case when signal.function_name in (
        'record_user_streak_activity',
        'prevent_user_chest_reversion'
      ) and signal.authenticated_execute then 'authenticated_execute' end
    ]::text[], null)
  ) order by signal.function_name, signal.identity_arguments), '[]'::jsonb) as functions
  from function_signals as signal
),
open_chest_analysis as (
  select
    case
      when signal.function_oid is null then 'UNSAFE'
      when not signal.security_definer
        or not signal.has_explicit_search_path
        or signal.public_execute
        or signal.anon_execute
        or not signal.authenticated_execute
        or not signal.uses_auth_uid
        or not signal.checks_ownership
        or not signal.uses_row_lock
        or not signal.writes_reward_transaction
      then 'UNSAFE'
      when signal.updates_wallet
        and signal.updates_energy
        and signal.has_replay_signal
        and signal.has_idempotency_signal
      then 'EXACT_MATCH'
      when signal.has_replay_signal and signal.has_idempotency_signal
      then 'SAFE_COMPATIBLE'
      else 'OUTDATED'
    end as classification,
    jsonb_build_object(
      'signature', coalesce(signal.identity_arguments, 'missing'),
      'returns', signal.return_type,
      'security_definer', coalesce(signal.security_definer, false),
      'safe_search_path', coalesce(signal.has_explicit_search_path, false),
      'auth_uid', coalesce(signal.uses_auth_uid, false),
      'ownership_check', coalesce(signal.checks_ownership, false),
      'row_lock', coalesce(signal.uses_row_lock, false),
      'double_open_guard', coalesce(signal.has_idempotency_signal, false),
      'persisted_replay', coalesce(signal.has_replay_signal, false),
      'wallet_update', coalesce(signal.updates_wallet, false),
      'energy_update', coalesce(signal.updates_energy, false),
      'reward_transaction', coalesce(signal.writes_reward_transaction, false),
      'public_execute', coalesce(signal.public_execute, false),
      'anon_execute', coalesce(signal.anon_execute, false),
      'authenticated_execute', coalesce(signal.authenticated_execute, false)
    ) as details
  from (select 1) as anchor
  left join function_signals as signal
    on signal.function_name = 'open_user_chest'
    and signal.identity_arguments = 'p_chest_id uuid'
),
role_matrix(role_name) as (
  values ('PUBLIC'::text), ('anon'::text), ('authenticated'::text), ('service_role'::text)
),
profile_acl as (
  select
    role_record.role_name,
    target.column_name,
    case when role_record.role_name = 'PUBLIC' then exists (
      select 1 from aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) as acl
      where acl.grantee = 0 and acl.privilege_type = 'INSERT'
    ) else pg_catalog.has_table_privilege(
      role_record.role_name,
      relation.oid,
      'INSERT'
    ) end as table_insert,
    case when role_record.role_name = 'PUBLIC' then exists (
      select 1 from aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) as acl
      where acl.grantee = 0 and acl.privilege_type = 'UPDATE'
    ) else pg_catalog.has_table_privilege(
      role_record.role_name,
      relation.oid,
      'UPDATE'
    ) end as table_update,
    exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      cross join lateral aclexplode(coalesce(attribute.attacl, '{}'::aclitem[])) as acl
      where attribute.attrelid = relation.oid
        and attribute.attname = target.column_name
        and acl.grantee = case
          when role_record.role_name = 'PUBLIC' then 0
          else to_regrole(role_record.role_name)::oid
        end
        and acl.privilege_type = 'INSERT'
    ) as column_insert,
    exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      cross join lateral aclexplode(coalesce(attribute.attacl, '{}'::aclitem[])) as acl
      where attribute.attrelid = relation.oid
        and attribute.attname = target.column_name
        and acl.grantee = case
          when role_record.role_name = 'PUBLIC' then 0
          else to_regrole(role_record.role_name)::oid
        end
        and acl.privilege_type = 'UPDATE'
    ) as column_update,
    case when role_record.role_name = 'PUBLIC' then
      exists (
        select 1 from aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) as acl
        where acl.grantee = 0 and acl.privilege_type = 'UPDATE'
      )
      or exists (
        select 1
        from pg_catalog.pg_attribute as attribute
        cross join lateral aclexplode(coalesce(attribute.attacl, '{}'::aclitem[])) as acl
        where attribute.attrelid = relation.oid
          and attribute.attname = target.column_name
          and acl.grantee = 0
          and acl.privilege_type = 'UPDATE'
      )
    else pg_catalog.has_column_privilege(
      role_record.role_name,
      relation.oid,
      attribute_record.attnum,
      'UPDATE'
    ) end as effective_column_update_privilege,
    exists (
      select 1
      from pg_catalog.pg_policy as policy_record
      where policy_record.polrelid = relation.oid
        and policy_record.polcmd::text in ('*', 'w')
        and (
          0 = any(policy_record.polroles)
          or (
            role_record.role_name <> 'PUBLIC'
            and to_regrole(role_record.role_name)::oid = any(policy_record.polroles)
          )
        )
    ) as rls_update_policy_present,
    exists (
      select 1
      from pg_catalog.pg_policy as policy_record
      where policy_record.polrelid = relation.oid
        and policy_record.polcmd::text in ('*', 'w')
        and (
          0 = any(policy_record.polroles)
          or (
            role_record.role_name <> 'PUBLIC'
            and to_regrole(role_record.role_name)::oid = any(policy_record.polroles)
          )
        )
        and (
          lower(coalesce(pg_catalog.pg_get_expr(
            policy_record.polqual,
            policy_record.polrelid
          )::text, '')) like '%auth.uid()%'
          or lower(coalesce(pg_catalog.pg_get_expr(
            policy_record.polwithcheck,
            policy_record.polrelid
          )::text, '')) like '%auth.uid()%'
        )
    ) as rls_update_policy_uses_auth_uid,
    coalesce(role_catalog.rolbypassrls, false) as bypasses_rls
  from role_matrix as role_record
  cross join (values ('total_xp'::text), ('streak'::text)) as target(column_name)
  join pg_catalog.pg_namespace as namespace on namespace.nspname = 'public'
  join pg_catalog.pg_class as relation
    on relation.relnamespace = namespace.oid and relation.relname = 'profiles'
  join pg_catalog.pg_attribute as attribute_record
    on attribute_record.attrelid = relation.oid
    and attribute_record.attname = target.column_name
    and not attribute_record.attisdropped
  left join pg_catalog.pg_roles as role_catalog
    on role_catalog.rolname = role_record.role_name
),
profile_acl_analysis as (
  select
    column_name,
    jsonb_agg(jsonb_build_object(
      'role', role_name,
      'table_insert', table_insert,
      'table_update', table_update,
      'column_insert', column_insert,
      'column_update', column_update,
      'effective_column_update_privilege', effective_column_update_privilege,
      'rls_update_policy_present', rls_update_policy_present,
      'rls_update_policy_uses_auth_uid', rls_update_policy_uses_auth_uid,
      'bypasses_rls', bypasses_rls,
      'effective_client_write_path',
        effective_column_update_privilege
        and (bypasses_rls or rls_update_policy_present)
    ) order by case role_name
      when 'PUBLIC' then 1 when 'anon' then 2
      when 'authenticated' then 3 else 4 end
    ) as roles,
    bool_or(
      role_name in ('PUBLIC', 'anon', 'authenticated')
      and effective_column_update_privilege
      and (bypasses_rls or rls_update_policy_present)
    ) as client_write_effective
  from profile_acl
  group by column_name
),
aggregate_data as (
  select
    (select count(*)::bigint from public.user_wallets) as wallet_rows,
    (select count(*)::bigint from public.user_wallets where crystals < 0) as negative_wallet_rows,
    (select count(*)::bigint from public.currency_transactions) as ledger_rows,
    (select count(*)::bigint from public.user_wallets as wallet
      where wallet.crystals <> coalesce((
        select sum(transaction_record.amount)
        from public.currency_transactions as transaction_record
        where transaction_record.user_id = wallet.user_id
          and transaction_record.currency = 'crystals'
      ), 0)
    ) as wallet_ledger_mismatch_rows,
    (select count(*)::bigint from public.reward_transactions) as reward_transaction_rows,
    (select count(*) filter (where reward_type = 'energy')::bigint
      from public.reward_transactions) as energy_reward_rows,
    (select count(*) filter (where reward_type = 'crystals')::bigint
      from public.reward_transactions) as crystal_reward_rows,
    (select count(*) filter (where reward_type = 'chest')::bigint
      from public.reward_transactions) as chest_reward_rows,
    (select count(*)::bigint from public.chest_definitions) as chest_definition_rows,
    (select count(*)::bigint from public.loot_tables) as loot_table_rows,
    (select count(*)::bigint from public.loot_table_entries) as loot_entry_rows,
    (select count(*)::bigint from public.user_chests) as user_chest_rows,
    (select count(*)::bigint from public.user_chests
      where (status = 'granted' and opened_at is not null)
        or (status = 'opened' and opened_at is null)
        or status not in ('granted', 'opened')
    ) as invalid_user_chest_rows,
    (select count(*)::bigint from public.loot_table_entries
      where min_quantity <= 0
        or max_quantity < min_quantity
        or relative_weight <= 0
        or (reward_type = 'item' and item_id is null)
        or (reward_type <> 'item' and item_id is not null)
    ) as invalid_loot_entry_rows,
    (select count(*)::bigint from public.user_streaks) as streak_rows,
    (select count(*)::bigint from public.user_streaks
      where current_streak < 0 or longest_streak < 0
    ) as negative_streak_rows,
    (select count(*)::bigint
      from public.user_streaks as dedicated
      join public.profiles as profile on profile.user_id = dedicated.user_id
      where dedicated.current_streak is distinct from profile.streak
    ) as profile_streak_mismatch_rows,
    (select count(*)::bigint from (
      select 1
      from public.daily_missions as mission
      where mission.category in ('workout', 'nutrition', 'protein')
      group by mission.user_id, mission.for_date, mission.category
      having count(*) > 1
    ) as duplicates) as duplicate_mission_groups
),
balance_after_analysis as (
  select
    column_exists,
    case
      when result_document is null then null
      else ((xpath(
        '/table/row/negative_count/text()',
        result_document
      ))[1]::text)::bigint
    end as negative_count
  from (
    select
      column_exists,
      case when column_exists then pg_catalog.query_to_xml(
        'select count(*)::text as negative_count from public.currency_transactions where balance_after < 0',
        false,
        true,
        ''
      ) else null end as result_document
    from (
      select exists (
        select 1
        from actual_columns
        where table_name = 'currency_transactions'
          and column_name = 'balance_after'
      ) as column_exists
    ) as probe
  ) as executed
),
mission_index_analysis as (
  select
    case
      when index_relation.oid is null then 'INCOMPATIBLE'
      when index_record.indisunique
        and index_record.indisvalid
        and lower(pg_catalog.pg_get_indexdef(index_relation.oid)::text)
          like '%(user_id, for_date, category)%'
        and lower(pg_catalog.pg_get_expr(
          index_record.indpred,
          index_record.indrelid
        )::text) like '%workout%'
        and lower(pg_catalog.pg_get_expr(
          index_record.indpred,
          index_record.indrelid
        )::text) like '%nutrition%'
        and lower(pg_catalog.pg_get_expr(
          index_record.indpred,
          index_record.indrelid
        )::text) like '%protein%'
      then 'EXACT_MATCH'
      when index_record.indisunique and index_record.indisvalid
      then 'SAFE_COMPATIBLE'
      else 'DIFFERENT'
    end as classification,
    jsonb_build_object(
      'exists', index_relation.oid is not null,
      'unique', coalesce(index_record.indisunique, false),
      'valid', coalesce(index_record.indisvalid, false),
      'definition', pg_catalog.pg_get_indexdef(index_relation.oid)::text
    ) as details
  from (select 1) as anchor
  left join pg_catalog.pg_class as index_relation
    on index_relation.oid = to_regclass('public.daily_missions_current_category_unique')
  left join pg_catalog.pg_index as index_record
    on index_record.indexrelid = index_relation.oid
),
ledger_probe as (
  select
    to_regclass('supabase_migrations.schema_migrations') is not null as exists,
    case
      when to_regclass('supabase_migrations.schema_migrations') is null then false
      else pg_catalog.has_table_privilege(
        current_user,
        to_regclass('supabase_migrations.schema_migrations'),
        'SELECT'
      )
    end as readable
),
ledger_document as (
  select
    probe.exists,
    probe.readable,
    case when probe.exists and probe.readable then pg_catalog.query_to_xml(
      'select version::text as version from supabase_migrations.schema_migrations where version::text in (''20260907000100'',''20260907000200'',''20260909000200'',''20260911000100'') order by version::text',
      false,
      true,
      ''
    ) else null end as ledger_xml
  from ledger_probe as probe
),
ledger_analysis as (
  select
    exists,
    readable,
    case when ledger_xml is null then null else
      position('20260907000100' in xmlserialize(document ledger_xml as text)) > 0
    end as reward_foundation_recorded,
    case when ledger_xml is null then null else
      position('20260907000200' in xmlserialize(document ledger_xml as text)) > 0
    end as chest_engine_recorded,
    case when ledger_xml is null then null else
      position('20260909000200' in xmlserialize(document ledger_xml as text)) > 0
    end as streak_recorded,
    case when ledger_xml is null then null else
      position('20260911000100' in xmlserialize(document ledger_xml as text)) > 0
    end as mission_integrity_recorded
  from ledger_document
),
migration_recommendations as (
  select 'supabase/planning/gamification/20261003000100_reward_system_foundation.sql'::text as migration,
    case
      when count(*) filter (where classification in ('MISSING', 'INCOMPATIBLE')) > 0
        then 'DO_NOT_APPLY_AS_WRITTEN'
      when count(*) filter (where classification = 'COMPATIBLE_BUT_DIFFERENT') > 0
        then 'NEEDS_FORWARD_PATCH'
      when count(*) filter (where classification = 'COMPATIBLE_SUPERSET') > 0
        then 'PARTIALLY_SATISFIED'
      else 'ALREADY_SATISFIED'
    end as recommendation
  from table_analysis
  where table_name <> 'user_streaks'
  union all
  select 'supabase/planning/gamification/20261003000200_chest_engine.sql',
    case
      when classification = 'UNSAFE' then 'DO_NOT_APPLY_AS_WRITTEN'
      when classification = 'EXACT_MATCH'
        and to_regprocedure(
          'public.' || 'grant_user_chest(uuid,text,text,text,text)'
        ) is not null
        and to_regprocedure(
          'public.' || 'sync_user_mission_rewards(uuid,date)'
        ) is not null
      then 'ALREADY_SATISFIED'
      when classification in ('EXACT_MATCH', 'SAFE_COMPATIBLE')
      then 'PARTIALLY_SATISFIED'
      else 'NEEDS_FORWARD_PATCH'
    end
  from open_chest_analysis
  union all
  select 'supabase/planning/gamification/20261003000300_user_streaks.sql',
    case
      when table_record.classification in ('MISSING', 'INCOMPATIBLE')
        then 'DO_NOT_APPLY_AS_WRITTEN'
      when recorder.syncs_legacy_streak
        and recorder.uses_brazil_timezone
        and recorder.uses_row_lock
      then 'ALREADY_SATISFIED'
      else 'NEEDS_FORWARD_PATCH'
    end
  from table_analysis as table_record
  left join function_signals as recorder
    on recorder.function_name = 'record_user_streak_activity'
    and recorder.identity_arguments = 'p_user_id uuid'
  where table_record.table_name = 'user_streaks'
  union all
  select 'supabase/planning/gamification/20261003000400_current_mission_integrity.sql',
    case
      when mission.classification = 'INCOMPATIBLE' then 'DO_NOT_APPLY_AS_WRITTEN'
      when mission.classification = 'EXACT_MATCH'
        and to_regprocedure(
          'public.' ||
          'upsert_current_daily_mission(uuid,date,text,text,text,integer,integer,integer)'
        ) is not null
      then 'ALREADY_SATISFIED'
      when mission.classification in ('EXACT_MATCH', 'SAFE_COMPATIBLE')
      then 'PARTIALLY_SATISFIED'
      else 'NEEDS_FORWARD_PATCH'
    end
  from mission_index_analysis as mission
),
checks(check_name, status, details) as (
  select
    'table_contracts'::text,
    case
      when count(*) filter (where classification in ('MISSING', 'INCOMPATIBLE')) > 0
        then 'FAIL'
      when count(*) filter (where classification <> 'EXACT_MATCH') > 0
        then 'WARN'
      else 'PASS'
    end,
    jsonb_build_object(
      'tables', jsonb_agg(jsonb_build_object(
        'table', table_name,
        'classification', classification,
        'details', details
      ) order by table_name)
    )
  from table_analysis
  union all
  select
    'function_inventory',
    case
      when unsafe_definer_count > 0 or missing_expected_count > 0 then 'FAIL'
      when exposed_invoker_count > 0 then 'WARN'
      else 'PASS'
    end,
    jsonb_build_object(
      'unsafe_security_definer_count', unsafe_definer_count,
      'public_or_anon_invoker_count', exposed_invoker_count,
      'missing_expected_count', missing_expected_count,
      'functions', functions
    )
  from function_inventory
  union all
  select
    'open_user_chest',
    case
      when classification = 'UNSAFE' then 'FAIL'
      when classification in ('OUTDATED', 'SAFE_COMPATIBLE') then 'WARN'
      else 'PASS'
    end,
    jsonb_build_object('classification', classification, 'details', details)
  from open_chest_analysis
  union all
  select
    'streak_state',
    case
      when data.negative_streak_rows > 0 then 'FAIL'
      when data.profile_streak_mismatch_rows > 0
        or table_record.classification <> 'EXACT_MATCH'
        or not coalesce(recorder.syncs_legacy_streak, false)
      then 'WARN'
      else 'PASS'
    end,
    jsonb_build_object(
      'table_classification', table_record.classification,
      'rows', data.streak_rows,
      'negative_rows', data.negative_streak_rows,
      'profiles_streak_mismatch_rows', data.profile_streak_mismatch_rows,
      'recorder_uses_brazil_timezone', coalesce(recorder.uses_brazil_timezone, false),
      'recorder_uses_row_lock', coalesce(recorder.uses_row_lock, false),
      'recorder_syncs_profiles_streak', coalesce(recorder.syncs_legacy_streak, false)
    )
  from aggregate_data as data
  join table_analysis as table_record on table_record.table_name = 'user_streaks'
  left join function_signals as recorder
    on recorder.function_name = 'record_user_streak_activity'
    and recorder.identity_arguments = 'p_user_id uuid'
  union all
  select
    'wallet_and_ledger',
    case
      when data.negative_wallet_rows > 0
        or coalesce(balance_after.negative_count, 0) > 0
      then 'FAIL'
      when wallet.classification <> 'EXACT_MATCH'
        or ledger.classification <> 'EXACT_MATCH'
        or data.wallet_ledger_mismatch_rows > 0
      then 'WARN'
      else 'PASS'
    end,
    jsonb_build_object(
      'wallet_classification', wallet.classification,
      'ledger_classification', ledger.classification,
      'wallet_rows', data.wallet_rows,
      'negative_wallet_rows', data.negative_wallet_rows,
      'ledger_rows', data.ledger_rows,
      'balance_after_available', balance_after.column_exists,
      'negative_balance_after_rows', balance_after.negative_count,
      'wallet_ledger_basic_mismatch_rows', data.wallet_ledger_mismatch_rows
    )
  from aggregate_data as data
  cross join balance_after_analysis as balance_after
  join table_analysis as wallet on wallet.table_name = 'user_wallets'
  join table_analysis as ledger on ledger.table_name = 'currency_transactions'
  union all
  select
    'reward_transactions',
    case when table_record.classification = 'INCOMPATIBLE' then 'FAIL'
      when table_record.classification <> 'EXACT_MATCH' then 'WARN'
      else 'PASS' end,
    jsonb_build_object(
      'classification', table_record.classification,
      'rows', data.reward_transaction_rows,
      'energy_rows', data.energy_reward_rows,
      'crystal_rows', data.crystal_reward_rows,
      'chest_rows', data.chest_reward_rows,
      'source_reward_unique_index_exists',
        to_regclass('public.reward_transactions_source_reward_unique') is not null
    )
  from aggregate_data as data
  join table_analysis as table_record
    on table_record.table_name = 'reward_transactions'
  union all
  select
    'chests_and_loot',
    case
      when data.invalid_user_chest_rows > 0 or data.invalid_loot_entry_rows > 0
        then 'FAIL'
      when bool_or(table_record.classification <> 'EXACT_MATCH') then 'WARN'
      else 'PASS'
    end,
    jsonb_build_object(
      'definitions', data.chest_definition_rows,
      'loot_tables', data.loot_table_rows,
      'loot_entries', data.loot_entry_rows,
      'user_chests', data.user_chest_rows,
      'invalid_user_chests', data.invalid_user_chest_rows,
      'invalid_loot_entries', data.invalid_loot_entry_rows,
      'prevention_trigger_exists', exists (
        select 1 from trigger_metadata
        where table_name = 'user_chests'
          and searchable_definition like '%prevent_user_chest_reversion%'
      )
    )
  from aggregate_data as data
  join table_analysis as table_record
    on table_record.table_name in (
      'chest_definitions', 'loot_tables', 'loot_table_entries', 'user_chests'
    )
  group by
    data.chest_definition_rows,
    data.loot_table_rows,
    data.loot_entry_rows,
    data.user_chest_rows,
    data.invalid_user_chest_rows,
    data.invalid_loot_entry_rows
  union all
  select
    'mission_integrity',
    case
      when data.duplicate_mission_groups > 0
        or mission.classification = 'INCOMPATIBLE'
      then 'FAIL'
      when mission.classification <> 'EXACT_MATCH' then 'WARN'
      else 'PASS'
    end,
    jsonb_build_object(
      'classification', mission.classification,
      'duplicate_current_mission_groups', data.duplicate_mission_groups,
      'details', mission.details
    )
  from aggregate_data as data
  cross join mission_index_analysis as mission
  union all
  select
    'profiles_total_xp_acl',
    case when client_write_effective then 'FAIL' else 'PASS' end,
    jsonb_build_object(
      'roles', roles,
      'effective_client_write_path', client_write_effective
    )
  from profile_acl_analysis
  where column_name = 'total_xp'
  union all
  select
    'profiles_streak_acl',
    case when client_write_effective then 'WARN' else 'PASS' end,
    jsonb_build_object(
      'roles', roles,
      'effective_client_write_path', client_write_effective
    )
  from profile_acl_analysis
  where column_name = 'streak'
  union all
  select
    'migration_ledger',
    case when not exists or not readable then 'WARN' else 'PASS' end,
    jsonb_build_object(
      'exists', exists,
      'readable', readable,
      'known_versions', jsonb_build_object(
        '20260907000100', reward_foundation_recorded,
        '20260907000200', chest_engine_recorded,
        '20260909000200', streak_recorded,
        '20260911000100', mission_integrity_recorded
      )
    )
  from ledger_analysis
  union all
  select
    'forward_migration_recommendations',
    case
      when count(*) filter (where recommendation = 'DO_NOT_APPLY_AS_WRITTEN') > 0
        then 'FAIL'
      when count(*) filter (where recommendation <> 'ALREADY_SATISFIED') > 0
        then 'WARN'
      else 'PASS'
    end,
    jsonb_build_object(
      'migrations', jsonb_agg(jsonb_build_object(
        'migration', migration,
        'recommendation', recommendation
      ) order by migration)
    )
  from migration_recommendations
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
