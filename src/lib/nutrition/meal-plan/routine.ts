import type { MealDisplayType } from "./domain";

export function mealDisplayTypesForCount(count: number): MealDisplayType[] {
  if (count <= 1) return ["MEAL"];
  if (count === 2) return ["BREAKFAST", "DINNER"];
  if (count === 3) return ["BREAKFAST", "LUNCH", "DINNER"];
  if (count === 4) return ["BREAKFAST", "LUNCH", "AFTERNOON_SNACK", "DINNER"];
  if (count === 5) return ["BREAKFAST", "MORNING_SNACK", "LUNCH", "AFTERNOON_SNACK", "DINNER"];
  return ["BREAKFAST", ...Array.from({ length: count - 2 }, () => "MEAL" as const), "DINNER"];
}
