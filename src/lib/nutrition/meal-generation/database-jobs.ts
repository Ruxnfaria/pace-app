import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MealPlanJobRepository } from "./generator";
import type { MealPlanGenerationContext } from "./domain";

export class DatabaseMealPlanJobRepository implements MealPlanJobRepository {
  constructor(private readonly client: SupabaseClient) {}

  async begin(context: MealPlanGenerationContext, idempotencyKey: string): Promise<void> {
    const { error } = await this.client.rpc("begin_nutrition_plan_generation_job_v1", {
      p_user_id: context.userId, p_target_snapshot_id: context.targetSnapshotId,
      p_strategy_version: context.strategyVersion, p_meal_distribution_version: context.mealDistributionVersion,
      p_generator_version: "praxe-meal-plan-generator-v1", p_idempotency_key: idempotencyKey,
    });
    if (error) throw new Error("MEAL_PLAN_JOB_START_FAILED");
  }

  async finish(idempotencyKey: string, status: "failed_retryable" | "requires_review", safeErrorCode: string): Promise<void> {
    const { error } = await this.client.rpc("finish_nutrition_plan_generation_job_v1", {
      p_idempotency_key: idempotencyKey, p_status: status, p_safe_error_code: safeErrorCode,
    });
    if (error) throw new Error("MEAL_PLAN_JOB_FINISH_FAILED");
  }
}
