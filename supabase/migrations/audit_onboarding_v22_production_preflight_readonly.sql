-- READ-ONLY PRODUCTION AUDIT
-- DO NOT APPLY AS A MIGRATION
-- DO NOT MODIFY DATA OR SCHEMA
-- SAFE TO RUN MANUALLY IN SUPABASE SQL EDITOR
-- ONBOARDING V2.2 PRODUCTION PREFLIGHT
--
-- This file contains only SELECT statements and read-only CTEs. It does not
-- call either onboarding completion RPC. Schema/catalog evidence takes
-- precedence over the optional migration ledger. User-level output is limited
-- to aggregate counts; no UUID, name, email, payload, hash, or idempotency key
-- is returned.

-- =============================================================================
-- 00. Audit identity and required Supabase roles
-- =============================================================================
SELECT
  '00_AUDIT_IDENTITY' AS audit_section,
  'PASS' AS audit_status,
  pg_catalog.current_database() AS database_name,
  CURRENT_USER AS audit_executor,
  pg_catalog.statement_timestamp() AS audit_started_at,
  'READ_ONLY_PRODUCTION_PREFLIGHT_V22' AS audit_kind;

WITH expected_roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
)
SELECT
  '00A_REQUIRED_ROLES' AS audit_section,
  CASE WHEN r.oid IS NULL THEN 'FAIL' ELSE 'PASS' END AS audit_status,
  e.role_name,
  r.oid IS NOT NULL AS role_exists,
  r.rolsuper AS is_superuser,
  r.rolinherit AS inherits_privileges
FROM expected_roles AS e
LEFT JOIN pg_catalog.pg_roles AS r ON r.rolname = e.role_name
ORDER BY e.role_name;

-- =============================================================================
-- 01. Optional project migration ledger (informational, never canonical)
-- =============================================================================
-- query_to_xml is a built-in read-only PostgreSQL function. The CASE guard
-- avoids querying a missing or unreadable optional ledger. Only expected
-- version identifiers are read; migration SQL is never returned.
WITH ledger_state AS (
  SELECT
    pg_catalog.to_regclass('supabase_migrations.schema_migrations') AS ledger_oid
), ledger_access AS (
  SELECT
    ledger_oid,
    COALESCE(
      pg_catalog.has_table_privilege(ledger_oid, 'SELECT'),
      false
    ) AS can_read
  FROM ledger_state
), ledger_snapshot AS (
  SELECT
    ledger_oid,
    can_read,
    CASE
      WHEN ledger_oid IS NOT NULL AND can_read THEN pg_catalog.query_to_xml(
        'SELECT to_jsonb(m)->>''version'' AS version FROM supabase_migrations.schema_migrations AS m WHERE to_jsonb(m)->>''version'' IN (''20260912000100'',''20260913000200'',''20260913000600'',''20260913000900'',''20260914000200'',''20260914000400'',''20260914000700'',''20260914001000'',''20260914001100'',''20260921000100'',''20260928000100'') ORDER BY to_jsonb(m)->>''version''',
        true,
        false,
        ''
      )
      ELSE NULL
    END AS ledger_xml
  FROM ledger_access
), expected(version, expectation, display_order) AS (
  VALUES
    ('20260912000100', 'HISTORICAL_EXPECTED', 1),
    ('20260913000200', 'HISTORICAL_EXPECTED', 2),
    ('20260913000600', 'HISTORICAL_EXPECTED', 3),
    ('20260913000900', 'HISTORICAL_EXPECTED', 4),
    ('20260914000200', 'HISTORICAL_EXPECTED', 5),
    ('20260914000400', 'HISTORICAL_EXPECTED', 6),
    ('20260914000700', 'HISTORICAL_EXPECTED', 7),
    ('20260914001000', 'HISTORICAL_EXPECTED', 8),
    ('20260914001100', 'HISTORICAL_EXPECTED', 9),
    ('20260921000100', 'V21_EXPECTED', 10),
    ('20260928000100', 'V22_EXPECTED_ABSENT', 11)
)
SELECT
  '01_MIGRATION_LEDGER' AS audit_section,
  CASE
    WHEN s.ledger_oid IS NULL OR NOT s.can_read THEN 'WARN'
    WHEN e.expectation = 'V22_EXPECTED_ABSENT'
      AND pg_catalog.cardinality(pg_catalog.xpath(
        pg_catalog.format('/table/row[version/text()="%s"]', e.version),
        s.ledger_xml
      )) > 0 THEN 'FAIL'
    WHEN e.expectation = 'V22_EXPECTED_ABSENT' THEN 'PASS'
    WHEN pg_catalog.cardinality(pg_catalog.xpath(
      pg_catalog.format('/table/row[version/text()="%s"]', e.version),
      s.ledger_xml
    )) > 0 THEN 'PASS'
    ELSE 'WARN'
  END AS audit_status,
  e.version,
  e.expectation,
  s.ledger_oid IS NOT NULL AS ledger_exists,
  s.can_read AS ledger_readable,
  CASE
    WHEN s.ledger_oid IS NULL THEN 'Ledger table unavailable; rely on schema evidence.'
    WHEN NOT s.can_read THEN 'Ledger not readable; rely on schema evidence.'
    WHEN pg_catalog.cardinality(pg_catalog.xpath(
      pg_catalog.format('/table/row[version/text()="%s"]', e.version),
      s.ledger_xml
    )) > 0 THEN 'VERSION_PRESENT'
    ELSE 'VERSION_ABSENT'
  END AS ledger_observation
FROM expected AS e
CROSS JOIN ledger_snapshot AS s
ORDER BY e.display_order;

-- =============================================================================
-- 02. Required V2/V2.1 relations and their owners
-- =============================================================================
WITH expected(table_name, display_order) AS (
  VALUES
    ('profiles', 1),
    ('user_health_profiles', 2),
    ('training_profiles', 3),
    ('training_profile_activities', 4),
    ('nutrition_profiles', 5),
    ('nutrition_profile_restrictions', 6),
    ('nutrition_profile_disliked_foods', 7),
    ('nutrition_profile_preferred_foods', 8),
    ('nutrition_profile_supplements', 9),
    ('onboarding_completion_receipts', 10)
)
SELECT
  '02_REQUIRED_RELATIONS' AS audit_section,
  CASE
    WHEN c.oid IS NULL THEN 'FAIL'
    WHEN c.relkind NOT IN ('r', 'p') THEN 'FAIL'
    WHEN owner_role.rolname IN ('anon', 'authenticated', 'service_role') THEN 'FAIL'
    ELSE 'PASS'
  END AS audit_status,
  'public' AS table_schema,
  e.table_name,
  c.oid IS NOT NULL AS exists,
  c.relkind,
  owner_role.rolname AS owner
FROM expected AS e
LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
LEFT JOIN pg_catalog.pg_class AS c
  ON c.relnamespace = n.oid
 AND c.relname = e.table_name
LEFT JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = c.relowner
ORDER BY e.display_order;

