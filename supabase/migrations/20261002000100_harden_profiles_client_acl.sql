-- Remove unnecessary table-level capabilities from the two client roles.
-- This migration changes ACLs only. It does not change data, RLS policies,
-- onboarding behavior, or the established per-column compatibility grants.
BEGIN;

SET LOCAL lock_timeout = '5s';

-- Keep the inspected ACL state stable until the transaction commits.
LOCK TABLE public.profiles IN ACCESS EXCLUSIVE MODE;

DO $preflight$
DECLARE
  profiles_oid oid := pg_catalog.to_regclass('public.profiles');
  client_role text;
  client_oid oid;
  privilege_name text;
  expected_columns text[];
  actual_direct_columns text[];
  actual_effective_columns text[];
BEGIN
  IF profiles_oid IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS c
    WHERE c.oid = profiles_oid
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Required RLS-enabled table public.profiles is missing or incompatible';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = c.relowner
    WHERE c.oid = profiles_oid
      AND owner_role.rolname IN ('anon', 'authenticated', 'service_role')
  ) THEN
    RAISE EXCEPTION 'public.profiles must have a trusted non-client owner';
  END IF;

  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    SELECT r.oid INTO client_oid
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname = client_role;

    IF client_oid IS NULL THEN
      RAISE EXCEPTION 'Required role % is missing', client_role;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles AS r
      WHERE r.oid = client_oid AND r.rolsuper
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_class AS c
      WHERE c.oid = profiles_oid AND c.relowner = client_oid
    ) THEN
      RAISE EXCEPTION '% has ownership or superuser access that a role-specific REVOKE cannot harden', client_role;
    END IF;

    IF NOT pg_catalog.has_table_privilege(client_oid, profiles_oid, 'SELECT') THEN
      RAISE EXCEPTION '% must retain effective SELECT on public.profiles', client_role;
    END IF;

    IF pg_catalog.has_table_privilege(client_oid, profiles_oid, 'INSERT')
       OR pg_catalog.has_table_privilege(client_oid, profiles_oid, 'UPDATE') THEN
      RAISE EXCEPTION '% unexpectedly has effective table-wide INSERT or UPDATE on public.profiles', client_role;
    END IF;

    FOREACH privilege_name IN ARRAY ARRAY['INSERT', 'UPDATE']
    LOOP
      IF client_role = 'authenticated' AND privilege_name = 'INSERT' THEN
        expected_columns := ARRAY[
          'last_activity_date', 'level', 'streak', 'total_xp', 'user_id'
        ]::text[];
      ELSIF client_role = 'authenticated' AND privilege_name = 'UPDATE' THEN
        expected_columns := ARRAY[
          'altura', 'best_league', 'dias_treino', 'idade',
          'last_activity_date', 'league', 'level', 'nivel_experiencia', 'nome',
          'objetivo', 'onboarding_completed', 'peso', 'sexo', 'streak',
          'total_xp', 'user_id', 'weekly_xp'
        ]::text[];
      ELSE
        -- Historical anon compatibility intentionally remains unchanged here.
        expected_columns := ARRAY[
          'altura', 'best_league', 'created_at', 'dias_treino', 'id', 'idade',
          'last_activity_date', 'league', 'level', 'nivel_experiencia', 'nome',
          'objetivo', 'onboarding_completed', 'peso', 'sexo',
          'status_assinatura', 'streak', 'total_xp', 'user_id', 'weekly_xp'
        ]::text[];
      END IF;

      SELECT pg_catalog.array_agg(a.attname::text ORDER BY a.attname::text)
      INTO actual_direct_columns
      FROM pg_catalog.pg_attribute AS a
      WHERE a.attrelid = profiles_oid
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(a.attacl) AS acl
          WHERE acl.grantee = client_oid
            AND acl.privilege_type = privilege_name
        );

      SELECT pg_catalog.array_agg(a.attname::text ORDER BY a.attname::text)
      INTO actual_effective_columns
      FROM pg_catalog.pg_attribute AS a
      WHERE a.attrelid = profiles_oid
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND pg_catalog.has_column_privilege(
          client_oid, profiles_oid, a.attnum, privilege_name
        );

      IF actual_direct_columns IS DISTINCT FROM expected_columns
         OR actual_effective_columns IS DISTINCT FROM expected_columns THEN
        RAISE EXCEPTION
          'Unexpected % column allowlist for % (direct: %, effective: %, expected: %)',
          privilege_name, client_role, actual_direct_columns,
          actual_effective_columns, expected_columns;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS r WHERE r.rolname = 'service_role'
  ) THEN
    RAISE EXCEPTION 'Required role service_role is missing';
  END IF;

  FOREACH privilege_name IN ARRAY ARRAY[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
    'REFERENCES', 'TRIGGER', 'MAINTAIN'
  ]
  LOOP
    IF NOT pg_catalog.has_table_privilege(
      'service_role', profiles_oid, privilege_name
    ) THEN
      RAISE EXCEPTION 'service_role lacks required % on public.profiles', privilege_name;
    END IF;
  END LOOP;
