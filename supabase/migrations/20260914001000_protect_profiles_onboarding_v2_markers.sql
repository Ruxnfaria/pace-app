-- Protect the V2 onboarding markers from direct client writes.
-- This migration changes privileges only; it does not change profile data or RLS.
BEGIN;

SET LOCAL lock_timeout = '5s';

-- Freeze the table and its ACL-bearing catalog rows before inspecting them so
-- the accepted input state cannot change between preflight and reconstruction.
LOCK TABLE public.profiles IN ACCESS EXCLUSIVE MODE;

DO $preflight$
DECLARE
  profiles_oid oid;
  authenticated_oid oid;
  anon_oid oid;
  actual_columns text[];
  actual_direct_columns text[];
  actual_effective_columns text[];
  expected_privilege_columns text[];
  role_name text;
  role_oid oid;
  privilege_name text;
  state_a boolean := true;
  state_b boolean := true;
  expected_columns constant text[] := ARRAY[
    'altura',
    'best_league',
    'created_at',
    'dias_treino',
    'id',
    'idade',
    'last_activity_date',
    'league',
    'level',
    'nivel_experiencia',
    'nome',
    'objetivo',
    'onboarding_completed',
    'onboarding_completed_at',
    'onboarding_version',
    'peso',
    'sexo',
    'status_assinatura',
    'streak',
    'total_xp',
    'user_id',
    'weekly_xp'
  ]::text[];