-- =============================================================================
-- 03. V2.1 prerequisite columns and exact current definitions
-- =============================================================================
WITH expected(table_name, column_name, expected_type, expected_nullable, display_order) AS (
  VALUES
    ('profiles', 'onboarding_completed', 'boolean', false, 1),
    ('profiles', 'onboarding_version', 'smallint', true, 2),
    ('profiles', 'onboarding_completed_at', 'timestamp with time zone', true, 3),
    ('training_profiles', 'priority_muscles', 'text[]', false, 10),
    ('training_profiles', 'training_experience', 'text', false, 11),
    ('training_profiles', 'exercise_confidence', 'text', false, 12),
    ('training_profiles', 'recent_training_break', 'text', true, 13),
    ('training_profiles', 'available_weekdays', 'smallint[]', false, 14),
    ('training_profiles', 'session_duration_min', 'smallint', false, 15),
    ('training_profiles', 'session_duration_is_plus', 'boolean', false, 16),
    ('training_profiles', 'training_location', 'text', false, 17),
    ('training_profiles', 'available_equipment', 'text[]', false, 18),
    ('training_profiles', 'pain_or_limitation', 'boolean', false, 19),
    ('training_profiles', 'affected_body_areas', 'text[]', false, 20),
    ('training_profile_activities', 'activity_code', 'text', false, 30),
    ('training_profile_activities', 'schedule_type', 'text', false, 31),
    ('training_profile_activities', 'available_weekdays', 'smallint[]', true, 32),
    ('training_profile_activities', 'sessions_per_week', 'smallint', true, 33),
    ('nutrition_profiles', 'meals_per_day', 'smallint', true, 40),
    ('nutrition_profiles', 'food_preparation_style', 'text', false, 41),
    ('nutrition_profiles', 'food_budget_style', 'text', false, 42),
    ('nutrition_profiles', 'meal_schedule_flexibility', 'text', true, 43),
    ('onboarding_completion_receipts', 'user_id', 'uuid', false, 50),
    ('onboarding_completion_receipts', 'onboarding_version', 'smallint', false, 51),
    ('onboarding_completion_receipts', 'idempotency_key', 'uuid', false, 52),
    ('onboarding_completion_receipts', 'payload_hash', 'bytea', false, 53),
    ('onboarding_completion_receipts', 'payload_schema_version', 'smallint', false, 54),
    ('onboarding_completion_receipts', 'canonicalization_version', 'smallint', false, 55),
    ('onboarding_completion_receipts', 'completed_at', 'timestamp with time zone', false, 56)
), actual AS (
  SELECT
    c.relname AS table_name,
    a.attname AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS actual_type,
    NOT a.attnotnull AS actual_nullable,
    pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
    a.attidentity,
    a.attgenerated
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef AS ad
    ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
)
SELECT
  '03_V21_PREREQUISITE_COLUMNS' AS audit_section,
  CASE
    WHEN a.column_name IS NULL THEN 'FAIL'
    WHEN a.actual_type <> e.expected_type THEN 'FAIL'
    WHEN a.actual_nullable <> e.expected_nullable THEN 'FAIL'
    WHEN a.attidentity <> '' OR a.attgenerated <> '' THEN 'FAIL'
    ELSE 'PASS'
  END AS audit_status,
  'public' AS table_schema,
  e.table_name,
  e.column_name,
  e.expected_type,
  a.actual_type,
  e.expected_nullable,
  a.actual_nullable,
  a.column_default,
  NULLIF(a.attidentity, '') AS identity_kind,
  NULLIF(a.attgenerated, '') AS generated_kind
FROM expected AS e
LEFT JOIN actual AS a
  ON a.table_name = e.table_name AND a.column_name = e.column_name
ORDER BY e.display_order;

-- Full column inventory for the ten scoped relations.
WITH target_tables(table_name) AS (
  VALUES
    ('profiles'), ('user_health_profiles'), ('training_profiles'),
    ('training_profile_activities'), ('nutrition_profiles'),
    ('nutrition_profile_restrictions'), ('nutrition_profile_disliked_foods'),
    ('nutrition_profile_preferred_foods'), ('nutrition_profile_supplements'),
    ('onboarding_completion_receipts')
)
SELECT
  '03A_ALL_SCOPED_COLUMNS' AS audit_section,
  'INFO' AS audit_status,
  n.nspname AS table_schema,
  c.relname AS table_name,
  a.attnum AS ordinal_position,
  a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
  typ.typname AS udt_name,
  NOT a.attnotnull AS is_nullable,
  pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
  NULLIF(a.attidentity, '') AS identity_kind,
  NULLIF(a.attgenerated, '') AS generated_kind
FROM target_tables AS t
JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
JOIN pg_catalog.pg_class AS c
  ON c.relnamespace = n.oid AND c.relname = t.table_name
JOIN pg_catalog.pg_attribute AS a
  ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
JOIN pg_catalog.pg_type AS typ ON typ.oid = a.atttypid
LEFT JOIN pg_catalog.pg_attrdef AS ad
  ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
ORDER BY c.relname, a.attnum;

-- =============================================================================
-- 04. V2.2 columns must all be absent before migration application
-- =============================================================================
WITH v22_columns(table_name, column_name, expected_type, display_order) AS (
  VALUES
    ('training_profiles', 'onboarding_payload_schema_version', 'smallint', 1),
    ('training_profiles', 'preferred_weekdays', 'smallint[]', 2),
    ('training_profiles', 'session_duration_range', 'text', 3),
    ('training_profiles', 'aerobic_practice_frequency', 'text', 4),
    ('training_profiles', 'aerobic_safety_limitation', 'boolean', 5),
    ('training_profile_activities', 'onboarding_payload_schema_version', 'smallint', 6),
    ('training_profile_activities', 'duration_range', 'text', 7),
    ('training_profile_activities', 'intensity', 'text', 8),
    ('nutrition_profiles', 'onboarding_payload_schema_version', 'smallint', 9),
    ('nutrition_profiles', 'available_meal_moments', 'text[]', 10),
    ('nutrition_profiles', 'food_preparation_availability', 'text', 11),
    ('nutrition_profiles', 'current_eating_routine', 'text', 12)
)
SELECT
  '04_V22_COLUMNS_EXPECTED_ABSENT' AS audit_section,
  CASE WHEN a.attname IS NULL THEN 'PASS' ELSE 'FAIL' END AS audit_status,
  'public' AS table_schema,
  v.table_name,
  v.column_name,
  v.expected_type AS type_v22_would_add,
  CASE WHEN a.attname IS NULL THEN NULL
       ELSE pg_catalog.format_type(a.atttypid, a.atttypmod) END AS existing_type,
  a.attname IS NOT NULL AS unexpectedly_exists,
  CASE WHEN a.attname IS NULL THEN 'ABSENT_AS_EXPECTED'
       ELSE 'DRIFT_BLOCKER_REVIEW_BEFORE_MIGRATION' END AS observation
FROM v22_columns AS v
LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
LEFT JOIN pg_catalog.pg_class AS c
  ON c.relnamespace = n.oid AND c.relname = v.table_name
