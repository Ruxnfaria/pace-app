-- READ-ONLY 00700 preflight/postcondition audit. DO NOT APPLY AS A MIGRATION.
-- Safe for manual disposable SQL Editor use. One statement, one result set.
-- It inspects catalog metadata only and never invokes public.open_user_chest.
with function_metadata as (
  select
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
  from (values ('public.open_user_chest(uuid)'::text)) as expected(signature)
  left join pg_catalog.pg_proc as function_record
    on function_record.oid = to_regprocedure(expected.signature)
),
function_acl as (
  select
    coalesce(bool_or(expanded.grantee = 0) filter (
      where expanded.privilege_type = 'EXECUTE'
    ), false) as public_execute,
    coalesce(bool_or(expanded.grantee = to_regrole('anon')::oid) filter (
      where expanded.privilege_type = 'EXECUTE'
    ), false) as anon_execute,
    coalesce(bool_or(expanded.grantee = to_regrole('authenticated')::oid) filter (
      where expanded.privilege_type = 'EXECUTE'
    ), false) as authenticated_execute
  from function_metadata as metadata
  join pg_catalog.pg_proc as function_record on function_record.oid = metadata.oid
  left join lateral aclexplode(
    coalesce(function_record.proacl, acldefault('f', function_record.proowner))
  ) as expanded on true
),
expected_ledger_columns(column_name, type_oid, required_not_null) as (
  values
    ('user_id'::text, 'uuid'::regtype::oid, true),
    ('currency'::text, 'text'::regtype::oid, true),
    ('amount'::text, 'bigint'::regtype::oid, true),
    ('transaction_type'::text, 'text'::regtype::oid, true),
    ('source_type'::text, 'text'::regtype::oid, true),
    ('source_id'::text, 'text'::regtype::oid, false),
    ('idempotency_key'::text, 'text'::regtype::oid, true),
    ('metadata'::text, 'jsonb'::regtype::oid, true)
),
ledger_contract as (
  select
    to_regclass('public.currency_transactions') is not null as relation_exists,
    count(*) filter (
      where attribute.attnum is null
        or attribute.atttypid <> expected.type_oid
        or attribute.attnotnull <> expected.required_not_null
    )::integer as incompatible_column_count,
    exists (
      select 1
      from pg_catalog.pg_attribute as balance_column
      where balance_column.attrelid = to_regclass('public.currency_transactions')
        and balance_column.attname = 'balance_after'
        and balance_column.attnum > 0
        and not balance_column.attisdropped
    ) as balance_after_exists,
    jsonb_agg(jsonb_build_object(
      'column', expected.column_name,
      'present', attribute.attnum is not null,
      'type', case when attribute.attnum is not null
        then pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
        else null end,
      'not_null', coalesce(attribute.attnotnull, false)
    ) order by expected.column_name) as columns
  from expected_ledger_columns as expected
  left join pg_catalog.pg_attribute as attribute
    on attribute.attrelid = to_regclass('public.currency_transactions')
    and attribute.attname = expected.column_name
    and attribute.attnum > 0
    and not attribute.attisdropped
),
dependency_contract as (
  select
    to_regclass('public.user_wallets') is not null
      and to_regclass('public.reward_transactions') is not null
      and to_regclass('public.user_chests') is not null
      and to_regclass('public.chest_definitions') is not null
      and to_regclass('public.loot_tables') is not null
      and to_regclass('public.loot_table_entries') is not null
      and to_regclass('public.profiles') is not null as relations_exist,
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
      where index_record.indexrelid = to_regclass(
        'public.reward_transactions_source_reward_unique'
      )
        and index_record.indisunique
        and index_record.indisvalid
        and index_record.indpred is not null
    ) as semantic_reward_uniqueness
),
phase as (
  select case
    when metadata.definition_md5 = 'e0e2b37869940e51cf02e3af0ae0ec23'
      and metadata.definition like '%balance_after%'
      then 'PRE_00700'
    when metadata.definition_md5 <> 'e0e2b37869940e51cf02e3af0ae0ec23'
      and metadata.definition not like '%balance_after%'
      and metadata.definition like '%00700: currency_transactions is amount-only%'
      and metadata.description = 'PRAXE 00700 amount-only ledger; definition_md5='
        || metadata.definition_md5
      then 'POST_00700_CANDIDATE'
    else 'UNKNOWN_DRIFT'
  end as audit_phase
  from function_metadata as metadata
),
checks(check_name, status, details) as (
  select
    'recognized_phase',
    case when phase.audit_phase = 'UNKNOWN_DRIFT' then 'FAIL' else 'PASS' end,
    jsonb_build_object(
      'phase', phase.audit_phase,
      'definition_md5', metadata.definition_md5,
      'reviewed_old_md5', 'e0e2b37869940e51cf02e3af0ae0ec23'
    )
  from phase
  cross join function_metadata as metadata
  union all
  select
    'public_rpc_contract',
    case
      when metadata.all_argument_types = array[
          'uuid'::regtype::oid,
          'uuid'::regtype::oid,
          'text'::regtype::oid,
          'text'::regtype::oid,
          'text'::regtype::oid,
          'text'::regtype::oid,
          'integer'::regtype::oid,
          'uuid'::regtype::oid
        ]::oid[]
        and metadata.argument_modes = array[
          'i', 't', 't', 't', 't', 't', 't', 't'
        ]::"char"[]
        and metadata.argument_names = array[
          'p_chest_id', 'chest_id', 'chest_slug', 'chest_name', 'chest_rarity',
          'reward_type', 'amount', 'item_id'
        ]::text[]
      then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'argument_names', metadata.argument_names,
      'argument_modes', metadata.argument_modes
    )
  from function_metadata as metadata
  union all
  select
    'security_and_acl',
    case
      when metadata.security_definer
        and metadata.owner_name not in ('anon', 'authenticated', 'service_role')
        and metadata.configuration = array['search_path=""']::text[]
        and not acl.public_execute
        and not acl.anon_execute
        and acl.authenticated_execute
      then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'security_definer', metadata.security_definer,
      'owner', metadata.owner_name,
      'configuration', metadata.configuration,
      'public_execute', acl.public_execute,
      'anon_execute', acl.anon_execute,
      'authenticated_execute', acl.authenticated_execute
    )
  from function_metadata as metadata
  cross join function_acl as acl
  union all
  select
    'amount_only_ledger_schema',
    case
      when ledger.relation_exists
        and ledger.incompatible_column_count = 0
        and not ledger.balance_after_exists
      then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'relation_exists', ledger.relation_exists,
      'incompatible_columns', ledger.incompatible_column_count,
      'balance_after_exists', ledger.balance_after_exists,
      'columns', ledger.columns
    )
  from ledger_contract as ledger
  union all
  select
    'dependency_and_idempotency_contracts',
    case
      when dependency.relations_exist
        and dependency.wallet_primary_key
        and dependency.chest_primary_key
        and dependency.currency_idempotency
        and dependency.reward_idempotency
        and dependency.semantic_reward_uniqueness
      then 'PASS' else 'FAIL'
    end,
    to_jsonb(dependency)
  from dependency_contract as dependency
  union all
  select
    'behavioral_signals',
    case
      when metadata.definition like '%auth.uid%'
        and metadata.definition like '%user_chest.user_id = v_user_id%'
        and metadata.definition like '%for update of user_chest%'
        and metadata.definition like '%opened chest has no persisted reward%'
        and metadata.definition like '%insert into public.user_wallets%'
        and metadata.definition like '%insert into public.currency_transactions%'
        and metadata.definition like '%insert into public.reward_transactions%'
        and metadata.definition like '%update public.user_chests%'
        and metadata.definition like '%idempotency_key%'
      then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'auth_bound', metadata.definition like '%auth.uid%',
      'ownership_bound', metadata.definition like '%user_chest.user_id = v_user_id%',
      'row_locked', metadata.definition like '%for update of user_chest%',
      'persisted_replay', metadata.definition like '%opened chest has no persisted reward%',
      'wallet_write', metadata.definition like '%insert into public.user_wallets%',
      'currency_write', metadata.definition like '%insert into public.currency_transactions%',
      'reward_write', metadata.definition like '%insert into public.reward_transactions%',
      'opened_transition', metadata.definition like '%update public.user_chests%'
    )
  from function_metadata as metadata
  union all
  select
    'reconciliation_state',
    case
      when phase.audit_phase = 'PRE_00700'
        and metadata.definition like '%balance_after%'
      then 'PASS'
      when phase.audit_phase = 'POST_00700_CANDIDATE'
        and metadata.definition not like '%balance_after%'
        and metadata.definition like '%00700: currency_transactions is amount-only%'
      then 'PASS'
      else 'FAIL'
    end,
    jsonb_build_object(
      'phase', phase.audit_phase,
      'references_balance_after', metadata.definition like '%balance_after%',
      'amount_only_marker',
        metadata.definition like '%00700: currency_transactions is amount-only%'
    )
  from phase
  cross join function_metadata as metadata
  union all
  select
    'post_00700_fingerprint_pin',
    case
      when phase.audit_phase = 'PRE_00700' then 'PASS'
      when phase.audit_phase = 'POST_00700_CANDIDATE'
        and metadata.description = 'PRAXE 00700 amount-only ledger; definition_md5='
          || metadata.definition_md5
      then 'PASS'
      else 'FAIL'
    end,
    jsonb_build_object(
      'definition_md5', metadata.definition_md5,
      'stored_pin', metadata.description,
      'pin_matches_definition',
        metadata.description = 'PRAXE 00700 amount-only ledger; definition_md5='
          || metadata.definition_md5,
      'capture_for_review_before_production',
        phase.audit_phase = 'POST_00700_CANDIDATE'
    )
  from phase
  cross join function_metadata as metadata
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
select
  phase.audit_phase,
  metadata.definition_md5 as open_user_chest_definition_md5,
  summary.overall_status,
  summary.pass_count,
  summary.warn_count,
  summary.fail_count,
  summary.checks
from summary
cross join phase
cross join function_metadata as metadata;