BEGIN
  profiles_oid := pg_catalog.to_regclass('public.profiles');
  IF profiles_oid IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS c
    WHERE c.oid = profiles_oid
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE EXCEPTION 'Required table public.profiles is missing or incompatible';
  END IF;

  SELECT r.oid
  INTO authenticated_oid
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = 'authenticated';

  IF authenticated_oid IS NULL THEN
    RAISE EXCEPTION 'Required role authenticated is missing';
  END IF;

  SELECT r.oid
  INTO anon_oid
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = 'anon';

  IF anon_oid IS NULL THEN
    RAISE EXCEPTION 'Required role anon is missing';
  END IF;

  SELECT pg_catalog.array_agg(a.attname::text ORDER BY a.attname::text)
  INTO actual_columns
  FROM pg_catalog.pg_attribute AS a
  WHERE a.attrelid = profiles_oid
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF actual_columns IS DISTINCT FROM expected_columns THEN
    RAISE EXCEPTION
      'public.profiles columns differ from the audited 22-column contract (actual: %)',
      actual_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = profiles_oid
      AND a.attname = 'onboarding_version'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.atttypid = 'smallint'::regtype
      AND NOT a.attnotnull
      AND NOT a.atthasdef
      AND a.attidentity = ''
      AND a.attgenerated = ''
  ) THEN
    RAISE EXCEPTION 'Expected nullable, default-free smallint public.profiles.onboarding_version is missing or incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = profiles_oid
      AND a.attname = 'onboarding_completed_at'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.atttypid = 'timestamptz'::regtype
      AND NOT a.attnotnull
      AND NOT a.atthasdef
      AND a.attidentity = ''
      AND a.attgenerated = ''
  ) THEN
    RAISE EXCEPTION 'Expected nullable, default-free timestamptz public.profiles.onboarding_completed_at is missing or incompatible';
  END IF;

  -- Neither accepted input state may rely on PUBLIC, an inherited role,
  -- ownership, or superuser status. Role-specific REVOKEs cannot safely remove
  -- those sources, so reject them before changing any privilege.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS r
    WHERE r.oid IN (authenticated_oid, anon_oid)
      AND r.rolsuper
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS c
    WHERE c.oid = profiles_oid
      AND c.relowner IN (authenticated_oid, anon_oid)
  ) THEN
    RAISE EXCEPTION 'authenticated/anon ownership or superuser status is incompatible with fail-closed ACL reconstruction';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS c
    CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) AS acl
    WHERE c.oid = profiles_oid
      AND acl.grantee = 0
      AND acl.privilege_type IN ('INSERT', 'UPDATE')
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS a
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
    WHERE a.attrelid = profiles_oid
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND acl.grantee = 0
      AND acl.privilege_type IN ('INSERT', 'UPDATE')
  ) THEN
    RAISE EXCEPTION 'PUBLIC INSERT/UPDATE grants on public.profiles are outside the accepted input states';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES (authenticated_oid), (anon_oid)) AS requested(role_oid)
    JOIN pg_catalog.pg_roles AS inherited
      ON inherited.oid <> requested.role_oid
     AND pg_catalog.pg_has_role(requested.role_oid, inherited.oid, 'USAGE')
    JOIN pg_catalog.pg_class AS c
      ON c.oid = profiles_oid
    CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) AS acl
    WHERE acl.grantee = inherited.oid
      AND acl.privilege_type IN ('INSERT', 'UPDATE')
  ) OR EXISTS (
    SELECT 1
    FROM (VALUES (authenticated_oid), (anon_oid)) AS requested(role_oid)
    JOIN pg_catalog.pg_roles AS inherited
      ON inherited.oid <> requested.role_oid
     AND pg_catalog.pg_has_role(requested.role_oid, inherited.oid, 'USAGE')
    JOIN pg_catalog.pg_attribute AS a
      ON a.attrelid = profiles_oid
     AND a.attnum > 0
     AND NOT a.attisdropped
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
    WHERE acl.grantee = inherited.oid
      AND acl.privilege_type IN ('INSERT', 'UPDATE')
  ) THEN
    RAISE EXCEPTION 'Inherited INSERT/UPDATE grants on public.profiles are outside the accepted input states';
  END IF;

  -- State A is the original audited shape: all four direct table-wide grants
  -- exist. State B is the confirmed remote shape: none exists and both native
  -- direct-column ACLs and effective column privileges exactly match the final
  -- contract. A mixed or otherwise different state is rejected.
  FOREACH role_name IN ARRAY ARRAY['authenticated', 'anon']
  LOOP
    role_oid := CASE role_name
      WHEN 'authenticated' THEN authenticated_oid
      ELSE anon_oid
    END;

    FOREACH privilege_name IN ARRAY ARRAY['INSERT', 'UPDATE']
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS c
        CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) AS acl
        WHERE c.oid = profiles_oid
          AND acl.grantee = role_oid
          AND acl.privilege_type = privilege_name
      ) THEN
        state_a := false;
      ELSE
        state_b := false;
      END IF;

      IF role_name = 'authenticated' AND privilege_name = 'INSERT' THEN
        expected_privilege_columns := ARRAY[
          'last_activity_date', 'level', 'streak', 'total_xp', 'user_id'
        ]::text[];
      ELSIF role_name = 'authenticated' AND privilege_name = 'UPDATE' THEN
        expected_privilege_columns := ARRAY[
          'altura', 'best_league', 'dias_treino', 'idade',
          'last_activity_date', 'league', 'level', 'nivel_experiencia', 'nome',
          'objetivo', 'onboarding_completed', 'peso', 'sexo', 'streak',
          'total_xp', 'user_id', 'weekly_xp'
        ]::text[];
      ELSE
        expected_privilege_columns := ARRAY[
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
          WHERE acl.grantee = role_oid
            AND acl.privilege_type = privilege_name
        );

      SELECT pg_catalog.array_agg(a.attname::text ORDER BY a.attname::text)
      INTO actual_effective_columns
      FROM pg_catalog.pg_attribute AS a
      WHERE a.attrelid = profiles_oid
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND pg_catalog.has_column_privilege(
          role_oid, profiles_oid, a.attnum, privilege_name
        );

      IF actual_direct_columns IS DISTINCT FROM expected_privilege_columns
         OR actual_effective_columns IS DISTINCT FROM expected_privilege_columns THEN
        state_b := false;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT state_a AND NOT state_b THEN
    RAISE EXCEPTION 'public.profiles ACLs match neither accepted State A (four direct table grants) nor State B (exact final direct/effective column allowlists)';
  END IF;
END
$preflight$;

-- Remove both privilege layers confirmed by the audit: table-wide grants and
-- any explicit per-column grants. REVOKE is harmless for absent column grants.
REVOKE INSERT, UPDATE ON TABLE public.profiles FROM authenticated, anon;

REVOKE INSERT (
  id, user_id, nome, peso, altura, objetivo, status_assinatura, created_at,
  total_xp, level, streak, last_activity_date, league, weekly_xp, best_league,
  onboarding_completed, nivel_experiencia, idade, sexo, dias_treino,
  onboarding_version, onboarding_completed_at
) ON TABLE public.profiles FROM authenticated, anon;

REVOKE UPDATE (
  id, user_id, nome, peso, altura, objetivo, status_assinatura, created_at,
  total_xp, level, streak, last_activity_date, league, weekly_xp, best_league,
  onboarding_completed, nivel_experiencia, idade, sexo, dias_treino,
  onboarding_version, onboarding_completed_at
) ON TABLE public.profiles FROM authenticated, anon;

-- Authenticated clients retain only the audited direct-write compatibility set.
GRANT UPDATE (
  user_id, nome, peso, altura, objetivo, total_xp, level, streak,
  last_activity_date, league, weekly_xp, best_league, onboarding_completed,
  nivel_experiencia, idade, sexo, dias_treino
) ON TABLE public.profiles TO authenticated;

