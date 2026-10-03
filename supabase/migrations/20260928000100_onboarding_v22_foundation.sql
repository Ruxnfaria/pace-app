-- LOCAL PREPARATION ONLY. Manual review required before any deployment.
-- V2.1 RPC, canonicalization, receipts and stored values are not rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $preflight$
DECLARE v_relation text;
BEGIN
  IF current_user IN ('anon', 'authenticated', 'service_role')
     OR pg_catalog.to_regprocedure('public.complete_onboarding_v2(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('public.training_profiles_set_initial_level()') IS NULL
     OR pg_catalog.to_regprocedure('auth.uid()') IS NULL
     OR pg_catalog.to_regprocedure('pg_catalog.sha256(bytea)') IS NULL THEN
    RAISE EXCEPTION 'V2.2 requires a trusted migration owner and the V2.1 foundation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.nutrition_profiles'::regclass
      AND attname = 'meal_schedule_flexibility' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'Apply the reviewed V2.1 contract before V2.2';
  END IF;
  IF NOT pg_catalog.has_schema_privilege(current_user, 'auth', 'USAGE')
     OR NOT pg_catalog.has_function_privilege(current_user, 'auth.uid()', 'EXECUTE')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.profiles', 'SELECT')
     OR NOT pg_catalog.has_table_privilege(current_user, 'public.profiles', 'UPDATE') THEN
    RAISE EXCEPTION 'V2.2 function owner lacks required identity/profile privileges';
  END IF;
  FOREACH v_relation IN ARRAY ARRAY[
    'user_health_profiles','training_profiles','training_profile_activities','nutrition_profiles',
    'nutrition_profile_restrictions','nutrition_profile_disliked_foods',
    'nutrition_profile_preferred_foods','nutrition_profile_supplements','onboarding_completion_receipts'
  ] LOOP
    IF NOT pg_catalog.has_table_privilege(current_user, 'public.' || v_relation, 'SELECT')
       OR NOT pg_catalog.has_table_privilege(current_user, 'public.' || v_relation, 'INSERT')
       OR NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = ('public.' || v_relation)::regclass) THEN
      RAISE EXCEPTION 'V2.2 requires owner domain privileges and existing RLS';
    END IF;
  END LOOP;
END
$preflight$;

LOCK TABLE public.training_profiles, public.training_profile_activities,
  public.nutrition_profiles IN ACCESS EXCLUSIVE MODE;

-- NULL identifies a row created under a pre-V2.2 contract. No backfill/default.
-- Clients have no INSERT/UPDATE grant on these discriminators or new columns.
ALTER TABLE public.training_profiles
  ADD COLUMN onboarding_payload_schema_version smallint,
  ADD COLUMN preferred_weekdays smallint[],
  ADD COLUMN session_duration_range text,
  ADD COLUMN aerobic_practice_frequency text,
  ADD COLUMN aerobic_safety_limitation boolean,
  ALTER COLUMN priority_muscles DROP NOT NULL,
  ALTER COLUMN training_experience DROP NOT NULL,
  ALTER COLUMN exercise_confidence DROP NOT NULL,
  ALTER COLUMN available_weekdays DROP NOT NULL,
  ALTER COLUMN session_duration_min DROP NOT NULL,
  ALTER COLUMN session_duration_is_plus DROP NOT NULL,
  ALTER COLUMN pain_or_limitation DROP NOT NULL,
  ALTER COLUMN affected_body_areas DROP NOT NULL,
  DROP CONSTRAINT training_profiles_location_check,
  ADD CONSTRAINT training_profiles_location_check CHECK (
    training_location IN ('full_gym','simple_gym','home','outdoor','other')
  ),
  ADD CONSTRAINT training_profiles_contract_check CHECK ((
    (onboarding_payload_schema_version IS NULL
      AND priority_muscles IS NOT NULL
      AND training_experience IS NOT NULL AND exercise_confidence IS NOT NULL
      AND available_weekdays IS NOT NULL
      AND session_duration_min IS NOT NULL AND session_duration_is_plus IS NOT NULL
      AND pain_or_limitation IS NOT NULL AND affected_body_areas IS NOT NULL
      AND training_location <> 'simple_gym'
      AND preferred_weekdays IS NULL AND session_duration_range IS NULL
      AND aerobic_practice_frequency IS NULL AND aerobic_safety_limitation IS NULL)
    OR
    (onboarding_payload_schema_version = 3
      AND priority_muscles IS NULL
      AND training_experience IS NULL AND exercise_confidence IS NULL
      AND recent_training_break IS NULL AND available_weekdays IS NULL
      AND session_duration_min IS NULL AND session_duration_is_plus IS NULL
      AND pain_or_limitation IS NULL AND affected_body_areas IS NULL
      AND primary_goal IN ('hypertrophy','fat_loss','conditioning')
      AND preferred_weekdays IS NOT NULL
      AND public.training_profile_code_set_valid(
        preferred_weekdays::text[], ARRAY['1','2','3','4','5','6','7']::text[])
      AND session_duration_range IN ('under_30','30_45','45_60','60_90','over_90')
      AND aerobic_practice_frequency IN ('never','sometimes','regularly')
      AND aerobic_safety_limitation IS NOT NULL
      AND (training_location <> 'full_gym'
        OR (cardinality(available_equipment) = 0 AND other_equipment_label IS NULL)))
  ) IS TRUE);