LEFT JOIN pg_catalog.pg_attribute AS a
  ON a.attrelid = c.oid
 AND a.attname = v.column_name
 AND a.attnum > 0
 AND NOT a.attisdropped
ORDER BY v.display_order;

-- =============================================================================
-- 05. Constraints removed, replaced, depended on, or introduced by V2.2
-- =============================================================================
WITH expected(table_name, constraint_name, expectation, display_order) AS (
  VALUES
    ('training_profiles', 'training_profiles_location_check', 'MUST_EXIST_V21_AND_WILL_BE_REPLACED', 1),
    ('training_profiles', 'training_profiles_equipment_check', 'MUST_EXIST_V21_AND_IS_PRESERVED', 2),
    ('training_profile_activities', 'training_profile_activities_code_check', 'MUST_EXIST_V21_AND_WILL_BE_REPLACED', 3),
    ('training_profile_activities', 'training_profile_activities_schedule_check', 'MUST_EXIST_V21_AND_WILL_BE_REMOVED', 4),
    ('nutrition_profiles', 'nutrition_profiles_meal_schedule_flexibility_check', 'MUST_EXIST_V21_AND_IS_PRESERVED', 5),
    ('training_profiles', 'training_profiles_contract_check', 'V22_MUST_BE_ABSENT', 10),
    ('training_profile_activities', 'training_profile_activities_contract_check', 'V22_MUST_BE_ABSENT', 11),
    ('nutrition_profiles', 'nutrition_profiles_contract_check', 'V22_MUST_BE_ABSENT', 12)
), actual AS (
  SELECT
    c.relname AS table_name,
    con.conname AS constraint_name,
    con.oid,
    con.contype,
    con.convalidated,
    pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
  FROM pg_catalog.pg_constraint AS con
  JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace AND n.nspname = 'public'
)
SELECT
  '05_TARGET_CONSTRAINTS' AS audit_section,
  CASE
    WHEN e.expectation = 'V22_MUST_BE_ABSENT' AND a.oid IS NULL THEN 'PASS'
    WHEN e.expectation = 'V22_MUST_BE_ABSENT' THEN 'FAIL'
    WHEN a.oid IS NULL THEN 'FAIL'
    WHEN NOT a.convalidated THEN 'FAIL'
    ELSE 'PASS'
  END AS audit_status,
  'public' AS table_schema,
  e.table_name,
  e.constraint_name,
  e.expectation,
  CASE a.contype
    WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE'
    WHEN 'f' THEN 'FOREIGN KEY' WHEN 'c' THEN 'CHECK'
    WHEN 'x' THEN 'EXCLUDE' ELSE a.contype::text
  END AS constraint_type,
  a.convalidated AS validated,
  a.definition
FROM expected AS e
LEFT JOIN actual AS a
  ON a.table_name = e.table_name
 AND a.constraint_name = e.constraint_name
ORDER BY e.display_order;

-- Complete constraint inventory exposes additional/unexpected conflicts.
WITH target_tables(table_name) AS (
  VALUES
    ('profiles'), ('user_health_profiles'), ('training_profiles'),
    ('training_profile_activities'), ('nutrition_profiles'),
    ('nutrition_profile_restrictions'), ('nutrition_profile_disliked_foods'),
    ('nutrition_profile_preferred_foods'), ('nutrition_profile_supplements'),
    ('onboarding_completion_receipts')
)
SELECT
  '05A_ALL_SCOPED_CONSTRAINTS' AS audit_section,
  'INFO' AS audit_status,
  n.nspname AS table_schema,
  c.relname AS table_name,
  con.conname AS constraint_name,
  CASE con.contype
    WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE'
    WHEN 'f' THEN 'FOREIGN KEY' WHEN 'c' THEN 'CHECK'
    WHEN 'x' THEN 'EXCLUDE' ELSE con.contype::text
  END AS constraint_type,
  con.convalidated AS validated,
  pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM target_tables AS t
JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
JOIN pg_catalog.pg_class AS c
  ON c.relnamespace = n.oid AND c.relname = t.table_name
JOIN pg_catalog.pg_constraint AS con ON con.conrelid = c.oid
ORDER BY c.relname, con.contype, con.conname;

-- Same-name constraints outside public are not direct ALTER targets, but they
-- are surfaced as naming drift for review.
SELECT
  '05B_V22_CONSTRAINT_NAME_COLLISIONS_ALL_SCHEMAS' AS audit_section,
  'FAIL' AS audit_status,
  n.nspname AS table_schema,
  c.relname AS table_name,
  con.conname AS constraint_name,
  con.convalidated AS validated,
  pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE con.conname IN (
  'training_profiles_contract_check',
  'training_profile_activities_contract_check',
  'nutrition_profiles_contract_check'
)
ORDER BY n.nspname, c.relname, con.conname;

-- =============================================================================
-- 06. Triggers and trigger functions
-- =============================================================================
WITH target_tables(table_name) AS (
  VALUES
    ('profiles'), ('user_health_profiles'), ('training_profiles'),
    ('training_profile_activities'), ('nutrition_profiles'),
    ('nutrition_profile_restrictions'), ('nutrition_profile_disliked_foods'),
    ('nutrition_profile_preferred_foods'), ('nutrition_profile_supplements'),
    ('onboarding_completion_receipts')
)
SELECT
  '06_SCOPED_TRIGGERS' AS audit_section,
  CASE
    WHEN c.relname = 'training_profiles'
      AND tg.tgname = 'training_profiles_set_initial_level'
      AND NOT tg.tgisinternal THEN 'PASS'
    WHEN tg.tgname = 'training_profile_activities_check_contract'
      AND NOT tg.tgisinternal THEN 'FAIL'
    ELSE 'INFO'
  END AS audit_status,
  n.nspname AS table_schema,
  c.relname AS table_name,
  tg.tgname AS trigger_name,
  tg.tgisinternal AS is_internal,
  CASE tg.tgenabled
    WHEN 'O' THEN 'origin/local' WHEN 'D' THEN 'disabled'
    WHEN 'R' THEN 'replica' WHEN 'A' THEN 'always'
    ELSE tg.tgenabled::text
  END AS enabled_mode,
  pn.nspname AS function_schema,
  p.proname AS function_name,
  pg_catalog.pg_get_triggerdef(tg.oid, true) AS trigger_definition,
  CASE
    WHEN NOT tg.tgisinternal
      AND (tg.tgname = 'training_profiles_set_initial_level'
        OR p.proname IN (
          'training_profiles_set_initial_level',
          'training_profile_activities_check_contract'
        ))
      THEN pg_catalog.pg_get_functiondef(p.oid)
    ELSE NULL
  END AS related_function_definition
FROM target_tables AS t
JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
JOIN pg_catalog.pg_class AS c
  ON c.relnamespace = n.oid AND c.relname = t.table_name
JOIN pg_catalog.pg_trigger AS tg ON tg.tgrelid = c.oid
JOIN pg_catalog.pg_proc AS p ON p.oid = tg.tgfoid
JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.pronamespace
ORDER BY c.relname, tg.tgisinternal, tg.tgname;

