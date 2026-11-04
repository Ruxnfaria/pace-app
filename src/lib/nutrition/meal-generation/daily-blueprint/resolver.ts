import type { MealPlanGenerationContext } from "../domain";
import { DAILY_MEAL_BLUEPRINT_VERSION, type DailyMealBlueprint, type MealIntent } from "./domain";

function clockMinutes(value: string, dayOffset: 0 | 1): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes + dayOffset * 1440;
}

function gapAfter(context: MealPlanGenerationContext, index: number): number | null {
  const current = context.mealWindows[index];
  const next = context.mealWindows[index + 1];
  if (!current || !next) return null;
  return clockMinutes(next.start, next.startDayOffset) - clockMinutes(current.end, current.endDayOffset);
}

function initialIntent(context: MealPlanGenerationContext, index: number, mainCount: number): MealIntent {
  const role = context.mealRoles[index];
  const averageCalories = context.target.calories / Math.max(context.mealCount, 1);
  const targetCalories = context.mealMacroTargets[index]?.calories ?? averageCalories;
  if (role === "BREAKFAST") return "BREAKFAST";
  if (role === "MAIN_MEAL") return "MAIN_MEAL";
  if (role === "SNACK") return "SNACK";
  if (role === "PRE_WORKOUT") return targetCalories >= averageCalories * 1.05 ? "PRE_WORKOUT_MEAL" : "PRE_WORKOUT_SNACK";
  if (role === "POST_WORKOUT") {
    const longGapAfter = (gapAfter(context, index) ?? 0) >= 150;
    return mainCount === 0 || longGapAfter || targetCalories >= averageCalories * 0.9
      ? "POST_WORKOUT_MAIN" : "POST_WORKOUT_SNACK";
  }
  if (role === "EVENING_MEAL") {
    // A compact three-meal day should not manufacture a snack in place of a
    // normal dinner. Longer days can use the final window as a ceia once a
    // cooked main meal has already been scheduled.
    if (context.mealCount <= 3) return "EVENING_MAIN";
    return mainCount > 0 ? "EVENING_SNACK" : "EVENING_MAIN";
  }
  return "LIGHT_MEAL";
}

function isMainIntent(intent: MealIntent): boolean {
  return intent === "MAIN_MEAL" || intent === "PRE_WORKOUT_MEAL" || intent === "POST_WORKOUT_MAIN"
    || intent === "EVENING_MAIN";
}

export function resolveDailyMealBlueprint(context: MealPlanGenerationContext): DailyMealBlueprint {
  let mainCount = 0;
  const mealIntents = context.mealRoles.map((role, index) => {
    const intent = initialIntent(context, index, mainCount);
    if (isMainIntent(intent)) mainCount += 1;
    return { position: index + 1, role, intent, rationale: [`role:${role}`, `training:${context.trainingPeriod}`] };
  });
  const minimumMainMeals = context.mealCount >= 3 ? 1 : 0;
  if (mainCount < minimumMainMeals) {
    const fallback = [...mealIntents].reverse().find((meal) => meal.role !== "BREAKFAST");
    if (fallback) {
      fallback.intent = fallback.role === "POST_WORKOUT" ? "POST_WORKOUT_MAIN"
        : fallback.role === "EVENING_MEAL" ? "EVENING_MAIN" : "MAIN_MEAL";
      fallback.rationale.push("product-main-meal-guarantee");
      mainCount += 1;
    }
  }
  const intentKey = mealIntents.map((meal) => meal.intent.toLowerCase()).join("-");
  return {
    id: `brazilian-${context.mealCount}-${context.trainingPeriod}-${intentKey}`,
    version: DAILY_MEAL_BLUEPRINT_VERSION,
    mealCount: context.mealCount,
    trainingPeriod: context.trainingPeriod,
    mealIntents,
    minimumMainMeals,
    maximumSnackMeals: Math.max(1, context.mealCount - minimumMainMeals),
    minimumStapleFamilies: context.mealCount >= 4 ? 2 : 1,
    maximumTemplateFamilyOccurrences: context.mealCount >= 4 ? 2 : context.mealCount,
  };
}
