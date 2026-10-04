-- Manual 00500 smoke audit. Read-only, one statement, one result set.
-- Run only in a disposable/test database after applying 00500.
with expected_functions(signature, function_name) as (
  values
    ('public.toggle_mission_with_xp(uuid,boolean)'::text, 'legacy'::text),
    ('public.complete_mission_with_energy(uuid)'::text, 'successor'::text)
),
function_metadata as (
  select
    expected.signature,
    expected.function_name,
    function_record.oid,
    function_record.prosecdef as security_definer,
    pg_catalog.pg_get_userbyid(function_record.proowner)::text as owner_name,
    coalesce(function_record.proconfig, array[]::text[]) as configuration,
    lower(coalesce(pg_catalog.pg_get_functiondef(function_record.oid)::text, ''))
      as definition
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
  left join pg_catalog.pg_proc as function_record on function_record.oid = metadata.oid
  left join lateral aclexplode(
    coalesce(function_record.proacl, acldefault('f', function_record.proowner))
  ) as expanded on function_record.oid is not null
  group by metadata.signature
),
checks(check_name, status, details) as (
  select
    'required_signatures'::text,
    case when count(*) filter (where oid is null) = 0 then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'functions', jsonb_agg(jsonb_build_object(
        'signature', signature,
        'exists', oid is not null
      ) order by signature)
    )
  from function_metadata
  union all
  select
    'legacy_acl_containment',
    case
      when metadata.oid is null
        or acl.public_execute
        or acl.anon_execute
        or not acl.authenticated_execute
      then 'FAIL' else 'PASS'
    end,
    jsonb_build_object(
      'public_execute', acl.public_execute,
      'anon_execute', acl.anon_execute,
      'authenticated_execute', acl.authenticated_execute,
      'authenticated_retained_temporarily', true
    )
  from function_metadata as metadata
  join function_acl as acl using (signature)
  where metadata.function_name = 'legacy'
  union all
  select
    'successor_acl_and_definer',
    case
      when metadata.oid is null
        or not metadata.security_definer
        or metadata.owner_name in ('anon', 'authenticated', 'service_role')
        or acl.public_execute
        or acl.anon_execute
        or not acl.authenticated_execute
        or not acl.service_execute
        or array_to_string(metadata.configuration, ',') not like '%search_path=%'
      then 'FAIL' else 'PASS'
    end,
    jsonb_build_object(
      'security_definer', metadata.security_definer,
      'trusted_owner', metadata.owner_name not in ('anon', 'authenticated', 'service_role'),
      'configuration', metadata.configuration,
      'public_execute', acl.public_execute,
      'anon_execute', acl.anon_execute,
      'authenticated_execute', acl.authenticated_execute,
      'service_execute', acl.service_execute
    )
  from function_metadata as metadata
  join function_acl as acl using (signature)
  where metadata.function_name = 'successor'
  union all
  select
    'successor_semantics',
    case
      when metadata.oid is null
        or metadata.definition not like '%auth.uid%'
        or metadata.definition not like '%mission.user_id = v_user_id%'
        or metadata.definition not like '%for update%'
        or metadata.definition not like '%mission.completed = false%'
        or metadata.definition not like '%idempotency_key%'
        or metadata.definition not like '%record_user_streak_activity%'
      then 'FAIL' else 'PASS'
    end,
    jsonb_build_object(
      'auth_bound', metadata.definition like '%auth.uid%',
      'ownership_bound', metadata.definition like '%mission.user_id = v_user_id%',
      'row_lock', metadata.definition like '%for update%',
      'completion_only', metadata.definition like '%mission.completed = false%',
      'idempotency_record', metadata.definition like '%idempotency_key%',
      'streak_in_same_transaction',
        metadata.definition like '%record_user_streak_activity%'
    )
  from function_metadata as metadata
  where metadata.function_name = 'successor'
),
summary as (
  select
    case when count(*) filter (where status = 'FAIL') > 0 then 'FAIL' else 'PASS' end
      as overall_status,
    count(*) filter (where status = 'PASS')::integer as pass_count,
    count(*) filter (where status = 'FAIL')::integer as fail_count,
    jsonb_agg(jsonb_build_object(
      'check', check_name,
      'status', status,
      'details', details
    ) order by check_name) as checks
  from checks
)
select overall_status, pass_count, fail_count, checks
from summary;