-- Explicit presence/absence checks avoid hiding a missing legacy trigger.
WITH expected(trigger_name, expected_table, expectation) AS (
  VALUES
    ('training_profiles_set_initial_level', 'training_profiles', 'MUST_EXIST_V21'),
    ('training_profile_activities_check_contract', 'training_profile_activities', 'V22_MUST_BE_ABSENT')
), actual AS (
  SELECT tg.tgname AS trigger_name,
         c.relname AS table_name, n.nspname AS table_schema,
         tg.tgenabled, tg.tgisinternal
  FROM pg_catalog.pg_trigger AS tg
  JOIN pg_catalog.pg_class AS c ON c.oid = tg.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE NOT tg.tgisinternal
)
SELECT
  '06A_TARGET_TRIGGER_STATUS' AS audit_section,
  CASE
    WHEN e.expectation = 'MUST_EXIST_V21'
      AND count(a.trigger_name) = 1
      AND bool_and(a.table_schema = 'public' AND a.table_name = e.expected_table)
      THEN 'PASS'
    WHEN e.expectation = 'V22_MUST_BE_ABSENT' AND count(a.trigger_name) = 0 THEN 'PASS'
    ELSE 'FAIL'
  END AS audit_status,
  e.trigger_name,
  e.expected_table,
  e.expectation,
  count(a.trigger_name) AS matching_trigger_count,
  pg_catalog.array_agg(
    a.table_schema || '.' || a.table_name ORDER BY a.table_schema, a.table_name
  ) FILTER (WHERE a.trigger_name IS NOT NULL) AS actual_locations
FROM expected AS e
LEFT JOIN actual AS a ON a.trigger_name = e.trigger_name
GROUP BY e.trigger_name, e.expected_table, e.expectation
ORDER BY e.trigger_name;

-- =============================================================================
-- 07. V2.1 RPC definition, overloads, owner, configuration, and ACL
-- =============================================================================
WITH v2_functions AS (
  SELECT p.*, n.nspname, l.lanname, owner_role.rolname AS owner_name
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
  WHERE n.nspname = 'public' AND p.proname = 'complete_onboarding_v2'
), totals AS (
  SELECT count(*) AS overload_count FROM v2_functions
)
SELECT
  '07_COMPLETE_ONBOARDING_V2' AS audit_section,
  CASE
    WHEN totals.overload_count <> 1 THEN 'FAIL'
    WHEN pg_catalog.pg_get_function_identity_arguments(f.oid) <> 'p_payload jsonb' THEN 'FAIL'
    WHEN f.lanname <> 'plpgsql' OR NOT f.prosecdef THEN 'FAIL'
    WHEN pg_catalog.array_length(f.proconfig, 1) IS DISTINCT FROM 1 THEN 'FAIL'
    WHEN f.proconfig[1] NOT IN ('search_path=', 'search_path=""') THEN 'FAIL'
    WHEN f.owner_name IN ('anon', 'authenticated', 'service_role') THEN 'FAIL'
    ELSE 'PASS'
  END AS audit_status,
  totals.overload_count,
  f.nspname AS function_schema,
  f.proname AS function_name,
  pg_catalog.pg_get_function_identity_arguments(f.oid) AS identity_arguments,
  pg_catalog.pg_get_function_result(f.oid) AS return_type,
  f.owner_name AS owner,
  f.lanname AS language,
  f.prosecdef AS security_definer,
  f.proconfig AS runtime_configuration,
  f.proacl AS raw_acl,
  pg_catalog.pg_get_functiondef(f.oid) AS definition
FROM totals
LEFT JOIN v2_functions AS f ON true
ORDER BY identity_arguments;

WITH target_functions AS (
  SELECT p.oid, p.proowner,
         pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
         COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner)) AS effective_acl
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'complete_onboarding_v2'
)
SELECT
  '07A_COMPLETE_ONBOARDING_V2_ACL' AS audit_section,
  CASE
    WHEN (CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END) = 'authenticated'
      AND acl.privilege_type = 'EXECUTE' THEN 'PASS'
    WHEN (CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END) = 'service_role'
      AND acl.privilege_type = 'EXECUTE' THEN 'PASS'
    WHEN (CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END) IN ('PUBLIC', 'anon')
      AND acl.privilege_type = 'EXECUTE' THEN 'FAIL'
    ELSE 'INFO'
  END AS audit_status,
  t.identity_arguments,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END AS grantee,
  acl.privilege_type,
  acl.is_grantable,
  grantor_role.rolname AS grantor
FROM target_functions AS t
CROSS JOIN LATERAL pg_catalog.aclexplode(t.effective_acl) AS acl
LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
LEFT JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = acl.grantor
ORDER BY t.identity_arguments, grantee, acl.privilege_type;

WITH target_functions AS (
  SELECT p.oid, pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'complete_onboarding_v2'
), target_roles AS (
  SELECT oid, rolname FROM pg_catalog.pg_roles
  WHERE rolname IN ('anon', 'authenticated', 'service_role')
)
SELECT
  '07B_COMPLETE_ONBOARDING_V2_EFFECTIVE_EXECUTE' AS audit_section,
  CASE
    WHEN r.rolname IN ('authenticated', 'service_role')
      AND pg_catalog.has_function_privilege(r.oid, f.oid, 'EXECUTE') THEN 'PASS'
    WHEN r.rolname = 'anon'
      AND NOT pg_catalog.has_function_privilege(r.oid, f.oid, 'EXECUTE') THEN 'PASS'
    ELSE 'FAIL'
  END AS audit_status,
  f.identity_arguments,
  r.rolname AS role_name,
  pg_catalog.has_function_privilege(r.oid, f.oid, 'EXECUTE') AS can_execute
FROM target_functions AS f
CROSS JOIN target_roles AS r
ORDER BY f.identity_arguments, r.rolname;

-- =============================================================================
-- 08. V2.2 object collision scan (all exact names from the local migration)
-- =============================================================================
WITH expected_function(function_name, identity_arguments, display_order) AS (
  VALUES
    ('onboarding_v22_assert_object', 'p_value jsonb, p_shape jsonb', 1),
    ('onboarding_v22_enum', 'p_value jsonb, p_allowed text[], p_nullable boolean', 2),
    ('onboarding_v22_label', 'p_value jsonb, p_max integer, p_nullable boolean', 3),
    ('onboarding_v22_set', 'p_value jsonb, p_allowed jsonb, p_min integer', 4),
    ('canonicalize_onboarding_v22', 'p_payload jsonb', 5),
    ('training_profile_activities_check_contract', '', 6),
    ('complete_onboarding_v22', 'p_payload jsonb', 7)
)
SELECT
  '08_V22_FUNCTIONS_EXPECTED_ABSENT' AS audit_section,
  CASE WHEN count(p.oid) = 0 THEN 'PASS' ELSE 'FAIL' END AS audit_status,
  e.function_name,
  e.identity_arguments AS signature_v22_would_create,
  count(p.oid) AS existing_function_count,
  pg_catalog.array_agg(
    n.nspname || '.' || p.proname || '(' ||
    pg_catalog.pg_get_function_identity_arguments(p.oid) || ')'
    ORDER BY n.nspname, pg_catalog.pg_get_function_identity_arguments(p.oid)
  ) FILTER (WHERE p.oid IS NOT NULL) AS collisions
