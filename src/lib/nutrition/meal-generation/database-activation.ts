import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MealPlanActivationRepository } from "./generator";
import type { MealPlanGenerationContext, ResolvedMealPlan } from "./domain";
import { resolveDailyMealBlueprint } from "./daily-blueprint/resolver";
import { realMealTemplateById } from "./real-meal-templates/registry";

export class DatabaseMealPlanActivationRepository implements MealPlanActivationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async activate(plan: ResolvedMealPlan, context: MealPlanGenerationContext, idempotencyKey: string): Promise<{ planId: string; reused: boolean }> {
    const blueprint = resolveDailyMealBlueprint(context);
    const meals = plan.meals.map((meal) => ({
      position: meal.position, role: meal.role, label: meal.label,
      window_start: meal.window.start, window_end: meal.window.end,
      window_start_day_offset: meal.window.startDayOffset, window_end_day_offset: meal.window.endDayOffset,
      target_calories: meal.target.calories, target_protein_g: meal.target.proteinG,
      target_carbs_g: meal.target.carbsG, target_fat_g: meal.target.fatG, target_fiber_g: meal.target.fiberG,
      items: meal.items.map((item, index) => ({
        position: index + 1, food_catalog_entry_id: item.food.id, food_name: item.displayName,
        quantity_grams: item.quantityGrams, catalog_source: item.food.source,
        catalog_source_version: item.food.sourceVersion, calories: item.nutrients.calories,
        protein_g: item.nutrients.proteinG, carbs_g: item.nutrients.carbsG,
        fat_g: item.nutrients.fatG, fiber_g: item.nutrients.fiberG,
        metadata: { preparationNote: item.preparationNote, resolution: item.resolution,
          originalQuantityUnit: item.quantityUnit, templateId: meal.templateId, variantId: meal.variantId,
          componentId: item.componentId, dailyBlueprintId: blueprint.id,
          mealIntent: blueprint.mealIntents[meal.position - 1]?.intent,
          templateFamily: realMealTemplateById(meal.templateId)?.familyId,
          stapleFamily: realMealTemplateById(meal.templateId)?.stapleFamily,
          proteinFamily: realMealTemplateById(meal.templateId)?.proteinFamily },
      })),
    }));
    const { data, error } = await this.client.rpc("activate_nutrition_meal_plan_v1", {
      p_user_id: context.userId,
      p_target_snapshot_id: context.targetSnapshotId,
      p_strategy_version: context.strategyVersion,
      p_meal_distribution_version: context.mealDistributionVersion,
      p_generator_version: plan.generatorVersion,
      p_validator_version: plan.validatorVersion,
      p_validation_policy_version: plan.validationPolicyVersion,
      p_idempotency_key: idempotencyKey,
      p_recommended_meals_per_day: context.mealCount,
      p_meals: meals,
    });
    if (error || typeof data !== "string") throw new Error("MEAL_PLAN_ACTIVATION_FAILED");
    return { planId: data, reused: false };
  }
}
