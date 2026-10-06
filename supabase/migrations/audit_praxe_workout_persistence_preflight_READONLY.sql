-- READ-ONLY PREFLIGHT AUDIT.
-- DO NOT APPLY AS A MIGRATION.
-- Run manually only after explicit approval.
--
-- One catalog-only statement and one consolidated result set. It reads no
-- application rows, invokes no business function and returns no user data.

with target_relations(relation_name) as (
  values
    ('workouts'::text),
    ('workout_logs'),
    ('training_profiles')
),
relations as (
  select
    target.relation_name,
    relation.oid,
    relation.relkind::text as relation_kind,
    relation.relrowsecurity as rls_enabled,
    relation.relforcerowsecurity as rls_forced,
    relation.relowner as owner_oid,
    pg_catalog.pg_get_userbyid(relation.relowner)::text as owner_name,
    relation.relacl
  from target_relations as target
  left join pg_catalog.pg_namespace as namespace
    on namespace.nspname = 'public'
  left join pg_catalog.pg_class as relation
    on relation.relnamespace = namespace.oid
    and relation.relname = target.relation_name
    and relation.relkind in ('r', 'p')
),
required_columns(relation_name, column_name, data_type, not_null, identity) as (
  values
    ('workouts'::text, 'id'::text, 'uuid'::text, true, false),
    ('workouts', 'user_id', 'uuid', true, false),
    ('workouts', 'title', 'text', true, false),
    ('workouts', 'exercises', 'text', true, false),
    ('workouts', 'created_at', 'timestamp with time zone', true, false),
    ('workout_logs', 'id', 'bigint', true, true),
    ('workout_logs', 'user_id', 'uuid', false, false),
    ('workout_logs', 'workout_id', 'uuid', false, false),
    ('workout_logs', 'workout_date', 'date', false, false),
    ('training_profiles', 'user_id', 'uuid', true, false),
    ('training_profiles', 'onboarding_payload_schema_version', 'smallint', false, false),
    ('training_profiles', 'training_days_per_week', 'smallint', true, false),
    ('training_profiles', 'available_weekdays', 'smallint[]', false, false),
    ('training_profiles', 'preferred_weekdays', 'smallint[]', false, false)
),
actual_columns as (
  select
    relation.relation_name,
    attribute.attname::text as column_name,
    pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)::text
      as data_type,
    attribute.attnotnull as not_null,
    (attribute.attidentity <> '') as identity
  from relations as relation
  join pg_catalog.pg_attribute as attribute
    on attribute.attrelid = relation.oid
    and attribute.attnum > 0
    and not attribute.attisdropped
),
column_mismatches as (
  select
    required.relation_name,
    required.column_name,
    required.data_type as expected_type,
    actual.data_type as actual_type,
    required.not_null as expected_not_null,
    actual.not_null as actual_not_null,
    required.identity as expected_identity,
    actual.identity as actual_identity
  from required_columns as required
  left join actual_columns as actual
    on actual.relation_name = required.relation_name
    and actual.column_name = required.column_name
  where actual.column_name is null
    or actual.data_type <> required.data_type
    or required.not_null <> actual.not_null
    or required.identity <> actual.identity
),
training_profile_constraints as (
  select
    constraint_record.conname::text as constraint_name,
    constraint_record.convalidated as validated,
    pg_catalog.regexp_replace(
      lower(pg_catalog.pg_get_constraintdef(constraint_record.oid, true)),
      '[[:space:]]+',
      ' ',
      'g'
    ) as normalized_definition
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid = pg_catalog.to_regclass(
      'public.training_profiles'
    )
    and constraint_record.contype = 'c'
),
training_profile_contract as (
  select
    exists (
      select 1
      from training_profile_constraints as constraint_record
      where constraint_record.constraint_name =
          'training_profiles_contract_check'
        and constraint_record.validated
        and constraint_record.normalized_definition like
          '%onboarding_payload_schema_version is null%'
        and constraint_record.normalized_definition like
          '%available_weekdays is not null%'
        and constraint_record.normalized_definition like
          '%preferred_weekdays is null%'
        and constraint_record.normalized_definition like
          '%onboarding_payload_schema_version = 3%'
        and constraint_record.normalized_definition like
          '%available_weekdays is null%'
        and constraint_record.normalized_definition like
          '%preferred_weekdays is not null%'
        and constraint_record.normalized_definition like
          '%training_profile_code_set_valid%preferred_weekdays%'
    ) and exists (
      select 1
      from training_profile_constraints as constraint_record
      where constraint_record.constraint_name =
          'training_profiles_weekdays_check'
        and constraint_record.validated
        and constraint_record.normalized_definition like
          '%training_profile_code_set_valid%available_weekdays%'
        and constraint_record.normalized_definition like
          '%cardinality(available_weekdays) >= training_days_per_week%'
    ) as compatible,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(constraint_record)
          order by constraint_record.constraint_name
        )
        from training_profile_constraints as constraint_record
        where constraint_record.constraint_name in (
          'training_profiles_contract_check',
          'training_profiles_weekdays_check'
        )
      ),
      '[]'::jsonb
    ) as definitions
),
constraints as (
  select
    owner_relation.relname::text as relation_name,
    constraint_record.conname::text as constraint_name,
    constraint_record.contype::text as constraint_type,
    pg_catalog.pg_get_constraintdef(constraint_record.oid, true)::text
      as definition,
    referenced_namespace.nspname::text as referenced_schema,
    referenced_relation.relname::text as referenced_relation,
    constraint_record.confdeltype::text as delete_action,
    constraint_record.convalidated as validated
  from pg_catalog.pg_constraint as constraint_record
  join pg_catalog.pg_class as owner_relation
    on owner_relation.oid = constraint_record.conrelid
  join pg_catalog.pg_namespace as owner_namespace
    on owner_namespace.oid = owner_relation.relnamespace
  left join pg_catalog.pg_class as referenced_relation
    on referenced_relation.oid = constraint_record.confrelid
  left join pg_catalog.pg_namespace as referenced_namespace
    on referenced_namespace.oid = referenced_relation.relnamespace
  where owner_namespace.nspname = 'public'
    and owner_relation.relname in (
      'workouts', 'workout_logs', 'training_profiles'
    )
),
workouts_key_contract as (
  select
    exists (
      select 1
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = pg_catalog.to_regclass(
          'public.workouts'
        )
        and constraint_record.contype = 'p'
        and (
          select array_agg(attribute.attname::text order by key.key_order)
          from unnest(constraint_record.conkey) with ordinality
            as key(attribute_number, key_order)
          join pg_catalog.pg_attribute as attribute
            on attribute.attrelid = constraint_record.conrelid
            and attribute.attnum = key.attribute_number
        ) = array['id']::text[]
    ) as id_primary_key,
    exists (
      select 1
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = pg_catalog.to_regclass(
          'public.workouts'
        )
        and constraint_record.contype = 'f'
        and constraint_record.confrelid = pg_catalog.to_regclass('auth.users')
        and constraint_record.confdeltype = 'c'
        and (
          select array_agg(attribute.attname::text order by key.key_order)
          from unnest(constraint_record.conkey) with ordinality
            as key(attribute_number, key_order)
          join pg_catalog.pg_attribute as attribute
            on attribute.attrelid = constraint_record.conrelid
            and attribute.attnum = key.attribute_number
        ) = array['user_id']::text[]
    ) as user_fk_auth_cascade
),
workout_logs_contract as (
  select
    exists (
      select 1
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = pg_catalog.to_regclass(
          'public.workout_logs'
        )
        and constraint_record.contype = 'p'
        and (
          select array_agg(attribute.attname::text order by key.key_order)
          from unnest(constraint_record.conkey) with ordinality
            as key(attribute_number, key_order)
          join pg_catalog.pg_attribute as attribute
            on attribute.attrelid = constraint_record.conrelid
            and attribute.attnum = key.attribute_number
        ) = array['id']::text[]
    ) as id_primary_key,
    not exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid = pg_catalog.to_regclass(
          'public.workout_logs'
        )
        and attribute.attname in ('user_id', 'workout_id', 'workout_date')
        and attribute.attnotnull
    ) as compatibility_columns_nullable,
    not exists (
      select 1
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = pg_catalog.to_regclass(
          'public.workout_logs'
        )
        and constraint_record.contype = 'f'
        and constraint_record.confrelid = pg_catalog.to_regclass(
          'public.workouts'
        )
    ) as no_workout_fk,
    not exists (
      select 1
      from pg_catalog.pg_index as index_record
      where index_record.indrelid = pg_catalog.to_regclass(
          'public.workout_logs'
        )
        and index_record.indisunique
        and (
          select array_agg(attribute.attname::text order by key.key_order)
          from unnest(index_record.indkey) with ordinality
            as key(attribute_number, key_order)
          join pg_catalog.pg_attribute as attribute
            on attribute.attrelid = index_record.indrelid
            and attribute.attnum = key.attribute_number
          where key.attribute_number > 0
        ) @> array['user_id', 'workout_date']::text[]
    ) as no_false_completion_uniqueness
),
proposed_objects(object_name, object_kind, object_oid) as (
  select
    proposed.object_name,
    proposed.object_kind,
    case proposed.object_kind
      when 'relation' then pg_catalog.to_regclass(
        'public.' || proposed.object_name
      )::oid
      when 'function' then pg_catalog.to_regprocedure(
        'public.' || proposed.object_name
      )::oid
    end
  from (values
    ('workout_sessions'::text, 'relation'::text),
    ('workout_session_exercises', 'relation'),
    ('workout_session_legacy_log', 'relation'),
    ('workout_weekly_schedule', 'relation'),
    ('workout_schedule_occurrences', 'relation'),
    ('workout_schedule_occurrence_exercises', 'relation'),
    ('start_workout_session(uuid,uuid,uuid)', 'function'),
    ('complete_workout_session(uuid)', 'function'),
    ('abandon_workout_session(uuid)', 'function'),
    ('set_workout_session_exercise_completion(uuid,uuid,boolean)', 'function'),
    ('update_workout_session_note(uuid,text)', 'function'),
    ('update_workout_weekly_schedule(jsonb)', 'function'),
    ('skip_workout_schedule_occurrence(uuid,text)', 'function'),
    ('replace_user_workout_plan(jsonb)', 'function')
  ) as proposed(object_name, object_kind)
),
relevant_functions as (
  select
    function_record.oid,
    namespace.nspname::text as schema_name,
    function_record.proname::text as function_name,
    pg_catalog.pg_get_function_identity_arguments(function_record.oid)::text
      as identity_arguments,
    pg_catalog.pg_get_function_result(function_record.oid)::text as result_type,
    pg_catalog.pg_get_userbyid(function_record.proowner)::text as owner_name,
    function_record.prosecdef as security_definer,
    function_record.provolatile::text as volatility,
    function_record.proconfig::text[] as configuration,
    pg_catalog.md5(
      pg_catalog.pg_get_functiondef(function_record.oid)::text
    ) as definition_md5,
    array(
      select acl_entry::text
      from pg_catalog.unnest(coalesce(
        function_record.proacl,
        pg_catalog.acldefault('f'::"char", function_record.proowner)
      )) as acl_entry
      order by 1
    ) as acl
  from pg_catalog.pg_proc as function_record
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = function_record.pronamespace
  where namespace.nspname = 'public'
    and function_record.proname in (
      'complete_mission_with_energy',
      'record_user_streak_activity',
      'toggle_mission_with_xp',
      'replace_user_workouts',
      'reward_system_set_updated_at',
      'training_profile_code_set_valid'
    )
),
function_acl_contract as (
  select
    function_record.function_name,
    not exists (
      select 1
      from pg_catalog.pg_proc as proc
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          proc.proacl,
          pg_catalog.acldefault('f'::"char", proc.proowner)
        )
      ) as expanded
      where proc.oid = function_record.oid
        and expanded.privilege_type = 'EXECUTE'
        and expanded.grantee = 0
    ) as public_blocked,
    pg_catalog.has_function_privilege(
      'anon', function_record.oid, 'EXECUTE'
    ) as anon_execute,
    pg_catalog.has_function_privilege(
      'authenticated', function_record.oid, 'EXECUTE'
    ) as authenticated_execute,
    pg_catalog.has_function_privilege(
      'service_role', function_record.oid, 'EXECUTE'
    ) as service_role_execute,
    not exists (
      select 1
      from pg_catalog.pg_proc as proc
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          proc.proacl,
          pg_catalog.acldefault('f'::"char", proc.proowner)
        )
      ) as expanded
      where proc.oid = function_record.oid
        and expanded.privilege_type = 'EXECUTE'
        and expanded.grantee <> 0
        and expanded.grantee <> proc.proowner
        and expanded.grantee <> 'service_role'::regrole::oid
        and not (
          function_record.function_name in (
            'complete_mission_with_energy',
            'toggle_mission_with_xp'
          )
          and expanded.grantee = 'authenticated'::regrole::oid
        )
    ) as no_unexpected_execute
  from relevant_functions as function_record
  where function_record.function_name in (
    'complete_mission_with_energy',
    'record_user_streak_activity',
    'toggle_mission_with_xp'
  )
),
relation_grants as (
  select
    relation.relation_name,
    case
      when expanded.grantee = 0 then 'PUBLIC'
      else pg_catalog.pg_get_userbyid(expanded.grantee)::text
    end as grantee,
    expanded.privilege_type::text as privilege_type,
    expanded.is_grantable
  from relations as relation
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      relation.relacl,
      pg_catalog.acldefault('r'::"char", relation.owner_oid)
    )
  ) as expanded
  where relation.oid is not null
),
trigger_inventory as (
  select
    relation.relation_name,
    trigger_record.tgname::text as trigger_name,
    trigger_record.tgenabled::text as enabled_state,
    pg_catalog.pg_get_triggerdef(trigger_record.oid, true)::text as definition
  from relations as relation
  join pg_catalog.pg_trigger as trigger_record
    on trigger_record.tgrelid = relation.oid
    and not trigger_record.tgisinternal
),
mission_mapping_contract as (
  select
    pg_catalog.to_regclass('public.daily_missions') is not null
      as relation_exists,
    not exists (
      select 1
      from (values
        ('user_id'::text, 'uuid'::text),
        ('for_date', 'date'),
        ('category', 'text')
      ) as required(column_name, data_type)
      left join information_schema.columns as actual
        on actual.table_schema = 'public'
        and actual.table_name = 'daily_missions'
        and actual.column_name = required.column_name
      where actual.column_name is null
        or actual.data_type <> required.data_type
    ) as required_columns_exist,
    exists (
      select 1
      from pg_catalog.pg_index as index_record
      where index_record.indrelid = pg_catalog.to_regclass(
          'public.daily_missions'
        )
        and index_record.indisunique
        and index_record.indisvalid
        and index_record.indisready
        and index_record.indpred is null
        and (
          select array_agg(attribute.attname::text order by key.key_order)
          from unnest(index_record.indkey) with ordinality
            as key(attribute_number, key_order)
          join pg_catalog.pg_attribute as attribute
            on attribute.attrelid = index_record.indrelid
            and attribute.attnum = key.attribute_number
          where key.attribute_number > 0
            and key.key_order <= index_record.indnkeyatts
        ) = array['user_id', 'for_date', 'category']::text[]
    ) as exact_unique_mapping
),
checks(check_name, status, details) as (
  select
    'required_relations_and_columns',
    case
      when not exists (select 1 from relations where oid is null)
        and not exists (select 1 from column_mismatches)
        and profile_contract.compatible
        then 'PASS'
      else 'FAIL'
    end,
    pg_catalog.jsonb_build_object(
      'relations', (
        select pg_catalog.jsonb_agg(to_jsonb(relation) - 'relacl')
        from relations as relation
      ),
      'column_mismatches', (
        select coalesce(jsonb_agg(mismatch), '[]'::jsonb)
        from column_mismatches as mismatch
      ),
      'training_profile_contract_compatible', profile_contract.compatible,
      'training_profile_contracts', profile_contract.definitions
    )
  from training_profile_contract as profile_contract

  union all

  select
    'legacy_keys_and_delete_behavior',
    case
      when key_contract.id_primary_key
        and key_contract.user_fk_auth_cascade
        and log_contract.id_primary_key
        and log_contract.compatibility_columns_nullable
        and log_contract.no_workout_fk
        and log_contract.no_false_completion_uniqueness
        then 'PASS'
      else 'FAIL'
    end,
    pg_catalog.jsonb_build_object(
      'workouts', to_jsonb(key_contract),
      'workout_logs', to_jsonb(log_contract),
      'constraints', (
        select coalesce(jsonb_agg(constraint_record), '[]'::jsonb)
        from constraints as constraint_record
      )
    )
  from workouts_key_contract as key_contract
  cross join workout_logs_contract as log_contract

  union all

  select
    'relation_security_and_owners',
    case
      when not exists (
        select 1
        from relations as relation
        where relation.oid is null
          or not relation.rls_enabled
          or relation.rls_forced
          or relation.owner_name in ('anon', 'authenticated', 'service_role')
      ) then 'PASS'
      else 'FAIL'
    end,
    pg_catalog.jsonb_build_object(
      'relations', (
        select jsonb_agg(to_jsonb(relation) - 'relacl')
        from relations as relation
      ),
      'grants', (
        select coalesce(jsonb_agg(grant_record), '[]'::jsonb)
        from relation_grants as grant_record
      )
    )

  union all

  select
    'proposed_namespace_clear',
    case when not exists (
      select 1 from proposed_objects where object_oid is not null
    ) then 'PASS' else 'FAIL' end,
    pg_catalog.jsonb_build_object(
      'existing_conflicts', (
        select coalesce(jsonb_agg(proposed), '[]'::jsonb)
        from proposed_objects as proposed
        where proposed.object_oid is not null
      )
    )

  union all

  select
    'required_function_inventory',
    case
      when pg_catalog.to_regprocedure(
          'public.reward_system_set_updated_at()'
        ) is not null
        and pg_catalog.to_regprocedure(
          'public.training_profile_code_set_valid(text[],text[])'
        ) is not null
        and pg_catalog.to_regprocedure(
          'public.complete_mission_with_energy(uuid)'
        ) is not null
        and pg_catalog.to_regprocedure(
          'public.record_user_streak_activity(uuid)'
        ) is not null
        and pg_catalog.to_regprocedure(
          'public.toggle_mission_with_xp(uuid,boolean)'
        ) is not null
        and exists (
          select 1
          from relevant_functions as function_record
          where function_record.function_name =
              'complete_mission_with_energy'
            and function_record.identity_arguments = 'p_mission_id uuid'
            and function_record.definition_md5 =
              '4a1deeecb318df2dd76a30a1cd4acb74'
            and function_record.security_definer
            and coalesce(
              array_to_string(function_record.configuration, ','),
              ''
            ) in ('search_path=', 'search_path=""')
        )
        and exists (
          select 1
          from relevant_functions as function_record
          where function_record.function_name =
              'record_user_streak_activity'
            and function_record.identity_arguments = 'p_user_id uuid'
            and function_record.definition_md5 =
              '66a1d1b6ad6cdfd150ef06026410320c'
            and function_record.security_definer
            and coalesce(
              array_to_string(function_record.configuration, ','),
              ''
            ) in ('search_path=', 'search_path=""')
        )
        and exists (
          select 1
          from function_acl_contract as acl
          where acl.function_name = 'complete_mission_with_energy'
            and acl.public_blocked
            and not acl.anon_execute
            and acl.authenticated_execute
            and acl.service_role_execute
            and acl.no_unexpected_execute
        )
        and exists (
          select 1
          from function_acl_contract as acl
          where acl.function_name = 'record_user_streak_activity'
            and acl.public_blocked
            and not acl.anon_execute
            and not acl.authenticated_execute
            and acl.service_role_execute
            and acl.no_unexpected_execute
        )
        and exists (
          select 1
          from function_acl_contract as acl
          where acl.function_name = 'toggle_mission_with_xp'
            and acl.public_blocked
            and not acl.anon_execute
            and acl.authenticated_execute
            and acl.service_role_execute
            and acl.no_unexpected_execute
        )
        then 'PASS'
      else 'FAIL'
    end,
    pg_catalog.jsonb_build_object(
      'functions', (
        select coalesce(jsonb_agg(function_record), '[]'::jsonb)
        from relevant_functions as function_record
      ),
      'acl_contract', (
        select coalesce(jsonb_agg(acl), '[]'::jsonb)
        from function_acl_contract as acl
      )
    )

  union all

  select
    'generator_cutover_required',
    'WARN',
    pg_catalog.jsonb_build_object(
      'reason',
        'Current runtime performs client-side delete then iterative inserts; atomic replacement RPC cutover is required before schedule FKs are deployed',
      'replace_user_workouts_present',
        pg_catalog.to_regprocedure('public.replace_user_workouts(jsonb)')
          is not null,
      'triggers', (
        select coalesce(jsonb_agg(trigger_record), '[]'::jsonb)
        from trigger_inventory as trigger_record
      )
    )

  union all

  select
    'mission_mapping_atomicity',
    'WARN',
    pg_catalog.jsonb_build_object(
      'reason',
        'First workout completion RPC does not call Energy; atomic composition requires a separately reviewed deterministic mapping even if catalog uniqueness is present',
      'energy_rpc_present',
        pg_catalog.to_regprocedure(
          'public.complete_mission_with_energy(uuid)'
        ) is not null,
      'catalog_mapping', to_jsonb(mapping)
    )
  from mission_mapping_contract as mapping
)
select check_name, status, details
from checks
order by check_name;
