-- Initial, atomic completion endpoint for Onboarding V2.
-- This migration installs the RPC only. It does not call it or change user data.
-- Onboarding V2 contract: birth_date is authoritative and completion requires
-- the user to have reached 18 years of age on the server's current date.
BEGIN;

SET LOCAL lock_timeout = '5s';

DO $preflight$
DECLARE
  required_relation text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'complete_onboarding_v2'
  ) THEN
    RAISE EXCEPTION 'A public.complete_onboarding_v2 overload already exists; audit before proceeding';
  END IF;

  IF current_user IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'Migration must be run by a trusted non-client owner';
  END IF;

  FOREACH required_relation IN ARRAY ARRAY[
    'public.profiles',
    'public.user_health_profiles',
    'public.training_profiles',
    'public.training_profile_activities',
    'public.nutrition_profiles',
    'public.nutrition_profile_restrictions',
    'public.nutrition_profile_disliked_foods',
    'public.nutrition_profile_preferred_foods',
    'public.nutrition_profile_supplements',
    'public.onboarding_completion_receipts'
  ]
  LOOP
    IF pg_catalog.to_regclass(required_relation) IS NULL THEN
      RAISE EXCEPTION 'Required relation % is missing', required_relation;
    END IF;
  END LOOP;

  IF pg_catalog.to_regprocedure('auth.uid()') IS NULL
     OR pg_catalog.to_regprocedure('pg_catalog.sha256(bytea)') IS NULL
     OR pg_catalog.to_regprocedure('pg_catalog.trim_scale(numeric)') IS NULL
     OR pg_catalog.to_regprocedure('public.training_profiles_set_initial_level()') IS NULL
     OR pg_catalog.to_regprocedure('public.training_profile_code_set_valid(text[],text[])') IS NULL
     OR pg_catalog.to_regprocedure('public.reward_system_set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'Required auth, SHA-256, training, or updated_at helper is missing';
  END IF;

  IF NOT pg_catalog.has_schema_privilege(current_user, 'auth', 'USAGE')
     OR NOT pg_catalog.has_function_privilege(current_user, 'auth.uid()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege(current_user, 'pg_catalog.sha256(bytea)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege(current_user, 'public.training_profile_code_set_valid(text[],text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'Function owner lacks required schema or helper privileges';
  END IF;

  IF NOT pg_catalog.has_table_privilege(current_user, 'public.profiles', 'SELECT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.profiles', 'UPDATE')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.user_health_profiles', 'SELECT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.user_health_profiles', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.training_profiles', 'SELECT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.training_profiles', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.training_profile_activities', 'SELECT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.training_profile_activities', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.nutrition_profiles', 'SELECT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.nutrition_profiles', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.nutrition_profile_restrictions', 'SELECT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.nutrition_profile_restrictions', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.nutrition_profile_disliked_foods', 'SELECT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.nutrition_profile_disliked_foods', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.nutrition_profile_preferred_foods', 'SELECT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.nutrition_profile_preferred_foods', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.nutrition_profile_supplements', 'SELECT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.nutrition_profile_supplements', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.onboarding_completion_receipts', 'SELECT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.onboarding_completion_receipts', 'INSERT') THEN
    RAISE EXCEPTION 'Function owner lacks the table privileges required at runtime';
  END IF;
END
$preflight$;

CREATE FUNCTION public.complete_onboarding_v2(p_payload jsonb)
RETURNS TABLE (
  result text,
  onboarding_version smallint,
  completed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_idempotency_key uuid;
  v_keys text[];
  v_profile_onboarding_completed boolean;
  v_profile_onboarding_version smallint;
  v_profile_onboarding_completed_at timestamptz;
  v_receipt public.onboarding_completion_receipts%ROWTYPE;

  v_health jsonb;
  v_birth_date date;
  v_biological_sex text;
  v_height_cm numeric;
  v_weight_kg numeric;
  v_target_weight_kg numeric;
  v_health_goal text;

  v_training jsonb;
  v_training_goal text;
  v_priority_muscles text[];
  v_training_experience text;
  v_exercise_confidence text;
  v_recent_training_break text;
  v_training_days smallint;
  v_training_weekdays smallint[];
  v_session_duration smallint;
  v_session_plus boolean;
  v_training_location text;
  v_other_location text;
  v_equipment text[];
  v_other_equipment text;
  v_pain boolean;
  v_body_areas text[];
  v_activities jsonb;

  v_nutrition jsonb;
  v_meals_per_day smallint;
  v_preparation_style text;
  v_budget_style text;
  v_dietary_pattern text;
  v_dietary_other text;
  v_has_restrictions boolean;
  v_uses_supplements boolean;
  v_accepts_eggs boolean;
  v_accepts_dairy boolean;
  v_restrictions jsonb;
  v_disliked_foods jsonb;
  v_preferred_foods jsonb;
  v_supplements jsonb;

  v_canonical jsonb;
  v_payload_hash bytea;
  v_completed_at timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '28000',
      MESSAGE = 'Authentication required to complete onboarding';
  END IF;

  -- The profile row is the per-user serialization point for the entire call.
  SELECT p.onboarding_completed, p.onboarding_version, p.onboarding_completed_at
  INTO v_profile_onboarding_completed, v_profile_onboarding_version,
       v_profile_onboarding_completed_at
  FROM public.profiles AS p
  WHERE p.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Profile not found for authenticated user';
  END IF;

  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Onboarding payload must be a JSON object';
  END IF;

  SELECT pg_catalog.array_agg(k ORDER BY k) INTO v_keys
  FROM pg_catalog.jsonb_object_keys(p_payload) AS keys(k);
  IF v_keys IS DISTINCT FROM ARRAY[
    'health', 'idempotency_key', 'nutrition', 'payload_schema_version', 'training'
  ]::text[] THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Onboarding payload has missing or unknown top-level fields';
  END IF;

  IF pg_catalog.jsonb_typeof(p_payload->'idempotency_key') <> 'string'
     OR pg_catalog.jsonb_typeof(p_payload->'payload_schema_version') <> 'number'
     OR (p_payload->>'payload_schema_version') !~ '^[0-9]+$'
     OR (p_payload->>'payload_schema_version')::integer <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid idempotency key or unsupported payload schema version';
  END IF;

  BEGIN
    v_idempotency_key := (p_payload->>'idempotency_key')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'idempotency_key must be a valid UUID';
  END;

  v_health := p_payload->'health';
  v_training := p_payload->'training';
  v_nutrition := p_payload->'nutrition';
  IF pg_catalog.jsonb_typeof(v_health) <> 'object'
     OR pg_catalog.jsonb_typeof(v_training) <> 'object'
     OR pg_catalog.jsonb_typeof(v_nutrition) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'health, training, and nutrition must be JSON objects';
  END IF;

  -- Health payload: exact shape and primitive types.
  SELECT pg_catalog.array_agg(k ORDER BY k) INTO v_keys
  FROM pg_catalog.jsonb_object_keys(v_health) AS keys(k);
  IF v_keys IS DISTINCT FROM ARRAY[
    'biological_sex', 'birth_date', 'height_cm', 'primary_goal',
    'target_weight_kg', 'weight_kg'
  ]::text[]
     OR pg_catalog.jsonb_typeof(v_health->'birth_date') <> 'string'
     OR (v_health->>'birth_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR pg_catalog.jsonb_typeof(v_health->'biological_sex') <> 'string'
     OR pg_catalog.jsonb_typeof(v_health->'height_cm') <> 'number'
     OR pg_catalog.jsonb_typeof(v_health->'weight_kg') <> 'number'
     OR pg_catalog.jsonb_typeof(v_health->'primary_goal') <> 'string'
     OR pg_catalog.jsonb_typeof(v_health->'target_weight_kg') NOT IN ('number', 'null') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid health payload shape or types';
  END IF;

  BEGIN
    v_birth_date := (v_health->>'birth_date')::date;
    v_biological_sex := v_health->>'biological_sex';
    v_height_cm := (v_health->>'height_cm')::numeric;
    v_weight_kg := (v_health->>'weight_kg')::numeric;
    v_target_weight_kg := CASE WHEN v_health->'target_weight_kg' = 'null'::jsonb
      THEN NULL ELSE (v_health->>'target_weight_kg')::numeric END;
    v_health_goal := v_health->>'primary_goal';
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Health payload contains an invalid value';
  END;

  IF v_birth_date > CURRENT_DATE THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Birth date cannot be in the future';
  END IF;

  -- age(date, date) is calendar-aware: it changes only when the birthday has
  -- actually been reached, including across month lengths and leap years.
  IF pg_catalog.date_part('year', pg_catalog.age(CURRENT_DATE, v_birth_date)) < 18 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'User must be at least 18 years old to complete onboarding';
  END IF;

  IF v_biological_sex NOT IN ('male', 'female', 'not_specified')
     OR v_height_cm <= 0 OR v_height_cm > 300
     OR v_weight_kg <= 0 OR v_weight_kg > 500
     OR (v_target_weight_kg IS NOT NULL AND (v_target_weight_kg <= 0 OR v_target_weight_kg > 500))
     OR v_health_goal NOT IN ('hypertrophy', 'fat_loss', 'body_recomposition', 'strength', 'conditioning', 'health') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Health payload violates the onboarding contract';
  END IF;

  -- Training parent payload. initial_training_level is deliberately absent:
  -- the existing BEFORE INSERT trigger remains the sole source of truth.
  SELECT pg_catalog.array_agg(k ORDER BY k) INTO v_keys
  FROM pg_catalog.jsonb_object_keys(v_training) AS keys(k);
  IF v_keys IS DISTINCT FROM ARRAY[
    'activities', 'affected_body_areas', 'available_equipment', 'available_weekdays',
    'exercise_confidence', 'other_equipment_label', 'other_location_label',
    'pain_or_limitation', 'primary_goal', 'priority_muscles', 'recent_training_break',
    'session_duration_is_plus', 'session_duration_min', 'training_days_per_week',
    'training_experience', 'training_location'
  ]::text[] THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Training payload has missing or unknown fields';
  END IF;

  IF pg_catalog.jsonb_typeof(v_training->'primary_goal') <> 'string'
     OR pg_catalog.jsonb_typeof(v_training->'priority_muscles') <> 'array'
     OR pg_catalog.jsonb_typeof(v_training->'training_experience') <> 'string'
     OR pg_catalog.jsonb_typeof(v_training->'exercise_confidence') <> 'string'
     OR pg_catalog.jsonb_typeof(v_training->'recent_training_break') NOT IN ('string', 'null')
     OR pg_catalog.jsonb_typeof(v_training->'training_days_per_week') <> 'number'
     OR (v_training->>'training_days_per_week') !~ '^[0-9]+$'
     OR pg_catalog.jsonb_typeof(v_training->'available_weekdays') <> 'array'
     OR pg_catalog.jsonb_typeof(v_training->'session_duration_min') <> 'number'
     OR (v_training->>'session_duration_min') !~ '^[0-9]+$'
     OR pg_catalog.jsonb_typeof(v_training->'session_duration_is_plus') <> 'boolean'
     OR pg_catalog.jsonb_typeof(v_training->'training_location') <> 'string'
     OR pg_catalog.jsonb_typeof(v_training->'other_location_label') NOT IN ('string', 'null')
     OR pg_catalog.jsonb_typeof(v_training->'available_equipment') <> 'array'
     OR pg_catalog.jsonb_typeof(v_training->'other_equipment_label') NOT IN ('string', 'null')
     OR pg_catalog.jsonb_typeof(v_training->'pain_or_limitation') <> 'boolean'
     OR pg_catalog.jsonb_typeof(v_training->'affected_body_areas') <> 'array'
     OR pg_catalog.jsonb_typeof(v_training->'activities') <> 'array'
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(CASE WHEN pg_catalog.jsonb_typeof(v_training->'priority_muscles') = 'array' THEN v_training->'priority_muscles' ELSE '[]'::jsonb END) e WHERE pg_catalog.jsonb_typeof(e) <> 'string')
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(CASE WHEN pg_catalog.jsonb_typeof(v_training->'available_weekdays') = 'array' THEN v_training->'available_weekdays' ELSE '[]'::jsonb END) e WHERE pg_catalog.jsonb_typeof(e) <> 'number' OR (e #>> '{}') !~ '^[0-9]+$')
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(CASE WHEN pg_catalog.jsonb_typeof(v_training->'available_equipment') = 'array' THEN v_training->'available_equipment' ELSE '[]'::jsonb END) e WHERE pg_catalog.jsonb_typeof(e) <> 'string')
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(CASE WHEN pg_catalog.jsonb_typeof(v_training->'affected_body_areas') = 'array' THEN v_training->'affected_body_areas' ELSE '[]'::jsonb END) e WHERE pg_catalog.jsonb_typeof(e) <> 'string') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid training payload types';
  END IF;

  BEGIN
    v_training_goal := v_training->>'primary_goal';
    v_priority_muscles := ARRAY(SELECT e #>> '{}' FROM pg_catalog.jsonb_array_elements(v_training->'priority_muscles') e);
    v_training_experience := v_training->>'training_experience';
    v_exercise_confidence := v_training->>'exercise_confidence';
    v_recent_training_break := CASE WHEN v_training->'recent_training_break' = 'null'::jsonb THEN NULL ELSE v_training->>'recent_training_break' END;
    v_training_days := (v_training->>'training_days_per_week')::smallint;
    v_training_weekdays := ARRAY(SELECT (e #>> '{}')::smallint FROM pg_catalog.jsonb_array_elements(v_training->'available_weekdays') e);
    v_session_duration := (v_training->>'session_duration_min')::smallint;
    v_session_plus := (v_training->>'session_duration_is_plus')::boolean;
    v_training_location := v_training->>'training_location';
    v_other_location := CASE WHEN v_training->'other_location_label' = 'null'::jsonb THEN NULL ELSE pg_catalog.btrim(v_training->>'other_location_label') END;
    v_equipment := ARRAY(SELECT e #>> '{}' FROM pg_catalog.jsonb_array_elements(v_training->'available_equipment') e);
    v_other_equipment := CASE WHEN v_training->'other_equipment_label' = 'null'::jsonb THEN NULL ELSE pg_catalog.btrim(v_training->>'other_equipment_label') END;
    v_pain := (v_training->>'pain_or_limitation')::boolean;
    v_body_areas := ARRAY(SELECT e #>> '{}' FROM pg_catalog.jsonb_array_elements(v_training->'affected_body_areas') e);
    v_activities := v_training->'activities';
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Training payload contains an invalid value';
  END;

  IF v_training_goal NOT IN ('hypertrophy', 'fat_loss', 'body_recomposition', 'strength', 'conditioning', 'health')
     OR NOT public.training_profile_code_set_valid(v_priority_muscles, ARRAY['chest','back','shoulders','biceps','triceps','quadriceps','hamstrings','glutes','calves','core']::text[])
     OR pg_catalog.cardinality(v_priority_muscles) > 3
     OR v_training_experience NOT IN ('none','under_6_months','6_to_12_months','1_to_2_years','over_2_years')
     OR v_exercise_confidence NOT IN ('needs_guidance','basic_independent','confident_independent')
     OR NOT ((v_training_experience = 'none' AND v_recent_training_break IS NULL)
       OR (v_training_experience <> 'none' AND v_recent_training_break IN ('no_significant_break','under_1_month','1_to_3_months','over_3_months')))
     OR v_training_days NOT BETWEEN 2 AND 6
     OR NOT public.training_profile_code_set_valid(v_training_weekdays::text[], ARRAY['1','2','3','4','5','6','7']::text[])
     OR pg_catalog.cardinality(v_training_weekdays) < v_training_days
     OR NOT ((v_session_duration IN (30,45,60,75) AND NOT v_session_plus) OR (v_session_duration = 90 AND v_session_plus))
     OR v_training_location NOT IN ('full_gym','home','outdoor','other')
     OR NOT ((v_training_location = 'other' AND v_other_location IS NOT NULL AND v_other_location <> '' AND pg_catalog.length(v_other_location) <= 80)
       OR (v_training_location <> 'other' AND v_other_location IS NULL))
     OR pg_catalog.cardinality(v_equipment) < 1
     OR NOT public.training_profile_code_set_valid(v_equipment, ARRAY['bodyweight','dumbbells','barbell','weight_plates','bench','rack','cable_machine','selectorized_machines','smith_machine','leg_press','resistance_bands','pull_up_bar','kettlebell','other']::text[])
     OR NOT ((('other' = ANY(v_equipment)) AND v_other_equipment IS NOT NULL AND v_other_equipment <> '' AND pg_catalog.length(v_other_equipment) <= 80)
       OR (NOT ('other' = ANY(v_equipment)) AND v_other_equipment IS NULL))
     OR NOT public.training_profile_code_set_valid(v_body_areas, ARRAY['neck','shoulder','elbow','wrist_hand','upper_back','lower_back','hip','knee','ankle_foot','other','unspecified']::text[])
     OR NOT ((NOT v_pain AND pg_catalog.cardinality(v_body_areas) = 0) OR (v_pain AND pg_catalog.cardinality(v_body_areas) >= 1)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Training payload violates the onboarding contract';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_activities) a
    CROSS JOIN LATERAL (SELECT pg_catalog.array_agg(k ORDER BY k) AS keys
      FROM pg_catalog.jsonb_object_keys(CASE WHEN pg_catalog.jsonb_typeof(a) = 'object' THEN a ELSE '{}'::jsonb END) keys(k)) s
    WHERE pg_catalog.jsonb_typeof(a) <> 'object'
       OR s.keys IS DISTINCT FROM ARRAY['activity_code','available_weekdays','other_activity_label','schedule_type','sessions_per_week']::text[]
       OR pg_catalog.jsonb_typeof(a->'activity_code') <> 'string'
       OR pg_catalog.jsonb_typeof(a->'other_activity_label') NOT IN ('string','null')
       OR pg_catalog.jsonb_typeof(a->'schedule_type') <> 'string'
       OR pg_catalog.jsonb_typeof(a->'available_weekdays') NOT IN ('array','null')
       OR pg_catalog.jsonb_typeof(a->'sessions_per_week') NOT IN ('number','null')
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_activities) a,
      LATERAL pg_catalog.jsonb_array_elements(CASE WHEN pg_catalog.jsonb_typeof(a->'available_weekdays') = 'array' THEN a->'available_weekdays' ELSE '[]'::jsonb END) d
    WHERE pg_catalog.jsonb_typeof(d) <> 'number' OR (d #>> '{}') !~ '^[0-9]+$'
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_activities) a
    GROUP BY a->>'activity_code' HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_activities) a
    WHERE a->>'activity_code' NOT IN ('running','football','cycling','combat_sports','swimming','other')
       OR NOT ((a->>'activity_code' = 'other' AND a->'other_activity_label' <> 'null'::jsonb
                AND pg_catalog.btrim(a->>'other_activity_label') <> '' AND pg_catalog.length(pg_catalog.btrim(a->>'other_activity_label')) <= 80)
               OR (a->>'activity_code' <> 'other' AND a->'other_activity_label' = 'null'::jsonb))
       OR NOT (
         (a->>'schedule_type' = 'fixed_weekdays' AND pg_catalog.jsonb_typeof(a->'available_weekdays') = 'array'
          AND pg_catalog.jsonb_array_length(CASE WHEN pg_catalog.jsonb_typeof(a->'available_weekdays') = 'array' THEN a->'available_weekdays' ELSE '[]'::jsonb END) >= 1 AND a->'sessions_per_week' = 'null'::jsonb
          AND public.training_profile_code_set_valid(
            ARRAY(SELECT d #>> '{}' FROM pg_catalog.jsonb_array_elements(CASE WHEN pg_catalog.jsonb_typeof(a->'available_weekdays') = 'array' THEN a->'available_weekdays' ELSE '[]'::jsonb END) d), ARRAY['1','2','3','4','5','6','7']::text[]))
         OR
         (a->>'schedule_type' = 'variable' AND a->'available_weekdays' = 'null'::jsonb
          AND pg_catalog.jsonb_typeof(a->'sessions_per_week') = 'number'
          AND (a->>'sessions_per_week') ~ '^[0-9]+$' AND (a->>'sessions_per_week')::integer > 0
          AND (a->>'sessions_per_week')::integer <= 32767)
       )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Training activities violate the onboarding contract';
  END IF;

  -- Nutrition payload and children.
  SELECT pg_catalog.array_agg(k ORDER BY k) INTO v_keys
  FROM pg_catalog.jsonb_object_keys(v_nutrition) AS keys(k);
  IF v_keys IS DISTINCT FROM ARRAY[
    'accepts_dairy','accepts_eggs','dietary_pattern','dietary_pattern_other_label',
    'disliked_foods','food_budget_style','food_preparation_style','has_food_restrictions',
    'meals_per_day','preferred_foods','restrictions','supplements','uses_supplements'
  ]::text[]
     OR pg_catalog.jsonb_typeof(v_nutrition->'meals_per_day') <> 'number'
     OR (v_nutrition->>'meals_per_day') !~ '^[0-9]+$'
     OR pg_catalog.jsonb_typeof(v_nutrition->'food_preparation_style') <> 'string'
     OR pg_catalog.jsonb_typeof(v_nutrition->'food_budget_style') <> 'string'
     OR pg_catalog.jsonb_typeof(v_nutrition->'dietary_pattern') <> 'string'
     OR pg_catalog.jsonb_typeof(v_nutrition->'dietary_pattern_other_label') NOT IN ('string','null')
     OR pg_catalog.jsonb_typeof(v_nutrition->'has_food_restrictions') <> 'boolean'
     OR pg_catalog.jsonb_typeof(v_nutrition->'uses_supplements') <> 'boolean'
     OR pg_catalog.jsonb_typeof(v_nutrition->'accepts_eggs') NOT IN ('boolean','null')
     OR pg_catalog.jsonb_typeof(v_nutrition->'accepts_dairy') NOT IN ('boolean','null')
     OR pg_catalog.jsonb_typeof(v_nutrition->'restrictions') <> 'array'
     OR pg_catalog.jsonb_typeof(v_nutrition->'disliked_foods') <> 'array'
     OR pg_catalog.jsonb_typeof(v_nutrition->'preferred_foods') <> 'array'
     OR pg_catalog.jsonb_typeof(v_nutrition->'supplements') <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid nutrition payload shape or types';
  END IF;

  BEGIN
    v_meals_per_day := (v_nutrition->>'meals_per_day')::smallint;
    v_preparation_style := v_nutrition->>'food_preparation_style';
    v_budget_style := v_nutrition->>'food_budget_style';
    v_dietary_pattern := v_nutrition->>'dietary_pattern';
    v_dietary_other := CASE WHEN v_nutrition->'dietary_pattern_other_label' = 'null'::jsonb THEN NULL ELSE pg_catalog.btrim(v_nutrition->>'dietary_pattern_other_label') END;
    v_has_restrictions := (v_nutrition->>'has_food_restrictions')::boolean;
    v_uses_supplements := (v_nutrition->>'uses_supplements')::boolean;
    v_accepts_eggs := CASE WHEN v_nutrition->'accepts_eggs' = 'null'::jsonb THEN NULL ELSE (v_nutrition->>'accepts_eggs')::boolean END;
    v_accepts_dairy := CASE WHEN v_nutrition->'accepts_dairy' = 'null'::jsonb THEN NULL ELSE (v_nutrition->>'accepts_dairy')::boolean END;
    v_restrictions := v_nutrition->'restrictions';
    v_disliked_foods := v_nutrition->'disliked_foods';
    v_preferred_foods := v_nutrition->'preferred_foods';
    v_supplements := v_nutrition->'supplements';
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Nutrition payload contains an invalid value';
  END;

  IF v_meals_per_day NOT BETWEEN 2 AND 6
     OR v_preparation_style NOT IN ('very_quick','cook_some','meal_prep','flexible')
     OR v_budget_style NOT IN ('economic','balanced','varied')
     OR v_dietary_pattern NOT IN ('omnivore','vegetarian','vegan','pescatarian','other')
     OR NOT ((v_dietary_pattern = 'other' AND v_dietary_other IS NOT NULL AND v_dietary_other <> '' AND pg_catalog.length(v_dietary_other) <= 80)
       OR (v_dietary_pattern <> 'other' AND v_dietary_other IS NULL))
     OR (v_dietary_pattern = 'vegan' AND (v_accepts_eggs IS NOT NULL OR v_accepts_dairy IS NOT NULL))
     OR (v_dietary_pattern <> 'vegan' AND (v_accepts_eggs IS NULL OR v_accepts_dairy IS NULL))
     OR (v_has_restrictions <> (pg_catalog.jsonb_array_length(v_restrictions) > 0))
     OR (v_uses_supplements <> (pg_catalog.jsonb_array_length(v_supplements) > 0)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Nutrition flags or egg/dairy answers are incoherent';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_restrictions) x
    CROSS JOIN LATERAL (SELECT pg_catalog.array_agg(k ORDER BY k) keys
      FROM pg_catalog.jsonb_object_keys(CASE WHEN pg_catalog.jsonb_typeof(x) = 'object' THEN x ELSE '{}'::jsonb END) keys(k)) s
    WHERE pg_catalog.jsonb_typeof(x) <> 'object'
       OR s.keys IS DISTINCT FROM ARRAY['declared_label','restriction_code','restriction_type']::text[]
       OR pg_catalog.jsonb_typeof(x->'declared_label') <> 'string'
       OR pg_catalog.jsonb_typeof(x->'restriction_type') <> 'string'
       OR pg_catalog.jsonb_typeof(x->'restriction_code') NOT IN ('string','null')
       OR pg_catalog.btrim(x->>'declared_label') = '' OR pg_catalog.length(pg_catalog.btrim(x->>'declared_label')) > 160
       OR x->>'restriction_type' NOT IN ('allergy','intolerance','dietary_restriction','other')
       OR (x->'restriction_code' <> 'null'::jsonb AND x->>'restriction_code' NOT IN ('lactose','gluten','milk','egg','peanut','tree_nuts','soy','fish','shellfish'))
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_restrictions) x
    GROUP BY pg_catalog.lower(pg_catalog.btrim(x->>'declared_label')) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Nutrition restrictions violate the onboarding contract';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT 'disliked_foods' kind, x FROM pg_catalog.jsonb_array_elements(v_disliked_foods) x
      UNION ALL SELECT 'preferred_foods', x FROM pg_catalog.jsonb_array_elements(v_preferred_foods) x
    ) foods
    CROSS JOIN LATERAL (SELECT pg_catalog.array_agg(k ORDER BY k) keys
      FROM pg_catalog.jsonb_object_keys(CASE WHEN pg_catalog.jsonb_typeof(foods.x) = 'object' THEN foods.x ELSE '{}'::jsonb END) keys(k)) s
    WHERE pg_catalog.jsonb_typeof(foods.x) <> 'object'
       OR s.keys IS DISTINCT FROM ARRAY['declared_label']::text[]
       OR pg_catalog.jsonb_typeof(foods.x->'declared_label') <> 'string'
       OR pg_catalog.btrim(foods.x->>'declared_label') = ''
       OR pg_catalog.length(pg_catalog.btrim(foods.x->>'declared_label')) > 160
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_disliked_foods) x
    GROUP BY pg_catalog.lower(pg_catalog.btrim(x->>'declared_label')) HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_preferred_foods) x
    GROUP BY pg_catalog.lower(pg_catalog.btrim(x->>'declared_label')) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Declared foods violate the onboarding contract';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_supplements) x
    CROSS JOIN LATERAL (SELECT pg_catalog.array_agg(k ORDER BY k) keys
      FROM pg_catalog.jsonb_object_keys(CASE WHEN pg_catalog.jsonb_typeof(x) = 'object' THEN x ELSE '{}'::jsonb END) keys(k)) s
    WHERE pg_catalog.jsonb_typeof(x) <> 'object'
       OR s.keys IS DISTINCT FROM ARRAY['declared_label','supplement_code']::text[]
       OR pg_catalog.jsonb_typeof(x->'declared_label') <> 'string'
       OR pg_catalog.jsonb_typeof(x->'supplement_code') NOT IN ('string','null')
       OR pg_catalog.btrim(x->>'declared_label') = '' OR pg_catalog.length(pg_catalog.btrim(x->>'declared_label')) > 160
       OR (x->'supplement_code' <> 'null'::jsonb AND x->>'supplement_code' NOT IN ('whey_protein','creatine','mass_gainer','protein_powder_other','multivitamin'))
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_supplements) x
    GROUP BY pg_catalog.lower(pg_catalog.btrim(x->>'declared_label')) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Supplements violate the onboarding contract';
  END IF;

  -- Canonicalization v1: exact typed object, trimmed free labels, and sorted sets.
  v_canonical := pg_catalog.jsonb_build_object(
    'payload_schema_version', 1,
    'health', pg_catalog.jsonb_build_object(
      'birth_date', v_birth_date, 'biological_sex', v_biological_sex,
      'height_cm', pg_catalog.trim_scale(v_height_cm),
      'weight_kg', pg_catalog.trim_scale(v_weight_kg),
      'target_weight_kg', pg_catalog.trim_scale(v_target_weight_kg),
      'primary_goal', v_health_goal
    ),
    'training', pg_catalog.jsonb_build_object(
      'primary_goal', v_training_goal,
      'priority_muscles', pg_catalog.to_jsonb(ARRAY(SELECT x FROM pg_catalog.unnest(v_priority_muscles) x ORDER BY x)),
      'training_experience', v_training_experience, 'exercise_confidence', v_exercise_confidence,
      'recent_training_break', v_recent_training_break, 'training_days_per_week', v_training_days,
      'available_weekdays', pg_catalog.to_jsonb(ARRAY(SELECT x FROM pg_catalog.unnest(v_training_weekdays) x ORDER BY x)),
      'session_duration_min', v_session_duration, 'session_duration_is_plus', v_session_plus,
      'training_location', v_training_location, 'other_location_label', v_other_location,
      'available_equipment', pg_catalog.to_jsonb(ARRAY(SELECT x FROM pg_catalog.unnest(v_equipment) x ORDER BY x)),
      'other_equipment_label', v_other_equipment, 'pain_or_limitation', v_pain,
      'affected_body_areas', pg_catalog.to_jsonb(ARRAY(SELECT x FROM pg_catalog.unnest(v_body_areas) x ORDER BY x)),
      'activities', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'activity_code', a->>'activity_code',
        'other_activity_label', CASE WHEN a->'other_activity_label' = 'null'::jsonb THEN NULL ELSE pg_catalog.btrim(a->>'other_activity_label') END,
        'schedule_type', a->>'schedule_type',
        'available_weekdays', CASE WHEN a->'available_weekdays' = 'null'::jsonb THEN NULL ELSE
          pg_catalog.to_jsonb(ARRAY(SELECT (d #>> '{}')::smallint FROM pg_catalog.jsonb_array_elements(a->'available_weekdays') d ORDER BY (d #>> '{}')::smallint)) END,
        'sessions_per_week', CASE WHEN a->'sessions_per_week' = 'null'::jsonb THEN NULL ELSE (a->>'sessions_per_week')::smallint END
      ) ORDER BY a->>'activity_code') FROM pg_catalog.jsonb_array_elements(v_activities) a), '[]'::jsonb)
    ),
    'nutrition', pg_catalog.jsonb_build_object(
      'meals_per_day', v_meals_per_day, 'food_preparation_style', v_preparation_style,
      'food_budget_style', v_budget_style, 'dietary_pattern', v_dietary_pattern,
      'dietary_pattern_other_label', v_dietary_other, 'has_food_restrictions', v_has_restrictions,
      'uses_supplements', v_uses_supplements, 'accepts_eggs', v_accepts_eggs, 'accepts_dairy', v_accepts_dairy,
      'restrictions', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'restriction_type', x->>'restriction_type',
        'restriction_code', CASE WHEN x->'restriction_code' = 'null'::jsonb THEN NULL ELSE x->>'restriction_code' END,
        'declared_label', pg_catalog.btrim(x->>'declared_label')
      ) ORDER BY pg_catalog.lower(pg_catalog.btrim(x->>'declared_label')), x->>'restriction_type', COALESCE(x->>'restriction_code',''))
        FROM pg_catalog.jsonb_array_elements(v_restrictions) x), '[]'::jsonb),
      'disliked_foods', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('declared_label', pg_catalog.btrim(x->>'declared_label'))
        ORDER BY pg_catalog.lower(pg_catalog.btrim(x->>'declared_label'))) FROM pg_catalog.jsonb_array_elements(v_disliked_foods) x), '[]'::jsonb),
      'preferred_foods', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('declared_label', pg_catalog.btrim(x->>'declared_label'))
        ORDER BY pg_catalog.lower(pg_catalog.btrim(x->>'declared_label'))) FROM pg_catalog.jsonb_array_elements(v_preferred_foods) x), '[]'::jsonb),
      'supplements', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'supplement_code', CASE WHEN x->'supplement_code' = 'null'::jsonb THEN NULL ELSE x->>'supplement_code' END,
        'declared_label', pg_catalog.btrim(x->>'declared_label')
      ) ORDER BY pg_catalog.lower(pg_catalog.btrim(x->>'declared_label')), COALESCE(x->>'supplement_code',''))
        FROM pg_catalog.jsonb_array_elements(v_supplements) x), '[]'::jsonb)
    )
  );
  v_payload_hash := pg_catalog.sha256(pg_catalog.convert_to(v_canonical::text, 'UTF8'));

  SELECT r.* INTO v_receipt
  FROM public.onboarding_completion_receipts r
  WHERE r.user_id = v_user_id AND r.onboarding_version = 2;

  IF FOUND THEN
    IF v_profile_onboarding_completed IS TRUE
       AND v_profile_onboarding_version = 2
       AND v_profile_onboarding_completed_at IS NOT NULL
       AND v_profile_onboarding_completed_at = v_receipt.completed_at
       AND v_receipt.payload_schema_version = 1
       AND v_receipt.canonicalization_version = 1
       AND v_receipt.idempotency_key = v_idempotency_key
       AND v_receipt.payload_hash = v_payload_hash THEN
      RETURN QUERY SELECT 'replay'::text, 2::smallint, v_receipt.completed_at;
      RETURN;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Onboarding V2 already has a conflicting completion receipt';
  END IF;

  IF v_profile_onboarding_completed IS TRUE
     OR v_profile_onboarding_version IS NOT NULL
     OR v_profile_onboarding_completed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Existing onboarding completion cannot be replaced by Onboarding V2';
  END IF;

  -- This is an initial-completion operation, never an edit/upsert endpoint.
  IF EXISTS (SELECT 1 FROM public.user_health_profiles x WHERE x.user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.training_profiles x WHERE x.user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.training_profile_activities x WHERE x.user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.nutrition_profiles x WHERE x.user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.nutrition_profile_restrictions x WHERE x.user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.nutrition_profile_disliked_foods x WHERE x.user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.nutrition_profile_preferred_foods x WHERE x.user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.nutrition_profile_supplements x WHERE x.user_id = v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Existing V2 profile data requires a separate edit or recovery flow';
  END IF;

  INSERT INTO public.user_health_profiles (
    user_id, birth_date, biological_sex, height_cm, weight_kg, target_weight_kg, primary_goal
  ) VALUES (
    v_user_id, v_birth_date, v_biological_sex, v_height_cm, v_weight_kg, v_target_weight_kg, v_health_goal
  );

  INSERT INTO public.training_profiles (
    user_id, primary_goal, priority_muscles, training_experience, exercise_confidence,
    recent_training_break, training_days_per_week, available_weekdays,
    session_duration_min, session_duration_is_plus, training_location, other_location_label,
    available_equipment, other_equipment_label, pain_or_limitation, affected_body_areas
  ) VALUES (
    v_user_id, v_training_goal, v_priority_muscles, v_training_experience, v_exercise_confidence,
    v_recent_training_break, v_training_days, v_training_weekdays,
    v_session_duration, v_session_plus, v_training_location, v_other_location,
    v_equipment, v_other_equipment, v_pain, v_body_areas
  );

  INSERT INTO public.training_profile_activities (
    user_id, activity_code, other_activity_label, schedule_type, available_weekdays, sessions_per_week
  )
  SELECT v_user_id, a->>'activity_code',
    CASE WHEN a->'other_activity_label' = 'null'::jsonb THEN NULL ELSE pg_catalog.btrim(a->>'other_activity_label') END,
    a->>'schedule_type',
    CASE WHEN a->'available_weekdays' = 'null'::jsonb THEN NULL ELSE
      ARRAY(SELECT (d #>> '{}')::smallint FROM pg_catalog.jsonb_array_elements(a->'available_weekdays') d) END,
    CASE WHEN a->'sessions_per_week' = 'null'::jsonb THEN NULL ELSE (a->>'sessions_per_week')::smallint END
  FROM pg_catalog.jsonb_array_elements(v_activities) a;

  INSERT INTO public.nutrition_profiles (
    user_id, meals_per_day, food_preparation_style, food_budget_style, dietary_pattern,
    dietary_pattern_other_label, has_food_restrictions, uses_supplements, accepts_eggs, accepts_dairy
  ) VALUES (
    v_user_id, v_meals_per_day, v_preparation_style, v_budget_style, v_dietary_pattern,
    v_dietary_other, v_has_restrictions, v_uses_supplements, v_accepts_eggs, v_accepts_dairy
  );

  INSERT INTO public.nutrition_profile_restrictions (user_id, restriction_type, restriction_code, declared_label)
  SELECT v_user_id, x->>'restriction_type',
    CASE WHEN x->'restriction_code' = 'null'::jsonb THEN NULL ELSE x->>'restriction_code' END,
    pg_catalog.btrim(x->>'declared_label')
  FROM pg_catalog.jsonb_array_elements(v_restrictions) x;

  -- food_code is intentionally omitted: free text never controls catalog codes.
  INSERT INTO public.nutrition_profile_disliked_foods (user_id, declared_label)
  SELECT v_user_id, pg_catalog.btrim(x->>'declared_label')
  FROM pg_catalog.jsonb_array_elements(v_disliked_foods) x;

  INSERT INTO public.nutrition_profile_preferred_foods (user_id, declared_label)
  SELECT v_user_id, pg_catalog.btrim(x->>'declared_label')
  FROM pg_catalog.jsonb_array_elements(v_preferred_foods) x;

  INSERT INTO public.nutrition_profile_supplements (user_id, supplement_code, declared_label)
  SELECT v_user_id,
    CASE WHEN x->'supplement_code' = 'null'::jsonb THEN NULL ELSE x->>'supplement_code' END,
    pg_catalog.btrim(x->>'declared_label')
  FROM pg_catalog.jsonb_array_elements(v_supplements) x;

  v_completed_at := pg_catalog.statement_timestamp();
  INSERT INTO public.onboarding_completion_receipts (
    user_id, onboarding_version, idempotency_key, payload_hash,
    payload_schema_version, canonicalization_version, completed_at
  ) VALUES (
    v_user_id, 2, v_idempotency_key, v_payload_hash, 1, 1, v_completed_at
  );

  -- Deliberately last: no legacy, subscription, or gamification field is touched.
  UPDATE public.profiles AS p
  SET onboarding_completed = true,
      onboarding_version = 2,
      onboarding_completed_at = v_completed_at
  WHERE p.user_id = v_user_id;

  RETURN QUERY SELECT 'completed'::text, 2::smallint, v_completed_at;
END
$function$;

REVOKE ALL ON FUNCTION public.complete_onboarding_v2(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_v2(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_v2(jsonb) TO service_role;

COMMIT;