COMMENT ON COLUMN public.training_profiles.onboarding_payload_schema_version IS
  'NULL = pre-V2.2 row; 3 = V2.2. Receipt remains the completion/replay authority.';
COMMENT ON COLUMN public.training_profiles.preferred_weekdays IS
  'ISO weekdays 1=Monday..7=Sunday. Preferences, not availability constraints; may be empty.';
COMMENT ON COLUMN public.training_profiles.session_duration_range IS
  'Declared range; no exact minutes are inferred. NULL = not collected by this contract.';
COMMENT ON COLUMN public.training_profiles.aerobic_safety_limitation IS
  'Consideration flag only; not medical clearance, diagnosis or permission for clinical adaptation. NULL = not collected.';

CREATE OR REPLACE FUNCTION public.training_profiles_set_initial_level()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $function$
BEGIN
  IF NEW.onboarding_payload_schema_version = 3 THEN
    IF NEW.initial_training_level IS NULL
       OR NEW.initial_training_level NOT IN ('beginner','intermediate','advanced') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 initial training level';
    END IF;
    RETURN NEW;
  END IF;
  -- Preserve the original pre-V2.2 derivation verbatim, including insert-only behavior.
  NEW.initial_training_level := CASE
    WHEN NEW.training_experience IN ('none', 'under_6_months')
      OR NEW.exercise_confidence = 'needs_guidance'
      OR NEW.recent_training_break = 'over_3_months'
      THEN 'beginner'
    WHEN NEW.training_experience = 'over_2_years'
      AND NEW.exercise_confidence = 'confident_independent'
      AND NEW.recent_training_break IN ('no_significant_break', 'under_1_month')
      THEN 'advanced'
    ELSE 'intermediate'
  END;
  RETURN NEW;
END
$function$;

ALTER TABLE public.training_profile_activities
  ADD COLUMN onboarding_payload_schema_version smallint,
  ADD COLUMN duration_range text,
  ADD COLUMN intensity text,
  ALTER COLUMN schedule_type DROP NOT NULL,
  DROP CONSTRAINT training_profile_activities_code_check,
  DROP CONSTRAINT training_profile_activities_schedule_check,
  ADD CONSTRAINT training_profile_activities_code_check CHECK (
    activity_code IN ('running','football','cycling','combat_sports','swimming','walking','other')
  ),
  ADD CONSTRAINT training_profile_activities_contract_check CHECK ((
    (onboarding_payload_schema_version IS NULL
      AND duration_range IS NULL AND intensity IS NULL AND activity_code <> 'walking'
      AND (
        (schedule_type = 'fixed_weekdays' AND available_weekdays IS NOT NULL
          AND cardinality(available_weekdays) >= 1
          AND public.training_profile_code_set_valid(
            available_weekdays::text[], ARRAY['1','2','3','4','5','6','7']::text[])
          AND sessions_per_week IS NULL)
        OR (schedule_type = 'variable' AND available_weekdays IS NULL
          AND sessions_per_week IS NOT NULL AND sessions_per_week > 0)))
    OR
    (onboarding_payload_schema_version = 3 AND schedule_type IS NULL
      AND (available_weekdays IS NULL OR (
        cardinality(available_weekdays) >= 1
        AND public.training_profile_code_set_valid(
          available_weekdays::text[], ARRAY['1','2','3','4','5','6','7']::text[])))
      AND (sessions_per_week IS NULL OR sessions_per_week > 0)
      AND (duration_range IS NULL OR duration_range IN ('under_30','30_45','45_60','60_90','over_90'))
      AND (intensity IS NULL OR intensity IN ('low','moderate','high')))
  ) IS TRUE);

