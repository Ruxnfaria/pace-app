import type { AiMealCandidate, AiMealPlanCandidate } from "../domain";

export const HUMAN_PORTION_BALANCE_VERSION = "praxe-human-portion-balance-v1" as const;

export type HumanPortionBalanceCode = "BREAD_EGG_IMBALANCE" | "YOGURT_OATS_IMBALANCE"
  | "ADDED_FAT_COMPENSATION" | "MAIN_STAPLE_PROPORTION" | "MAIN_PROTEIN_PROPORTION";

export interface HumanPortionBalanceIssue {
  code: HumanPortionBalanceCode;
  mealPosition: number;
  severity: "HARD_FAILURE" | "WARNING";
  message: string;
}

export interface HumanPortionBalanceReport {
  version: typeof HUMAN_PORTION_BALANCE_VERSION;
  valid: boolean;
  penalty: number;
  preferencePenalty: number;
  issues: HumanPortionBalanceIssue[];
}

function quantity(meal: AiMealCandidate, componentId: string): number | null {
  return meal.items.find((item) => item.componentId === componentId)?.quantityGrams ?? null;
}

function excessRatio(value: number, preferredMaximum: number): number {
  return Math.max(0, (value - preferredMaximum) / preferredMaximum);
}

// These are culinary preferences for this exact curated recipe family, derived
// from its 180 g rice / 100 g beans / 130 g protein reference composition.
// They are deliberately soft: macro feasibility remains authoritative.
const RICE_BEANS_PREFERRED_MAXIMUM_RATIO = 2.25;
const RICE_PROTEIN_PREFERRED_MAXIMUM_RATIO = 2;

export function assessHumanPortionBalance(candidate: AiMealPlanCandidate): HumanPortionBalanceReport {
  const issues: HumanPortionBalanceIssue[] = [];
  let penalty = 0;
  let preferencePenalty = 0;
  candidate.meals.forEach((meal, index) => {
    const mealPosition = index + 1;
    if (meal.recipeFamilyId === "BREAD_EGGS_FRUIT") {
      const bread = quantity(meal, "BREAD");
      const eggs = quantity(meal, "EGGS");
      if (bread !== null && eggs !== null && eggs > 0) {
        const ratio = bread / eggs;
        penalty += 3 * excessRatio(ratio, 1.25) ** 2;
        if (ratio > 1.75 + 1e-9) issues.push({ code: "BREAD_EGG_IMBALANCE", mealPosition,
          severity: "HARD_FAILURE",
          message: "Bread-to-egg proportion exceeds the curated BREAD_EGGS_FRUIT balance" });
      }
    }
    if (meal.recipeFamilyId === "YOGURT_OATS_FRUIT") {
      const yogurt = quantity(meal, "YOGURT");
      const oats = quantity(meal, "OATS");
      if (yogurt !== null && oats !== null && yogurt > 0) {
        const ratio = oats / yogurt;
        penalty += 3 * excessRatio(ratio, 0.25) ** 2;
        if (ratio > 0.35 + 1e-9) issues.push({ code: "YOGURT_OATS_IMBALANCE", mealPosition,
          severity: "HARD_FAILURE",
          message: "Oats-to-yogurt proportion exceeds the curated bowl balance" });
      }
    }
    if (meal.recipeFamilyId === "RICE_BEANS_PROTEIN_VEGETABLES") {
      const rice = quantity(meal, "RICE");
      const beans = quantity(meal, "BEANS");
      const protein = quantity(meal, "PROTEIN");
      if (rice !== null && beans !== null && beans > 0) {
        const ratio = rice / beans;
        const excess = excessRatio(ratio, RICE_BEANS_PREFERRED_MAXIMUM_RATIO);
        preferencePenalty += 0.25 * excess ** 2;
        if (excess > 0) issues.push({ code: "MAIN_STAPLE_PROPORTION", mealPosition,
          severity: "WARNING",
          message: "Rice-to-beans proportion is above this curated recipe's preferred reference balance" });
      }
      if (rice !== null && protein !== null && protein > 0) {
        const ratio = rice / protein;
        const excess = excessRatio(ratio, RICE_PROTEIN_PREFERRED_MAXIMUM_RATIO);
        preferencePenalty += 0.25 * excess ** 2;
        if (excess > 0) issues.push({ code: "MAIN_PROTEIN_PROPORTION", mealPosition,
          severity: "WARNING",
          message: "Rice-to-protein proportion is above this curated recipe's preferred reference balance" });
      }
    }
    const cookingFat = quantity(meal, "COOKING_FAT");
    if (cookingFat !== null) {
      // 15 g is the existing typical maximum from foodPortionProfile. The
      // catalog/recipe absolute maximum remains 20 g, but that edge is not a
      // valid automatic macro patch.
      penalty += 4 * excessRatio(cookingFat, 10) ** 2;
      if (cookingFat > 15 + 1e-9) issues.push({ code: "ADDED_FAT_COMPENSATION", mealPosition,
        severity: "HARD_FAILURE",
        message: "Added culinary fat exceeds its existing typical portion range" });
    }
  });
  return { version: HUMAN_PORTION_BALANCE_VERSION,
    valid: !issues.some((issue) => issue.severity === "HARD_FAILURE"),
    penalty: Number(penalty.toFixed(6)), preferencePenalty: Number(preferencePenalty.toFixed(6)), issues };
}
