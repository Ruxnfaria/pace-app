import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildLegacyFitnessContext,
  buildV2FitnessContext,
  FitnessContextError,
  type LegacyProfileRow,
  type UserFitnessContext,
  type V2ContextRows,
} from "./model";

const PROFILE_FIELDS = [
  "nome",
  "onboarding_version",
  "objetivo",
  "nivel_experiencia",
  "dias_treino",
  "idade",
  "sexo",
  "peso",
  "altura",
].join(",");

function assertQuerySucceeded(
  table: string,
  error: { message: string } | null
): void {
  if (error) {
    throw new FitnessContextError(
      "READ_FAILED",
      `Falha ao ler ${table}: ${error.message}`
    );
  }
}

export async function getUserFitnessContext(
  supabase: SupabaseClient,
  userId: string
): Promise<UserFitnessContext> {
  const profileResponse = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("user_id", userId)
    .maybeSingle();

  assertQuerySucceeded("profiles", profileResponse.error);

  if (!profileResponse.data) {
    throw new FitnessContextError(
      "PROFILE_NOT_FOUND",
      "Perfil do usuário não encontrado."
    );
  }

  const profile = profileResponse.data as unknown as LegacyProfileRow;
  if (profile.onboarding_version !== 2) {
    return buildLegacyFitnessContext(profile);
  }

  const [
    healthResponse,
    trainingResponse,
    nutritionResponse,
    activitiesResponse,
    restrictionsResponse,
    dislikedFoodsResponse,
    preferredFoodsResponse,
    supplementsResponse,
  ] = await Promise.all([
    supabase
      .from("user_health_profiles")
      .select(
        "birth_date,biological_sex,height_cm,weight_kg,target_weight_kg,primary_goal"
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("training_profiles")
      .select(
        "primary_goal,priority_muscles,training_experience,exercise_confidence,recent_training_break,initial_training_level,training_days_per_week,available_weekdays,session_duration_min,session_duration_is_plus,training_location,other_location_label,available_equipment,other_equipment_label,pain_or_limitation,affected_body_areas"
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("nutrition_profiles")
      .select(
        "meals_per_day,meal_schedule_flexibility,food_preparation_style,food_budget_style,dietary_pattern,dietary_pattern_other_label,has_food_restrictions,uses_supplements,accepts_eggs,accepts_dairy"
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("training_profile_activities")
      .select(
        "activity_code,other_activity_label,schedule_type,available_weekdays,sessions_per_week"
      )
      .eq("user_id", userId)
      .order("activity_code"),
    supabase
      .from("nutrition_profile_restrictions")
      .select("restriction_type,restriction_code,declared_label")
      .eq("user_id", userId)
      .order("declared_label"),
    supabase
      .from("nutrition_profile_disliked_foods")
      .select("food_code,declared_label")
      .eq("user_id", userId)
      .order("declared_label"),
    supabase
      .from("nutrition_profile_preferred_foods")
      .select("food_code,declared_label")
      .eq("user_id", userId)
      .order("declared_label"),
    supabase
      .from("nutrition_profile_supplements")
      .select("supplement_code,declared_label")
      .eq("user_id", userId)
      .order("declared_label"),
  ]);

  const responses = [
    ["user_health_profiles", healthResponse.error],
    ["training_profiles", trainingResponse.error],
    ["nutrition_profiles", nutritionResponse.error],
    ["training_profile_activities", activitiesResponse.error],
    ["nutrition_profile_restrictions", restrictionsResponse.error],
    ["nutrition_profile_disliked_foods", dislikedFoodsResponse.error],
    ["nutrition_profile_preferred_foods", preferredFoodsResponse.error],
    ["nutrition_profile_supplements", supplementsResponse.error],
  ] as const;

  for (const [table, error] of responses) {
    assertQuerySucceeded(table, error);
  }

  return buildV2FitnessContext(profile, {
    health: healthResponse.data,
    training: trainingResponse.data,
    nutrition: nutritionResponse.data,
    activities: activitiesResponse.data ?? [],
    restrictions: restrictionsResponse.data ?? [],
    dislikedFoods: dislikedFoodsResponse.data ?? [],
    preferredFoods: preferredFoodsResponse.data ?? [],
    supplements: supplementsResponse.data ?? [],
  } as unknown as V2ContextRows);
}