FROM expected_function AS e
LEFT JOIN pg_catalog.pg_proc AS p ON p.proname = e.function_name
LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
GROUP BY e.function_name, e.identity_arguments, e.display_order
ORDER BY e.display_order;

-- V2.1 helpers that V2.2 requires or replaces must exist in public.
WITH expected(function_name, expected_identity_arguments, display_order) AS (
  VALUES
    ('training_profile_code_set_valid', 'p_values text[], p_allowed text[]', 1),
    ('training_profiles_set_initial_level', '', 2),
    ('reward_system_set_updated_at', '', 3)
)
SELECT
  '08A_REQUIRED_HELPERS' AS audit_section,
  CASE
    WHEN count(p.oid) FILTER (
      WHERE n.nspname = 'public'
        AND pg_catalog.pg_get_function_identity_arguments(p.oid) = e.expected_identity_arguments
    ) = 1 THEN 'PASS'
    ELSE 'FAIL'
  END AS audit_status,
  e.function_name,
  e.expected_identity_arguments,
  count(p.oid) AS same_name_count_all_schemas,
  pg_catalog.array_agg(
    n.nspname || '.' || p.proname || '(' ||
    pg_catalog.pg_get_function_identity_arguments(p.oid) || ')'
    ORDER BY n.nspname, pg_catalog.pg_get_function_identity_arguments(p.oid)
  ) FILTER (WHERE p.oid IS NOT NULL) AS actual_functions
FROM expected AS e
LEFT JOIN pg_catalog.pg_proc AS p ON p.proname = e.function_name
LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
GROUP BY e.function_name, e.expected_identity_arguments, e.display_order
ORDER BY e.display_order;

WITH expected(function_schema, function_name, expected_identity_arguments, display_order) AS (
  VALUES
    ('auth', 'uid', '', 1),
    ('pg_catalog', 'sha256', 'bytea', 2),
    ('pg_catalog', 'trim_scale', 'numeric', 3)
)
SELECT
  '08B_REQUIRED_PLATFORM_FUNCTIONS' AS audit_section,
  CASE WHEN count(p.oid) = 1 THEN 'PASS' ELSE 'FAIL' END AS audit_status,
  e.function_schema,
  e.function_name,
  e.expected_identity_arguments,
  count(p.oid) AS matching_function_count,
  pg_catalog.array_agg(pg_catalog.pg_get_function_result(p.oid))
    FILTER (WHERE p.oid IS NOT NULL) AS return_types
FROM expected AS e
LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = e.function_schema
LEFT JOIN pg_catalog.pg_proc AS p
  ON p.pronamespace = n.oid
 AND p.proname = e.function_name
 AND pg_catalog.pg_get_function_identity_arguments(p.oid) = e.expected_identity_arguments
GROUP BY e.function_schema, e.function_name,
         e.expected_identity_arguments, e.display_order
ORDER BY e.display_order;

-- =============================================================================
-- 09. Receipt structure: columns, constraints, keys, and indexes
-- =============================================================================
SELECT
  '09_RECEIPT_COLUMNS' AS audit_section,
  'INFO' AS audit_status,
  a.attnum AS ordinal_position,
  a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
  NOT a.attnotnull AS is_nullable,
  pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
  NULLIF(a.attidentity, '') AS identity_kind,
  NULLIF(a.attgenerated, '') AS generated_kind
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n
  ON n.oid = c.relnamespace AND n.nspname = 'public'
JOIN pg_catalog.pg_attribute AS a
  ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_catalog.pg_attrdef AS ad
  ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE c.relname = 'onboarding_completion_receipts'
ORDER BY a.attnum;

SELECT
  '09A_RECEIPT_CONSTRAINTS' AS audit_section,
  CASE
    WHEN con.conname IN (
      'onboarding_completion_receipts_pkey',
      'onboarding_completion_receipts_user_key_unique',
      'onboarding_completion_receipts_user_fk',
      'onboarding_completion_receipts_version_positive',
      'onboarding_completion_receipts_payload_schema_positive',
      'onboarding_completion_receipts_canonicalization_positive',
      'onboarding_completion_receipts_hash_length_check'
    ) AND con.convalidated THEN 'PASS'
    ELSE 'INFO'
  END AS audit_status,
  con.conname AS constraint_name,
  CASE con.contype
    WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE'
    WHEN 'f' THEN 'FOREIGN KEY' WHEN 'c' THEN 'CHECK'
    ELSE con.contype::text
  END AS constraint_type,
  con.convalidated AS validated,
  pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n
  ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relname = 'onboarding_completion_receipts'
ORDER BY con.contype, con.conname;

SELECT
  '09B_RECEIPT_INDEXES' AS audit_section,
  'INFO' AS audit_status,
  idx.relname AS index_name,
  i.indisprimary AS is_primary,
  i.indisunique AS is_unique,
  i.indisvalid AS is_valid,
  i.indisready AS is_ready,
  pg_catalog.pg_get_indexdef(idx.oid) AS definition
FROM pg_catalog.pg_index AS i
JOIN pg_catalog.pg_class AS tbl ON tbl.oid = i.indrelid
JOIN pg_catalog.pg_namespace AS n
  ON n.oid = tbl.relnamespace AND n.nspname = 'public'
JOIN pg_catalog.pg_class AS idx ON idx.oid = i.indexrelid
WHERE tbl.relname = 'onboarding_completion_receipts'
ORDER BY idx.relname;

-- =============================================================================
-- 10. Aggregated V2.1 receipt and completion-marker consistency (no PII)
-- =============================================================================
SELECT
  '10_RECEIPT_AGGREGATES' AS audit_section,
  CASE
    WHEN count(*) FILTER (
      WHERE r.onboarding_version = 2
        AND (r.payload_schema_version, r.canonicalization_version) <> (2, 2)
    ) > 0 THEN 'FAIL'
    ELSE 'PASS'
  END AS audit_status,
  count(*) AS receipts_all_versions,
  count(*) FILTER (WHERE r.onboarding_version = 2) AS receipts_onboarding_version_2,
  count(*) FILTER (
    WHERE r.onboarding_version = 2
      AND r.payload_schema_version = 2
      AND r.canonicalization_version = 2
  ) AS receipts_v2_schema2_canonicalization2,
  count(*) FILTER (
    WHERE r.onboarding_version = 2
      AND (r.payload_schema_version, r.canonicalization_version) <> (2, 2)
  ) AS receipts_v2_other_schema_or_canonicalization,
  count(*) FILTER (WHERE r.onboarding_version <> 2) AS receipts_other_onboarding_versions
FROM public.onboarding_completion_receipts AS r;

