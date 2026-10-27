import type { ResolvedMealPlan } from "../meal-generation/domain";
import type { MealCoherenceIssue } from "./domain";
import { classifyFoodSuitability } from "./food-suitability";

export interface DailyMealQualityReport {
  valid: boolean;
  mainMealCount: number;
  mainMealsWithProduce: number;
  issues: MealCoherenceIssue[];
}

export function validateDailyMealQuality(plan: ResolvedMealPlan): DailyMealQualityReport {
  const issues: MealCoherenceIssue[] = [];
  const mainMeals = plan.meals.filter((meal) => meal.role === "MAIN_MEAL" || meal.role === "EVENING_MEAL"
    || (meal.role === "POST_WORKOUT" && meal.target.calories >= plan.totals.calories / Math.max(plan.meals.length, 1) * 0.75));
  const mainMealsWithProduce = mainMeals.filter((meal) => meal.items.some((item) =>
    classifyFoodSuitability(item.food).culinaryRoles.includes("VEGETABLE"))).length;
  if (mainMeals.length >= 2 && mainMealsWithProduce !== mainMeals.length) {
    issues.push({ code: "MAIN_MEAL_MISSING_PRODUCE", severity: "HARD_FAILURE",
      message: "Every main-style meal in the day requires vegetable produce" });
  }
  const profiles = plan.meals.flatMap((meal) => meal.items.map((item) => ({ item, profile: classifyFoodSuitability(item.food) })));
  if (!profiles.some(({ profile }) => profile.culinaryRoles.includes("FRUIT"))) {
    issues.push({ code: "LOW_DAILY_VARIETY", severity: "WARNING", message: "Daily plan has no fruit option" });
  }
  const supportingFats = profiles.filter(({ profile }) => profile.qualityClass === "SUPPORTING" && profile.culinaryRoles.includes("FAT"))
    .map(({ item }) => item.food.normalizedName);
  if (supportingFats.some((name, index) => supportingFats.indexOf(name) !== index)) {
    issues.push({ code: "EXCESSIVE_REPETITION", severity: "WARNING", message: "The same supporting nut or seed repeats across meals" });
  }
  return { valid: !issues.some((value) => value.severity === "HARD_FAILURE"), mainMealCount: mainMeals.length,
    mainMealsWithProduce, issues };
}