END
$preflight$;

-- Do not use REVOKE ALL: SELECT and every per-column INSERT/UPDATE grant must
-- survive unchanged. REVOKE is idempotent when a listed direct grant is absent.
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.profiles
  FROM anon, authenticated;

DO $postcondition$
DECLARE
  profiles_oid oid := 'public.profiles'::regclass;
  client_role text;
  client_oid oid;
  privilege_name text;
  expected_columns text[];
  actual_direct_columns text[];
  actual_effective_columns text[];
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    SELECT r.oid INTO STRICT client_oid
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname = client_role;

    FOREACH privilege_name IN ARRAY ARRAY[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
      'REFERENCES', 'TRIGGER', 'MAINTAIN'
    ]
    LOOP
      IF pg_catalog.has_table_privilege(
        client_oid, profiles_oid, privilege_name
      ) THEN
        RAISE EXCEPTION '% retains effective table-wide % on public.profiles',
          client_role, privilege_name;
      END IF;
    END LOOP;

    IF NOT pg_catalog.has_table_privilege(client_oid, profiles_oid, 'SELECT') THEN
      RAISE EXCEPTION '% lost expected SELECT on public.profiles', client_role;
    END IF;

    FOREACH privilege_name IN ARRAY ARRAY['INSERT', 'UPDATE']
    LOOP
      IF client_role = 'authenticated' AND privilege_name = 'INSERT' THEN
        expected_columns := ARRAY[
          'last_activity_date', 'level', 'streak', 'total_xp', 'user_id'
        ]::text[];
      ELSIF client_role = 'authenticated' AND privilege_name = 'UPDATE' THEN
        expected_columns := ARRAY[
          'altura', 'best_league', 'dias_treino', 'idade',
          'last_activity_date', 'league', 'level', 'nivel_experiencia', 'nome',
          'objetivo', 'onboarding_completed', 'peso', 'sexo', 'streak',
          'total_xp', 'user_id', 'weekly_xp'
        ]::text[];
      ELSE
        expected_columns := ARRAY[
          'altura', 'best_league', 'created_at', 'dias_treino', 'id', 'idade',
          'last_activity_date', 'league', 'level', 'nivel_experiencia', 'nome',
          'objetivo', 'onboarding_completed', 'peso', 'sexo',
          'status_assinatura', 'streak', 'total_xp', 'user_id', 'weekly_xp'
        ]::text[];
      END IF;

      SELECT pg_catalog.array_agg(a.attname::text ORDER BY a.attname::text)
      INTO actual_direct_columns
      FROM pg_catalog.pg_attribute AS a
      WHERE a.attrelid = profiles_oid
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(a.attacl) AS acl
          WHERE acl.grantee = client_oid
            AND acl.privilege_type = privilege_name
        );

      SELECT pg_catalog.array_agg(a.attname::text ORDER BY a.attname::text)
      INTO actual_effective_columns
      FROM pg_catalog.pg_attribute AS a
      WHERE a.attrelid = profiles_oid
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND pg_catalog.has_column_privilege(
          client_oid, profiles_oid, a.attnum, privilege_name
        );

      IF actual_direct_columns IS DISTINCT FROM expected_columns
         OR actual_effective_columns IS DISTINCT FROM expected_columns THEN
        RAISE EXCEPTION
          '% column allowlist changed for % (direct: %, effective: %, expected: %)',
          privilege_name, client_role, actual_direct_columns,
          actual_effective_columns, expected_columns;
      END IF;
    END LOOP;
  END LOOP;

  -- Explicit marker assertions document the V1/V2 boundary independently of
  -- the complete allowlist comparison above.
  IF NOT pg_catalog.has_column_privilege(
    'authenticated', profiles_oid, 'onboarding_completed', 'UPDATE'
  ) OR NOT pg_catalog.has_column_privilege(
    'anon', profiles_oid, 'onboarding_completed', 'INSERT'
  ) OR NOT pg_catalog.has_column_privilege(
    'anon', profiles_oid, 'onboarding_completed', 'UPDATE'
  ) THEN
    RAISE EXCEPTION 'Legacy onboarding_completed compatibility was not preserved';
  END IF;

  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    FOREACH privilege_name IN ARRAY ARRAY['INSERT', 'UPDATE']
    LOOP
      IF pg_catalog.has_column_privilege(
        client_role, profiles_oid, 'onboarding_version', privilege_name
      ) OR pg_catalog.has_column_privilege(
        client_role, profiles_oid, 'onboarding_completed_at', privilege_name
      ) THEN
        RAISE EXCEPTION '% retains % access to a protected V2 marker',
          client_role, privilege_name;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH privilege_name IN ARRAY ARRAY[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
    'REFERENCES', 'TRIGGER', 'MAINTAIN'
  ]
  LOOP
    IF NOT pg_catalog.has_table_privilege(
      'service_role', profiles_oid, privilege_name
    ) THEN
      RAISE EXCEPTION 'service_role lost required % on public.profiles', privilege_name;
    END IF;
  END LOOP;
END
$postcondition$;

COMMIT;
