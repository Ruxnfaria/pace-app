import { formatAbsoluteMinute, normalizeAwakeWindow } from "./awake-window";
import {
  MEAL_DISTRIBUTION_VERSION,
  MealPlanResolutionError,
  type AuthoritativeNutritionTarget,
  type MealMacroTarget,
  type MealPlanContext,
  type MealRole,
  type MealWindow,
  type NutritionGoalStrategy,
  type RecommendedMealStructure,
} from "./domain";

const ROLE_LABELS: Record<MealRole, string> = {
  BREAKFAST: "Primeira refeição",
  MAIN_MEAL: "Refeição principal",
  PRE_WORKOUT: "Pré-treino",
  POST_WORKOUT: "Pós-treino",
  SNACK: "Refeição prática",
  EVENING_MEAL: "Última refeição",
};

function validateTarget(target: AuthoritativeNutritionTarget): void {
  if (target.status === "requires_review") {
    throw new MealPlanResolutionError("TARGET_REQUIRES_REVIEW", "Nutrition target requires review before meal-plan generation");
  }
  for (const value of [target.calories, target.proteinG, target.carbsG, target.fatG, target.fiberG]) {
    if (!Number.isFinite(value) || value < 0) {
      throw new MealPlanResolutionError("INVALID_TARGET", "Nutrition target values must be finite and non-negative");
    }
  }
  if (target.calories <= 0 || target.proteinG <= 0 || target.fatG <= 0 || target.fiberG <= 0) {
    throw new MealPlanResolutionError("INVALID_TARGET", "Nutrition target is incomplete");
  }
}

function resolveMealCount(context: MealPlanContext, target: AuthoritativeNutritionTarget): number {
  if (context.mealBreakAvailability === "difficult") return 3;
  let count = 3;
  const highDistributionDemand = target.calories >= 2400 || target.proteinG >= 145;
  const veryHighDistributionDemand = target.calories >= 3000 || target.proteinG >= 190;
  if (context.mealBreakAvailability === "flexible" && highDistributionDemand) count = 4;
  if (context.mealBreakAvailability === "flexible" && veryHighDistributionDemand) count = 5;
  if (
    context.goal === "hypertrophy" &&
    context.mealBreakAvailability === "flexible" &&
    target.calories >= 2500
  ) count = Math.max(count, 4);
  if (
    context.mealBreakAvailability === "limited" &&
    veryHighDistributionDemand &&
    context.routinePredictability === "predictable" &&
    context.preparationStyle !== "very_quick"
  ) count = 4;
  return count;
}

function baseRoles(count: number): MealRole[] {
  if (count === 3) return ["BREAKFAST", "MAIN_MEAL", "EVENING_MEAL"];
  if (count === 4) return ["BREAKFAST", "MAIN_MEAL", "SNACK", "EVENING_MEAL"];
  return ["BREAKFAST", "SNACK", "MAIN_MEAL", "SNACK", "EVENING_MEAL"];
}

function trainingMinute(context: MealPlanContext, wake: number, duration: number): number | null {
  const fractions = { morning: 0.25, afternoon: 0.52, evening: 0.76 } as const;
  if (context.preferredTrainingPeriod === "variable") return null;
  return wake + duration * fractions[context.preferredTrainingPeriod];
}

function assignTrainingRoles(roles: MealRole[], centers: number[], training: number | null): MealRole[] {
  if (training === null || centers.length < 2) return roles;
  let pre = 0;
  let post = centers.length - 1;
  for (let index = 0; index < centers.length; index += 1) {
    if (centers[index] <= training - 30) pre = index;
    if (centers[index] >= training + 30) {
      post = index;
      break;
    }
  }
  if (pre === post) post = Math.min(pre + 1, centers.length - 1);
  if (pre === post) pre = Math.max(0, post - 1);
  const result = [...roles];
  result[pre] = "PRE_WORKOUT";
  result[post] = "POST_WORKOUT";
  return result;
}

function makeWindows(context: MealPlanContext, count: number): { windows: MealWindow[]; centers: number[] } {
  const awake = normalizeAwakeWindow(context.wakeTime, context.sleepTime);
  const edge = Math.min(90, Math.max(60, awake.durationMinutes * 0.08));
  const usable = awake.durationMinutes - edge * 2;
  const centers = Array.from({ length: count }, (_, index) =>
    awake.wakeMinute + edge + (usable * index) / (count - 1));
  const halfWindow = Math.min(45, Math.max(30, usable / Math.max(count - 1, 1) / 4));
  const windows = centers.map((center, index) => {
    const start = formatAbsoluteMinute(Math.max(awake.wakeMinute, center - halfWindow));
    const end = formatAbsoluteMinute(Math.min(awake.sleepMinute, center + halfWindow));
    return {
      position: index + 1,
      start: start.time,
      end: end.time,
      startDayOffset: start.dayOffset,
      endDayOffset: end.dayOffset,
    };
  });
  return { windows, centers };
}