SELECT
  '10A_RECEIPT_MARKER_CONSISTENCY' AS audit_section,
  CASE
    WHEN count(*) FILTER (
      WHERE p.user_id IS NULL
         OR p.onboarding_completed IS DISTINCT FROM true
         OR p.onboarding_version IS DISTINCT FROM 2
         OR p.onboarding_completed_at IS DISTINCT FROM r.completed_at
    ) = 0 THEN 'PASS'
    ELSE 'FAIL'
  END AS audit_status,
  count(*) FILTER (WHERE r.onboarding_version = 2) AS v2_receipts_checked,
  count(*) FILTER (
    WHERE r.onboarding_version = 2 AND p.user_id IS NULL
  ) AS v2_receipts_without_profile,
  count(*) FILTER (
    WHERE r.onboarding_version = 2
      AND p.user_id IS NOT NULL
      AND p.onboarding_completed IS DISTINCT FROM true
  ) AS v2_receipts_without_completed_marker,
  count(*) FILTER (
    WHERE r.onboarding_version = 2
      AND p.user_id IS NOT NULL
      AND p.onboarding_version IS DISTINCT FROM 2
  ) AS v2_receipts_with_incompatible_version_marker,
  count(*) FILTER (
    WHERE r.onboarding_version = 2
      AND p.user_id IS NOT NULL
      AND p.onboarding_completed_at IS DISTINCT FROM r.completed_at
  ) AS v2_receipts_with_timestamp_mismatch
FROM public.onboarding_completion_receipts AS r
LEFT JOIN public.profiles AS p ON p.user_id = r.user_id;

SELECT
  '10B_MARKERS_WITHOUT_RECEIPT' AS audit_section,
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS audit_status,
  count(*) AS completed_v2_markers_without_v2_receipt
FROM public.profiles AS p
WHERE p.onboarding_completed IS TRUE
  AND p.onboarding_version = 2
  AND NOT EXISTS (
    SELECT 1
    FROM public.onboarding_completion_receipts AS r
    WHERE r.user_id = p.user_id AND r.onboarding_version = 2
  );

-- =============================================================================
-- 11. Existing V2.1 rows versus the future V2.2 conditional constraints
-- =============================================================================
-- New V2.2 columns would initially be NULL. These counts therefore test the
-- exact pre-V2.2 branch that each new contract constraint would validate.
SELECT
  '11_FUTURE_TRAINING_PROFILE_CONSTRAINT' AS audit_section,
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS audit_status,
  count(*) AS incompatible_existing_rows
FROM public.training_profiles AS t
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
);

SELECT
  '11A_FUTURE_ACTIVITY_CONSTRAINT' AS audit_section,
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS audit_status,
  count(*) AS incompatible_existing_rows
FROM public.training_profile_activities AS a
WHERE NOT (
  a.activity_code <> 'walking'
  AND (
    (
      a.schedule_type = 'fixed_weekdays'
      AND a.available_weekdays IS NOT NULL
      AND pg_catalog.cardinality(a.available_weekdays) >= 1
      AND public.training_profile_code_set_valid(
        a.available_weekdays::text[],
        ARRAY['1', '2', '3', '4', '5', '6', '7']::text[]
      )
      AND a.sessions_per_week IS NULL
    )
    OR
    (
      a.schedule_type = 'variable'
      AND a.available_weekdays IS NULL
      AND a.sessions_per_week IS NOT NULL
      AND a.sessions_per_week > 0
    )
  )
);

SELECT
  '11B_FUTURE_NUTRITION_CONSTRAINT' AS audit_section,
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS audit_status,
  count(*) AS incompatible_existing_rows
FROM public.nutrition_profiles AS n
WHERE NOT (
  n.food_preparation_style IS NOT NULL
  AND n.food_budget_style IS NOT NULL
);

-- =============================================================================
-- 12. RLS state and policies
-- =============================================================================
WITH expected(table_name) AS (
  VALUES
    ('profiles'), ('user_health_profiles'), ('training_profiles'),
    ('training_profile_activities'), ('nutrition_profiles'),
    ('nutrition_profile_restrictions'), ('nutrition_profile_disliked_foods'),
    ('nutrition_profile_preferred_foods'), ('nutrition_profile_supplements'),
    ('onboarding_completion_receipts')
)
SELECT
  '12_RLS_STATE' AS audit_section,
  CASE
    WHEN c.oid IS NULL THEN 'FAIL'
    WHEN NOT c.relrowsecurity THEN 'FAIL'
    ELSE 'PASS'
  END AS audit_status,
  e.table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM expected AS e
LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
LEFT JOIN pg_catalog.pg_class AS c
  ON c.relnamespace = n.oid AND c.relname = e.table_name
ORDER BY e.table_name;

WITH target_tables(table_name) AS (
  VALUES
    ('profiles'), ('user_health_profiles'), ('training_profiles'),
    ('training_profile_activities'), ('nutrition_profiles'),
    ('nutrition_profile_restrictions'), ('nutrition_profile_disliked_foods'),
    ('nutrition_profile_preferred_foods'), ('nutrition_profile_supplements'),
    ('onboarding_completion_receipts')
)
SELECT
  '12A_POLICIES' AS audit_section,
  'INFO' AS audit_status,
  c.relname AS table_name,
  pol.polname AS policy_name,
  CASE pol.polcmd
    WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL' ELSE pol.polcmd::text
  END AS command,
  pol.polpermissive AS is_permissive,
  ARRAY(
    SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE r.rolname END
    FROM pg_catalog.unnest(pol.polroles) AS role_ids(role_oid)
    LEFT JOIN pg_catalog.pg_roles AS r ON r.oid = role_oid
    ORDER BY CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE r.rolname END
  ) AS roles,
  pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) AS using_expression,
  pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expression
FROM target_tables AS t
JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
JOIN pg_catalog.pg_class AS c
  ON c.relnamespace = n.oid AND c.relname = t.table_name
JOIN pg_catalog.pg_policy AS pol ON pol.polrelid = c.oid
ORDER BY c.relname, pol.polname;

