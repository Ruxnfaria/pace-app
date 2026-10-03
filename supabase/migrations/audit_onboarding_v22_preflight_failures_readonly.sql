-- READ-ONLY PRODUCTION AUDIT
-- DO NOT APPLY AS A MIGRATION
-- DO NOT MODIFY DATA OR SCHEMA
-- SAFE TO RUN MANUALLY IN SUPABASE SQL EDITOR
--
-- Focused evidence for consolidated preflight checks 70, 122, 130, and 131.
-- Returns one metadata-only result set. It does not read user rows, execute a
-- business RPC, or expose UUIDs, emails, payloads, hashes, keys, or secrets.

WITH
target_roles AS (
  SELECT r.oid, r.rolname::text AS rolname
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
),
profiles_relation AS (
  SELECT c.oid, c.relowner, c.relacl, owner_role.rolname::text AS owner_name
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = c.relowner
  WHERE c.relname = 'profiles' AND c.relkind IN ('r', 'p')
),
initial_level_trigger AS (
  SELECT
    tg.oid AS trigger_oid,
    tg.tgname::text AS tgname,
    tg.tgenabled::text AS tgenabled,
    tg.tgtype::integer AS tgtype,
    c.relname::text AS table_name,
    n.nspname::text AS table_schema,
    p.oid AS function_oid,
    p.proname::text AS function_name,
    pn.nspname::text AS function_schema,
    p.prosecdef,
    p.proconfig,
    p.prorettype,
    l.lanname::text AS lanname,
    owner_role.rolname::text AS function_owner,
    pg_catalog.pg_get_triggerdef(tg.oid, false) AS trigger_definition_canonical,
    pg_catalog.pg_get_triggerdef(tg.oid, true) AS trigger_definition_pretty,
    pg_catalog.pg_get_functiondef(p.oid) AS function_definition
  FROM pg_catalog.pg_trigger AS tg
  JOIN pg_catalog.pg_class AS c ON c.oid = tg.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_proc AS p ON p.oid = tg.tgfoid
  JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.pronamespace
  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
  WHERE tg.tgname = 'training_profiles_set_initial_level'
    AND NOT tg.tgisinternal
),
target_policy AS (
  SELECT
    pol.oid,
    pol.polname::text AS polname,
    pol.polcmd::text AS polcmd,
    pol.polpermissive,
    pol.polroles,
    c.relname::text AS table_name,
    pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) AS using_expression,
    pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expression,
    ARRAY(
      SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE r.rolname::text END
      FROM pg_catalog.unnest(pol.polroles) AS policy_role(role_oid)
      LEFT JOIN pg_catalog.pg_roles AS r ON r.oid = role_oid
      ORDER BY CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE r.rolname::text END
    ) AS role_names
  FROM pg_catalog.pg_policy AS pol
  JOIN pg_catalog.pg_class AS c ON c.oid = pol.polrelid
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relname = 'profiles'
    AND pol.polname = 'Usuários podem gerenciar o próprio perfil'
),
profiles_policy_inventory AS (
  SELECT
    pol.polname::text AS polname,
    pol.polcmd::text AS polcmd,
    pol.polpermissive,
    ARRAY(
      SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE r.rolname::text END
      FROM pg_catalog.unnest(pol.polroles) AS policy_role(role_oid)
      LEFT JOIN pg_catalog.pg_roles AS r ON r.oid = role_oid
      ORDER BY CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE r.rolname::text END
    ) AS role_names,
    pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) AS using_expression,
    pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expression
  FROM pg_catalog.pg_policy AS pol
  JOIN profiles_relation AS pr ON pr.oid = pol.polrelid
),
raw_table_acl AS (
  SELECT
    CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname::text END AS grantee,
    acl.privilege_type::text AS privilege_type,
    acl.is_grantable,
    grantor_role.rolname::text AS grantor
  FROM profiles_relation AS pr
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(pr.relacl, pg_catalog.acldefault('r', pr.relowner))
  ) AS acl
  LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
  LEFT JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = acl.grantor
),
raw_marker_acl AS (
  SELECT
    a.attname::text AS column_name,
    CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname::text END AS grantee,
    acl.privilege_type::text AS privilege_type,
    acl.is_grantable,
    grantor_role.rolname::text AS grantor
  FROM profiles_relation AS pr
  JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = pr.oid
   AND a.attname IN (
     'onboarding_completed', 'onboarding_version', 'onboarding_completed_at'
   )
   AND a.attnum > 0 AND NOT a.attisdropped
  CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
  LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
  LEFT JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = acl.grantor
),
role_effective_privileges AS (
  SELECT
    r.rolname,
    pg_catalog.has_table_privilege(r.oid, pr.oid, 'SELECT') AS can_select_table,
    pg_catalog.has_table_privilege(r.oid, pr.oid, 'INSERT') AS reports_insert_table,
    pg_catalog.has_table_privilege(r.oid, pr.oid, 'UPDATE') AS reports_update_table,
    pg_catalog.has_table_privilege(r.oid, pr.oid, 'DELETE') AS can_delete_table,
    EXISTS (
      SELECT 1 FROM raw_table_acl AS acl
      WHERE acl.grantee = r.rolname AND acl.privilege_type = 'INSERT'
    ) AS direct_table_insert_acl,
    EXISTS (
      SELECT 1 FROM raw_table_acl AS acl
      WHERE acl.grantee = r.rolname AND acl.privilege_type = 'UPDATE'
    ) AS direct_table_update_acl,
    EXISTS (
      SELECT 1 FROM raw_table_acl AS acl
      WHERE acl.grantee = r.rolname AND acl.privilege_type = 'DELETE'
    ) AS direct_table_delete_acl,
    ARRAY(
      SELECT a.attname::text
      FROM pg_catalog.pg_attribute AS a
      WHERE a.attrelid = pr.oid AND a.attnum > 0 AND NOT a.attisdropped
        AND pg_catalog.has_column_privilege(r.oid, pr.oid, a.attnum, 'INSERT')
      ORDER BY a.attname
    ) AS effective_insert_columns,
    ARRAY(
      SELECT a.attname::text
      FROM pg_catalog.pg_attribute AS a
      WHERE a.attrelid = pr.oid AND a.attnum > 0 AND NOT a.attisdropped
        AND pg_catalog.has_column_privilege(r.oid, pr.oid, a.attnum, 'UPDATE')
      ORDER BY a.attname
    ) AS effective_update_columns
  FROM target_roles AS r
  CROSS JOIN profiles_relation AS pr
),
inherited_write_sources AS (
  SELECT DISTINCT
    client.rolname AS client_role,
    inherited.rolname::text AS inherited_role,
    'TABLE'::text AS acl_scope,
    NULL::text AS column_name,
    acl.privilege_type::text AS privilege_type
  FROM target_roles AS client
  JOIN pg_catalog.pg_roles AS inherited
    ON inherited.oid <> client.oid
   AND pg_catalog.pg_has_role(client.oid, inherited.oid, 'USAGE')
  CROSS JOIN profiles_relation AS pr
  CROSS JOIN LATERAL pg_catalog.aclexplode(pr.relacl) AS acl
  WHERE acl.grantee = inherited.oid
    AND acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  UNION ALL
  SELECT DISTINCT
    client.rolname,
    inherited.rolname::text,
    'COLUMN',
    a.attname::text,
    acl.privilege_type::text
  FROM target_roles AS client
  JOIN pg_catalog.pg_roles AS inherited
    ON inherited.oid <> client.oid
   AND pg_catalog.pg_has_role(client.oid, inherited.oid, 'USAGE')
  CROSS JOIN profiles_relation AS pr
  JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = pr.oid AND a.attnum > 0 AND NOT a.attisdropped
  CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
  WHERE acl.grantee = inherited.oid
    AND acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
),
marker_effective_privileges AS (
  SELECT
    r.rolname,
    a.attname::text AS column_name,
    pg_catalog.has_column_privilege(r.oid, pr.oid, a.attnum, 'INSERT') AS can_insert,
    pg_catalog.has_column_privilege(r.oid, pr.oid, a.attnum, 'UPDATE') AS can_update
  FROM target_roles AS r
  CROSS JOIN profiles_relation AS pr
  JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = pr.oid
   AND a.attname IN (
     'onboarding_completed', 'onboarding_version', 'onboarding_completed_at'
   )
   AND a.attnum > 0 AND NOT a.attisdropped
),
profiles_triggers AS (
  SELECT
    tg.tgname::text AS tgname,
    tg.tgenabled::text AS tgenabled,
    pn.nspname::text AS function_schema,
    p.proname::text AS function_name,
    pg_catalog.pg_get_triggerdef(tg.oid, false) AS trigger_definition,
    pg_catalog.pg_get_functiondef(p.oid) AS function_definition
  FROM profiles_relation AS pr
  JOIN pg_catalog.pg_trigger AS tg
    ON tg.tgrelid = pr.oid AND NOT tg.tgisinternal
  JOIN pg_catalog.pg_proc AS p ON p.oid = tg.tgfoid
  JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.pronamespace
),
evidence(check_order, audit_section, check_name,
         observed_value, expected_context, details) AS (
  SELECT
    10,
    'FAIL_70_TRIGGER',
    'TRIGGER_COUNT_AND_LOCATION',
    count(trigger_oid)::text || ' matching trigger(s)',
    'Exactly one trigger on public.training_profiles',
    COALESCE(pg_catalog.string_agg(
      table_schema || '.' || table_name || '.' || tgname,
      '; ' ORDER BY table_schema, table_name, tgname
    ), 'No matching trigger')
  FROM (VALUES (1)) AS seed(value)
  LEFT JOIN initial_level_trigger ON true
  UNION ALL
  SELECT
    11,
    'FAIL_70_TRIGGER',
    'TRIGGER_COMPONENTS',
    COALESCE('enabled=' || tgenabled ||
      '; row=' || ((tgtype & 1) <> 0)::text ||
      '; before=' || ((tgtype & 2) <> 0)::text ||
      '; insert=' || ((tgtype & 4) <> 0)::text ||
      '; delete=' || ((tgtype & 8) <> 0)::text ||
      '; update=' || ((tgtype & 16) <> 0)::text ||
      '; truncate=' || ((tgtype & 32) <> 0)::text ||
      '; instead=' || ((tgtype & 64) <> 0)::text, 'missing'),
    'enabled=O; row=true; before=true; insert=true; all other events=false',
    COALESCE(trigger_definition_canonical, 'No matching trigger')
  FROM (VALUES (1)) AS seed(value)
  LEFT JOIN initial_level_trigger ON true
  UNION ALL
  SELECT
    12,
    'FAIL_70_TRIGGER',
    'TRIGGER_PRETTY_DEFINITION',
    COALESCE(trigger_definition_pretty, 'missing'),
    'Informational: exposes formatting used by summary check 70',
    'Compare canonical and pretty forms semantically, not textually.'
  FROM (VALUES (1)) AS seed(value)
  LEFT JOIN initial_level_trigger ON true
  UNION ALL
  SELECT
    13,
    'FAIL_70_TRIGGER',
    'TRIGGER_FUNCTION_METADATA',
    COALESCE(function_schema || '.' || function_name ||
      '; language=' || lanname ||
      '; security=' || CASE WHEN prosecdef THEN 'DEFINER' ELSE 'INVOKER' END ||
      '; return=' || pg_catalog.format_type(prorettype, NULL) ||
      '; enabled=' || tgenabled ||
      '; config=' || COALESCE(proconfig::text, 'NULL') ||
      '; owner=' || function_owner, 'missing'),
    'public.training_profiles_set_initial_level; plpgsql; INVOKER; trigger; empty search_path; trusted owner',
    COALESCE(function_definition, 'No matching trigger function')
  FROM (VALUES (1)) AS seed(value)
  LEFT JOIN initial_level_trigger ON true
  UNION ALL
  SELECT
    14,
    'FAIL_70_TRIGGER',
    'TRIGGER_FUNCTION_SEMANTIC_SIGNALS',
    COALESCE(
      'assigns_initial_level=' || (pg_catalog.lower(function_definition) LIKE '%new.initial_training_level%')::text ||
      '; reads_experience=' || (pg_catalog.lower(function_definition) LIKE '%new.training_experience%')::text ||
      '; reads_confidence=' || (pg_catalog.lower(function_definition) LIKE '%new.exercise_confidence%')::text ||
      '; reads_break=' || (pg_catalog.lower(function_definition) LIKE '%new.recent_training_break%')::text ||
      '; beginner=' || (pg_catalog.lower(function_definition) LIKE '%beginner%')::text ||
      '; intermediate=' || (pg_catalog.lower(function_definition) LIKE '%intermediate%')::text ||
      '; advanced=' || (pg_catalog.lower(function_definition) LIKE '%advanced%')::text,
      'missing'),
    'All semantic signals true',
    'Signals only; the full function definition is in check 13.'
  FROM (VALUES (1)) AS seed(value)
  LEFT JOIN initial_level_trigger ON true
  UNION ALL
  SELECT
    20,
    'FAIL_122_POLICY',
    'TARGET_POLICY_METADATA',
    COALESCE('command=' || CASE polcmd
      WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
      WHEN '*' THEN 'ALL' ELSE polcmd::text END ||
      '; permissive=' || polpermissive::text ||
      '; roles=' || role_names::text, 'missing'),
    'Identity-scoped semantics must be evaluated with ACLs',
    'Policy name: Usuários podem gerenciar o próprio perfil'
  FROM (VALUES (1)) AS seed(value)
  LEFT JOIN target_policy ON true
  UNION ALL
  SELECT
    21,
    'FAIL_122_POLICY',
    'TARGET_POLICY_PREDICATES',
    COALESCE('USING=' || COALESCE(using_expression, 'NULL') ||
      '; WITH_CHECK=' || COALESCE(with_check_expression, 'NULL'), 'missing'),
    'Mutation predicates should bind auth.uid() to user_id',
    COALESCE('roles=' || role_names::text ||
      '; PUBLIC alone is not dangerous when identity predicates and ACLs fail closed.',
      'No matching policy')
  FROM (VALUES (1)) AS seed(value)
  LEFT JOIN target_policy ON true
  UNION ALL
  SELECT
    22,
    'FAIL_122_POLICY',
    'ALL_PROFILES_POLICIES',
    count(*)::text || ' policy row(s)',
    'Informational complete policy inventory',
    COALESCE(pg_catalog.string_agg(
      polname || ':command=' || polcmd || ':permissive=' || polpermissive::text ||
      ':roles=' || role_names::text || ':using=' || COALESCE(using_expression, 'NULL') ||
      ':check=' || COALESCE(with_check_expression, 'NULL'),
      E'\n' ORDER BY polname
    ), 'No policies')
  FROM profiles_policy_inventory
  UNION ALL
  SELECT
    30,
    'FAIL_130_TABLE_ACL',
    'RAW_TABLE_ACL',
    count(*)::text || ' ACL entrie(s)',
    'Exact direct table ACL sources for profiles',
    COALESCE(pg_catalog.string_agg(
      grantee || ':' || privilege_type || ':grantable=' || is_grantable::text ||
      ':grantor=' || COALESCE(grantor, 'unknown'),
      '; ' ORDER BY grantee, privilege_type
    ), 'No ACL entries')
  FROM raw_table_acl
  UNION ALL
  SELECT
    31 + (row_number() OVER (ORDER BY rolname))::integer,
    'FAIL_130_TABLE_ACL',
    'EFFECTIVE_PROFILE_PRIVILEGES_' || pg_catalog.upper(rolname),
    'select=' || can_select_table::text ||
      '; has_table_insert=' || reports_insert_table::text ||
      '; has_table_update=' || reports_update_table::text ||
      '; delete=' || can_delete_table::text ||
      '; direct_table_insert=' || direct_table_insert_acl::text ||
      '; direct_table_update=' || direct_table_update_acl::text ||
      '; direct_table_delete=' || direct_table_delete_acl::text,
    'Separate direct table ACLs from effective column privileges',
    'effective_insert_columns=' || effective_insert_columns::text ||
      '; effective_update_columns=' || effective_update_columns::text
  FROM role_effective_privileges
  UNION ALL
  SELECT
    36,
    'FAIL_130_TABLE_ACL',
    'INHERITED_WRITE_ACL_SOURCES',
    count(*)::text || ' inherited source(s)',
    '0 inherited write sources for client roles',
    COALESCE(pg_catalog.string_agg(
      client_role || '<-' || inherited_role || ':' || acl_scope ||
      COALESCE('.' || column_name, '') || ':' || privilege_type,
      '; ' ORDER BY client_role, inherited_role, acl_scope, column_name, privilege_type
    ), 'No inherited write ACL sources')
  FROM inherited_write_sources
  UNION ALL
  SELECT
    40 + (row_number() OVER (ORDER BY rolname, column_name))::integer,
    'FAIL_131_MARKERS',
    pg_catalog.upper(rolname) || '_' || pg_catalog.upper(column_name),
    'insert=' || can_insert::text || '; update=' || can_update::text,
    CASE column_name
      WHEN 'onboarding_completed' THEN 'Legacy V1 compatibility may allow UPDATE; inspect policy and ACL source'
      ELSE 'Client INSERT/UPDATE must both be false' END,
    CASE column_name
      WHEN 'onboarding_completed' THEN 'Legacy completion flag; V1 frontend writes it directly.'
      ELSE 'V2-only marker; written by SECURITY DEFINER completion RPC.' END
  FROM marker_effective_privileges
  UNION ALL
  SELECT
    60,
    'FAIL_131_MARKERS',
    'RAW_MARKER_COLUMN_ACL',
    count(*)::text || ' ACL entrie(s)',
    'Exact direct marker-column ACL sources',
    COALESCE(pg_catalog.string_agg(
      column_name || ':' || grantee || ':' || privilege_type ||
      ':grantable=' || is_grantable::text || ':grantor=' || COALESCE(grantor, 'unknown'),
      '; ' ORDER BY column_name, grantee, privilege_type
    ), 'No direct marker-column ACL entries')
  FROM raw_marker_acl
  UNION ALL
  SELECT
    70,
    'FAIL_131_MARKERS',
    'PROFILES_PROTECTION_TRIGGERS',
    count(*)::text || ' non-internal trigger(s)',
    'Informational: identify any independent marker-write enforcement',
    COALESCE(pg_catalog.string_agg(
      tgname || ':enabled=' || tgenabled || ':function=' ||
      function_schema || '.' || function_name || ':trigger=' || trigger_definition ||
      ':function_definition=' || function_definition,
      E'\n' ORDER BY tgname
    ), 'No non-internal triggers on public.profiles')
  FROM profiles_triggers
)
SELECT
  check_order,
  audit_section,
  check_name,
  observed_value,
  expected_context,
  details
FROM evidence
ORDER BY check_order, check_name;