-- Prevent mixing activity and parent contracts, including existing direct-write paths.
CREATE FUNCTION public.training_profile_activities_check_contract()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $function$
DECLARE v_parent_version smallint;
BEGIN
  SELECT p.onboarding_payload_schema_version INTO v_parent_version
  FROM public.training_profiles p WHERE p.user_id = NEW.user_id FOR KEY SHARE;
  IF NOT FOUND OR v_parent_version IS DISTINCT FROM NEW.onboarding_payload_schema_version THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Activity contract must match its training profile';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER training_profile_activities_check_contract
  BEFORE INSERT OR UPDATE ON public.training_profile_activities
  FOR EACH ROW EXECUTE FUNCTION public.training_profile_activities_check_contract();

ALTER TABLE public.nutrition_profiles
  ADD COLUMN onboarding_payload_schema_version smallint,
  ADD COLUMN available_meal_moments text[],
  ADD COLUMN food_preparation_availability text,
  ADD COLUMN current_eating_routine text,
  ALTER COLUMN food_preparation_style DROP NOT NULL,
  ALTER COLUMN food_budget_style DROP NOT NULL,
  ADD CONSTRAINT nutrition_profiles_contract_check CHECK ((
    (onboarding_payload_schema_version IS NULL
      AND food_preparation_style IS NOT NULL AND food_budget_style IS NOT NULL
      AND available_meal_moments IS NULL AND food_preparation_availability IS NULL
      AND current_eating_routine IS NULL)
    OR
    (onboarding_payload_schema_version = 3
      AND food_preparation_style IS NULL AND food_budget_style IS NULL
      AND meal_schedule_flexibility IS NULL
      AND meals_per_day IS NULL AND accepts_eggs IS NULL AND accepts_dairy IS NULL
      AND available_meal_moments IS NOT NULL AND cardinality(available_meal_moments) >= 1
      AND public.training_profile_code_set_valid(available_meal_moments,
        ARRAY['breakfast','morning_snack','lunch','afternoon_snack','dinner','supper']::text[])
      AND food_preparation_availability IN ('limited','moderate','flexible')
      AND current_eating_routine IN ('structured','variable','irregular'))
  ) IS TRUE);

COMMENT ON COLUMN public.nutrition_profiles.current_eating_routine IS
  'Self-described regularity of current eating habits; distinct from meal scheduling and food preparation.';
COMMENT ON COLUMN public.nutrition_profiles.food_preparation_availability IS
  'Availability to prepare food, not meal_schedule_flexibility or food_preparation_style. NULL = not collected.';
COMMENT ON COLUMN public.training_profile_activities.duration_range IS
  'Optional declared activity duration; NULL means not collected, not zero minutes.';

