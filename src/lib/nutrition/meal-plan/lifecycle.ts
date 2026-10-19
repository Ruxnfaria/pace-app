import {
  MEAL_DISTRIBUTION_VERSION,
  NUTRITION_GOAL_STRATEGY_VERSION,
  type AuthoritativeNutritionTarget,
} from "./domain";

export type MealPlanGenerationDisposition = {
  jobStatus: "pending" | "requires_review";
  planStatus: "pending" | "requires_review";
  mayActivate: boolean;
};

export function resolveMealPlanGenerationDisposition(
  target: Pick<AuthoritativeNutritionTarget, "status">,
): MealPlanGenerationDisposition {
  return target.status === "active"
    ? { jobStatus: "pending", planStatus: "pending", mayActivate: true }
    : { jobStatus: "requires_review", planStatus: "requires_review", mayActivate: false };
}

export function buildMealPlanIdempotencyKey(targetSnapshotId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetSnapshotId)) {
    throw new Error("A valid target snapshot id is required");
  }
  return ["meal-plan", targetSnapshotId.toLowerCase(), NUTRITION_GOAL_STRATEGY_VERSION, MEAL_DISTRIBUTION_VERSION].join(":");
}
