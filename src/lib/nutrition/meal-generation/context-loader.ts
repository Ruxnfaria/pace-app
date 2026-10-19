import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AllergenTag } from "../food-catalog/domain";
import { resolveRecommendedMealStructure } from "../meal-plan/engine";
import type { FoodPreparationStyle, MealBreakAvailability, RoutinePredictability, SupportedNutritionGoal, TrainingPeriod } from "../meal-plan/domain";
import { getNutritionGoalStrategy } from "../meal-plan/strategies";
import type { MealPlanGenerationContext } from "./domain";

const RESTRICTION_TO_ALLERGEN: Readonly<Record<string, AllergenTag>> = {
  milk: "contains_milk", gluten: "contains_gluten", egg: "contains_egg", fish: "contains_fish",
  shellfish: "contains_shellfish", peanut: "contains_peanut", tree_nuts: "contains_tree_nut", soy: "contains_soy",
};

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`MEAL_CONTEXT_INVALID:${field}`);
  return value;
}
function requiredNumber(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`MEAL_CONTEXT_INVALID:${field}`);
  return number;
}
function hhmm(value: unknown, field: string): string {
  const text = requiredString(value, field);
  const match = /^(\d{2}:\d{2})/.exec(text);
  if (!match) throw new Error(`MEAL_CONTEXT_INVALID:${field}`);
  return match[1];
}

export async function loadMealPlanGenerationContext(client: SupabaseClient, userId: string): Promise<MealPlanGenerationContext> {
  const [targetResult, nutritionResult, trainingResult, restrictionsResult, dislikedResult, preferredResult, supplementsResult] = await Promise.all([
    client.from("nutrition_target_snapshots").select("id,status,goal,calories,protein_g,carbs_g,fat_g,fiber_g").eq("user_id", userId).eq("status", "active").order("version", { ascending: false }).limit(1).maybeSingle(),
    client.from("nutrition_profiles").select("wake_time,sleep_time,routine_predictability,meal_break_availability,food_preparation_style,food_budget_style,food_preparation_availability,dietary_pattern,has_food_restrictions").eq("user_id", userId).maybeSingle(),
    client.from("training_profiles").select("preferred_training_period").eq("user_id", userId).maybeSingle(),
    client.from("nutrition_profile_restrictions").select("restriction_code,declared_label").eq("user_id", userId),
    client.from("nutrition_profile_disliked_foods").select("declared_label").eq("user_id", userId),
    client.from("nutrition_profile_preferred_foods").select("declared_label").eq("user_id", userId),
    client.from("nutrition_profile_supplements").select("declared_label").eq("user_id", userId),
  ]);
  if ([targetResult, nutritionResult, trainingResult, restrictionsResult, dislikedResult, preferredResult, supplementsResult].some((result) => result.error)) {
    throw new Error("MEAL_CONTEXT_READ_FAILED");
  }
  const targetRow = targetResult.data;
  const nutrition = nutritionResult.data;
  const training = trainingResult.data;
  if (!targetRow || !nutrition || !training) throw new Error("MEAL_CONTEXT_INCOMPLETE");
  const goal = requiredString(targetRow.goal, "goal") as SupportedNutritionGoal;
  if (!(["fat_loss", "hypertrophy", "conditioning"] as string[]).includes(goal)) throw new Error("MEAL_CONTEXT_INVALID:goal");
  const target = { status: "active" as const, calories: requiredNumber(targetRow.calories, "calories"),
    proteinG: requiredNumber(targetRow.protein_g, "protein_g"), carbsG: requiredNumber(targetRow.carbs_g, "carbs_g"),
    fatG: requiredNumber(targetRow.fat_g, "fat_g"), fiberG: requiredNumber(targetRow.fiber_g, "fiber_g") };
  const preparation = nutrition.food_preparation_style ??
    ({ limited: "very_quick", moderate: "cook_some", flexible: "flexible" } as const)[nutrition.food_preparation_availability as "limited" | "moderate" | "flexible"];
  const mealContext = {
    wakeTime: hhmm(nutrition.wake_time, "wake_time"), sleepTime: hhmm(nutrition.sleep_time, "sleep_time"),
    routinePredictability: requiredString(nutrition.routine_predictability, "routine_predictability") as RoutinePredictability,
    mealBreakAvailability: requiredString(nutrition.meal_break_availability, "meal_break_availability") as MealBreakAvailability,
    preferredTrainingPeriod: requiredString(training.preferred_training_period, "preferred_training_period") as TrainingPeriod,
    preparationStyle: (preparation ?? "very_quick") as FoodPreparationStyle, goal,
  };
  const strategy = getNutritionGoalStrategy(goal);
  const structure = resolveRecommendedMealStructure(mealContext, target, strategy);
  const restrictions = restrictionsResult.data ?? [];
  const allergenRestrictions = restrictions.flatMap((restriction) => {
    const tag = restriction.restriction_code ? RESTRICTION_TO_ALLERGEN[restriction.restriction_code] : undefined;
    return tag ? [tag] : [];
  });
  return {
    userId, targetSnapshotId: requiredString(targetRow.id, "target_id"), goal, target,
    strategyVersion: structure.strategyVersion, mealDistributionVersion: structure.mealDistributionVersion,
    mealCount: structure.recommendedMealsPerDay, mealRoles: structure.mealRoles,
    mealWindows: structure.mealWindows, mealMacroTargets: structure.macroDistribution,
    catalogReadiness: "CATALOG_NOT_AVAILABLE",
    dietaryPattern: (nutrition.dietary_pattern ?? "unknown") as MealPlanGenerationContext["dietaryPattern"],
    allergenRestrictions, hasFoodRestriction: Boolean(nutrition.has_food_restrictions),
    restrictionSafetyKnown: restrictions.length === 0,
    preferredFoods: (preferredResult.data ?? []).map((row) => row.declared_label),
    dislikedFoods: (dislikedResult.data ?? []).map((row) => row.declared_label),
    preparationStyle: mealContext.preparationStyle,
    budget: (nutrition.food_budget_style ?? "unknown") as MealPlanGenerationContext["budget"],
    routinePredictability: mealContext.routinePredictability,
    mealBreakAvailability: mealContext.mealBreakAvailability,
    trainingPeriod: mealContext.preferredTrainingPeriod,
    supplements: (supplementsResult.data ?? []).map((row) => row.declared_label),
  };
}