-- =============================================================================
-- 13. Effective/direct grants and inherited privilege sources
-- =============================================================================
WITH target_tables(table_name) AS (
  VALUES
    ('profiles'), ('user_health_profiles'), ('training_profiles'),
    ('training_profile_activities'), ('nutrition_profiles'),
    ('nutrition_profile_restrictions'), ('nutrition_profile_disliked_foods'),
    ('nutrition_profile_preferred_foods'), ('nutrition_profile_supplements'),
    ('onboarding_completion_receipts')
), target_roles AS (
  SELECT oid, rolname FROM pg_catalog.pg_roles
  WHERE rolname IN ('anon', 'authenticated', 'service_role')
)
SELECT
  '13_EFFECTIVE_TABLE_PRIVILEGES' AS audit_section,
  CASE
    WHEN r.rolname IN ('anon', 'authenticated')
      AND c.relname = 'profiles'
      AND (
        pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT')
        OR pg_catalog.has_table_privilege(r.oid, c.oid, 'UPDATE')
        OR pg_catalog.has_table_privilege(r.oid, c.oid, 'DELETE')
        OR pg_catalog.has_table_privilege(r.oid, c.oid, 'TRUNCATE')
        OR pg_catalog.has_table_privilege(r.oid, c.oid, 'REFERENCES')
        OR pg_catalog.has_table_privilege(r.oid, c.oid, 'TRIGGER')
        OR pg_catalog.has_table_privilege(r.oid, c.oid, 'MAINTAIN')
      ) THEN 'FAIL'
    WHEN r.rolname IN ('anon', 'authenticated')
      AND c.relname IN (
        'training_profiles', 'training_profile_activities', 'nutrition_profiles'
      )
      AND (
        pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT')
        OR pg_catalog.has_table_privilege(r.oid, c.oid, 'UPDATE')
      ) THEN 'FAIL'
    WHEN r.rolname IN ('anon', 'authenticated')
      AND c.relname = 'onboarding_completion_receipts'
      AND (
        pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT')
        OR pg_catalog.has_table_privilege(r.oid, c.oid, 'UPDATE')
        OR pg_catalog.has_table_privilege(r.oid, c.oid, 'DELETE')
      ) THEN 'FAIL'
    ELSE 'INFO'
  END AS audit_status,
  c.relname AS table_name,
  r.rolname AS role_name,
  pg_catalog.has_table_privilege(r.oid, c.oid, 'SELECT') AS can_select,
  pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT') AS can_insert_table_wide,
  pg_catalog.has_table_privilege(r.oid, c.oid, 'UPDATE') AS can_update_table_wide,
  pg_catalog.has_table_privilege(r.oid, c.oid, 'DELETE') AS can_delete,
  pg_catalog.has_table_privilege(r.oid, c.oid, 'TRUNCATE') AS can_truncate,
  pg_catalog.has_table_privilege(r.oid, c.oid, 'REFERENCES') AS can_reference,
  pg_catalog.has_table_privilege(r.oid, c.oid, 'TRIGGER') AS can_trigger,
  pg_catalog.has_table_privilege(r.oid, c.oid, 'MAINTAIN') AS can_maintain
FROM target_tables AS t
JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
JOIN pg_catalog.pg_class AS c
  ON c.relnamespace = n.oid AND c.relname = t.table_name
CROSS JOIN target_roles AS r
ORDER BY c.relname, r.rolname;

-- Effective per-column write access reveals column ACLs and inherited access.
WITH target_tables(table_name) AS (
  VALUES
    ('profiles'), ('user_health_profiles'), ('training_profiles'),
    ('training_profile_activities'), ('nutrition_profiles'),
    ('nutrition_profile_restrictions'), ('nutrition_profile_disliked_foods'),
    ('nutrition_profile_preferred_foods'), ('nutrition_profile_supplements'),
    ('onboarding_completion_receipts')
), target_roles AS (
  SELECT oid, rolname FROM pg_catalog.pg_roles
  WHERE rolname IN ('anon', 'authenticated', 'service_role')
)
SELECT
  '13A_EFFECTIVE_COLUMN_WRITES' AS audit_section,
  CASE
    WHEN r.rolname IN ('anon', 'authenticated')
      AND c.relname = 'onboarding_completion_receipts' THEN 'FAIL'
    ELSE 'INFO'
  END AS audit_status,
  c.relname AS table_name,
  a.attname AS column_name,
  r.rolname AS role_name,
  pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, 'INSERT') AS can_insert,
  pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, 'UPDATE') AS can_update
FROM target_tables AS t
JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
JOIN pg_catalog.pg_class AS c
  ON c.relnamespace = n.oid AND c.relname = t.table_name
JOIN pg_catalog.pg_attribute AS a
  ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
CROSS JOIN target_roles AS r
WHERE pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, 'INSERT')
   OR pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, 'UPDATE')
ORDER BY c.relname, a.attname, r.rolname;

-- Raw table and column ACL entries, including PUBLIC (OID 0).
WITH target_tables AS (
  SELECT c.oid, c.relname, c.relowner, c.relacl
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relname IN (
    'profiles', 'user_health_profiles', 'training_profiles',
    'training_profile_activities', 'nutrition_profiles',
    'nutrition_profile_restrictions', 'nutrition_profile_disliked_foods',
    'nutrition_profile_preferred_foods', 'nutrition_profile_supplements',
    'onboarding_completion_receipts'
  )
)
SELECT
  '13B_RAW_TABLE_ACL' AS audit_section,
  'INFO' AS audit_status,
  t.relname AS table_name,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END AS grantee,
  acl.privilege_type,
  acl.is_grantable,
  grantor_role.rolname AS grantor
FROM target_tables AS t
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(t.relacl, pg_catalog.acldefault('r', t.relowner))
) AS acl
LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
LEFT JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = acl.grantor
ORDER BY t.relname, grantee, acl.privilege_type;

SELECT
  '13C_RAW_COLUMN_ACL' AS audit_section,
  'INFO' AS audit_status,
  c.relname AS table_name,
  a.attname AS column_name,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END AS grantee,
  acl.privilege_type,
  acl.is_grantable,
  grantor_role.rolname AS grantor
FROM pg_catalog.pg_attribute AS a
JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace AS n
  ON n.oid = c.relnamespace AND n.nspname = 'public'
CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
LEFT JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = acl.grantor
WHERE c.relname IN (
    'profiles', 'user_health_profiles', 'training_profiles',
    'training_profile_activities', 'nutrition_profiles',
    'nutrition_profile_restrictions', 'nutrition_profile_disliked_foods',
    'nutrition_profile_preferred_foods', 'nutrition_profile_supplements',
    'onboarding_completion_receipts'
  )
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY c.relname, a.attname, grantee, acl.privilege_type;

-- Any inherited INSERT/UPDATE/DELETE ACL source for client roles is surfaced.
WITH client_roles AS (
  SELECT oid, rolname FROM pg_catalog.pg_roles
  WHERE rolname IN ('anon', 'authenticated', 'service_role')
), inherited_roles AS (
  SELECT client.oid AS client_oid, client.rolname AS client_role,
         inherited.oid AS inherited_oid, inherited.rolname AS inherited_role
  FROM client_roles AS client
  JOIN pg_catalog.pg_roles AS inherited
    ON inherited.oid <> client.oid
   AND pg_catalog.pg_has_role(client.oid, inherited.oid, 'USAGE')
), table_sources AS (
  SELECT
    ir.client_role,
    ir.inherited_role,
    c.relname AS table_name,
    NULL::text AS column_name,
    acl.privilege_type
  FROM inherited_roles AS ir
  JOIN pg_catalog.pg_class AS c ON true
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) AS acl
  WHERE c.relname IN (
      'profiles', 'user_health_profiles', 'training_profiles',
      'training_profile_activities', 'nutrition_profiles',
      'nutrition_profile_restrictions', 'nutrition_profile_disliked_foods',
      'nutrition_profile_preferred_foods', 'nutrition_profile_supplements',
      'onboarding_completion_receipts'
    )
    AND acl.grantee = ir.inherited_oid
    AND acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
), column_sources AS (
  SELECT
    ir.client_role,
    ir.inherited_role,
    c.relname AS table_name,
    a.attname AS column_name,
    acl.privilege_type
  FROM inherited_roles AS ir
  JOIN pg_catalog.pg_attribute AS a ON true
  JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
  WHERE c.relname IN (
      'profiles', 'user_health_profiles', 'training_profiles',
      'training_profile_activities', 'nutrition_profiles',
      'nutrition_profile_restrictions', 'nutrition_profile_disliked_foods',
      'nutrition_profile_preferred_foods', 'nutrition_profile_supplements',
      'onboarding_completion_receipts'
    )
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND acl.grantee = ir.inherited_oid
    AND acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
)
SELECT
  '13D_INHERITED_WRITE_ACL_SOURCES' AS audit_section,
  'WARN' AS audit_status,
  source.client_role,
  source.inherited_role,
  source.table_name,
  source.column_name,
  source.privilege_type