-- Private, version-specific validation helpers. No payload values in exceptions.
CREATE FUNCTION public.onboarding_v22_assert_object(p_value jsonb, p_shape jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $function$
DECLARE v_key text; v_type text;
BEGIN
  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 object';
  END IF;
  IF (SELECT pg_catalog.array_agg(k ORDER BY k) FROM pg_catalog.jsonb_object_keys(p_value) k)
     IS DISTINCT FROM
     (SELECT pg_catalog.array_agg(k ORDER BY k) FROM pg_catalog.jsonb_object_keys(p_shape) k) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Missing or unknown V2.2 fields';
  END IF;
  FOR v_key, v_type IN SELECT * FROM pg_catalog.jsonb_each_text(p_shape) LOOP
    IF NOT (pg_catalog.jsonb_typeof(p_value->v_key) = ANY(pg_catalog.string_to_array(v_type, '|'))) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 field type';
    END IF;
  END LOOP;
END
$function$;

CREATE FUNCTION public.onboarding_v22_enum(p_value jsonb, p_allowed text[], p_nullable boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $function$
BEGIN
  IF p_nullable AND p_value = 'null'::jsonb THEN RETURN NULL; END IF;
  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'string'
     OR NOT ((p_value #>> '{}') = ANY(p_allowed)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 code';
  END IF;
  RETURN p_value #>> '{}';
END
$function$;

CREATE FUNCTION public.onboarding_v22_label(p_value jsonb, p_max integer, p_nullable boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $function$
DECLARE v_label text;
BEGIN
  IF p_nullable AND p_value = 'null'::jsonb THEN RETURN NULL; END IF;
  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 label type';
  END IF;
  v_label := pg_catalog.btrim(p_value #>> '{}');
  IF v_label = '' OR pg_catalog.length(v_label) > p_max OR v_label ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 label';
  END IF;
  RETURN v_label;
END
$function$;

CREATE FUNCTION public.onboarding_v22_set(p_value jsonb, p_allowed jsonb, p_min integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $function$
BEGIN
  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 set type';
  END IF;
  IF pg_catalog.jsonb_array_length(p_value) < p_min
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_value) x
                WHERE NOT (p_allowed @> pg_catalog.jsonb_build_array(x)))
     OR (SELECT count(DISTINCT x) FROM pg_catalog.jsonb_array_elements(p_value) x)
         <> pg_catalog.jsonb_array_length(p_value) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid or duplicate V2.2 set entries';
  END IF;
  RETURN COALESCE((SELECT pg_catalog.jsonb_agg(
    CASE WHEN pg_catalog.jsonb_typeof(x) = 'number'
      THEN pg_catalog.to_jsonb(pg_catalog.trim_scale((x #>> '{}')::numeric)) ELSE x END
    ORDER BY x::text COLLATE "C") FROM pg_catalog.jsonb_array_elements(p_value) x), '[]'::jsonb);
END
$function$;

-- Canonicalization v3 owns validation; never changes the V2.1 canonical form.
-- Stable SQL date handling makes this STABLE, not IMMUTABLE.
CREATE FUNCTION public.canonicalize_onboarding_v22(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = ''
AS $function$
DECLARE
  v_identity jsonb; v_health jsonb; v_training jsonb; v_nutrition jsonb;
  v_birth_date date; v_height numeric; v_weight numeric; v_goal text;
  v_location text; v_other_location text; v_equipment jsonb; v_other_equipment text;
  v_days numeric; v_name text; v_activities jsonb := '[]'::jsonb;
  v_item jsonb; v_child jsonb; v_kind text; v_items jsonb;
  v_code text; v_label text; v_weekdays jsonb; v_sessions numeric;
  v_pattern text; v_pattern_label text; v_key uuid;
  v_ranges constant text[] := ARRAY['under_30','30_45','45_60','60_90','over_90'];
BEGIN
  PERFORM public.onboarding_v22_assert_object(p_payload, '{
    "payload_schema_version":"number", "idempotency_key":"string",
    "identity":"object", "health":"object", "training":"object", "nutrition":"object"
  }'::jsonb);
  IF p_payload->'payload_schema_version' <> '3'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported V2.2 payload schema';
  END IF;
  BEGIN
    v_key := (p_payload->>'idempotency_key')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 idempotency key';
  END;
  v_identity := p_payload->'identity'; v_health := p_payload->'health';
  v_training := p_payload->'training'; v_nutrition := p_payload->'nutrition';
  PERFORM public.onboarding_v22_assert_object(v_identity, '{"name":"string"}'::jsonb);
  v_name := public.onboarding_v22_label(v_identity->'name', 80);

  PERFORM public.onboarding_v22_assert_object(v_health, '{
    "birth_date":"string", "biological_sex":"string", "height_cm":"number",
    "weight_kg":"number", "primary_goal":"string"
  }'::jsonb);
  IF (v_health->>'birth_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 birth date';
  END IF;
  BEGIN
    v_birth_date := (v_health->>'birth_date')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 birth date';
  END;
  IF v_birth_date > CURRENT_DATE OR pg_catalog.date_part('year', pg_catalog.age(CURRENT_DATE, v_birth_date)) < 18 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'V2.2 requires an adult birth date';
  END IF;
  v_height := (v_health->>'height_cm')::numeric;
  v_weight := (v_health->>'weight_kg')::numeric;
  IF v_height <= 0 OR v_height > 300 OR v_weight <= 0 OR v_weight > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 health measurements';
  END IF;
  v_goal := public.onboarding_v22_enum(v_health->'primary_goal', ARRAY['hypertrophy','fat_loss','conditioning']);
  v_health := pg_catalog.jsonb_build_object(
    -- Keep ISO date text independent of the session DateStyle setting.
    'birth_date', v_health->>'birth_date',
    'biological_sex', public.onboarding_v22_enum(v_health->'biological_sex', ARRAY['male','female','not_specified']),
    'height_cm', pg_catalog.trim_scale(v_height), 'weight_kg', pg_catalog.trim_scale(v_weight),
    'primary_goal', v_goal);

  PERFORM public.onboarding_v22_assert_object(v_training, '{
    "initial_training_level":"string", "training_days_per_week":"number",
    "preferred_weekdays":"array", "session_duration_range":"string",
    "training_location":"string", "other_location_label":"string|null",
    "available_equipment":"array", "other_equipment_label":"string|null",
    "aerobic_practice_frequency":"string", "aerobic_safety_limitation":"boolean",
    "activities":"array"
  }'::jsonb);
  v_days := (v_training->>'training_days_per_week')::numeric;
  IF v_days NOT BETWEEN 2 AND 6 OR v_days <> pg_catalog.trunc(v_days) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 training frequency';
  END IF;
  v_location := public.onboarding_v22_enum(v_training->'training_location', ARRAY['full_gym','simple_gym','home','outdoor','other']);
  v_other_location := public.onboarding_v22_label(v_training->'other_location_label', 80, true);
  v_other_equipment := public.onboarding_v22_label(v_training->'other_equipment_label', 80, true);
  v_equipment := public.onboarding_v22_set(v_training->'available_equipment',
    '["bodyweight","dumbbells","barbell","weight_plates","bench","rack","cable_machine","selectorized_machines","smith_machine","leg_press","resistance_bands","pull_up_bar","kettlebell","other"]'::jsonb);
  IF (v_location = 'other') <> (v_other_location IS NOT NULL)
     OR (v_equipment ? 'other') <> (v_other_equipment IS NOT NULL)
     OR (v_location = 'full_gym' AND (v_equipment <> '[]'::jsonb OR v_other_equipment IS NOT NULL))
     OR (v_location <> 'full_gym' AND v_equipment = '[]'::jsonb) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 location or equipment';
  END IF;

  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(v_training->'activities') LOOP
    PERFORM public.onboarding_v22_assert_object(v_item, '{
      "activity_code":"string", "other_activity_label":"string|null", "weekdays":"array|null",
      "sessions_per_week":"number|null", "duration_range":"string|null", "intensity":"string|null"
    }'::jsonb);
    v_code := public.onboarding_v22_enum(v_item->'activity_code', ARRAY['running','football','cycling','swimming','combat_sports','walking','other']);
    v_label := public.onboarding_v22_label(v_item->'other_activity_label', 80, true);
    IF (v_code = 'other') <> (v_label IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 activity label';
    END IF;
    v_weekdays := CASE WHEN v_item->'weekdays' = 'null'::jsonb THEN 'null'::jsonb
      ELSE public.onboarding_v22_set(v_item->'weekdays', '[1,2,3,4,5,6,7]'::jsonb, 1) END;
    v_sessions := (v_item->>'sessions_per_week')::numeric;
    IF v_sessions IS NOT NULL AND (v_sessions NOT BETWEEN 1 AND 32767 OR v_sessions <> pg_catalog.trunc(v_sessions)) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 activity frequency';
    END IF;
    v_activities := v_activities || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'activity_code', v_code, 'other_activity_label', v_label, 'weekdays', v_weekdays,
      'sessions_per_week', pg_catalog.trim_scale(v_sessions),
      'duration_range', public.onboarding_v22_enum(v_item->'duration_range', v_ranges, true),
      'intensity', public.onboarding_v22_enum(v_item->'intensity', ARRAY['low','moderate','high'], true)));
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_activities) a
             GROUP BY a->>'activity_code' HAVING count(*) > 1) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Duplicate V2.2 activities';
  END IF;
  v_training := pg_catalog.jsonb_build_object(
    'initial_training_level', public.onboarding_v22_enum(v_training->'initial_training_level', ARRAY['beginner','intermediate','advanced']),
    'training_days_per_week', pg_catalog.trim_scale(v_days),
    'preferred_weekdays', public.onboarding_v22_set(v_training->'preferred_weekdays', '[1,2,3,4,5,6,7]'::jsonb),
    'session_duration_range', public.onboarding_v22_enum(v_training->'session_duration_range', v_ranges),
    'training_location', v_location, 'other_location_label', v_other_location,
    'available_equipment', v_equipment, 'other_equipment_label', v_other_equipment,
    'aerobic_practice_frequency', public.onboarding_v22_enum(v_training->'aerobic_practice_frequency', ARRAY['never','sometimes','regularly']),
    'aerobic_safety_limitation', v_training->'aerobic_safety_limitation',
    'activities', COALESCE((SELECT pg_catalog.jsonb_agg(a ORDER BY (a->>'activity_code') COLLATE "C")
      FROM pg_catalog.jsonb_array_elements(v_activities) a), '[]'::jsonb));

  PERFORM public.onboarding_v22_assert_object(v_nutrition, '{
    "available_meal_moments":"array", "food_preparation_availability":"string",
    "current_eating_routine":"string", "dietary_pattern":"string",
    "dietary_pattern_other_label":"string|null", "restrictions":"array",
    "disliked_foods":"array", "preferred_foods":"array", "supplements":"array"
  }'::jsonb);
  v_pattern := public.onboarding_v22_enum(v_nutrition->'dietary_pattern', ARRAY['omnivore','vegetarian','vegan','pescatarian','other']);
  v_pattern_label := public.onboarding_v22_label(v_nutrition->'dietary_pattern_other_label', 80, true);
  IF (v_pattern = 'other') <> (v_pattern_label IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid V2.2 dietary pattern label';
  END IF;
  FOREACH v_kind IN ARRAY ARRAY['restrictions','disliked_foods','preferred_foods','supplements'] LOOP
    v_items := '[]'::jsonb;
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(v_nutrition->v_kind) LOOP
      PERFORM public.onboarding_v22_assert_object(v_item, CASE v_kind
        WHEN 'restrictions' THEN '{"declared_label":"string","restriction_type":"string","restriction_code":"string|null"}'::jsonb
        WHEN 'supplements' THEN '{"declared_label":"string","supplement_code":"string|null"}'::jsonb
        ELSE '{"declared_label":"string"}'::jsonb END);
      v_child := pg_catalog.jsonb_build_object('declared_label', public.onboarding_v22_label(v_item->'declared_label', 160));
      IF v_kind = 'restrictions' THEN
        v_child := v_child || pg_catalog.jsonb_build_object(
          'restriction_type', public.onboarding_v22_enum(v_item->'restriction_type', ARRAY['allergy','intolerance','dietary_restriction','other']),
          'restriction_code', public.onboarding_v22_enum(v_item->'restriction_code', ARRAY['lactose','gluten','milk','egg','peanut','tree_nuts','soy','fish','shellfish'], true));
      ELSIF v_kind = 'supplements' THEN
        v_child := v_child || pg_catalog.jsonb_build_object(
          'supplement_code', public.onboarding_v22_enum(v_item->'supplement_code', ARRAY['whey_protein','creatine','mass_gainer','protein_powder_other','multivitamin'], true));
      END IF;
      v_items := v_items || pg_catalog.jsonb_build_array(v_child);
    END LOOP;
    -- Match existing case-insensitive per-user unique label indexes.
    IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_items) x
               GROUP BY pg_catalog.lower(x->>'declared_label') HAVING count(*) > 1) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Duplicate V2.2 nutrition labels';
    END IF;
    v_nutrition := pg_catalog.jsonb_set(v_nutrition, ARRAY[v_kind],
      COALESCE((SELECT pg_catalog.jsonb_agg(x ORDER BY x::text COLLATE "C")
        FROM pg_catalog.jsonb_array_elements(v_items) x), '[]'::jsonb));
  END LOOP;
  v_nutrition := v_nutrition || pg_catalog.jsonb_build_object(
    'available_meal_moments', public.onboarding_v22_set(v_nutrition->'available_meal_moments',
      '["breakfast","morning_snack","lunch","afternoon_snack","dinner","supper"]'::jsonb, 1),
    'food_preparation_availability', public.onboarding_v22_enum(v_nutrition->'food_preparation_availability', ARRAY['limited','moderate','flexible']),
    'current_eating_routine', public.onboarding_v22_enum(v_nutrition->'current_eating_routine', ARRAY['structured','variable','irregular']),
    'dietary_pattern', v_pattern, 'dietary_pattern_other_label', v_pattern_label);

  -- The key is checked separately for replay and never contributes to the hash.
  RETURN pg_catalog.jsonb_build_object('payload_schema_version', 3,
    'identity', pg_catalog.jsonb_build_object('name', v_name),
    'health', v_health, 'training', v_training, 'nutrition', v_nutrition);
END
$function$;

CREATE FUNCTION public.complete_onboarding_v22(p_payload jsonb)
RETURNS TABLE (result text, onboarding_version smallint, completed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_receipt public.onboarding_completion_receipts%ROWTYPE;
  v_canonical jsonb; v_hash bytea; v_key uuid; v_completed_at timestamptz;
  h jsonb; t jsonb; n jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Authentication required to complete onboarding';
  END IF;
  -- Same serialization point and ordering as complete_onboarding_v2.
  SELECT p.* INTO v_profile FROM public.profiles p
  WHERE p.user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Profile not found for authenticated user';
  END IF;

  v_canonical := public.canonicalize_onboarding_v22(p_payload);
  v_hash := pg_catalog.sha256(pg_catalog.convert_to(v_canonical::text, 'UTF8'));
  v_key := (p_payload->>'idempotency_key')::uuid;
  SELECT r.* INTO v_receipt FROM public.onboarding_completion_receipts r
  WHERE r.user_id = v_user_id AND r.onboarding_version = 2;
  IF FOUND THEN
    IF v_profile.onboarding_completed IS TRUE AND v_profile.onboarding_version = 2
       AND v_profile.onboarding_completed_at IS NOT NULL
       AND v_profile.onboarding_completed_at = v_receipt.completed_at
       AND v_receipt.payload_schema_version = 3 AND v_receipt.canonicalization_version = 3
       AND v_receipt.idempotency_key = v_key AND v_receipt.payload_hash = v_hash THEN
      RETURN QUERY SELECT 'replay'::text, 2::smallint, v_receipt.completed_at;
      RETURN;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Onboarding V2 has a conflicting completion receipt';
  END IF;
  IF v_profile.onboarding_completed IS TRUE OR v_profile.onboarding_version IS NOT NULL
     OR v_profile.onboarding_completed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Existing onboarding completion cannot be replaced';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_health_profiles x WHERE x.user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.training_profiles x WHERE x.user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.training_profile_activities x WHERE x.user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.nutrition_profiles x WHERE x.user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.nutrition_profile_restrictions x WHERE x.user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.nutrition_profile_disliked_foods x WHERE x.user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.nutrition_profile_preferred_foods x WHERE x.user_id = v_user_id)
     OR EXISTS (SELECT 1 FROM public.nutrition_profile_supplements x WHERE x.user_id = v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Existing profile data requires a separate edit or recovery flow';
  END IF;
  h := v_canonical->'health'; t := v_canonical->'training'; n := v_canonical->'nutrition';

  UPDATE public.profiles p SET nome = v_canonical->'identity'->>'name' WHERE p.user_id = v_user_id;
  INSERT INTO public.user_health_profiles (user_id, birth_date, biological_sex, height_cm, weight_kg, primary_goal)
  VALUES (v_user_id, (h->>'birth_date')::date, h->>'biological_sex',
    (h->>'height_cm')::numeric, (h->>'weight_kg')::numeric, h->>'primary_goal');
  INSERT INTO public.training_profiles (
    user_id, onboarding_payload_schema_version, primary_goal, initial_training_level,
    training_days_per_week, preferred_weekdays, session_duration_range,
    training_location, other_location_label, available_equipment, other_equipment_label,
    aerobic_practice_frequency, aerobic_safety_limitation
  ) VALUES (
    v_user_id, 3, h->>'primary_goal', t->>'initial_training_level',
    (t->>'training_days_per_week')::smallint,
    ARRAY(SELECT (x #>> '{}')::smallint FROM pg_catalog.jsonb_array_elements(t->'preferred_weekdays') x),
    t->>'session_duration_range', t->>'training_location', t->>'other_location_label',
    ARRAY(SELECT x FROM pg_catalog.jsonb_array_elements_text(t->'available_equipment') x), t->>'other_equipment_label',
    t->>'aerobic_practice_frequency', (t->>'aerobic_safety_limitation')::boolean);
  INSERT INTO public.training_profile_activities (
    user_id, onboarding_payload_schema_version, activity_code, other_activity_label,
    available_weekdays, sessions_per_week, duration_range, intensity
  ) SELECT v_user_id, 3, a->>'activity_code', a->>'other_activity_label',
    CASE WHEN a->'weekdays' = 'null'::jsonb THEN NULL ELSE
      ARRAY(SELECT (x #>> '{}')::smallint FROM pg_catalog.jsonb_array_elements(a->'weekdays') x) END,
    (a->>'sessions_per_week')::smallint, a->>'duration_range', a->>'intensity'
  FROM pg_catalog.jsonb_array_elements(t->'activities') a;
  INSERT INTO public.nutrition_profiles (
    user_id, onboarding_payload_schema_version, available_meal_moments,
    food_preparation_availability, current_eating_routine, dietary_pattern,
    dietary_pattern_other_label, has_food_restrictions, uses_supplements
  ) VALUES (v_user_id, 3,
    ARRAY(SELECT x FROM pg_catalog.jsonb_array_elements_text(n->'available_meal_moments') x),
    n->>'food_preparation_availability', n->>'current_eating_routine',
    n->>'dietary_pattern', n->>'dietary_pattern_other_label',
    pg_catalog.jsonb_array_length(n->'restrictions') > 0,
    pg_catalog.jsonb_array_length(n->'supplements') > 0);
  INSERT INTO public.nutrition_profile_restrictions (user_id, restriction_type, restriction_code, declared_label)
  SELECT v_user_id, x->>'restriction_type', x->>'restriction_code', x->>'declared_label'
  FROM pg_catalog.jsonb_array_elements(n->'restrictions') x;
  INSERT INTO public.nutrition_profile_disliked_foods (user_id, declared_label)
  SELECT v_user_id, x->>'declared_label' FROM pg_catalog.jsonb_array_elements(n->'disliked_foods') x;
  INSERT INTO public.nutrition_profile_preferred_foods (user_id, declared_label)
  SELECT v_user_id, x->>'declared_label' FROM pg_catalog.jsonb_array_elements(n->'preferred_foods') x;
  INSERT INTO public.nutrition_profile_supplements (user_id, supplement_code, declared_label)
  SELECT v_user_id, x->>'supplement_code', x->>'declared_label'
  FROM pg_catalog.jsonb_array_elements(n->'supplements') x;

  v_completed_at := pg_catalog.statement_timestamp();
  INSERT INTO public.onboarding_completion_receipts (
    user_id, onboarding_version, idempotency_key, payload_hash,
    payload_schema_version, canonicalization_version, completed_at
  ) VALUES (v_user_id, 2, v_key, v_hash, 3, 3, v_completed_at);
  -- Completion markers are the final writes, after all domain rows and the receipt.
  UPDATE public.profiles p SET onboarding_completed = true, onboarding_version = 2,
    onboarding_completed_at = v_completed_at WHERE p.user_id = v_user_id;
  RETURN QUERY SELECT 'completed'::text, 2::smallint, v_completed_at;
END
$function$;

REVOKE ALL ON FUNCTION public.onboarding_v22_assert_object(jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.onboarding_v22_enum(jsonb,text[],boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.onboarding_v22_label(jsonb,integer,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.onboarding_v22_set(jsonb,jsonb,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.canonicalize_onboarding_v22(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_profiles_set_initial_level() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_profile_activities_check_contract() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_onboarding_v22(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_v22(jsonb) TO authenticated;
COMMENT ON FUNCTION public.complete_onboarding_v22(jsonb) IS
  'Initial completion only: auth.uid identity, onboarding v2, payload/canonicalization v3. No clinical text or logging.';

-- Fail closed on unexpected inherited/default grants instead of silently
-- changing legacy ACLs. Existing RLS policies and V1/V2.1 grants stay intact.
DO $postcondition$
DECLARE v_table text; v_column text; v_function regprocedure;
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'public.complete_onboarding_v22(jsonb)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', 'public.complete_onboarding_v22(jsonb)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.complete_onboarding_v22(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected effective V2.2 RPC privileges';
  END IF;
  FOR v_function IN
    SELECT p.oid::regprocedure FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND (p.proname LIKE 'onboarding_v22_%' OR p.proname = 'canonicalize_onboarding_v22')
  LOOP
    IF pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'V2.2 helpers must remain private';
    END IF;
  END LOOP;
  FOR v_table, v_column IN SELECT * FROM (VALUES
    ('training_profiles','onboarding_payload_schema_version'),
    ('training_profiles','initial_training_level'),
    ('training_profiles','preferred_weekdays'),
    ('training_profiles','session_duration_range'),
    ('training_profiles','aerobic_practice_frequency'),
    ('training_profiles','aerobic_safety_limitation'),
    ('training_profile_activities','onboarding_payload_schema_version'),
    ('training_profile_activities','duration_range'),
    ('training_profile_activities','intensity'),
    ('nutrition_profiles','onboarding_payload_schema_version'),
    ('nutrition_profiles','available_meal_moments'),
    ('nutrition_profiles','food_preparation_availability'),
    ('nutrition_profiles','current_eating_routine')
  ) AS columns(table_name, column_name) LOOP
    IF pg_catalog.has_column_privilege('authenticated', 'public.' || v_table, v_column, 'INSERT')
       OR pg_catalog.has_column_privilege('authenticated', 'public.' || v_table, v_column, 'UPDATE')
       OR pg_catalog.has_column_privilege('anon', 'public.' || v_table, v_column, 'INSERT')
       OR pg_catalog.has_column_privilege('anon', 'public.' || v_table, v_column, 'UPDATE')
       OR NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = ('public.' || v_table)::regclass) THEN
      RAISE EXCEPTION 'Unexpected direct-write grants or missing RLS on V2.2 columns';
    END IF;
  END LOOP;
END
$postcondition$;

COMMIT;
