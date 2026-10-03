-- READ-ONLY PRODUCTION AUDIT SUMMARY
-- DO NOT APPLY AS A MIGRATION
-- DO NOT MODIFY DATA OR SCHEMA
-- SAFE TO RUN MANUALLY IN SUPABASE SQL EDITOR
-- ONBOARDING V2.2 PRODUCTION PREFLIGHT CONSOLIDATED SUMMARY
--
-- Returns exactly one result set. Every row is derived from current catalog or
-- aggregate data evidence. Optional-ledger gaps are warnings; schema, data,
-- RLS, ACL, and partial-V2.2 drift are blocking failures. No business RPC is
-- executed and no user-level values are returned.

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
  SELECT
    pg_catalog.to_regclass('supabase_migrations.schema_migrations') AS ledger_oid
),
ledger_access AS (
  SELECT
    ledger_oid,
    COALESCE(pg_catalog.has_table_privilege(ledger_oid, 'SELECT'), false) AS can_read
  FROM ledger_state
),
ledger_snapshot AS (
  SELECT
    ledger_oid,
    can_read,
    CASE WHEN ledger_oid IS NOT NULL AND can_read THEN pg_catalog.query_to_xml(
      'SELECT to_jsonb(m)->>''version'' AS version FROM supabase_migrations.schema_migrations AS m WHERE to_jsonb(m)->>''version'' IN (''20260912000100'',''20260913000200'',''20260913000600'',''20260913000900'',''20260914000200'',''20260914000400'',''20260914000700'',''20260914001000'',''20260914001100'',''20260921000100'',''20260928000100'') ORDER BY to_jsonb(m)->>''version''',
      true, false, ''
    ) ELSE NULL END AS ledger_xml
  FROM ledger_access
),
historical_versions(version) AS (
  VALUES
    ('20260912000100'::text), ('20260913000200'::text),
    ('20260913000600'::text), ('20260913000900'::text),
    ('20260914000200'::text), ('20260914000400'::text),
    ('20260914000700'::text), ('20260914001000'::text),
    ('20260914001100'::text), ('20260921000100'::text)
),
ledger_history AS (
  SELECT
    count(*) FILTER (
      WHERE s.ledger_xml IS NOT NULL
        AND pg_catalog.cardinality(pg_catalog.xpath(
          pg_catalog.format('/table/row[version/text()="%s"]', h.version),
          s.ledger_xml
        )) = 0
    ) AS missing_count,
    pg_catalog.string_agg(h.version, ', ' ORDER BY h.version) FILTER (
      WHERE s.ledger_xml IS NOT NULL
        AND pg_catalog.cardinality(pg_catalog.xpath(
          pg_catalog.format('/table/row[version/text()="%s"]', h.version),
          s.ledger_xml
        )) = 0
    ) AS missing_versions
  FROM historical_versions AS h
  CROSS JOIN ledger_snapshot AS s
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
  SELECT
    e.table_name,
    c.oid,
    c.relkind,
    owner_role.rolname AS owner_name
  FROM expected_relations AS e
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid AND c.relname = e.table_name
  LEFT JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = c.relowner
),
relation_facts AS (
  SELECT
    count(*) FILTER (
      WHERE oid IS NULL OR relkind NOT IN ('r', 'p')
        OR owner_name IN ('anon', 'authenticated', 'service_role')
    ) AS bad_count,
    pg_catalog.string_agg(
      table_name || CASE
        WHEN oid IS NULL THEN '(missing)'
        WHEN relkind NOT IN ('r', 'p') THEN '(wrong-kind)'
        ELSE '(untrusted-owner:' || COALESCE(owner_name, 'unknown') || ')'
      END,
      ', ' ORDER BY table_name
    ) FILTER (
      WHERE oid IS NULL OR relkind NOT IN ('r', 'p')
        OR owner_name IN ('anon', 'authenticated', 'service_role')
    ) AS bad_relations
  FROM relation_actual
),
expected_columns(table_name, column_name, expected_type, expected_nullable) AS (
  VALUES
    ('profiles', 'onboarding_completed', 'boolean', false),
    ('profiles', 'onboarding_version', 'smallint', true),
    ('profiles', 'onboarding_completed_at', 'timestamp with time zone', true),
    ('training_profiles', 'priority_muscles', 'text[]', false),
    ('training_profiles', 'training_experience', 'text', false),
    ('training_profiles', 'exercise_confidence', 'text', false),
    ('training_profiles', 'recent_training_break', 'text', true),
    ('training_profiles', 'available_weekdays', 'smallint[]', false),
    ('training_profiles', 'session_duration_min', 'smallint', false),
    ('training_profiles', 'session_duration_is_plus', 'boolean', false),
    ('training_profiles', 'training_location', 'text', false),
    ('training_profiles', 'available_equipment', 'text[]', false),
    ('training_profiles', 'pain_or_limitation', 'boolean', false),
    ('training_profiles', 'affected_body_areas', 'text[]', false),
    ('training_profile_activities', 'activity_code', 'text', false),
    ('training_profile_activities', 'schedule_type', 'text', false),
    ('training_profile_activities', 'available_weekdays', 'smallint[]', true),
    ('training_profile_activities', 'sessions_per_week', 'smallint', true),
    ('nutrition_profiles', 'meals_per_day', 'smallint', true),
    ('nutrition_profiles', 'food_preparation_style', 'text', false),
    ('nutrition_profiles', 'food_budget_style', 'text', false),
    ('nutrition_profiles', 'meal_schedule_flexibility', 'text', true),
    ('onboarding_completion_receipts', 'user_id', 'uuid', false),
    ('onboarding_completion_receipts', 'onboarding_version', 'smallint', false),
    ('onboarding_completion_receipts', 'idempotency_key', 'uuid', false),
    ('onboarding_completion_receipts', 'payload_hash', 'bytea', false),
    ('onboarding_completion_receipts', 'payload_schema_version', 'smallint', false),
    ('onboarding_completion_receipts', 'canonicalization_version', 'smallint', false),
    ('onboarding_completion_receipts', 'completed_at', 'timestamp with time zone', false)
),
column_comparison AS (
  SELECT
    e.*,
    a.attname IS NOT NULL AS column_exists,
    CASE WHEN a.attname IS NULL THEN NULL
      ELSE pg_catalog.format_type(a.atttypid, a.atttypmod) END AS actual_type,
    CASE WHEN a.attname IS NULL THEN NULL ELSE NOT a.attnotnull END AS actual_nullable,
    COALESCE(a.attidentity, '') AS attidentity,
    COALESCE(a.attgenerated, '') AS attgenerated
  FROM expected_columns AS e
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid AND c.relname = e.table_name
  LEFT JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = c.oid AND a.attname = e.column_name
   AND a.attnum > 0 AND NOT a.attisdropped
),
column_facts AS (
  SELECT
    count(*) FILTER (WHERE NOT column_exists OR actual_type <> expected_type
      OR actual_nullable <> expected_nullable
      OR attidentity <> '' OR attgenerated <> '') AS bad_count,
    pg_catalog.string_agg(
      table_name || '.' || column_name || '(' ||
      CASE WHEN NOT column_exists THEN 'missing'
        ELSE COALESCE(actual_type, 'unknown') || ',' ||
          CASE WHEN actual_nullable THEN 'nullable' ELSE 'not-null' END
      END || ')',
      ', ' ORDER BY table_name, column_name
    ) FILTER (WHERE NOT column_exists OR actual_type <> expected_type
      OR actual_nullable <> expected_nullable
      OR attidentity <> '' OR attgenerated <> '') AS differences
  FROM column_comparison
),
v22_columns(table_name, column_name) AS (
  VALUES
    ('training_profiles'::text, 'onboarding_payload_schema_version'::text),
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
v22_column_facts AS (
  SELECT
    count(a.attname) AS collision_count,
    pg_catalog.string_agg(v.table_name || '.' || v.column_name, ', '
      ORDER BY v.table_name, v.column_name) FILTER (WHERE a.attname IS NOT NULL) AS collisions
  FROM v22_columns AS v
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid AND c.relname = v.table_name
  LEFT JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = c.oid AND a.attname = v.column_name
   AND a.attnum > 0 AND NOT a.attisdropped
),
v22_functions(function_name) AS (
  VALUES
    ('onboarding_v22_assert_object'::text), ('onboarding_v22_enum'::text),
    ('onboarding_v22_label'::text), ('onboarding_v22_set'::text),
    ('canonicalize_onboarding_v22'::text),
    ('training_profile_activities_check_contract'::text),
    ('complete_onboarding_v22'::text)
),
v22_function_facts AS (
  SELECT
    count(p.oid) AS collision_count,
    pg_catalog.string_agg(
      n.nspname || '.' || p.proname || '(' ||
        pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
      ', ' ORDER BY n.nspname, p.proname,
        pg_catalog.pg_get_function_identity_arguments(p.oid)
    ) FILTER (WHERE p.oid IS NOT NULL) AS collisions
  FROM v22_functions AS v
  LEFT JOIN pg_catalog.pg_proc AS p ON p.proname = v.function_name
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
),
v22_constraint_facts AS (
  SELECT
    count(*) AS collision_count,
    pg_catalog.string_agg(n.nspname || '.' || c.relname || '.' || con.conname,
      ', ' ORDER BY n.nspname, c.relname, con.conname) AS collisions
  FROM pg_catalog.pg_constraint AS con
  JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE con.conname IN (
    'training_profiles_contract_check',
    'training_profile_activities_contract_check',
    'nutrition_profiles_contract_check'
  )
),
v22_trigger_facts AS (
  SELECT
    count(*) AS collision_count,
    pg_catalog.string_agg(n.nspname || '.' || c.relname || '.' || tg.tgname,
      ', ' ORDER BY n.nspname, c.relname, tg.tgname) AS collisions
  FROM pg_catalog.pg_trigger AS tg
  JOIN pg_catalog.pg_class AS c ON c.oid = tg.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE NOT tg.tgisinternal
    AND tg.tgname = 'training_profile_activities_check_contract'
),
expected_v21_constraints(table_name, constraint_name, required_fragments) AS (
  VALUES
    ('training_profiles'::text, 'training_profiles_location_check'::text,
      ARRAY['check', 'training_location', 'full_gym', 'home', 'outdoor', 'other']::text[]),
    ('training_profiles', 'training_profiles_equipment_check',
      ARRAY['check', 'training_location', 'full_gym', 'cardinality', 'available_equipment',
        'training_profile_code_set_valid', 'bodyweight', 'dumbbells', 'barbell',
        'weight_plates', 'bench', 'rack', 'cable_machine', 'selectorized_machines',
        'smith_machine', 'leg_press', 'resistance_bands', 'pull_up_bar',
        'kettlebell', 'other']::text[]),
    ('training_profile_activities', 'training_profile_activities_code_check',
      ARRAY['check', 'activity_code', 'running', 'football', 'cycling', 'combat_sports', 'swimming', 'other']::text[]),
    ('training_profile_activities', 'training_profile_activities_schedule_check',
      ARRAY['check', 'schedule_type', 'fixed_weekdays', 'variable',
        'available_weekdays', 'cardinality', 'training_profile_code_set_valid',
        'sessions_per_week', '> 0']::text[]),
    ('nutrition_profiles', 'nutrition_profiles_meal_schedule_flexibility_check',
      ARRAY['check', 'meal_schedule_flexibility', 'limited', 'moderate', 'flexible']::text[])
),
v21_constraint_comparison AS (
  SELECT
    e.table_name,
    e.constraint_name,
    con.oid,
    con.convalidated,
    pg_catalog.lower(COALESCE(pg_catalog.pg_get_constraintdef(con.oid, true), '')) AS definition,
    NOT EXISTS (
      SELECT 1 FROM pg_catalog.unnest(e.required_fragments) AS fragment(value)
      WHERE pg_catalog.strpos(
        pg_catalog.lower(COALESCE(pg_catalog.pg_get_constraintdef(con.oid, true), '')),
        fragment.value
      ) = 0
    ) AS fragments_match
  FROM expected_v21_constraints AS e
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid AND c.relname = e.table_name
  LEFT JOIN pg_catalog.pg_constraint AS con
    ON con.conrelid = c.oid AND con.conname = e.constraint_name
),
v21_constraint_facts AS (
  SELECT
    count(*) FILTER (WHERE oid IS NULL OR NOT COALESCE(convalidated, false)
      OR NOT fragments_match) AS bad_count,
    pg_catalog.string_agg(table_name || '.' || constraint_name, ', '
      ORDER BY table_name, constraint_name) FILTER (
        WHERE oid IS NULL OR NOT COALESCE(convalidated, false) OR NOT fragments_match
      ) AS differences
  FROM v21_constraint_comparison
),
initial_trigger AS (
  SELECT
    tg.oid AS trigger_oid,
    tg.tgenabled::text AS tgenabled,
    tg.tgtype::integer AS tgtype,
    tg.tgisinternal,
    pn.nspname AS function_schema,
    p.proname AS function_name,
    pg_catalog.pg_get_triggerdef(tg.oid, true) AS trigger_definition,
    pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid)) AS function_definition,
    p.proconfig,
    p.prorettype = 'pg_catalog.trigger'::regtype AS returns_trigger
  FROM pg_catalog.pg_trigger AS tg
  JOIN pg_catalog.pg_class AS c ON c.oid = tg.tgrelid
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_catalog.pg_proc AS p ON p.oid = tg.tgfoid
  JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.pronamespace
  WHERE c.relname = 'training_profiles'
    AND tg.tgname = 'training_profiles_set_initial_level'
    AND NOT tg.tgisinternal
),
initial_trigger_facts AS (
  SELECT
    count(*) AS matching_count,
    COALESCE(pg_catalog.bool_and(
      tgenabled = 'O'
      AND function_schema = 'public'
      AND function_name = 'training_profiles_set_initial_level'
      AND returns_trigger
      AND pg_catalog.array_length(proconfig, 1) = 1
      AND proconfig[1] IN ('search_path=', 'search_path=""')
      AND (tgtype & 1) <> 0
      AND (tgtype & 2) <> 0
      AND (tgtype & 4) <> 0
      AND (tgtype & 8) = 0
      AND (tgtype & 16) = 0
      AND (tgtype & 32) = 0
      AND (tgtype & 64) = 0
      AND function_definition LIKE '%new.initial_training_level%'
      AND function_definition LIKE '%new.training_experience%'
      AND function_definition LIKE '%new.exercise_confidence%'
      AND function_definition LIKE '%new.recent_training_break%'
    ), false) AS compatible
  FROM initial_trigger
),
required_helpers(function_schema, function_name, identity_arguments, return_type) AS (
  VALUES
    ('public'::text, 'training_profile_code_set_valid'::text,
      'p_values text[], p_allowed text[]'::text, 'boolean'::text),
    ('public', 'training_profiles_set_initial_level', '', 'trigger'),
    ('public', 'reward_system_set_updated_at', '', 'trigger'),
    ('auth', 'uid', '', 'uuid'),
    ('pg_catalog', 'sha256', 'bytea', 'bytea'),
    ('pg_catalog', 'trim_scale', 'numeric', 'numeric')
),
helper_facts AS (
  SELECT
    count(*) FILTER (WHERE p.oid IS NULL
      OR pg_catalog.pg_get_function_result(p.oid) <> h.return_type) AS bad_count,
    pg_catalog.string_agg(h.function_schema || '.' || h.function_name, ', '
      ORDER BY h.function_schema, h.function_name) FILTER (
        WHERE p.oid IS NULL OR pg_catalog.pg_get_function_result(p.oid) <> h.return_type
      ) AS differences
  FROM required_helpers AS h
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = h.function_schema
  LEFT JOIN pg_catalog.pg_proc AS p
    ON p.pronamespace = n.oid
   AND p.proname = h.function_name
   AND pg_catalog.pg_get_function_identity_arguments(p.oid) = h.identity_arguments
),
rpc_candidates AS (
  SELECT
    p.oid,
    p.proowner,
    owner_role.rolname AS owner_name,
    l.lanname,
    p.prosecdef,
    p.proconfig,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_catalog.pg_get_function_result(p.oid) AS result_type,
    pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid)) AS definition,
    COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner)) AS effective_acl
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
  WHERE n.nspname = 'public' AND p.proname = 'complete_onboarding_v2'
),
rpc_facts AS (
  SELECT
    count(*) AS overload_count,
    count(*) FILTER (
      WHERE identity_arguments = 'p_payload jsonb'
        AND result_type = 'TABLE(result text, onboarding_version smallint, completed_at timestamp with time zone)'
        AND lanname = 'plpgsql' AND prosecdef
        AND pg_catalog.array_length(proconfig, 1) = 1
        AND proconfig[1] IN ('search_path=', 'search_path=""')
        AND owner_name NOT IN ('anon', 'authenticated', 'service_role')
    ) AS structurally_compatible_count,
    pg_catalog.max(owner_name) FILTER (
      WHERE identity_arguments = 'p_payload jsonb'
    ) AS expected_owner
  FROM rpc_candidates
),
rpc_definition_facts AS (
  SELECT
    count(*) FILTER (
      WHERE identity_arguments = 'p_payload jsonb'
        AND definition LIKE '%auth.uid()%'
        AND definition LIKE '%public.onboarding_completion_receipts%'
        AND definition LIKE '%payload_schema_version%'
        AND definition LIKE '%canonicalization_version%'
        AND definition LIKE '%for update%'
        AND definition LIKE '%onboarding_completed = true%'
        AND definition LIKE '%onboarding_version = 2%'
        AND definition NOT LIKE '%complete_onboarding_v22%'
    ) AS compatible_count
  FROM rpc_candidates
),
rpc_grant_facts AS (
  SELECT
    COALESCE(pg_catalog.bool_and(
      pg_catalog.has_function_privilege(r.oid, rpc.oid, 'EXECUTE') =
        (r.rolname IN ('authenticated', 'service_role'))
    ), false) AS named_roles_match,
    COALESCE(pg_catalog.bool_and(NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(rpc.effective_acl) AS acl
      WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    )), false) AS public_cannot_execute
  FROM rpc_candidates AS rpc
  CROSS JOIN pg_catalog.pg_roles AS r
  WHERE rpc.identity_arguments = 'p_payload jsonb'
    AND r.rolname IN ('anon', 'authenticated', 'service_role')
),
expected_receipt_columns(column_name, expected_type, expected_nullable) AS (
  VALUES
    ('user_id'::text, 'uuid'::text, false),
    ('onboarding_version', 'smallint', false),
    ('idempotency_key', 'uuid', false),
    ('payload_hash', 'bytea', false),
    ('payload_schema_version', 'smallint', false),
    ('canonicalization_version', 'smallint', false),
    ('completed_at', 'timestamp with time zone', false)
),
receipt_column_facts AS (
  SELECT
    count(*) FILTER (WHERE a.attname IS NULL
      OR pg_catalog.format_type(a.atttypid, a.atttypmod) <> e.expected_type
      OR (NOT a.attnotnull) <> e.expected_nullable) AS bad_count,
    pg_catalog.string_agg(e.column_name, ', ' ORDER BY e.column_name) FILTER (
      WHERE a.attname IS NULL
        OR pg_catalog.format_type(a.atttypid, a.atttypmod) <> e.expected_type
        OR (NOT a.attnotnull) <> e.expected_nullable
    ) AS differences
  FROM expected_receipt_columns AS e
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid AND c.relname = 'onboarding_completion_receipts'
  LEFT JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = c.oid AND a.attname = e.column_name
   AND a.attnum > 0 AND NOT a.attisdropped
),
expected_receipt_constraints(constraint_name, constraint_type, fragments) AS (
  VALUES
    ('onboarding_completion_receipts_pkey'::text, 'p'::char,
      ARRAY['primary key', 'user_id', 'onboarding_version']::text[]),
    ('onboarding_completion_receipts_user_key_unique', 'u'::char,
      ARRAY['unique', 'user_id', 'idempotency_key']::text[]),
    ('onboarding_completion_receipts_user_fk', 'f'::char,
      ARRAY['foreign key', 'user_id', 'auth.users', 'on delete cascade']::text[]),
    ('onboarding_completion_receipts_version_positive', 'c'::char,
      ARRAY['check', 'onboarding_version', '> 0']::text[]),
    ('onboarding_completion_receipts_payload_schema_positive', 'c'::char,
      ARRAY['check', 'payload_schema_version', '> 0']::text[]),
    ('onboarding_completion_receipts_canonicalization_positive', 'c'::char,
      ARRAY['check', 'canonicalization_version', '> 0']::text[]),
    ('onboarding_completion_receipts_hash_length_check', 'c'::char,
      ARRAY['check', 'octet_length(payload_hash)', '= 32']::text[])
),
receipt_constraint_comparison AS (
  SELECT
    e.constraint_name,
    con.oid,
    con.contype,
    con.convalidated,
    NOT EXISTS (
      SELECT 1 FROM pg_catalog.unnest(e.fragments) AS fragment(value)
      WHERE pg_catalog.strpos(
        pg_catalog.lower(COALESCE(pg_catalog.pg_get_constraintdef(con.oid, true), '')),
        fragment.value
      ) = 0
    ) AS fragments_match,
    e.constraint_type
  FROM expected_receipt_constraints AS e
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid AND c.relname = 'onboarding_completion_receipts'
  LEFT JOIN pg_catalog.pg_constraint AS con
    ON con.conrelid = c.oid AND con.conname = e.constraint_name
),
receipt_constraint_facts AS (
  SELECT
    count(*) FILTER (WHERE oid IS NULL OR contype <> constraint_type
      OR NOT COALESCE(convalidated, false) OR NOT fragments_match) AS bad_count,
    pg_catalog.string_agg(constraint_name, ', ' ORDER BY constraint_name) FILTER (
      WHERE oid IS NULL OR contype <> constraint_type
        OR NOT COALESCE(convalidated, false) OR NOT fragments_match
    ) AS differences
  FROM receipt_constraint_comparison
),
data_guard AS (
  SELECT
    (SELECT bad_count = 0 FROM relation_facts)
    AND (SELECT bad_count = 0 FROM column_facts)
    AND (SELECT bad_count = 0 FROM helper_facts)
    AND COALESCE(pg_catalog.bool_and(
      pg_catalog.has_table_privilege(a.oid, 'SELECT')
    ), false) AS can_run
  FROM relation_actual AS a
  WHERE a.table_name IN (
    'profiles', 'training_profiles', 'training_profile_activities',
    'nutrition_profiles', 'onboarding_completion_receipts'
  )
),
data_snapshot AS (
  SELECT
    can_run,
    CASE WHEN can_run THEN pg_catalog.query_to_xml($data$
      SELECT
        (SELECT count(*) FROM public.onboarding_completion_receipts) AS receipts_total,
        (SELECT count(*) FROM public.onboarding_completion_receipts
          WHERE onboarding_version = 2) AS receipts_v2,
        (SELECT count(*) FROM public.onboarding_completion_receipts
          WHERE onboarding_version = 2 AND payload_schema_version = 2
            AND canonicalization_version = 2) AS receipts_v2_2_2,
        (SELECT count(*) FROM public.onboarding_completion_receipts
          WHERE onboarding_version <> 2 OR payload_schema_version <> 2
            OR canonicalization_version <> 2) AS unexpected_receipt_combinations,
        (SELECT count(*) FROM public.onboarding_completion_receipts AS r
          LEFT JOIN public.profiles AS p ON p.user_id = r.user_id
          WHERE r.onboarding_version = 2 AND (
            p.user_id IS NULL OR p.onboarding_completed IS DISTINCT FROM true
            OR p.onboarding_version IS DISTINCT FROM 2
            OR p.onboarding_completed_at IS DISTINCT FROM r.completed_at
          )) AS receipts_without_matching_markers,
        (SELECT count(*) FROM public.profiles AS p
          WHERE p.onboarding_completed IS TRUE AND p.onboarding_version = 2
            AND NOT EXISTS (
              SELECT 1 FROM public.onboarding_completion_receipts AS r
              WHERE r.user_id = p.user_id AND r.onboarding_version = 2
            )) AS markers_without_receipt,
        (SELECT count(*) FROM public.training_profiles AS t
          WHERE NOT (
            t.priority_muscles IS NOT NULL
            AND t.training_experience IS NOT NULL
            AND t.exercise_confidence IS NOT NULL
            AND t.available_weekdays IS NOT NULL
            AND t.session_duration_min IS NOT NULL
            AND t.session_duration_is_plus IS NOT NULL
            AND t.pain_or_limitation IS NOT NULL
            AND t.affected_body_areas IS NOT NULL
            AND t.training_location <> 'simple_gym'
          )) AS future_training_incompatible,
        (SELECT count(*) FROM public.training_profile_activities AS a
          WHERE NOT (
            a.activity_code <> 'walking'
            AND (
              (a.schedule_type = 'fixed_weekdays'
                AND a.available_weekdays IS NOT NULL
                AND pg_catalog.cardinality(a.available_weekdays) >= 1
                AND COALESCE(pg_catalog.array_ndims(a.available_weekdays), 1) = 1
                AND COALESCE(pg_catalog.array_lower(a.available_weekdays, 1), 1) = 1
                AND a.available_weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
                AND pg_catalog.cardinality(a.available_weekdays) = (
                  SELECT count(DISTINCT days.day_value)
                  FROM pg_catalog.unnest(a.available_weekdays) AS days(day_value)
                )
                AND a.sessions_per_week IS NULL)
              OR
              (a.schedule_type = 'variable'
                AND a.available_weekdays IS NULL
                AND a.sessions_per_week IS NOT NULL
                AND a.sessions_per_week > 0)
            )
          )) AS future_activity_incompatible,
        (SELECT count(*) FROM public.nutrition_profiles AS n
          WHERE NOT (n.food_preparation_style IS NOT NULL
            AND n.food_budget_style IS NOT NULL)) AS future_nutrition_incompatible
    $data$, true, false, '') ELSE NULL END AS data_xml
  FROM data_guard
),
data_values AS (
  SELECT
    can_run,
    COALESCE(((pg_catalog.xpath('/table/row/receipts_total/text()', data_xml))[1]::text)::bigint, 0) AS receipts_total,
    COALESCE(((pg_catalog.xpath('/table/row/receipts_v2/text()', data_xml))[1]::text)::bigint, 0) AS receipts_v2,
    COALESCE(((pg_catalog.xpath('/table/row/receipts_v2_2_2/text()', data_xml))[1]::text)::bigint, 0) AS receipts_v2_2_2,
    COALESCE(((pg_catalog.xpath('/table/row/unexpected_receipt_combinations/text()', data_xml))[1]::text)::bigint, 0) AS unexpected_receipt_combinations,
    COALESCE(((pg_catalog.xpath('/table/row/receipts_without_matching_markers/text()', data_xml))[1]::text)::bigint, 0) AS receipts_without_matching_markers,
    COALESCE(((pg_catalog.xpath('/table/row/markers_without_receipt/text()', data_xml))[1]::text)::bigint, 0) AS markers_without_receipt,
    COALESCE(((pg_catalog.xpath('/table/row/future_training_incompatible/text()', data_xml))[1]::text)::bigint, 0) AS future_training_incompatible,
    COALESCE(((pg_catalog.xpath('/table/row/future_activity_incompatible/text()', data_xml))[1]::text)::bigint, 0) AS future_activity_incompatible,
    COALESCE(((pg_catalog.xpath('/table/row/future_nutrition_incompatible/text()', data_xml))[1]::text)::bigint, 0) AS future_nutrition_incompatible
  FROM data_snapshot
),
rls_facts AS (
  SELECT
    count(*) FILTER (WHERE a.oid IS NULL OR NOT COALESCE(c.relrowsecurity, false)) AS bad_count,
    pg_catalog.string_agg(a.table_name, ', ' ORDER BY a.table_name) FILTER (
      WHERE a.oid IS NULL OR NOT COALESCE(c.relrowsecurity, false)
    ) AS differences
  FROM relation_actual AS a
  LEFT JOIN pg_catalog.pg_class AS c ON c.oid = a.oid
),
expected_policies(table_name, command) AS (
  VALUES
    ('user_health_profiles'::text, 'r'::char),
    ('user_health_profiles', 'a'::char),
    ('user_health_profiles', 'w'::char),
    ('training_profiles', 'r'::char),
    ('training_profiles', 'a'::char),
    ('training_profiles', 'w'::char),
    ('training_profile_activities', 'r'::char),
    ('training_profile_activities', 'a'::char),
    ('training_profile_activities', 'w'::char),
    ('nutrition_profiles', 'r'::char),
    ('nutrition_profiles', 'a'::char),
    ('nutrition_profiles', 'w'::char),
    ('nutrition_profile_restrictions', 'r'::char),
    ('nutrition_profile_restrictions', 'a'::char),
    ('nutrition_profile_restrictions', 'w'::char),
    ('nutrition_profile_disliked_foods', 'r'::char),
    ('nutrition_profile_disliked_foods', 'a'::char),
    ('nutrition_profile_disliked_foods', 'w'::char),
    ('nutrition_profile_preferred_foods', 'r'::char),
    ('nutrition_profile_preferred_foods', 'a'::char),
    ('nutrition_profile_preferred_foods', 'w'::char),
    ('nutrition_profile_supplements', 'r'::char),
    ('nutrition_profile_supplements', 'a'::char),
    ('nutrition_profile_supplements', 'w'::char),
    ('onboarding_completion_receipts', 'r'::char)
),
policy_comparison AS (
  SELECT
    e.table_name,
    e.command,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_namespace AS n
      JOIN pg_catalog.pg_class AS c
        ON c.relnamespace = n.oid AND c.relname = e.table_name
      JOIN pg_catalog.pg_policy AS pol ON pol.polrelid = c.oid
      JOIN pg_catalog.pg_roles AS auth_role ON auth_role.rolname = 'authenticated'
      WHERE n.nspname = 'public'
        AND pol.polcmd = e.command
        AND pol.polpermissive
        AND COALESCE(pg_catalog.array_length(pol.polroles, 1), 0) = 1
        AND auth_role.oid = ANY(pol.polroles)
        AND (e.command NOT IN ('r', 'w') OR (
          pg_catalog.lower(COALESCE(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')) LIKE '%uid()%'
          AND pg_catalog.lower(COALESCE(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')) LIKE '%user_id%'
        ))
        AND (e.command NOT IN ('a', 'w') OR (
          pg_catalog.lower(COALESCE(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')) LIKE '%uid()%'
          AND pg_catalog.lower(COALESCE(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')) LIKE '%user_id%'
        ))
    ) AS compatible_policy_exists
  FROM expected_policies AS e
),
policy_facts AS (
  SELECT
    count(*) FILTER (WHERE NOT compatible_policy_exists) AS bad_count,
    pg_catalog.string_agg(
      table_name || ':' || CASE command
        WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
        ELSE command::text END,
      ', ' ORDER BY table_name, command
    ) FILTER (WHERE NOT compatible_policy_exists) AS differences
  FROM policy_comparison
),
dangerous_policy_facts AS (
  SELECT
    count(DISTINCT (c.oid, pol.oid)) AS bad_count,
    pg_catalog.string_agg(DISTINCT c.relname::text || '.' || pol.polname::text, ', '
      ORDER BY c.relname::text || '.' || pol.polname::text) AS differences
  FROM pg_catalog.pg_policy AS pol
  JOIN pg_catalog.pg_class AS c ON c.oid = pol.polrelid
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN pg_catalog.pg_roles AS client_role
  WHERE c.relname IN (SELECT table_name FROM expected_relations)
    AND client_role.rolname IN ('anon', 'authenticated')
    AND pol.polpermissive
    AND pol.polcmd IN ('a', 'w', 'd', '*')
    AND (
      0 = ANY(pol.polroles)
      OR client_role.oid = ANY(pol.polroles)
    )
    AND (
      (pol.polcmd IN ('a', '*') AND (
        pg_catalog.has_table_privilege(client_role.oid, c.oid, 'INSERT')
        OR pg_catalog.has_any_column_privilege(client_role.oid, c.oid, 'INSERT')
      ))
      OR (pol.polcmd IN ('w', '*') AND (
        pg_catalog.has_table_privilege(client_role.oid, c.oid, 'UPDATE')
        OR pg_catalog.has_any_column_privilege(client_role.oid, c.oid, 'UPDATE')
      ))
      OR (pol.polcmd IN ('d', '*')
        AND pg_catalog.has_table_privilege(client_role.oid, c.oid, 'DELETE'))
    )
    AND (
      (pol.polcmd IN ('w', 'd', '*') AND NOT (
        pg_catalog.lower(COALESCE(
          pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), ''
        )) LIKE '%uid()%'
        AND pg_catalog.lower(COALESCE(
          pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), ''
        )) LIKE '%user_id%'
      ))
      OR (pol.polcmd IN ('a', 'w', '*') AND NOT (
        pg_catalog.lower(COALESCE(
          pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid),
          pg_catalog.pg_get_expr(pol.polqual, pol.polrelid),
          ''
        )) LIKE '%uid()%'
        AND pg_catalog.lower(COALESCE(
          pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid),
          pg_catalog.pg_get_expr(pol.polqual, pol.polrelid),
          ''
        )) LIKE '%user_id%'
      ))
    )
),
client_table_grants AS (
  SELECT
    r.rolname::text AS role_name,
    a.table_name,
    privilege.privilege_name
  FROM relation_actual AS a
  CROSS JOIN pg_catalog.pg_roles AS r
  CROSS JOIN (VALUES
    ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text),
    ('TRUNCATE'::text), ('REFERENCES'::text), ('TRIGGER'::text),
    ('MAINTAIN'::text)
  ) AS privilege(privilege_name)
  WHERE a.oid IS NOT NULL AND r.rolname IN ('anon', 'authenticated')
    AND pg_catalog.has_table_privilege(
      r.oid, a.oid, privilege.privilege_name
    )
),
client_table_grant_facts AS (
  SELECT
    count(*) AS bad_count,
    pg_catalog.string_agg(
      role_name || ':' || table_name || ':' || privilege_name,
      ', ' ORDER BY role_name, table_name, privilege_name
    ) AS differences
  FROM client_table_grants
),
protected_columns(table_name, column_name) AS (
  VALUES
    ('profiles'::text, 'onboarding_version'::text),
    ('profiles', 'onboarding_completed_at'),
    ('onboarding_completion_receipts', 'user_id'),
    ('onboarding_completion_receipts', 'onboarding_version'),
    ('onboarding_completion_receipts', 'idempotency_key'),
    ('onboarding_completion_receipts', 'payload_hash'),
    ('onboarding_completion_receipts', 'payload_schema_version'),
    ('onboarding_completion_receipts', 'canonicalization_version'),
    ('onboarding_completion_receipts', 'completed_at')
),
client_column_grant_facts AS (
  SELECT
    count(*) FILTER (
      WHERE pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, 'INSERT')
         OR pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, 'UPDATE')
    ) AS bad_count,
    pg_catalog.string_agg(r.rolname || ':' || p.table_name || '.' || p.column_name,
      ', ' ORDER BY r.rolname, p.table_name, p.column_name) FILTER (
      WHERE pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, 'INSERT')
         OR pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, 'UPDATE')
    ) AS differences
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
legacy_marker_grant_facts AS (
  SELECT
    pg_catalog.has_column_privilege(
      'anon', 'public.profiles', 'onboarding_completed', 'INSERT'
    ) AS anon_can_insert,
    pg_catalog.has_column_privilege(
      'anon', 'public.profiles', 'onboarding_completed', 'UPDATE'
    ) AS anon_can_update,
    pg_catalog.has_column_privilege(
      'authenticated', 'public.profiles', 'onboarding_completed', 'INSERT'
    ) AS authenticated_can_insert,
    pg_catalog.has_column_privilege(
      'authenticated', 'public.profiles', 'onboarding_completed', 'UPDATE'
    ) AS authenticated_can_update
),
public_acl_facts AS (
  SELECT
    count(*) AS bad_count,
    pg_catalog.string_agg(c.relname || ':' || acl.privilege_type, ', '
      ORDER BY c.relname, acl.privilege_type) AS differences
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
  ) AS acl
  WHERE c.relname IN (SELECT table_name FROM expected_relations)
    AND acl.grantee = 0
    AND acl.privilege_type IN (
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
      'REFERENCES', 'TRIGGER', 'MAINTAIN'
    )
),
service_role_access_facts AS (
  SELECT
    count(*) FILTER (
      WHERE r.oid IS NULL
         OR NOT pg_catalog.has_table_privilege(r.oid, a.oid, 'SELECT')
         OR NOT pg_catalog.has_table_privilege(r.oid, a.oid, 'INSERT')
         OR NOT pg_catalog.has_table_privilege(r.oid, a.oid, 'UPDATE')
         OR NOT pg_catalog.has_table_privilege(r.oid, a.oid, 'DELETE')
    ) AS gap_count,
    pg_catalog.string_agg(a.table_name, ', ' ORDER BY a.table_name) FILTER (
      WHERE r.oid IS NULL
         OR NOT pg_catalog.has_table_privilege(r.oid, a.oid, 'SELECT')
         OR NOT pg_catalog.has_table_privilege(r.oid, a.oid, 'INSERT')
         OR NOT pg_catalog.has_table_privilege(r.oid, a.oid, 'UPDATE')
         OR NOT pg_catalog.has_table_privilege(r.oid, a.oid, 'DELETE')
    ) AS differences
  FROM relation_actual AS a
  LEFT JOIN pg_catalog.pg_roles AS r ON r.rolname = 'service_role'
  WHERE a.oid IS NOT NULL
),
owner_privilege_facts AS (
  SELECT
    count(*) FILTER (
      WHERE rpc.owner_name IN ('anon', 'authenticated', 'service_role')
         OR a.oid IS NULL
         OR NOT pg_catalog.has_table_privilege(rpc.proowner, a.oid, 'SELECT')
         OR (a.table_name = 'profiles'
           AND NOT pg_catalog.has_table_privilege(rpc.proowner, a.oid, 'UPDATE'))
         OR (a.table_name <> 'profiles'
           AND NOT pg_catalog.has_table_privilege(rpc.proowner, a.oid, 'INSERT'))
    ) AS bad_table_count,
    pg_catalog.string_agg(a.table_name, ', ' ORDER BY a.table_name) FILTER (
      WHERE rpc.owner_name IN ('anon', 'authenticated', 'service_role')
         OR a.oid IS NULL
         OR NOT pg_catalog.has_table_privilege(rpc.proowner, a.oid, 'SELECT')
         OR (a.table_name = 'profiles'
           AND NOT pg_catalog.has_table_privilege(rpc.proowner, a.oid, 'UPDATE'))
         OR (a.table_name <> 'profiles'
           AND NOT pg_catalog.has_table_privilege(rpc.proowner, a.oid, 'INSERT'))
    ) AS table_differences,
    COALESCE(pg_catalog.bool_and(
      pg_catalog.has_schema_privilege(rpc.proowner, 'auth', 'USAGE')
      AND pg_catalog.has_function_privilege(rpc.proowner, auth_uid.oid, 'EXECUTE')
    ), false) AS identity_privileges_ok
  FROM rpc_candidates AS rpc
  CROSS JOIN relation_actual AS a
  LEFT JOIN pg_catalog.pg_namespace AS auth_n ON auth_n.nspname = 'auth'
  LEFT JOIN pg_catalog.pg_proc AS auth_uid
    ON auth_uid.pronamespace = auth_n.oid AND auth_uid.proname = 'uid'
   AND pg_catalog.pg_get_function_identity_arguments(auth_uid.oid) = ''
  WHERE rpc.identity_arguments = 'p_payload jsonb'
),
checks(check_order, audit_section, check_name, audit_status,
       observed_value, expected_value, details) AS (
  SELECT 10, 'A_LEDGER', 'REQUIRED_ROLES',
    CASE WHEN missing_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    missing_count::text || ' missing', '0 missing',
    COALESCE(missing_names, 'anon, authenticated, and service_role exist')
  FROM role_facts
  UNION ALL
  SELECT 20, 'A_LEDGER', 'MIGRATION_LEDGER_AVAILABILITY',
    CASE WHEN ledger_oid IS NOT NULL AND can_read THEN 'PASS' ELSE 'WARN' END,
    CASE WHEN ledger_oid IS NULL THEN 'unavailable'
      WHEN NOT can_read THEN 'not readable' ELSE 'available and readable' END,
    'available and readable when exposed',
    CASE WHEN ledger_oid IS NULL THEN 'Optional ledger unavailable; schema evidence remains authoritative.'
      WHEN NOT can_read THEN 'Optional ledger unreadable; schema evidence remains authoritative.'
      ELSE 'Optional migration ledger can be inspected.' END
  FROM ledger_snapshot
  UNION ALL
  SELECT 21, 'A_LEDGER', 'V2_V21_LEDGER_HISTORY',
    CASE WHEN s.ledger_xml IS NULL OR h.missing_count > 0 THEN 'WARN' ELSE 'PASS' END,
    CASE WHEN s.ledger_xml IS NULL THEN 'not verifiable'
      ELSE h.missing_count::text || ' expected historical versions absent' END,
    'historical versions present when ledger is authoritative',
    CASE WHEN s.ledger_xml IS NULL THEN 'Optional ledger history unavailable; use schema evidence.'
      WHEN h.missing_count > 0 THEN 'Historical ledger gaps (non-blocking): ' || h.missing_versions
      ELSE 'All listed V2/V2.1 versions are present in the optional ledger.' END
  FROM ledger_snapshot AS s CROSS JOIN ledger_history AS h
  UNION ALL
  SELECT 22, 'A_LEDGER', 'V22_LEDGER_EXPECTED_ABSENT',
    CASE WHEN ledger_xml IS NULL THEN 'WARN'
      WHEN pg_catalog.cardinality(pg_catalog.xpath(
        '/table/row[version/text()="20260928000100"]', ledger_xml)) = 0 THEN 'PASS'
      ELSE 'FAIL' END,
    CASE WHEN ledger_xml IS NULL THEN 'not verifiable'
      WHEN pg_catalog.cardinality(pg_catalog.xpath(
        '/table/row[version/text()="20260928000100"]', ledger_xml)) = 0
        THEN 'absent' ELSE 'present' END,
    'absent',
    'The V2.2 migration version must not already be recorded.'
  FROM ledger_snapshot
  UNION ALL
  SELECT 30, 'B_REQUIRED_RELATIONS', 'REQUIRED_RELATIONS_SHAPE_AND_OWNER',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' incompatible of 10', '0 incompatible of 10',
    COALESCE(bad_relations, 'All required public relations exist as tables with trusted owners.')
  FROM relation_facts
  UNION ALL
  SELECT 40, 'C_V21_BASELINE_COLUMNS', 'V21_PREREQUISITE_COLUMN_SHAPES',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' incompatible of 29', '0 incompatible of 29',
    COALESCE(differences, 'Required V2.1 column types and nullability match the audited baseline.')
  FROM column_facts
  UNION ALL
  SELECT 50, 'D_V22_COLLISIONS', 'V22_COLUMNS_EXPECTED_ABSENT',
    CASE WHEN collision_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    collision_count::text || ' collisions', '0 collisions',
    COALESCE(collisions, 'All 12 V2.2 columns are absent.')
  FROM v22_column_facts
  UNION ALL
  SELECT 51, 'D_V22_COLLISIONS', 'V22_FUNCTIONS_EXPECTED_ABSENT',
    CASE WHEN collision_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    collision_count::text || ' collisions', '0 collisions',
    COALESCE(collisions, 'All exact V2.2 function/helper names are absent across schemas.')
  FROM v22_function_facts
  UNION ALL
  SELECT 52, 'D_V22_COLLISIONS', 'V22_CONSTRAINTS_AND_TRIGGER_EXPECTED_ABSENT',
    CASE WHEN c.collision_count + t.collision_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    (c.collision_count + t.collision_count)::text || ' collisions', '0 collisions',
    COALESCE(c.collisions, '') || CASE WHEN c.collisions IS NOT NULL AND t.collisions IS NOT NULL THEN '; ' ELSE '' END ||
      COALESCE(t.collisions, CASE WHEN c.collisions IS NULL THEN 'V2.2 constraints and trigger are absent.' ELSE '' END)
  FROM v22_constraint_facts AS c CROSS JOIN v22_trigger_facts AS t
  UNION ALL
  SELECT 60, 'E_V21_CONSTRAINTS', 'V21_DEPENDENCY_CONSTRAINTS',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' incompatible of 5', '0 incompatible of 5',
    COALESCE(differences, 'All constraints V2.2 replaces, removes, or preserves are present and compatible.')
  FROM v21_constraint_facts
  UNION ALL
  SELECT 70, 'F_INITIAL_LEVEL_TRIGGER', 'TRAINING_PROFILES_SET_INITIAL_LEVEL',
    CASE WHEN matching_count = 1 AND compatible THEN 'PASS' ELSE 'FAIL' END,
    matching_count::text || ' matching trigger; compatible=' || compatible::text,
    '1 matching enabled baseline trigger; compatible=true',
    'Checks table, timing/event, enabled state, trigger function, search_path, return type, and baseline derivation signals.'
  FROM initial_trigger_facts
  UNION ALL
  SELECT 71, 'F_INITIAL_LEVEL_TRIGGER', 'REQUIRED_HELPERS_AND_PLATFORM_FUNCTIONS',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' incompatible of 6', '0 incompatible of 6',
    COALESCE(differences, 'All required V2.1 helper and platform function signatures exist.')
  FROM helper_facts
  UNION ALL
  SELECT 80, 'G_COMPLETE_ONBOARDING_V2', 'RPC_STRUCTURE_OWNER_AND_RUNTIME_CONFIG',
    CASE WHEN overload_count = 1 AND structurally_compatible_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    overload_count::text || ' overloads; compatible=' || structurally_compatible_count::text ||
      '; owner=' || COALESCE(expected_owner, 'none'),
    '1 overload; compatible=1; trusted owner',
    'Requires jsonb signature, expected table return, PL/pgSQL, SECURITY DEFINER, and empty search_path.'
  FROM rpc_facts
  UNION ALL
  SELECT 81, 'G_COMPLETE_ONBOARDING_V2', 'RPC_BASELINE_DEFINITION_SIGNALS',
    CASE WHEN compatible_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    compatible_count::text || ' compatible definitions', '1 compatible definition',
    'Definition is inspected only; required V2.1 receipt, locking, identity, and completion-marker signals must be present.'
  FROM rpc_definition_facts
  UNION ALL
  SELECT 82, 'G_COMPLETE_ONBOARDING_V2', 'RPC_EFFECTIVE_EXECUTE_GRANTS',
    CASE WHEN named_roles_match AND public_cannot_execute THEN 'PASS' ELSE 'FAIL' END,
    'named_roles_match=' || named_roles_match::text || '; public_denied=' || public_cannot_execute::text,
    'anon=false; authenticated=true; service_role=true; PUBLIC=false',
    'Effective role privileges include inherited grants; PUBLIC is checked from the effective ACL.'
  FROM rpc_grant_facts
  UNION ALL
  SELECT 90, 'H_RECEIPT_STRUCTURE', 'RECEIPT_COLUMNS',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' incompatible of 7', '0 incompatible of 7',
    COALESCE(differences, 'Receipt column types and nullability match the baseline.')
  FROM receipt_column_facts
  UNION ALL
  SELECT 91, 'H_RECEIPT_STRUCTURE', 'RECEIPT_KEYS_AND_CONSTRAINTS',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' incompatible of 7', '0 incompatible of 7',
    COALESCE(differences, 'Receipt PK, unique key, FK, and validated checks match material baseline semantics.')
  FROM receipt_constraint_facts
  UNION ALL
  SELECT 100, 'I_RECEIPT_DATA', 'AGGREGATE_DATA_AUDIT_AVAILABILITY',
    CASE WHEN can_run THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN 'available' ELSE 'unavailable' END, 'available',
    CASE WHEN can_run THEN 'Guarded aggregate data checks executed without returning row-level values.'
      ELSE 'Required relation, column, helper, or SELECT prerequisite is missing; aggregate consistency cannot be certified.' END
  FROM data_values
  UNION ALL
  SELECT 101, 'I_RECEIPT_DATA', 'RECEIPT_VERSION_COMBINATIONS',
    CASE WHEN can_run AND unexpected_receipt_combinations = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN 'total=' || receipts_total::text || '; v2=' || receipts_v2::text ||
      '; v2_schema2_canonical2=' || receipts_v2_2_2::text ||
      '; unexpected=' || unexpected_receipt_combinations::text ELSE 'not evaluated' END,
    'unexpected=0',
    'Only aggregate counts are returned; pre-V2.2 receipts must use onboarding/schema/canonicalization 2/2/2.'
  FROM data_values
  UNION ALL
  SELECT 102, 'I_RECEIPT_DATA', 'RECEIPT_MARKER_AND_TIMESTAMP_CONSISTENCY',
    CASE WHEN can_run AND receipts_without_matching_markers = 0
      AND markers_without_receipt = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN 'receipt_mismatches=' || receipts_without_matching_markers::text ||
      '; markers_without_receipt=' || markers_without_receipt::text ELSE 'not evaluated' END,
    'receipt_mismatches=0; markers_without_receipt=0',
    'Checks both directions, completion flags/version, and exact completion timestamp equality using counts only.'
  FROM data_values
  UNION ALL
  SELECT 110, 'J_FUTURE_V22_COMPATIBILITY', 'TRAINING_PROFILE_EXISTING_ROWS',
    CASE WHEN can_run AND future_training_incompatible = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN future_training_incompatible::text ELSE 'not evaluated' END,
    '0 incompatible rows', 'Pre-V2.2 branch of the future training profile contract.'
  FROM data_values
  UNION ALL
  SELECT 111, 'J_FUTURE_V22_COMPATIBILITY', 'ACTIVITY_EXISTING_ROWS',
    CASE WHEN can_run AND future_activity_incompatible = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN future_activity_incompatible::text ELSE 'not evaluated' END,
    '0 incompatible rows', 'Pre-V2.2 branch of the future activity contract, inlined without calling a helper.'
  FROM data_values
  UNION ALL
  SELECT 112, 'J_FUTURE_V22_COMPATIBILITY', 'NUTRITION_EXISTING_ROWS',
    CASE WHEN can_run AND future_nutrition_incompatible = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN future_nutrition_incompatible::text ELSE 'not evaluated' END,
    '0 incompatible rows', 'Pre-V2.2 branch of the future nutrition contract.'
  FROM data_values
  UNION ALL
  SELECT 120, 'K_RLS', 'RLS_ENABLED_ON_SCOPED_TABLES',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' missing/disabled of 10', '0 missing/disabled of 10',
    COALESCE(differences, 'RLS is enabled on every scoped table.')
  FROM rls_facts
  UNION ALL
  SELECT 121, 'L_POLICIES', 'EXPECTED_OWN_USER_POLICIES',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' incompatible of 25', '0 incompatible of 25',
    COALESCE(differences, 'Expected authenticated own-user policies match command, role, and identity predicates.')
  FROM policy_facts
  UNION ALL
  SELECT 122, 'L_POLICIES', 'NO_UNSCOPED_PUBLIC_OR_ANON_MUTATION_POLICY',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' dangerous policies', '0 dangerous policies',
    COALESCE(differences, 'Every effective permissive PUBLIC/anon mutation policy is identity-scoped.')
  FROM dangerous_policy_facts
  UNION ALL
  SELECT 130, 'M_GRANTS_ACL', 'NO_DANGEROUS_CLIENT_TABLE_PRIVILEGES',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' effective table-wide write paths', '0 write paths',
    COALESCE(differences, 'anon/authenticated have no table-wide INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, or MAINTAIN on scoped tables.')
  FROM client_table_grant_facts
  UNION ALL
  SELECT 131, 'M_GRANTS_ACL', 'PROTECTED_COLUMN_WRITE_DENIAL',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' effective protected-column write paths', '0 write paths',
    COALESCE(differences, 'anon/authenticated cannot write V2 markers or receipt columns, including via inheritance.')
  FROM client_column_grant_facts
  UNION ALL
  SELECT 132, 'M_GRANTS_ACL', 'LEGACY_ONBOARDING_COMPLETED_COMPATIBILITY',
    CASE WHEN anon_can_insert AND anon_can_update
      AND NOT authenticated_can_insert AND authenticated_can_update
      THEN 'PASS' ELSE 'FAIL' END,
    'anon(insert=' || anon_can_insert::text || ',update=' || anon_can_update::text ||
      '); authenticated(insert=' || authenticated_can_insert::text ||
      ',update=' || authenticated_can_update::text || ')',
    'anon(insert=true,update=true); authenticated(insert=false,update=true)',
    'onboarding_completed is the audited V1 compatibility marker; onboarding_version and onboarding_completed_at remain protected separately.'
  FROM legacy_marker_grant_facts
  UNION ALL
  SELECT 133, 'M_GRANTS_ACL', 'NO_PUBLIC_WRITE_ACL',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' PUBLIC write ACL entries', '0 write ACL entries',
    COALESCE(differences, 'PUBLIC has no scoped table mutation ACL.')
  FROM public_acl_facts
  UNION ALL
  SELECT 134, 'M_GRANTS_ACL', 'SERVICE_ROLE_ADMIN_TABLE_ACCESS',
    CASE WHEN gap_count = 0 THEN 'PASS' ELSE 'WARN' END,
    gap_count::text || ' scoped tables missing expected effective DML access',
    '0 access gaps',
    COALESCE(differences, 'service_role has effective SELECT, INSERT, UPDATE, and DELETE on every scoped table.')
  FROM service_role_access_facts
  UNION ALL
  SELECT 140, 'N_RPC_OWNER_PRIVILEGES', 'SECURITY_DEFINER_OWNER_RUNTIME_PRIVILEGES',
    CASE WHEN bad_table_count = 0 AND identity_privileges_ok THEN 'PASS' ELSE 'FAIL' END,
    bad_table_count::text || ' table privilege gaps; identity_privileges=' || identity_privileges_ok::text,
    '0 table privilege gaps; identity_privileges=true',
    COALESCE(table_differences, 'Owner has required SELECT plus profile UPDATE/domain INSERT privileges, auth USAGE, and auth.uid EXECUTE.')
  FROM owner_privilege_facts
),
check_counts AS (
  SELECT
    count(*) FILTER (WHERE audit_status = 'PASS') AS pass_count,
    count(*) FILTER (WHERE audit_status = 'WARN') AS warn_count,
    count(*) FILTER (WHERE audit_status = 'FAIL') AS fail_count
  FROM checks
),
final_row AS (
  SELECT
    999 AS check_order,
    'FINAL'::text AS audit_section,
    'ONBOARDING_V22_PRODUCTION_PREFLIGHT'::text AS check_name,
    CASE WHEN fail_count > 0 THEN 'FAIL'
      WHEN warn_count > 0 THEN 'WARN' ELSE 'PASS' END::text AS audit_status,
    'PASS=' || pass_count::text || '; WARN=' || warn_count::text ||
      '; FAIL=' || fail_count::text AS observed_value,
    'FAIL=0; human review required'::text AS expected_value,
    CASE WHEN fail_count > 0 THEN 'STOP_BEFORE_MIGRATION'
      ELSE 'READY_FOR_MIGRATION_REVIEW' END::text AS details
  FROM check_counts
)
SELECT
  check_order,
  audit_section,
  check_name,
  audit_status,
  observed_value,
  expected_value,
  details
FROM (
  SELECT * FROM checks
  UNION ALL
  SELECT * FROM final_row
) AS consolidated_result
ORDER BY check_order;
