-- READ-ONLY PRODUCTION POST-MIGRATION AUDIT
-- DO NOT APPLY AS A MIGRATION. RUN MANUALLY ONLY AFTER THE REVIEWED V2.2
-- FOUNDATION AND profiles ACL REMEDIATION HAVE BOTH BEEN APPLIED.
-- Returns exactly one aggregate/catalog-only result set and never invokes a
-- business RPC or returns row-level user data.

WITH
expected_roles(role_name) AS (
  VALUES ('anon'::text), ('authenticated'::text), ('service_role'::text)
),
role_facts AS (
  SELECT
    count(*) FILTER (WHERE r.oid IS NULL) AS missing_count,
    pg_catalog.string_agg(e.role_name, ', ' ORDER BY e.role_name)
      FILTER (WHERE r.oid IS NULL) AS missing_names
  FROM expected_roles AS e
  LEFT JOIN pg_catalog.pg_roles AS r ON r.rolname = e.role_name
),
ledger_state AS (
  SELECT pg_catalog.to_regclass(
    'supabase_migrations.schema_migrations'
  ) AS ledger_oid
),
ledger_access AS (
  SELECT ledger_oid,
    COALESCE(pg_catalog.has_table_privilege(ledger_oid, 'SELECT'), false) AS can_read
  FROM ledger_state
),
ledger_snapshot AS (
  SELECT ledger_oid, can_read,
    CASE WHEN ledger_oid IS NOT NULL AND can_read THEN pg_catalog.query_to_xml(
      'SELECT count(*) AS version_count FROM supabase_migrations.schema_migrations AS m WHERE to_jsonb(m)->>''version'' = ''20260928000100''',
      true, false, ''
    ) ELSE NULL END AS ledger_xml
  FROM ledger_access
),
expected_relations(table_name) AS (
  VALUES
    ('profiles'::text), ('user_health_profiles'::text),
    ('training_profiles'::text), ('training_profile_activities'::text),
    ('nutrition_profiles'::text), ('nutrition_profile_restrictions'::text),
    ('nutrition_profile_disliked_foods'::text),
    ('nutrition_profile_preferred_foods'::text),
    ('nutrition_profile_supplements'::text),
    ('onboarding_completion_receipts'::text)
),
relation_actual AS (
  SELECT e.table_name, c.oid, c.relkind, c.relrowsecurity,
    owner_role.rolname::text AS owner_name
  FROM expected_relations AS e
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid AND c.relname = e.table_name
  LEFT JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = c.relowner
),
relation_facts AS (
  SELECT
    count(*) FILTER (WHERE oid IS NULL OR relkind NOT IN ('r', 'p')) AS shape_bad_count,
    count(*) FILTER (WHERE oid IS NULL OR NOT COALESCE(relrowsecurity, false)) AS rls_bad_count,
    count(*) FILTER (WHERE oid IS NOT NULL
      AND owner_name IN ('anon', 'authenticated', 'service_role')) AS owner_bad_count,
    pg_catalog.string_agg(table_name, ', ' ORDER BY table_name)
      FILTER (WHERE oid IS NULL OR relkind NOT IN ('r', 'p')) AS shape_differences,
    pg_catalog.string_agg(table_name, ', ' ORDER BY table_name)
      FILTER (WHERE oid IS NULL OR NOT COALESCE(relrowsecurity, false)) AS rls_differences,
    pg_catalog.string_agg(table_name || ':' || COALESCE(owner_name, 'missing'), ', '
      ORDER BY table_name) FILTER (WHERE oid IS NOT NULL
        AND owner_name IN ('anon', 'authenticated', 'service_role')) AS owner_differences
  FROM relation_actual
),
expected_columns(table_name, column_name, expected_type, expected_nullable, group_name) AS (
  VALUES
    ('training_profiles'::text, 'onboarding_payload_schema_version'::text, 'smallint'::text, true, 'V22_NEW'::text),
    ('training_profiles', 'preferred_weekdays', 'smallint[]', true, 'V22_NEW'),
    ('training_profiles', 'session_duration_range', 'text', true, 'V22_NEW'),
    ('training_profiles', 'aerobic_practice_frequency', 'text', true, 'V22_NEW'),
    ('training_profiles', 'aerobic_safety_limitation', 'boolean', true, 'V22_NEW'),
    ('training_profile_activities', 'onboarding_payload_schema_version', 'smallint', true, 'V22_NEW'),
    ('training_profile_activities', 'duration_range', 'text', true, 'V22_NEW'),
    ('training_profile_activities', 'intensity', 'text', true, 'V22_NEW'),
    ('nutrition_profiles', 'onboarding_payload_schema_version', 'smallint', true, 'V22_NEW'),
    ('nutrition_profiles', 'available_meal_moments', 'text[]', true, 'V22_NEW'),
    ('nutrition_profiles', 'food_preparation_availability', 'text', true, 'V22_NEW'),
    ('nutrition_profiles', 'current_eating_routine', 'text', true, 'V22_NEW'),
    ('training_profiles', 'priority_muscles', 'text[]', true, 'V21_NULLABILITY'),
    ('training_profiles', 'training_experience', 'text', true, 'V21_NULLABILITY'),
    ('training_profiles', 'exercise_confidence', 'text', true, 'V21_NULLABILITY'),
    ('training_profiles', 'available_weekdays', 'smallint[]', true, 'V21_NULLABILITY'),
    ('training_profiles', 'session_duration_min', 'smallint', true, 'V21_NULLABILITY'),
    ('training_profiles', 'session_duration_is_plus', 'boolean', true, 'V21_NULLABILITY'),
    ('training_profiles', 'pain_or_limitation', 'boolean', true, 'V21_NULLABILITY'),
    ('training_profiles', 'affected_body_areas', 'text[]', true, 'V21_NULLABILITY'),
    ('training_profile_activities', 'schedule_type', 'text', true, 'V21_NULLABILITY'),
    ('nutrition_profiles', 'food_preparation_style', 'text', true, 'V21_NULLABILITY'),
    ('nutrition_profiles', 'food_budget_style', 'text', true, 'V21_NULLABILITY')
),
column_comparison AS (
  SELECT e.*,
    a.attname IS NOT NULL AS column_exists,
    CASE WHEN a.attname IS NULL THEN NULL
      ELSE pg_catalog.format_type(a.atttypid, a.atttypmod) END AS actual_type,
    CASE WHEN a.attname IS NULL THEN NULL ELSE NOT a.attnotnull END AS actual_nullable,
    COALESCE(a.attidentity::text, '') AS identity_kind,
    COALESCE(a.attgenerated::text, '') AS generated_kind
  FROM expected_columns AS e
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid AND c.relname = e.table_name
  LEFT JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = c.oid AND a.attname = e.column_name
   AND a.attnum > 0 AND NOT a.attisdropped
),
column_facts AS (
  SELECT group_name,
    count(*) FILTER (WHERE NOT column_exists OR actual_type <> expected_type
      OR actual_nullable <> expected_nullable OR identity_kind <> ''
      OR generated_kind <> '') AS bad_count,
    pg_catalog.string_agg(table_name || '.' || column_name, ', '
      ORDER BY table_name, column_name) FILTER (
        WHERE NOT column_exists OR actual_type <> expected_type
          OR actual_nullable <> expected_nullable OR identity_kind <> ''
          OR generated_kind <> '') AS differences
  FROM column_comparison
  GROUP BY group_name
),
expected_constraints(table_name, constraint_name, fragments) AS (
  VALUES
    ('training_profiles'::text, 'training_profiles_location_check'::text,
      ARRAY['check', 'training_location', 'full_gym', 'simple_gym', 'home', 'outdoor', 'other']::text[]),
    ('training_profiles', 'training_profiles_contract_check',
      ARRAY['check', 'onboarding_payload_schema_version is null', 'onboarding_payload_schema_version = 3',
        'preferred_weekdays is null', 'preferred_weekdays is not null', 'training_profile_code_set_valid',
        'under_30', 'over_90', 'never', 'regularly', 'aerobic_safety_limitation is not null']::text[]),
    ('training_profile_activities', 'training_profile_activities_code_check',
      ARRAY['check', 'activity_code', 'running', 'walking', 'other']::text[]),
    ('training_profile_activities', 'training_profile_activities_contract_check',
      ARRAY['check', 'onboarding_payload_schema_version is null', 'onboarding_payload_schema_version = 3',
        'duration_range is null', 'intensity is null', 'schedule_type is null',
        'training_profile_code_set_valid', 'under_30', 'over_90', 'low', 'moderate', 'high']::text[]),
    ('nutrition_profiles', 'nutrition_profiles_contract_check',
      ARRAY['check', 'onboarding_payload_schema_version is null', 'onboarding_payload_schema_version = 3',
        'available_meal_moments is null', 'available_meal_moments is not null',
        'training_profile_code_set_valid', 'breakfast', 'supper', 'limited', 'flexible',
        'structured', 'irregular']::text[])
),
constraint_comparison AS (
  SELECT e.table_name, e.constraint_name, con.oid, con.convalidated,
    NOT EXISTS (
      SELECT 1 FROM pg_catalog.unnest(e.fragments) AS fragment(value)
      WHERE pg_catalog.strpos(pg_catalog.lower(COALESCE(
        pg_catalog.pg_get_constraintdef(con.oid, true), ''
      )), fragment.value) = 0
    ) AS fragments_match
  FROM expected_constraints AS e
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid AND c.relname = e.table_name
  LEFT JOIN pg_catalog.pg_constraint AS con
    ON con.conrelid = c.oid AND con.conname = e.constraint_name
   AND con.contype = 'c'
),
constraint_facts AS (
  SELECT count(*) FILTER (WHERE oid IS NULL OR NOT COALESCE(convalidated, false)
      OR NOT fragments_match) AS bad_count,
    pg_catalog.string_agg(table_name || '.' || constraint_name, ', '
      ORDER BY table_name, constraint_name) FILTER (
        WHERE oid IS NULL OR NOT COALESCE(convalidated, false)
          OR NOT fragments_match) AS differences
  FROM constraint_comparison
),
removed_constraint_facts AS (
  SELECT count(con.oid) AS remaining_count,
    pg_catalog.string_agg(con.conname::text, ', ' ORDER BY con.conname::text)
      FILTER (WHERE con.oid IS NOT NULL) AS differences
  FROM (VALUES
    ('training_profile_activities'::text, 'training_profile_activities_schedule_check'::text)
  ) AS removed(table_name, constraint_name)
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid AND c.relname = removed.table_name
  LEFT JOIN pg_catalog.pg_constraint AS con
    ON con.conrelid = c.oid AND con.conname = removed.constraint_name
),
expected_triggers(table_name, trigger_name, function_name, expected_tgtype) AS (
  VALUES
    ('training_profiles'::text, 'training_profiles_set_initial_level'::text,
      'training_profiles_set_initial_level'::text, 7),
    ('training_profile_activities', 'training_profile_activities_check_contract',
      'training_profile_activities_check_contract', 23)
),
trigger_comparison AS (
  SELECT e.*, tg.oid, tg.tgenabled::text AS enabled,
    tg.tgtype::integer AS actual_tgtype, pn.nspname::text AS function_schema,
    p.proname::text AS actual_function_name
  FROM expected_triggers AS e
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid AND c.relname = e.table_name
  LEFT JOIN pg_catalog.pg_trigger AS tg
    ON tg.tgrelid = c.oid AND tg.tgname = e.trigger_name AND NOT tg.tgisinternal
  LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = tg.tgfoid
  LEFT JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.pronamespace
),
trigger_facts AS (
  SELECT count(*) FILTER (WHERE oid IS NULL OR enabled <> 'O'
      OR actual_tgtype <> expected_tgtype OR function_schema <> 'public'
      OR actual_function_name <> function_name) AS bad_count,
    pg_catalog.string_agg(table_name || '.' || trigger_name, ', '
      ORDER BY table_name, trigger_name) FILTER (
        WHERE oid IS NULL OR enabled <> 'O' OR actual_tgtype <> expected_tgtype
          OR function_schema <> 'public' OR actual_function_name <> function_name
      ) AS differences
  FROM trigger_comparison
),
expected_functions(function_name, identity_arguments, result_type, language_name,
  security_definer, volatility) AS (
  VALUES
    ('onboarding_v22_assert_object'::text, 'p_value jsonb, p_shape jsonb'::text,
      'void'::text, 'plpgsql'::text, false, 'i'::text),
    ('onboarding_v22_enum', 'p_value jsonb, p_allowed text[], p_nullable boolean',
      'text', 'plpgsql', false, 'i'),
    ('onboarding_v22_label', 'p_value jsonb, p_max integer, p_nullable boolean',
      'text', 'plpgsql', false, 'i'),
    ('onboarding_v22_set', 'p_value jsonb, p_allowed jsonb, p_min integer',
      'jsonb', 'plpgsql', false, 'i'),
    ('canonicalize_onboarding_v22', 'p_payload jsonb', 'jsonb', 'plpgsql', false, 's'),
    ('complete_onboarding_v22', 'p_payload jsonb',
      'TABLE(result text, onboarding_version smallint, completed_at timestamp with time zone)',
      'plpgsql', true, 'v'),
    ('training_profiles_set_initial_level', '', 'trigger', 'plpgsql', false, 'v'),
    ('training_profile_activities_check_contract', '', 'trigger', 'plpgsql', false, 'v')
),
function_actual AS (
  SELECT p.oid, p.proowner, p.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_catalog.pg_get_function_result(p.oid) AS result_type,
    l.lanname::text AS language_name, p.prosecdef AS security_definer,
    p.provolatile::text AS volatility, p.proconfig,
    owner_role.rolname::text AS owner_name,
    pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid)) AS definition,
    COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner)) AS effective_acl
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace AND n.nspname = 'public'
  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
  WHERE p.proname IN (SELECT function_name FROM expected_functions)
),
function_comparison AS (
  SELECT e.*, a.oid, a.proowner, a.owner_name, a.definition, a.effective_acl,
    a.proconfig,
    a.identity_arguments AS actual_identity_arguments,
    a.result_type AS actual_result_type,
    a.language_name AS actual_language_name,
    a.security_definer AS actual_security_definer,
    a.volatility AS actual_volatility
  FROM expected_functions AS e
  LEFT JOIN function_actual AS a
    ON a.function_name = e.function_name
   AND a.identity_arguments = e.identity_arguments
),
function_facts AS (
  SELECT
    count(*) FILTER (WHERE oid IS NULL OR actual_result_type <> result_type
      OR actual_language_name <> language_name
      OR actual_security_definer <> security_definer
      OR actual_volatility <> volatility
      OR owner_name IN ('anon', 'authenticated', 'service_role')
      OR pg_catalog.array_length(proconfig, 1) <> 1
      OR proconfig[1] NOT IN ('search_path=', 'search_path=""')) AS bad_count,
    pg_catalog.string_agg(function_name, ', ' ORDER BY function_name) FILTER (
      WHERE oid IS NULL OR actual_result_type <> result_type
        OR actual_language_name <> language_name
        OR actual_security_definer <> security_definer
        OR actual_volatility <> volatility
        OR owner_name IN ('anon', 'authenticated', 'service_role')
        OR pg_catalog.array_length(proconfig, 1) <> 1
        OR proconfig[1] NOT IN ('search_path=', 'search_path=""')
    ) AS differences
  FROM function_comparison
),
function_overload_facts AS (
  SELECT count(*) AS actual_count FROM function_actual
),
private_function_facts AS (
  SELECT count(*) FILTER (WHERE
      EXISTS (SELECT 1 FROM pg_catalog.aclexplode(f.effective_acl) AS acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE')
      OR EXISTS (SELECT 1 FROM expected_roles AS expected_role
        JOIN pg_catalog.pg_roles AS r ON r.rolname = expected_role.role_name
        WHERE pg_catalog.has_function_privilege(r.oid, f.oid, 'EXECUTE'))
    ) AS bad_count,
    pg_catalog.string_agg(f.function_name, ', ' ORDER BY f.function_name) FILTER (WHERE
      EXISTS (SELECT 1 FROM pg_catalog.aclexplode(f.effective_acl) AS acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE')
      OR EXISTS (SELECT 1 FROM expected_roles AS expected_role
        JOIN pg_catalog.pg_roles AS r ON r.rolname = expected_role.role_name
        WHERE pg_catalog.has_function_privilege(r.oid, f.oid, 'EXECUTE'))
    ) AS differences
  FROM function_actual AS f
  WHERE f.function_name IN (
    'onboarding_v22_assert_object', 'onboarding_v22_enum',
    'onboarding_v22_label', 'onboarding_v22_set',
    'canonicalize_onboarding_v22', 'training_profiles_set_initial_level',
    'training_profile_activities_check_contract'
  )
),
rpc22 AS (
  SELECT * FROM function_comparison WHERE function_name = 'complete_onboarding_v22'
),
rpc22_grant_facts AS (
  SELECT
    COALESCE(pg_catalog.bool_and(
      pg_catalog.has_function_privilege(r.oid, rpc.oid, 'EXECUTE') =
        (r.rolname = 'authenticated')
    ), false) AS named_roles_match,
    COALESCE(pg_catalog.bool_and(NOT EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(rpc.effective_acl) AS acl
      WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    )), false) AS public_denied
  FROM rpc22 AS rpc
  CROSS JOIN pg_catalog.pg_roles AS r
  WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
),
rpc22_definition_facts AS (
  SELECT count(*) FILTER (WHERE oid IS NOT NULL
      AND definition LIKE '%auth.uid()%'
      AND definition LIKE '%from public.profiles p%'
      AND definition LIKE '%for update%'
      AND definition LIKE '%public.canonicalize_onboarding_v22(p_payload)%'
      AND definition LIKE '%pg_catalog.sha256%'
      AND definition LIKE '%r.onboarding_version = 2%'
      AND definition LIKE '%v_receipt.payload_schema_version = 3%'
      AND definition LIKE '%v_receipt.canonicalization_version = 3%'
      AND definition LIKE '%conflicting completion receipt%'
      AND definition LIKE '%existing onboarding completion cannot be replaced%'
      AND definition LIKE '%existing profile data requires a separate edit or recovery flow%'
      AND definition LIKE '%values (v_user_id, 2, v_key, v_hash, 3, 3, v_completed_at)%'
      AND pg_catalog.strpos(definition, 'insert into public.onboarding_completion_receipts') > 0
      AND pg_catalog.strpos(definition, 'update public.profiles p set onboarding_completed = true') >
          pg_catalog.strpos(definition, 'insert into public.onboarding_completion_receipts')
    ) AS compatible_count
  FROM rpc22
),
rpc22_owner_facts AS (
  SELECT COALESCE(pg_catalog.bool_and(
      pg_catalog.has_schema_privilege(rpc.proowner, 'auth', 'USAGE')
      AND pg_catalog.has_function_privilege(rpc.proowner, auth_uid.oid, 'EXECUTE')
      AND pg_catalog.has_table_privilege(rpc.proowner, 'public.profiles', 'SELECT')
      AND pg_catalog.has_table_privilege(rpc.proowner, 'public.profiles', 'UPDATE')
      AND NOT EXISTS (
        SELECT 1 FROM relation_actual AS rel
        WHERE rel.table_name <> 'profiles' AND (
          NOT pg_catalog.has_table_privilege(rpc.proowner, rel.oid, 'SELECT')
          OR NOT pg_catalog.has_table_privilege(rpc.proowner, rel.oid, 'INSERT')
        )
      )
    ), false) AS owner_access_ok
  FROM rpc22 AS rpc
  LEFT JOIN pg_catalog.pg_namespace AS auth_n ON auth_n.nspname = 'auth'
  LEFT JOIN pg_catalog.pg_proc AS auth_uid
    ON auth_uid.pronamespace = auth_n.oid AND auth_uid.proname = 'uid'
   AND pg_catalog.pg_get_function_identity_arguments(auth_uid.oid) = ''
),
rpc21 AS (
  SELECT p.oid, p.proowner, p.prosecdef, p.proconfig,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_catalog.pg_get_function_result(p.oid) AS result_type,
    l.lanname::text AS language_name, owner_role.rolname::text AS owner_name,
    pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid)) AS definition,
    COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner)) AS effective_acl
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace AND n.nspname = 'public'
  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
  WHERE p.proname = 'complete_onboarding_v2'
),
rpc21_facts AS (
  SELECT count(*) AS overload_count,
    count(*) FILTER (WHERE identity_arguments = 'p_payload jsonb'
      AND result_type = 'TABLE(result text, onboarding_version smallint, completed_at timestamp with time zone)'
      AND language_name = 'plpgsql' AND prosecdef
      AND owner_name NOT IN ('anon', 'authenticated', 'service_role')
      AND pg_catalog.array_length(proconfig, 1) = 1
      AND proconfig[1] IN ('search_path=', 'search_path=""')) AS compatible_count,
    COALESCE(pg_catalog.bool_and(
      pg_catalog.has_function_privilege(r.oid, rpc.oid, 'EXECUTE') =
        (r.rolname IN ('authenticated', 'service_role'))
    ), false) AS named_roles_match,
    COALESCE(pg_catalog.bool_and(NOT EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(rpc.effective_acl) AS acl
      WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    )), false) AS public_denied
  FROM rpc21 AS rpc
  CROSS JOIN pg_catalog.pg_roles AS r
  WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
),
trigger_function_semantics AS (
  SELECT
    count(*) FILTER (WHERE function_name = 'training_profiles_set_initial_level'
      AND definition LIKE '%if new.onboarding_payload_schema_version = 3%'
      AND definition LIKE '%new.initial_training_level := case%'
      AND definition LIKE '%new.training_experience%'
      AND definition LIKE '%new.exercise_confidence%'
      AND definition LIKE '%new.recent_training_break%'
      AND definition LIKE '%then ''beginner''%'
      AND definition LIKE '%then ''advanced''%'
      AND definition LIKE '%else ''intermediate''%') AS initial_level_compatible,
    count(*) FILTER (WHERE function_name = 'training_profile_activities_check_contract'
      AND definition LIKE '%from public.training_profiles p%'
      AND definition LIKE '%for key share%'
      AND definition LIKE '%is distinct from new.onboarding_payload_schema_version%') AS activity_contract_compatible
  FROM function_actual
),
data_guard AS (
  SELECT (SELECT shape_bad_count = 0 FROM relation_facts)
    AND COALESCE(pg_catalog.bool_and(
      pg_catalog.has_table_privilege(rel.oid, 'SELECT')
    ), false) AS can_run
  FROM relation_actual AS rel
),
data_snapshot AS (
  SELECT can_run,
    CASE WHEN can_run THEN pg_catalog.query_to_xml($data$
      SELECT
        (SELECT count(*) FROM public.onboarding_completion_receipts) AS receipts_total,
        (SELECT count(*) FROM public.onboarding_completion_receipts
          WHERE onboarding_version = 2) AS receipts_v2,
        (SELECT count(*) FROM public.onboarding_completion_receipts
          WHERE onboarding_version = 2 AND payload_schema_version = 2
            AND canonicalization_version = 2) AS receipts_schema2,
        (SELECT count(*) FROM public.onboarding_completion_receipts
          WHERE payload_schema_version = 3 OR canonicalization_version = 3) AS receipts_schema3,
        (SELECT count(*) FROM public.onboarding_completion_receipts
          WHERE onboarding_version <> 2) AS unexpected_versions,
        (SELECT count(*) FROM public.onboarding_completion_receipts AS r
          LEFT JOIN public.profiles AS p ON p.user_id = r.user_id
          WHERE p.user_id IS NULL OR p.onboarding_completed IS DISTINCT FROM true
            OR p.onboarding_version IS DISTINCT FROM 2
            OR p.onboarding_completed_at IS DISTINCT FROM r.completed_at) AS receipt_marker_mismatches,
        (SELECT count(*) FROM public.profiles AS p
          WHERE p.onboarding_completed IS TRUE AND p.onboarding_version = 2
            AND NOT EXISTS (SELECT 1 FROM public.onboarding_completion_receipts AS r
              WHERE r.user_id = p.user_id AND r.onboarding_version = 2)) AS markers_without_receipt,
        (SELECT count(*) FROM public.training_profiles
          WHERE onboarding_payload_schema_version = 3) AS training_v3,
        (SELECT count(*) FROM public.training_profile_activities
          WHERE onboarding_payload_schema_version = 3) AS activities_v3,
        (SELECT count(*) FROM public.nutrition_profiles
          WHERE onboarding_payload_schema_version = 3) AS nutrition_v3,
        (SELECT count(*) FROM public.training_profiles t WHERE NOT (
          t.onboarding_payload_schema_version IS NULL
          AND t.priority_muscles IS NOT NULL AND t.training_experience IS NOT NULL
          AND t.exercise_confidence IS NOT NULL AND t.available_weekdays IS NOT NULL
          AND t.session_duration_min IS NOT NULL AND t.session_duration_is_plus IS NOT NULL
          AND t.pain_or_limitation IS NOT NULL AND t.affected_body_areas IS NOT NULL
          AND t.training_location <> 'simple_gym' AND t.preferred_weekdays IS NULL
          AND t.session_duration_range IS NULL AND t.aerobic_practice_frequency IS NULL
          AND t.aerobic_safety_limitation IS NULL)) AS incompatible_legacy_training,
        (SELECT count(*) FROM public.training_profile_activities a WHERE NOT (
          a.onboarding_payload_schema_version IS NULL AND a.duration_range IS NULL
          AND a.intensity IS NULL AND a.activity_code <> 'walking' AND (
            (a.schedule_type = 'fixed_weekdays' AND a.available_weekdays IS NOT NULL
              AND cardinality(a.available_weekdays) >= 1
              AND public.training_profile_code_set_valid(a.available_weekdays::text[],
                ARRAY['1','2','3','4','5','6','7']::text[])
              AND a.sessions_per_week IS NULL)
            OR (a.schedule_type = 'variable' AND a.available_weekdays IS NULL
              AND a.sessions_per_week IS NOT NULL AND a.sessions_per_week > 0))))
          AS incompatible_legacy_activities,
        (SELECT count(*) FROM public.nutrition_profiles n WHERE NOT (
          n.onboarding_payload_schema_version IS NULL
          AND n.food_preparation_style IS NOT NULL AND n.food_budget_style IS NOT NULL
          AND n.available_meal_moments IS NULL
          AND n.food_preparation_availability IS NULL
          AND n.current_eating_routine IS NULL)) AS incompatible_legacy_nutrition
    $data$, true, false, '') ELSE NULL END AS data_xml
  FROM data_guard
),
data_values AS (
  SELECT can_run,
    COALESCE(((pg_catalog.xpath('/table/row/receipts_total/text()', data_xml))[1]::text)::bigint, 0) AS receipts_total,
    COALESCE(((pg_catalog.xpath('/table/row/receipts_v2/text()', data_xml))[1]::text)::bigint, 0) AS receipts_v2,
    COALESCE(((pg_catalog.xpath('/table/row/receipts_schema2/text()', data_xml))[1]::text)::bigint, 0) AS receipts_schema2,
    COALESCE(((pg_catalog.xpath('/table/row/receipts_schema3/text()', data_xml))[1]::text)::bigint, 0) AS receipts_schema3,
    COALESCE(((pg_catalog.xpath('/table/row/unexpected_versions/text()', data_xml))[1]::text)::bigint, 0) AS unexpected_versions,
    COALESCE(((pg_catalog.xpath('/table/row/receipt_marker_mismatches/text()', data_xml))[1]::text)::bigint, 0) AS receipt_marker_mismatches,
    COALESCE(((pg_catalog.xpath('/table/row/markers_without_receipt/text()', data_xml))[1]::text)::bigint, 0) AS markers_without_receipt,
    COALESCE(((pg_catalog.xpath('/table/row/training_v3/text()', data_xml))[1]::text)::bigint, 0) AS training_v3,
    COALESCE(((pg_catalog.xpath('/table/row/activities_v3/text()', data_xml))[1]::text)::bigint, 0) AS activities_v3,
    COALESCE(((pg_catalog.xpath('/table/row/nutrition_v3/text()', data_xml))[1]::text)::bigint, 0) AS nutrition_v3,
    COALESCE(((pg_catalog.xpath('/table/row/incompatible_legacy_training/text()', data_xml))[1]::text)::bigint, 0) AS incompatible_legacy_training,
    COALESCE(((pg_catalog.xpath('/table/row/incompatible_legacy_activities/text()', data_xml))[1]::text)::bigint, 0) AS incompatible_legacy_activities,
    COALESCE(((pg_catalog.xpath('/table/row/incompatible_legacy_nutrition/text()', data_xml))[1]::text)::bigint, 0) AS incompatible_legacy_nutrition
  FROM data_snapshot
),
client_table_grants AS (
  SELECT r.rolname::text AS role_name, rel.table_name, privilege.privilege_name
  FROM relation_actual AS rel
  CROSS JOIN pg_catalog.pg_roles AS r
  CROSS JOIN (VALUES ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text),
    ('TRUNCATE'::text), ('REFERENCES'::text), ('TRIGGER'::text),
    ('MAINTAIN'::text)) AS privilege(privilege_name)
  WHERE rel.oid IS NOT NULL AND r.rolname IN ('anon', 'authenticated')
    AND pg_catalog.has_table_privilege(r.oid, rel.oid, privilege.privilege_name)
),
client_table_grant_facts AS (
  SELECT count(*) AS bad_count,
    pg_catalog.string_agg(role_name || ':' || table_name || ':' || privilege_name,
      ', ' ORDER BY role_name, table_name, privilege_name) AS differences
  FROM client_table_grants
),
protected_columns(table_name, column_name) AS (
  VALUES
    ('profiles'::text, 'onboarding_version'::text),
    ('profiles', 'onboarding_completed_at'),
    ('training_profiles', 'onboarding_payload_schema_version'),
    ('training_profiles', 'initial_training_level'),
    ('training_profiles', 'preferred_weekdays'),
    ('training_profiles', 'session_duration_range'),
    ('training_profiles', 'aerobic_practice_frequency'),
    ('training_profiles', 'aerobic_safety_limitation'),
    ('training_profile_activities', 'onboarding_payload_schema_version'),
    ('training_profile_activities', 'duration_range'),
    ('training_profile_activities', 'intensity'),
    ('nutrition_profiles', 'onboarding_payload_schema_version'),
    ('nutrition_profiles', 'available_meal_moments'),
    ('nutrition_profiles', 'food_preparation_availability'),
    ('nutrition_profiles', 'current_eating_routine')
),
protected_column_facts AS (
  SELECT count(*) FILTER (WHERE
      pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, 'INSERT')
      OR pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, 'UPDATE')) AS bad_count,
    pg_catalog.string_agg(r.rolname::text || ':' || p.table_name || '.' || p.column_name,
      ', ' ORDER BY r.rolname::text, p.table_name, p.column_name) FILTER (WHERE
        pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, 'INSERT')
        OR pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, 'UPDATE')) AS differences
  FROM protected_columns AS p
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid AND c.relname = p.table_name
  LEFT JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = c.oid AND a.attname = p.column_name
   AND a.attnum > 0 AND NOT a.attisdropped
  CROSS JOIN pg_catalog.pg_roles AS r
  WHERE r.rolname IN ('anon', 'authenticated')
),
legacy_marker_facts AS (
  SELECT
    pg_catalog.has_column_privilege('anon', 'public.profiles',
      'onboarding_completed', 'INSERT') AS anon_insert,
    pg_catalog.has_column_privilege('anon', 'public.profiles',
      'onboarding_completed', 'UPDATE') AS anon_update,
    pg_catalog.has_column_privilege('authenticated', 'public.profiles',
      'onboarding_completed', 'INSERT') AS authenticated_insert,
    pg_catalog.has_column_privilege('authenticated', 'public.profiles',
      'onboarding_completed', 'UPDATE') AS authenticated_update
),
public_acl_facts AS (
  SELECT count(*) AS bad_count,
    pg_catalog.string_agg(c.relname::text || ':' || acl.privilege_type, ', '
      ORDER BY c.relname::text, acl.privilege_type) AS differences
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
  ) AS acl
  WHERE c.relname IN (SELECT table_name FROM expected_relations)
    AND acl.grantee = 0
    AND acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
      'REFERENCES', 'TRIGGER', 'MAINTAIN')
),
service_role_facts AS (
  SELECT count(*) FILTER (WHERE r.oid IS NULL OR rel.oid IS NULL
      OR NOT pg_catalog.has_table_privilege(r.oid, rel.oid, 'SELECT')
      OR NOT pg_catalog.has_table_privilege(r.oid, rel.oid, 'INSERT')
      OR NOT pg_catalog.has_table_privilege(r.oid, rel.oid, 'UPDATE')
      OR NOT pg_catalog.has_table_privilege(r.oid, rel.oid, 'DELETE')) AS gap_count,
    pg_catalog.string_agg(rel.table_name, ', ' ORDER BY rel.table_name) FILTER (
      WHERE r.oid IS NULL OR rel.oid IS NULL
        OR NOT pg_catalog.has_table_privilege(r.oid, rel.oid, 'SELECT')
        OR NOT pg_catalog.has_table_privilege(r.oid, rel.oid, 'INSERT')
        OR NOT pg_catalog.has_table_privilege(r.oid, rel.oid, 'UPDATE')
        OR NOT pg_catalog.has_table_privilege(r.oid, rel.oid, 'DELETE')) AS differences
  FROM relation_actual AS rel
  LEFT JOIN pg_catalog.pg_roles AS r ON r.rolname = 'service_role'
  WHERE rel.table_name NOT IN ('training_profiles', 'training_profile_activities')
),
checks(check_order, audit_section, check_name, audit_status,
  observed_value, expected_value, details) AS (
  SELECT 10, 'A_FOUNDATION', 'REQUIRED_ROLES',
    CASE WHEN missing_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    missing_count::text || ' missing', '0 missing',
    COALESCE(missing_names, 'anon, authenticated, and service_role exist')
  FROM role_facts
  UNION ALL
  SELECT 11, 'A_FOUNDATION', 'V22_MIGRATION_LEDGER',
    CASE WHEN ledger_xml IS NULL THEN 'WARN'
      WHEN COALESCE(((pg_catalog.xpath('/table/row/version_count/text()', ledger_xml))[1]::text)::integer, 0) = 1
        THEN 'PASS' ELSE 'WARN' END,
    CASE WHEN ledger_xml IS NULL THEN 'unavailable'
      ELSE COALESCE(((pg_catalog.xpath('/table/row/version_count/text()', ledger_xml))[1]::text), '0') || ' entries' END,
    '1 entry when migration was ledger-managed; schema evidence is authoritative',
    'Manual SQL Editor application may legitimately leave the optional ledger without this version.'
  FROM ledger_snapshot
  UNION ALL
  SELECT 20, 'A_FOUNDATION', 'REQUIRED_RELATIONS_AND_TRUSTED_OWNERS',
    CASE WHEN shape_bad_count = 0 AND owner_bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    shape_bad_count::text || ' shape errors; ' || owner_bad_count::text || ' untrusted owners',
    '0 shape errors; 0 untrusted owners',
    COALESCE(shape_differences, owner_differences,
      'All 10 required relations are tables owned by trusted roles.')
  FROM relation_facts
  UNION ALL
  SELECT 21, 'A_FOUNDATION', 'RLS_ENABLED_ON_SCOPED_TABLES',
    CASE WHEN rls_bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    rls_bad_count::text || ' missing or disabled', '0 missing or disabled',
    COALESCE(rls_differences, 'RLS is enabled on all 10 scoped tables.')
  FROM relation_facts
  UNION ALL
  SELECT 30, 'B_COLUMNS', 'V22_NEW_COLUMN_SHAPES',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' incompatible of 12', '0 incompatible of 12',
    COALESCE(differences, 'All 12 V2.2 columns have exact types and nullability.')
  FROM column_facts WHERE group_name = 'V22_NEW'
  UNION ALL
  SELECT 31, 'B_COLUMNS', 'V21_COLUMNS_EXPECTED_NULLABLE',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' incompatible of 11', '0 incompatible of 11',
    COALESCE(differences, 'All 11 V2.1 columns changed by V2.2 are nullable with unchanged types.')
  FROM column_facts WHERE group_name = 'V21_NULLABILITY'
  UNION ALL
  SELECT 40, 'C_CONSTRAINTS', 'V22_CONTRACT_CONSTRAINTS',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' incompatible of 5', '0 incompatible of 5',
    COALESCE(differences, 'All five validated constraints expose both legacy and schema-3 contract semantics.')
  FROM constraint_facts
  UNION ALL
  SELECT 41, 'C_CONSTRAINTS', 'REMOVED_V21_CONSTRAINTS_ABSENT',
    CASE WHEN remaining_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    remaining_count::text || ' obsolete constraints remain', '0 remain',
    COALESCE(differences, 'training_profile_activities_schedule_check is absent as required.')
  FROM removed_constraint_facts
  UNION ALL
  SELECT 50, 'D_TRIGGERS', 'V22_TRIGGER_SEMANTICS',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' incompatible of 2', '0 incompatible of 2',
    COALESCE(differences, 'Enabled row-level BEFORE events and target functions match semantically.')
  FROM trigger_facts
  UNION ALL
  SELECT 51, 'D_TRIGGERS', 'TRIGGER_FUNCTION_CONTRACT_BRANCHES',
    CASE WHEN initial_level_compatible = 1 AND activity_contract_compatible = 1
      THEN 'PASS' ELSE 'FAIL' END,
    'initial=' || initial_level_compatible::text || '; activity=' || activity_contract_compatible::text,
    'initial=1; activity=1',
    'The initial-level helper preserves the legacy derivation and schema-3 branch; activities enforce parent version equality.'
  FROM trigger_function_semantics
  UNION ALL
  SELECT 60, 'E_FUNCTIONS', 'V22_FUNCTION_METADATA',
    CASE WHEN f.bad_count = 0 AND o.actual_count = 8 THEN 'PASS' ELSE 'FAIL' END,
    f.bad_count::text || ' incompatible; ' || o.actual_count::text || ' exact-name overloads',
    '0 incompatible; 8 exact-name overloads',
    COALESCE(f.differences, 'All eight functions match signature, return, language, security, volatility, owner, and search_path.')
  FROM function_facts AS f CROSS JOIN function_overload_facts AS o
  UNION ALL
  SELECT 61, 'E_FUNCTIONS', 'V22_PRIVATE_HELPERS',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' helpers executable by a client/PUBLIC role', '0 executable',
    COALESCE(differences, 'All V2.2 validation/canonicalization/trigger helpers are private.')
  FROM private_function_facts
  UNION ALL
  SELECT 70, 'F_COMPLETE_ONBOARDING_V22', 'RPC_EXECUTE_GRANTS',
    CASE WHEN named_roles_match AND public_denied THEN 'PASS' ELSE 'FAIL' END,
    'named_roles_match=' || named_roles_match::text || '; public_denied=' || public_denied::text,
    'anon=false; authenticated=true; service_role=false; PUBLIC=false',
    'Effective EXECUTE privileges are checked without invoking the RPC.'
  FROM rpc22_grant_facts
  UNION ALL
  SELECT 71, 'F_COMPLETE_ONBOARDING_V22', 'RPC_FAIL_CLOSED_DEFINITION_SIGNALS',
    CASE WHEN compatible_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    compatible_count::text || ' compatible definitions', '1 compatible definition',
    'Checks identity, profile lock, canonicalization, server hash, 2/3/3 receipt, conflict guards, domain guards, and marker-last ordering.'
  FROM rpc22_definition_facts
  UNION ALL
  SELECT 72, 'F_COMPLETE_ONBOARDING_V22', 'RPC_OWNER_RUNTIME_PRIVILEGES',
    CASE WHEN owner_access_ok THEN 'PASS' ELSE 'FAIL' END,
    'owner_access=' || owner_access_ok::text, 'owner_access=true',
    'Trusted SECURITY DEFINER owner retains auth.uid, profile, and domain-table runtime privileges.'
  FROM rpc22_owner_facts
  UNION ALL
  SELECT 80, 'G_V21_COMPATIBILITY', 'COMPLETE_ONBOARDING_V2_STRUCTURE_AND_GRANTS',
    CASE WHEN overload_count = 3 AND compatible_count = 3
      AND named_roles_match AND public_denied THEN 'PASS' ELSE 'FAIL' END,
    overload_count::text || ' role evaluations; compatible=' || compatible_count::text ||
      '; grants=' || named_roles_match::text || '; public_denied=' || public_denied::text,
    '3 role evaluations; compatible=3; grants=true; public_denied=true',
    'V2.1 remains SECURITY DEFINER with its exact signature, trusted owner, empty search_path, and authenticated/service_role grants.'
  FROM rpc21_facts
  UNION ALL
  SELECT 90, 'H_EXISTING_DATA', 'AGGREGATE_DATA_AUDIT_AVAILABILITY',
    CASE WHEN can_run THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN 'available' ELSE 'unavailable' END, 'available',
    'Only aggregate counts are inspected; no user-level values are returned.'
  FROM data_values
  UNION ALL
  SELECT 91, 'H_EXISTING_DATA', 'PREEXISTING_RECEIPTS_PRESERVED',
    CASE WHEN can_run AND receipts_total = 3 AND receipts_v2 = 3
      AND receipts_schema2 = 3 AND receipts_schema3 = 0 AND unexpected_versions = 0
      THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN 'total=' || receipts_total::text || '; v2=' || receipts_v2::text ||
      '; schema2=' || receipts_schema2::text || '; schema3=' || receipts_schema3::text ||
      '; unexpected_versions=' || unexpected_versions::text ELSE 'not evaluated' END,
    'total=3; v2=3; schema2=3; schema3=0; unexpected_versions=0',
    'The three reviewed V2.1 receipts must remain onboarding 2 with payload/canonicalization 2/2.'
  FROM data_values
  UNION ALL
  SELECT 92, 'H_EXISTING_DATA', 'RECEIPT_MARKER_TIMESTAMP_CONSISTENCY',
    CASE WHEN can_run AND receipt_marker_mismatches = 0
      AND markers_without_receipt = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN 'receipt_mismatches=' || receipt_marker_mismatches::text ||
      '; markers_without_receipt=' || markers_without_receipt::text ELSE 'not evaluated' END,
    'receipt_mismatches=0; markers_without_receipt=0',
    'Both directions and exact completion timestamps are checked using counts only.'
  FROM data_values
  UNION ALL
  SELECT 93, 'H_EXISTING_DATA', 'NO_V22_DATA_BACKFILL_OR_REWRITE',
    CASE WHEN can_run AND training_v3 = 0 AND activities_v3 = 0
      AND nutrition_v3 = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN 'training_v3=' || training_v3::text ||
      '; activities_v3=' || activities_v3::text || '; nutrition_v3=' || nutrition_v3::text
      ELSE 'not evaluated' END,
    'training_v3=0; activities_v3=0; nutrition_v3=0',
    'With V2.2 not activated, no historical row may have been backfilled into schema 3.'
  FROM data_values
  UNION ALL
  SELECT 94, 'H_EXISTING_DATA', 'LEGACY_ROWS_MATCH_NEW_CHECK_BRANCHES',
    CASE WHEN can_run AND incompatible_legacy_training = 0
      AND incompatible_legacy_activities = 0 AND incompatible_legacy_nutrition = 0
      THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN 'training=' || incompatible_legacy_training::text ||
      '; activities=' || incompatible_legacy_activities::text ||
      '; nutrition=' || incompatible_legacy_nutrition::text ELSE 'not evaluated' END,
    'training=0; activities=0; nutrition=0',
    'Every historical row remains in the NULL discriminator branch of the new constraints.'
  FROM data_values
  UNION ALL
  SELECT 100, 'I_V22_READINESS', 'SCHEMA3_CONTRACT_READY',
    CASE WHEN c.bad_count = 0 AND t.bad_count = 0
      AND s.initial_level_compatible = 1 AND s.activity_contract_compatible = 1
      THEN 'PASS' ELSE 'FAIL' END,
    'constraints=' || c.bad_count::text || '; triggers=' || t.bad_count::text,
    'constraints=0; triggers=0',
    'Catalog definitions require schema=3 field sets, controlled enums, parent/child version equality, and valid initial level without inserting a row.'
  FROM constraint_facts AS c CROSS JOIN trigger_facts AS t
  CROSS JOIN trigger_function_semantics AS s
  UNION ALL
  SELECT 110, 'J_ACL_SECURITY', 'NO_DANGEROUS_CLIENT_TABLE_PRIVILEGES',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' effective paths', '0 effective paths',
    COALESCE(differences, 'anon/authenticated have no table-wide INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, or MAINTAIN.')
  FROM client_table_grant_facts
  UNION ALL
  SELECT 111, 'J_ACL_SECURITY', 'NO_PUBLIC_WRITE_ACL',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' PUBLIC write entries', '0 entries',
    COALESCE(differences, 'PUBLIC has no scoped write/DDL ACL.')
  FROM public_acl_facts
  UNION ALL
  SELECT 112, 'J_ACL_SECURITY', 'PROTECTED_AND_V22_COLUMN_DENIAL',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' client write paths', '0 paths',
    COALESCE(differences, 'V2 markers and all new V2.2-controlled columns deny client INSERT/UPDATE.')
  FROM protected_column_facts
  UNION ALL
  SELECT 113, 'J_ACL_SECURITY', 'LEGACY_ONBOARDING_COMPLETED_COMPATIBILITY',
    CASE WHEN anon_insert AND anon_update AND NOT authenticated_insert
      AND authenticated_update THEN 'PASS' ELSE 'FAIL' END,
    'anon(insert=' || anon_insert::text || ',update=' || anon_update::text ||
      '); authenticated(insert=' || authenticated_insert::text ||
      ',update=' || authenticated_update::text || ')',
    'anon(insert=true,update=true); authenticated(insert=false,update=true)',
    'The V1 marker remains separate from protected V2/V2.2 state.'
  FROM legacy_marker_facts
  UNION ALL
  SELECT 114, 'J_ACL_SECURITY', 'SERVICE_ROLE_ADMIN_DML_ACCESS',
    CASE WHEN gap_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    gap_count::text || ' scoped access gaps', '0 gaps',
    COALESCE(differences, 'service_role retains the explicit V2.1 SELECT, INSERT, UPDATE, and DELETE grants on profiles, health, nutrition, detail, and receipt tables; training writes remain owner/RPC mediated.')
  FROM service_role_facts
),
check_counts AS (
  SELECT count(*) FILTER (WHERE audit_status = 'PASS') AS pass_count,
    count(*) FILTER (WHERE audit_status = 'WARN') AS warn_count,
    count(*) FILTER (WHERE audit_status = 'FAIL') AS fail_count
  FROM checks
),
final_row AS (
  SELECT 999 AS check_order, 'FINAL'::text AS audit_section,
    'ONBOARDING_V22_PRODUCTION_POSTMIGRATION'::text AS check_name,
    CASE WHEN fail_count > 0 THEN 'FAIL'
      WHEN warn_count > 0 THEN 'WARN' ELSE 'PASS' END::text AS audit_status,
    'PASS=' || pass_count::text || '; WARN=' || warn_count::text ||
      '; FAIL=' || fail_count::text AS observed_value,
    'FAIL=0; human review required'::text AS expected_value,
    CASE WHEN fail_count > 0 THEN 'POSTMIGRATION_DRIFT_DETECTED'
      ELSE 'READY_FOR_HUMAN_POSTMIGRATION_REVIEW' END::text AS details
  FROM check_counts
)
SELECT check_order, audit_section, check_name, audit_status,
  observed_value, expected_value, details
FROM (
  SELECT * FROM checks
  UNION ALL
  SELECT * FROM final_row
) AS consolidated_result
ORDER BY check_order;