function allocateExact(total: number, weights: number[]): number[] {
  const totalUnits = Math.round(total * 10);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const raw = weights.map((weight) => totalUnits * weight / weightTotal);
  const units = raw.map(Math.floor);
  const remaining = totalUnits - units.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; index < remaining; index += 1) units[order[index].index] += 1;
  return units.map((value) => value / 10);
}

function roleWeights(roles: MealRole[], strategy: NutritionGoalStrategy) {
  const protein = roles.map((role) => role === "POST_WORKOUT" ? 1.08 : role === "PRE_WORKOUT" ? 0.96 : 1);
  const carbs = roles.map((role) => {
    if (role === "PRE_WORKOUT") return strategy.goal === "conditioning" ? 1.45 : strategy.goal === "hypertrophy" ? 1.35 : 1.15;
    if (role === "POST_WORKOUT") return strategy.goal === "conditioning" ? 1.55 : strategy.goal === "hypertrophy" ? 1.45 : 1.2;
    return 1;
  });
  const fat = roles.map((role) => role === "PRE_WORKOUT" ? 0.65 : role === "POST_WORKOUT" ? 0.82 : 1.08);
  const fiber = roles.map((role) => role === "PRE_WORKOUT" ? 0.5 : role === "POST_WORKOUT" ? 0.82 : strategy.goal === "fat_loss" ? 1.12 : 1);
  const calories = roles.map((_, index) => protein[index] * 0.25 + carbs[index] * 0.45 + fat[index] * 0.3);
  return { calories, protein, carbs, fat, fiber };
}

function delta(expected: number, values: number[]): number {
  const result = Number((values.reduce((sum, value) => sum + value, 0) - expected).toFixed(2));
  return Object.is(result, -0) ? 0 : result;
}

export function resolveRecommendedMealStructure(
  context: MealPlanContext,
  target: AuthoritativeNutritionTarget,
  strategy: NutritionGoalStrategy,
): RecommendedMealStructure {
  validateTarget(target);
  if (context.goal !== strategy.goal) {
    throw new MealPlanResolutionError("GOAL_STRATEGY_MISMATCH", "Context goal and nutrition strategy must match");
  }
  const count = resolveMealCount(context, target);
  const { windows, centers } = makeWindows(context, count);
  const awake = normalizeAwakeWindow(context.wakeTime, context.sleepTime);
  const training = trainingMinute(context, awake.wakeMinute, awake.durationMinutes);
  const roles = assignTrainingRoles(baseRoles(count), centers, training);
  const weights = roleWeights(roles, strategy);
  const calories = allocateExact(target.calories, weights.calories);
  const protein = allocateExact(target.proteinG, weights.protein);
  const carbs = allocateExact(target.carbsG, weights.carbs);
  const fat = allocateExact(target.fatG, weights.fat);
  const fiber = allocateExact(target.fiberG, weights.fiber);
  const macroDistribution: MealMacroTarget[] = roles.map((role, index) => ({
    position: index + 1,
    role,
    calories: calories[index],
    proteinG: protein[index],
    carbsG: carbs[index],
    fatG: fat[index],
    fiberG: fiber[index],
  }));
  const rationale = [
    `${count} eating occasions fit the declared meal-break availability and target distribution demand.`,
    context.preferredTrainingPeriod === "variable"
      ? "Variable training timing keeps meal roles flexible instead of inventing fixed pre/post-workout times."
      : `${ROLE_LABELS.PRE_WORKOUT} and ${ROLE_LABELS.POST_WORKOUT} are placed around the declared training period.`,
    "Every macro uses controlled 0.1-unit rounding and reconciles to the authoritative target.",
  ];
  return {
    strategyVersion: strategy.version,
    mealDistributionVersion: MEAL_DISTRIBUTION_VERSION,
    recommendedMealsPerDay: count,
    mealWindows: windows,
    mealRoles: roles,
    macroDistribution,
    reconciliation: {
      caloriesDelta: delta(target.calories, calories),
      proteinGDelta: delta(target.proteinG, protein),
      carbsGDelta: delta(target.carbsG, carbs),
      fatGDelta: delta(target.fatG, fat),
      fiberGDelta: delta(target.fiberG, fiber),
    },
    rationale,
  };
}
