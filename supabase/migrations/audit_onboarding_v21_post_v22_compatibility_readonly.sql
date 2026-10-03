-- READ-ONLY V2.1 COMPATIBILITY AUDIT AFTER THE V2.2 FOUNDATION.
-- DO NOT APPLY AS A MIGRATION. This statement inspects catalogs and aggregate
-- counts only. It never invokes complete_onboarding_v2/complete_onboarding_v22
-- and never returns row-level user data.

WITH
expected_roles(role_name) AS (
  VALUES ('anon'::text), ('authenticated'::text), ('service_role'::text)
),
role_facts AS (
  SELECT count(*) FILTER (WHERE r.oid IS NULL) AS missing_count,
    pg_catalog.string_agg(e.role_name, ', ' ORDER BY e.role_name)
      FILTER (WHERE r.oid IS NULL) AS missing_names
  FROM expected_roles AS e
  LEFT JOIN pg_catalog.pg_roles AS r ON r.rolname = e.role_name
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
  SELECT count(*) FILTER (WHERE oid IS NULL OR relkind NOT IN ('r', 'p')
      OR owner_name IN ('anon', 'authenticated', 'service_role')) AS shape_owner_bad_count,
    count(*) FILTER (WHERE oid IS NULL OR NOT COALESCE(relrowsecurity, false)) AS rls_bad_count,
    pg_catalog.string_agg(table_name, ', ' ORDER BY table_name) FILTER (
      WHERE oid IS NULL OR relkind NOT IN ('r', 'p')
        OR owner_name IN ('anon', 'authenticated', 'service_role')) AS shape_owner_differences,
    pg_catalog.string_agg(table_name, ', ' ORDER BY table_name) FILTER (
      WHERE oid IS NULL OR NOT COALESCE(relrowsecurity, false)) AS rls_differences
  FROM relation_actual
),
rpc AS (
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
rpc_metadata_facts AS (
  SELECT count(*) AS overload_count,
    count(*) FILTER (WHERE identity_arguments = 'p_payload jsonb'
      AND result_type = 'TABLE(result text, onboarding_version smallint, completed_at timestamp with time zone)'
      AND language_name = 'plpgsql' AND prosecdef
      AND owner_name NOT IN ('anon', 'authenticated', 'service_role')
      AND pg_catalog.array_length(proconfig, 1) = 1
      AND proconfig[1] IN ('search_path=', 'search_path=""')) AS compatible_count
  FROM rpc
),
rpc_expected AS (
  SELECT * FROM rpc WHERE identity_arguments = 'p_payload jsonb'
),
rpc_grant_facts AS (
  SELECT COALESCE(pg_catalog.bool_and(
      pg_catalog.has_function_privilege(r.oid, rpc.oid, 'EXECUTE') =
        (r.rolname IN ('authenticated', 'service_role'))
    ), false) AS named_roles_match,
    COALESCE(pg_catalog.bool_and(NOT EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(rpc.effective_acl) AS acl
      WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    )), false) AS public_denied
  FROM rpc_expected AS rpc
  CROSS JOIN pg_catalog.pg_roles AS r
  WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
),
rpc_definition_facts AS (
  SELECT count(*) FILTER (WHERE
      definition LIKE '%auth.uid()%'
      AND definition LIKE '%from public.profiles as p%'
      AND definition LIKE '%for update%'
      AND definition LIKE '%payload_schema_version%'
      AND definition LIKE '%::integer <> 2%'
      AND definition LIKE '%v_receipt.payload_schema_version = 2%'
      AND definition LIKE '%v_receipt.canonicalization_version = 2%'
      AND definition LIKE '%r.onboarding_version = 2%'
      AND definition LIKE '%values (%v_user_id, 2, v_idempotency_key, v_payload_hash, 2, 2, v_completed_at%'
      AND definition LIKE '%conflicting completion receipt%'
      AND definition LIKE '%existing onboarding completion cannot be replaced%'
      AND definition LIKE '%existing v2 profile data requires a separate edit or recovery flow%'
      AND pg_catalog.strpos(definition, 'insert into public.onboarding_completion_receipts') > 0
      AND pg_catalog.strpos(definition, 'set onboarding_completed = true') >
          pg_catalog.strpos(definition, 'insert into public.onboarding_completion_receipts')
      AND definition NOT LIKE '%complete_onboarding_v22%'
      AND definition NOT LIKE '%canonicalize_onboarding_v22%'
      AND definition NOT LIKE '%onboarding_payload_schema_version%'
      AND definition NOT LIKE '%payload_schema_version = 3%'
      AND definition NOT LIKE '%canonicalization_version = 3%'
    ) AS compatible_count
  FROM rpc_expected
),
rpc_owner_facts AS (
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
  FROM rpc_expected AS rpc
  LEFT JOIN pg_catalog.pg_namespace AS auth_n ON auth_n.nspname = 'auth'
  LEFT JOIN pg_catalog.pg_proc AS auth_uid
    ON auth_uid.pronamespace = auth_n.oid AND auth_uid.proname = 'uid'
   AND pg_catalog.pg_get_function_identity_arguments(auth_uid.oid) = ''
),
initial_trigger AS (
  SELECT tg.oid, tg.tgenabled::text AS enabled,
    tg.tgtype::integer AS tgtype, pn.nspname::text AS function_schema,
    p.proname::text AS function_name, p.prosecdef, p.proconfig,
    pg_catalog.pg_get_function_result(p.oid) AS result_type,
    owner_role.rolname::text AS owner_name,
    pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid)) AS definition
  FROM pg_catalog.pg_trigger AS tg
  JOIN pg_catalog.pg_class AS c ON c.oid = tg.tgrelid
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_catalog.pg_proc AS p ON p.oid = tg.tgfoid
  JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
  WHERE c.relname = 'training_profiles'
    AND tg.tgname = 'training_profiles_set_initial_level'
    AND NOT tg.tgisinternal
),
initial_trigger_facts AS (
  SELECT count(*) AS trigger_count,
    count(*) FILTER (WHERE enabled = 'O' AND tgtype = 7
      AND function_schema = 'public'
      AND function_name = 'training_profiles_set_initial_level'
      AND NOT prosecdef AND result_type = 'trigger'
      AND owner_name NOT IN ('anon', 'authenticated', 'service_role')
      AND pg_catalog.array_length(proconfig, 1) = 1
      AND proconfig[1] IN ('search_path=', 'search_path=""')
      AND definition LIKE '%if new.onboarding_payload_schema_version = 3%'
      AND definition LIKE '%new.initial_training_level := case%'
      AND definition LIKE '%new.training_experience%'
      AND definition LIKE '%new.exercise_confidence%'
      AND definition LIKE '%new.recent_training_break%'
      AND definition LIKE '%then ''beginner''%'
      AND definition LIKE '%then ''advanced''%'
      AND definition LIKE '%else ''intermediate''%') AS compatible_count
  FROM initial_trigger
),
legacy_constraints(table_name, constraint_name, fragments) AS (
  VALUES
    ('training_profiles'::text, 'training_profiles_contract_check'::text,
      ARRAY['onboarding_payload_schema_version is null', 'priority_muscles is not null',
        'training_experience is not null', 'exercise_confidence is not null',
        'available_weekdays is not null', 'session_duration_min is not null',
        'session_duration_is_plus is not null', 'pain_or_limitation is not null',
        'affected_body_areas is not null', 'preferred_weekdays is null',
        'session_duration_range is null', 'aerobic_practice_frequency is null',
        'aerobic_safety_limitation is null']::text[]),
    ('training_profile_activities', 'training_profile_activities_contract_check',
      ARRAY['onboarding_payload_schema_version is null', 'duration_range is null',
        'intensity is null', 'activity_code <> ''walking''', 'fixed_weekdays',
        'variable', 'available_weekdays is not null', 'sessions_per_week is not null']::text[]),
    ('nutrition_profiles', 'nutrition_profiles_contract_check',
      ARRAY['onboarding_payload_schema_version is null',
        'food_preparation_style is not null', 'food_budget_style is not null',
        'available_meal_moments is null', 'food_preparation_availability is null',
        'current_eating_routine is null']::text[])
),
constraint_comparison AS (
  SELECT e.table_name, e.constraint_name, con.oid, con.convalidated,
    NOT EXISTS (
      SELECT 1 FROM pg_catalog.unnest(e.fragments) AS fragment(value)
      WHERE pg_catalog.strpos(pg_catalog.lower(COALESCE(
        pg_catalog.pg_get_constraintdef(con.oid, true), ''
      )), fragment.value) = 0
    ) AS fragments_match
  FROM legacy_constraints AS e
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
authenticated_select_facts AS (
  SELECT count(*) FILTER (WHERE r.oid IS NULL OR rel.oid IS NULL
      OR NOT pg_catalog.has_table_privilege(r.oid, rel.oid, 'SELECT')) AS gap_count,
    pg_catalog.string_agg(rel.table_name, ', ' ORDER BY rel.table_name) FILTER (
      WHERE r.oid IS NULL OR rel.oid IS NULL
        OR NOT pg_catalog.has_table_privilege(r.oid, rel.oid, 'SELECT')) AS differences
  FROM relation_actual AS rel
  LEFT JOIN pg_catalog.pg_roles AS r ON r.rolname = 'authenticated'
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
marker_acl_facts AS (
  SELECT
    pg_catalog.has_column_privilege('authenticated', 'public.profiles',
      'onboarding_completed', 'UPDATE') AS legacy_update_preserved,
    NOT pg_catalog.has_column_privilege('authenticated', 'public.profiles',
      'onboarding_version', 'INSERT')
      AND NOT pg_catalog.has_column_privilege('authenticated', 'public.profiles',
        'onboarding_version', 'UPDATE')
      AND NOT pg_catalog.has_column_privilege('authenticated', 'public.profiles',
        'onboarding_completed_at', 'INSERT')
      AND NOT pg_catalog.has_column_privilege('authenticated', 'public.profiles',
        'onboarding_completed_at', 'UPDATE')
      AND NOT pg_catalog.has_column_privilege('anon', 'public.profiles',
        'onboarding_version', 'INSERT')
      AND NOT pg_catalog.has_column_privilege('anon', 'public.profiles',
        'onboarding_version', 'UPDATE')
      AND NOT pg_catalog.has_column_privilege('anon', 'public.profiles',
        'onboarding_completed_at', 'INSERT')
      AND NOT pg_catalog.has_column_privilege('anon', 'public.profiles',
        'onboarding_completed_at', 'UPDATE') AS v2_markers_protected
),
data_guard AS (
  SELECT (SELECT shape_owner_bad_count = 0 FROM relation_facts)
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
          WHERE onboarding_version = 2 AND payload_schema_version = 2
            AND canonicalization_version = 2) AS receipts_v21,
        (SELECT count(*) FROM public.onboarding_completion_receipts
          WHERE onboarding_version <> 2 OR payload_schema_version <> 2
            OR canonicalization_version <> 2) AS unexpected_receipts,
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
          AND t.aerobic_safety_limitation IS NULL)) AS incompatible_training,
        (SELECT count(*) FROM public.training_profile_activities a WHERE NOT (
          a.onboarding_payload_schema_version IS NULL AND a.duration_range IS NULL
          AND a.intensity IS NULL AND a.activity_code <> 'walking' AND (
            (a.schedule_type = 'fixed_weekdays' AND a.available_weekdays IS NOT NULL
              AND cardinality(a.available_weekdays) >= 1
              AND a.available_weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
              AND cardinality(a.available_weekdays) = (
                SELECT count(DISTINCT day_value)
                FROM pg_catalog.unnest(a.available_weekdays) AS days(day_value))
              AND a.sessions_per_week IS NULL)
            OR (a.schedule_type = 'variable' AND a.available_weekdays IS NULL
              AND a.sessions_per_week IS NOT NULL AND a.sessions_per_week > 0))))
          AS incompatible_activities,
        (SELECT count(*) FROM public.nutrition_profiles n WHERE NOT (
          n.onboarding_payload_schema_version IS NULL
          AND n.food_preparation_style IS NOT NULL AND n.food_budget_style IS NOT NULL
          AND n.available_meal_moments IS NULL
          AND n.food_preparation_availability IS NULL
          AND n.current_eating_routine IS NULL)) AS incompatible_nutrition
    $data$, true, false, '') ELSE NULL END AS data_xml
  FROM data_guard
),
data_values AS (
  SELECT can_run,
    COALESCE(((pg_catalog.xpath('/table/row/receipts_total/text()', data_xml))[1]::text)::bigint, 0) AS receipts_total,
    COALESCE(((pg_catalog.xpath('/table/row/receipts_v21/text()', data_xml))[1]::text)::bigint, 0) AS receipts_v21,
    COALESCE(((pg_catalog.xpath('/table/row/unexpected_receipts/text()', data_xml))[1]::text)::bigint, 0) AS unexpected_receipts,
    COALESCE(((pg_catalog.xpath('/table/row/receipt_marker_mismatches/text()', data_xml))[1]::text)::bigint, 0) AS receipt_marker_mismatches,
    COALESCE(((pg_catalog.xpath('/table/row/markers_without_receipt/text()', data_xml))[1]::text)::bigint, 0) AS markers_without_receipt,
    COALESCE(((pg_catalog.xpath('/table/row/training_v3/text()', data_xml))[1]::text)::bigint, 0) AS training_v3,
    COALESCE(((pg_catalog.xpath('/table/row/activities_v3/text()', data_xml))[1]::text)::bigint, 0) AS activities_v3,
    COALESCE(((pg_catalog.xpath('/table/row/nutrition_v3/text()', data_xml))[1]::text)::bigint, 0) AS nutrition_v3,
    COALESCE(((pg_catalog.xpath('/table/row/incompatible_training/text()', data_xml))[1]::text)::bigint, 0) AS incompatible_training,
    COALESCE(((pg_catalog.xpath('/table/row/incompatible_activities/text()', data_xml))[1]::text)::bigint, 0) AS incompatible_activities,
    COALESCE(((pg_catalog.xpath('/table/row/incompatible_nutrition/text()', data_xml))[1]::text)::bigint, 0) AS incompatible_nutrition
  FROM data_snapshot
),
checks(check_order, audit_section, check_name, audit_status,
  observed_value, expected_value, details) AS (
  SELECT 10, 'A_FOUNDATION', 'REQUIRED_ROLES',
    CASE WHEN missing_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    missing_count::text || ' missing', '0 missing',
    COALESCE(missing_names, 'anon, authenticated, and service_role exist')
  FROM role_facts
  UNION ALL
  SELECT 20, 'B_COMPLETE_ONBOARDING_V2', 'RPC_SIGNATURE_OWNER_AND_RUNTIME',
    CASE WHEN overload_count = 1 AND compatible_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    overload_count::text || ' overloads; compatible=' || compatible_count::text,
    '1 overload; compatible=1',
    'Requires exact jsonb signature/table return, PL/pgSQL, SECURITY DEFINER, trusted owner, and empty search_path.'
  FROM rpc_metadata_facts
  UNION ALL
  SELECT 21, 'B_COMPLETE_ONBOARDING_V2', 'RPC_EXECUTE_GRANTS',
    CASE WHEN named_roles_match AND public_denied THEN 'PASS' ELSE 'FAIL' END,
    'named_roles_match=' || named_roles_match::text || '; public_denied=' || public_denied::text,
    'anon=false; authenticated=true; service_role=true; PUBLIC=false',
    'Effective grants are inspected without executing complete_onboarding_v2.'
  FROM rpc_grant_facts
  UNION ALL
  SELECT 22, 'B_COMPLETE_ONBOARDING_V2', 'V21_DEFINITION_AND_VERSION_ISOLATION',
    CASE WHEN compatible_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    compatible_count::text || ' compatible definitions', '1 compatible definition',
    'Checks auth identity, profile lock, 2/2 receipt/replay, fail-closed guards, marker-last ordering, and absence of schema-3/V2.2 references.'
  FROM rpc_definition_facts
  UNION ALL
  SELECT 23, 'B_COMPLETE_ONBOARDING_V2', 'RPC_OWNER_PRIVILEGES',
    CASE WHEN owner_access_ok THEN 'PASS' ELSE 'FAIL' END,
    'owner_access=' || owner_access_ok::text, 'owner_access=true',
    'The trusted SECURITY DEFINER owner retains the V2.1 runtime privileges.'
  FROM rpc_owner_facts
  UNION ALL
  SELECT 30, 'C_INITIAL_LEVEL', 'LEGACY_INITIAL_LEVEL_BRANCH',
    CASE WHEN trigger_count = 1 AND compatible_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    trigger_count::text || ' triggers; compatible=' || compatible_count::text,
    '1 trigger; compatible=1',
    'Semantic pg_trigger bits and the preserved V2.1 beginner/intermediate/advanced derivation are validated.'
  FROM initial_trigger_facts
  UNION ALL
  SELECT 40, 'D_LEGACY_CONSTRAINTS', 'V21_NULL_DISCRIMINATOR_BRANCHES',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' incompatible of 3', '0 incompatible of 3',
    COALESCE(differences, 'Training, activities, and nutrition retain validated V2.1 NULL-discriminator branches.')
  FROM constraint_facts
  UNION ALL
  SELECT 50, 'E_RLS_ACL', 'RELATIONS_OWNERS_AND_RLS',
    CASE WHEN shape_owner_bad_count = 0 AND rls_bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    shape_owner_bad_count::text || ' relation/owner errors; ' || rls_bad_count::text || ' RLS errors',
    '0 relation/owner errors; 0 RLS errors',
    COALESCE(shape_owner_differences, rls_differences,
      'All V2.1 relations exist with trusted owners and RLS enabled.')
  FROM relation_facts
  UNION ALL
  SELECT 51, 'E_RLS_ACL', 'AUTHENTICATED_READ_COMPATIBILITY',
    CASE WHEN gap_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    gap_count::text || ' SELECT gaps', '0 gaps',
    COALESCE(differences, 'authenticated retains SELECT on all scoped V2.1 relations.')
  FROM authenticated_select_facts
  UNION ALL
  SELECT 52, 'E_RLS_ACL', 'NO_DANGEROUS_CLIENT_TABLE_PRIVILEGES',
    CASE WHEN bad_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    bad_count::text || ' effective paths', '0 paths',
    COALESCE(differences, 'anon/authenticated have no table-wide writes or dangerous table capabilities.')
  FROM client_table_grant_facts
  UNION ALL
  SELECT 53, 'E_RLS_ACL', 'V1_MARKER_COMPATIBILITY_AND_V2_MARKER_PROTECTION',
    CASE WHEN legacy_update_preserved AND v2_markers_protected THEN 'PASS' ELSE 'FAIL' END,
    'legacy_update=' || legacy_update_preserved::text ||
      '; v2_markers_protected=' || v2_markers_protected::text,
    'legacy_update=true; v2_markers_protected=true',
    'Authenticated V1 can still update onboarding_completed; version/timestamp markers remain client-protected.'
  FROM marker_acl_facts
  UNION ALL
  SELECT 60, 'F_EXISTING_DATA', 'AGGREGATE_AUDIT_AVAILABILITY',
    CASE WHEN can_run THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN 'available' ELSE 'unavailable' END, 'available',
    'Only aggregate counts are inspected; no user-level values are returned.'
  FROM data_values
  UNION ALL
  SELECT 61, 'F_EXISTING_DATA', 'THREE_V21_RECEIPTS_PRESERVED',
    CASE WHEN can_run AND receipts_total = 3 AND receipts_v21 = 3
      AND unexpected_receipts = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN 'total=' || receipts_total::text || '; v21_2_2=' ||
      receipts_v21::text || '; unexpected=' || unexpected_receipts::text
      ELSE 'not evaluated' END,
    'total=3; v21_2_2=3; unexpected=0',
    'The reviewed historical receipts remain onboarding/payload/canonicalization 2/2/2.'
  FROM data_values
  UNION ALL
  SELECT 62, 'F_EXISTING_DATA', 'V21_MARKER_TIMESTAMP_CONSISTENCY',
    CASE WHEN can_run AND receipt_marker_mismatches = 0
      AND markers_without_receipt = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN 'receipt_mismatches=' || receipt_marker_mismatches::text ||
      '; markers_without_receipt=' || markers_without_receipt::text
      ELSE 'not evaluated' END,
    'receipt_mismatches=0; markers_without_receipt=0',
    'Receipt/profile markers and completion timestamps remain consistent in both directions.'
  FROM data_values
  UNION ALL
  SELECT 63, 'F_EXISTING_DATA', 'NO_HISTORICAL_SCHEMA3_ROWS',
    CASE WHEN can_run AND training_v3 = 0 AND activities_v3 = 0
      AND nutrition_v3 = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN 'training_v3=' || training_v3::text ||
      '; activities_v3=' || activities_v3::text || '; nutrition_v3=' || nutrition_v3::text
      ELSE 'not evaluated' END,
    'training_v3=0; activities_v3=0; nutrition_v3=0',
    'V2.1 rows must remain in the NULL discriminator branch before V2.2 activation.'
  FROM data_values
  UNION ALL
  SELECT 64, 'F_EXISTING_DATA', 'V21_ROWS_MATCH_POST_V22_CONSTRAINTS',
    CASE WHEN can_run AND incompatible_training = 0 AND incompatible_activities = 0
      AND incompatible_nutrition = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN can_run THEN 'training=' || incompatible_training::text ||
      '; activities=' || incompatible_activities::text ||
      '; nutrition=' || incompatible_nutrition::text ELSE 'not evaluated' END,
    'training=0; activities=0; nutrition=0',
    'All historical rows satisfy the legacy branches without invoking a write or RPC.'
  FROM data_values
),
check_counts AS (
  SELECT count(*) FILTER (WHERE audit_status = 'PASS') AS pass_count,
    count(*) FILTER (WHERE audit_status = 'WARN') AS warn_count,
    count(*) FILTER (WHERE audit_status = 'FAIL') AS fail_count
  FROM checks
),
final_row AS (
  SELECT 999 AS check_order, 'FINAL'::text AS audit_section,
    'ONBOARDING_V21_POST_V22_COMPATIBILITY'::text AS check_name,
    CASE WHEN fail_count > 0 THEN 'FAIL'
      WHEN warn_count > 0 THEN 'WARN' ELSE 'PASS' END::text AS audit_status,
    'PASS=' || pass_count::text || '; WARN=' || warn_count::text ||
      '; FAIL=' || fail_count::text AS observed_value,
    'FAIL=0; human review required'::text AS expected_value,
    CASE WHEN fail_count > 0 THEN 'V21_COMPATIBILITY_DRIFT_DETECTED'
      ELSE 'READY_FOR_V21_COMPATIBILITY_SMOKE_REVIEW' END::text AS details
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
