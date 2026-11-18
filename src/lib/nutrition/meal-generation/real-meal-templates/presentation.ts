import type { ResolvedMealPlan } from "../domain";
import { buildNaturalRecipeLines } from "../culinary-library/natural-language";

export function humanReadableMealPlan(plan: ResolvedMealPlan): string {
  return plan.meals.map((meal) => {
    const foods = buildNaturalRecipeLines(meal.items.map((item, index) => ({
      componentId: item.componentId,
      displayName: item.presentationDisplayName ?? item.displayName,
      nutritionQuantityGrams: item.quantityGrams,
      displayQuantity: item.quantityGrams,
      displayUnit: "g",
      preparationState: item.preparationState ?? "NOT_APPLICABLE",
      presentationOrder: index + 1,
    }))).map((line) => line.text).join(" + ");
    return `${meal.role}: ${meal.label} — ${foods}`;
  }).join("\n");
}