FROM (
  SELECT * FROM table_sources
  UNION ALL
  SELECT * FROM column_sources
) AS source
ORDER BY source.client_role, source.inherited_role, source.table_name,
         source.column_name, source.privilege_type;

-- =============================================================================
-- 14. Owner/runtime privilege checks for the existing SECURITY DEFINER RPC
-- =============================================================================
WITH rpc AS (
  SELECT p.oid, p.proowner, owner_role.rolname AS owner_name
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
  WHERE n.nspname = 'public'
    AND p.proname = 'complete_onboarding_v2'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb'
), target_tables(table_name, needs_update) AS (
  VALUES
    ('profiles', true),
    ('user_health_profiles', false),
    ('training_profiles', false),
    ('training_profile_activities', false),
    ('nutrition_profiles', false),
    ('nutrition_profile_restrictions', false),
    ('nutrition_profile_disliked_foods', false),
    ('nutrition_profile_preferred_foods', false),
    ('nutrition_profile_supplements', false),
    ('onboarding_completion_receipts', false)
)
SELECT
  '14_RPC_OWNER_TABLE_PRIVILEGES' AS audit_section,
  CASE
    WHEN r.owner_name IN ('anon', 'authenticated', 'service_role') THEN 'FAIL'
    WHEN c.oid IS NULL THEN 'FAIL'
    WHEN NOT pg_catalog.has_table_privilege(r.proowner, c.oid, 'SELECT') THEN 'FAIL'
    WHEN t.needs_update
      AND NOT pg_catalog.has_table_privilege(r.proowner, c.oid, 'UPDATE') THEN 'FAIL'
    WHEN NOT t.needs_update
      AND NOT pg_catalog.has_table_privilege(r.proowner, c.oid, 'INSERT') THEN 'FAIL'
    ELSE 'PASS'
  END AS audit_status,
  r.owner_name AS rpc_owner,
  t.table_name,
  pg_catalog.has_table_privilege(r.proowner, c.oid, 'SELECT') AS owner_can_select,
  pg_catalog.has_table_privilege(r.proowner, c.oid, 'INSERT') AS owner_can_insert,
  pg_catalog.has_table_privilege(r.proowner, c.oid, 'UPDATE') AS owner_can_update
FROM rpc AS r
CROSS JOIN target_tables AS t
LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
LEFT JOIN pg_catalog.pg_class AS c
  ON c.relnamespace = n.oid AND c.relname = t.table_name
ORDER BY t.table_name;

-- =============================================================================
-- 15. Final drift/blocker summary (schema evidence is authoritative)
-- =============================================================================
WITH required_relations(table_name) AS (
  VALUES
    ('profiles'), ('user_health_profiles'), ('training_profiles'),
    ('training_profile_activities'), ('nutrition_profiles'),
    ('nutrition_profile_restrictions'), ('nutrition_profile_disliked_foods'),
    ('nutrition_profile_preferred_foods'), ('nutrition_profile_supplements'),
    ('onboarding_completion_receipts')
), v22_columns(table_name, column_name) AS (
  VALUES
    ('training_profiles', 'onboarding_payload_schema_version'),
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
), v22_functions(function_name) AS (
  VALUES
    ('onboarding_v22_assert_object'), ('onboarding_v22_enum'),
    ('onboarding_v22_label'), ('onboarding_v22_set'),
    ('canonicalize_onboarding_v22'),
    ('training_profile_activities_check_contract'),
    ('complete_onboarding_v22')
), facts AS (
  SELECT
    count(*) FILTER (
      WHERE pg_catalog.to_regclass('public.' || rr.table_name) IS NULL
    ) AS missing_required_relations,
    (
      SELECT count(*)
      FROM v22_columns AS vc
      JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
      JOIN pg_catalog.pg_class AS c
        ON c.relnamespace = n.oid AND c.relname = vc.table_name
      JOIN pg_catalog.pg_attribute AS a
        ON a.attrelid = c.oid
       AND a.attname = vc.column_name
       AND a.attnum > 0
       AND NOT a.attisdropped
    ) AS existing_v22_columns,
    (
      SELECT count(*)
      FROM pg_catalog.pg_proc AS p
      JOIN v22_functions AS vf ON vf.function_name = p.proname
    ) AS existing_v22_functions,
    (
      SELECT count(*)
      FROM pg_catalog.pg_constraint AS con
      WHERE con.conname IN (
        'training_profiles_contract_check',
        'training_profile_activities_contract_check',
        'nutrition_profiles_contract_check'
      )
    ) AS existing_v22_constraints,
    (
      SELECT count(*)
      FROM pg_catalog.pg_trigger AS tg
      WHERE NOT tg.tgisinternal
        AND tg.tgname = 'training_profile_activities_check_contract'
    ) AS existing_v22_triggers,
    (
      SELECT count(*)
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'complete_onboarding_v2'
    ) AS v2_rpc_overload_count
  FROM required_relations AS rr
  GROUP BY ()
)
SELECT
  '15_FINAL_DRIFT_SUMMARY' AS audit_section,
  CASE
    WHEN missing_required_relations > 0
      OR existing_v22_columns > 0
      OR existing_v22_functions > 0
      OR existing_v22_constraints > 0
      OR existing_v22_triggers > 0
      OR v2_rpc_overload_count <> 1
    THEN 'FAIL'
    ELSE 'PASS'
  END AS audit_status,
  missing_required_relations,
  existing_v22_columns,
  existing_v22_functions,
  existing_v22_constraints,
  existing_v22_triggers,
  v2_rpc_overload_count,
  CASE
    WHEN missing_required_relations > 0
      OR existing_v22_columns > 0
      OR existing_v22_functions > 0
      OR existing_v22_constraints > 0
      OR existing_v22_triggers > 0
      OR v2_rpc_overload_count <> 1
    THEN 'BLOCK_REVIEW_DRIFT_BEFORE_V22_MIGRATION'
    ELSE 'CATALOG_COLLISION_PREFLIGHT_PASSED_REVIEW_ALL_PRIOR_SECTIONS'
  END AS audit_result
FROM facts;