GRANT INSERT (
  user_id, total_xp, level, streak, last_activity_date
) ON TABLE public.profiles TO authenticated;

-- This stage deliberately preserves anon access to every pre-existing column
-- except the two V2 markers. Broader anon hardening belongs in a later change.
GRANT UPDATE (
  id, user_id, nome, peso, altura, objetivo, status_assinatura, created_at,
  total_xp, level, streak, last_activity_date, league, weekly_xp, best_league,
  onboarding_completed, nivel_experiencia, idade, sexo, dias_treino
) ON TABLE public.profiles TO anon;

GRANT INSERT (
  id, user_id, nome, peso, altura, objetivo, status_assinatura, created_at,
  total_xp, level, streak, last_activity_date, league, weekly_xp, best_league,
  onboarding_completed, nivel_experiencia, idade, sexo, dias_treino
) ON TABLE public.profiles TO anon;

-- Fail closed if PUBLIC/inherited privileges or an unexpected ACL interaction
-- makes the effective result differ from the requested allowlists. Any failure
-- rolls back every REVOKE and GRANT above.
DO $postcondition$
DECLARE
  profiles_oid oid := 'public.profiles'::regclass;
  role_name text;
  role_oid oid;
  privilege_name text;
  actual_columns text[];
  actual_direct_columns text[];
  expected_columns text[];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS c
    CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) AS acl
    WHERE c.oid = profiles_oid
      AND acl.grantee = 0
      AND acl.privilege_type IN ('INSERT', 'UPDATE')
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS a
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
    WHERE a.attrelid = profiles_oid
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND acl.grantee = 0
      AND acl.privilege_type IN ('INSERT', 'UPDATE')
  ) THEN
    RAISE EXCEPTION 'PUBLIC INSERT/UPDATE ACL remains on public.profiles';
  END IF;

  FOREACH role_name IN ARRAY ARRAY['authenticated', 'anon']
  LOOP
    SELECT r.oid INTO STRICT role_oid
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname = role_name;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles AS inherited
      JOIN pg_catalog.pg_class AS c
        ON c.oid = profiles_oid
      CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) AS acl
      WHERE inherited.oid <> role_oid
        AND pg_catalog.pg_has_role(role_oid, inherited.oid, 'USAGE')
        AND acl.grantee = inherited.oid
        AND acl.privilege_type IN ('INSERT', 'UPDATE')
    ) OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles AS inherited
      JOIN pg_catalog.pg_attribute AS a
        ON a.attrelid = profiles_oid
       AND a.attnum > 0
       AND NOT a.attisdropped
      CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
      WHERE inherited.oid <> role_oid
        AND pg_catalog.pg_has_role(role_oid, inherited.oid, 'USAGE')
        AND acl.grantee = inherited.oid
        AND acl.privilege_type IN ('INSERT', 'UPDATE')
    ) THEN
      RAISE EXCEPTION '% inherits an INSERT/UPDATE ACL on public.profiles',
        role_name;
    END IF;

    FOREACH privilege_name IN ARRAY ARRAY['INSERT', 'UPDATE']
    LOOP
      IF pg_catalog.has_table_privilege(role_oid, profiles_oid, privilege_name) THEN
        RAISE EXCEPTION '% retains effective table-wide % on public.profiles',
          role_name, privilege_name;
      END IF;

      SELECT pg_catalog.array_agg(a.attname::text ORDER BY a.attname::text)
      INTO actual_columns
      FROM pg_catalog.pg_attribute AS a
      WHERE a.attrelid = profiles_oid
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND pg_catalog.has_column_privilege(
          role_oid,
          profiles_oid,
          a.attnum,
          privilege_name
        );

      IF role_name = 'authenticated' AND privilege_name = 'INSERT' THEN
        expected_columns := ARRAY[
          'last_activity_date', 'level', 'streak', 'total_xp', 'user_id'
        ]::text[];
      ELSIF role_name = 'authenticated' AND privilege_name = 'UPDATE' THEN
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
          WHERE acl.grantee = role_oid
            AND acl.privilege_type = privilege_name
        );

      IF actual_direct_columns IS DISTINCT FROM expected_columns THEN
        RAISE EXCEPTION
          'Direct-column % allowlist for % is unexpected (actual: %, expected: %)',
          privilege_name, role_name, actual_direct_columns, expected_columns;
      END IF;

      IF actual_columns IS DISTINCT FROM expected_columns THEN
        RAISE EXCEPTION
          'Effective % allowlist for % is unexpected (actual: %, expected: %)',
          privilege_name, role_name, actual_columns, expected_columns;
      END IF;
    END LOOP;
  END LOOP;
END
$postcondition$;

COMMIT;
