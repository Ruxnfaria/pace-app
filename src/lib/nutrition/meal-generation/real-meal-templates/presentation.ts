import type { ResolvedMealPlan } from "../domain";

export function humanReadableMealPlan(plan: ResolvedMealPlan): string {
  return plan.meals.map((meal) => {
    const foods = meal.items.map((item) => `${item.displayName} ${item.quantityGrams} g`).join(" + ");
    return `${meal.role}: ${meal.label} — ${foods}`;
  }).join("\n");
}
