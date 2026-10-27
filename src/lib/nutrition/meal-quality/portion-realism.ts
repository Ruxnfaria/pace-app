import type { ResolvedMealPlan } from "../meal-generation/domain";
import type { MealCoherenceIssue, PortionRealismReport } from "./domain";
import { classifyFoodSuitability } from "./food-suitability";
import { foodPortionProfile, snapGramsToPortionProfile } from "./portion-profile";

function issue(
  code: MealCoherenceIssue["code"],
  message: string,
  mealPosition?: number,
  itemPosition?: number,
  severity: MealCoherenceIssue["severity"] = "HARD_FAILURE",
): MealCoherenceIssue {
  return { code, severity, message, ...(mealPosition ? { mealPosition } : {}),
    ...(itemPosition ? { itemPosition } : {}) };
}

export function validatePortionRealism(plan: ResolvedMealPlan): PortionRealismReport {
  const issues: MealCoherenceIssue[] = [];
  const averageProtein = plan.totals.proteinG / Math.max(plan.meals.length, 1);
  for (const meal of plan.meals) {
    const carbAnchor = meal.items.find((item) => item.slot === "CARB_ANCHOR");
    meal.items.forEach((item, index) => {
      const suitability = classifyFoodSuitability(item.food);
      const profile = foodPortionProfile(item.food, item.slot, meal.role);
      const snapped = snapGramsToPortionProfile(item.quantityGrams, profile);
      if (profile.maximumAutogenerationGrams === 0
        || item.quantityGrams < profile.minimumGrams - 0.01
        || item.quantityGrams > profile.maximumAutogenerationGrams + 0.01
        || Math.abs(snapped - item.quantityGrams) > 0.051) {
        const code = suitability.culinaryRoles.includes("FRUIT") ? "FRUIT_PORTION_IMPLAUSIBLE"
          : item.slot === "PROTEIN_ANCHOR" ? "PROTEIN_ANCHOR_TOO_SMALL"
            : item.slot === "FAT_ANCHOR" ? "ADDED_FAT_PORTION_IMPLAUSIBLE" : "FOOD_PORTION_IMPLAUSIBLE";
        issues.push(issue(code, "Quantity is outside its deterministic human-portion profile", meal.position, index + 1));
      }
      if (suitability.culinaryRoles.includes("FRUIT") && carbAnchor
        && item.nutrients.calories > carbAnchor.nutrients.calories) {
        issues.push(issue("PRODUCE_USED_AS_MACRO_COMPENSATOR",
          "Fruit cannot contribute more energy than the primary carbohydrate anchor", meal.position, index + 1));
      }
    });
    if (meal.items.some((item) => item.slot === "PROTEIN_ANCHOR")
      && meal.totals.proteinG < averageProtein * 0.55) {
      issues.push(issue("MEAL_PROTEIN_DISTRIBUTION_IMBALANCED",
        "Meal protein is too small relative to the plan's own per-meal distribution", meal.position, undefined, "WARNING"));
    }
  }
  return { valid: !issues.some((value) => value.severity === "HARD_FAILURE"), issues };
}
