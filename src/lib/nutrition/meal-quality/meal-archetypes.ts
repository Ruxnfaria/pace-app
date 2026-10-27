import type { MealRole } from "../meal-plan/domain";
import type { CulinaryRole, MealArchetype, NutritionQualityGoal } from "./domain";

const BASE_ARCHETYPES: Record<MealRole, MealArchetype> = {
  BREAKFAST: {
    id: "BRAZILIAN_BREAKFAST_V1", role: "BREAKFAST", label: "Café da manhã brasileiro",
    requiredRoles: [["PROTEIN", "DAIRY"], ["FRUIT", "STARCH", "WHOLE_GRAIN"]],
    optionalRoles: [["FRUIT"], ["FAT"]], maximumItems: 5,
  },
  MAIN_MEAL: {
    id: "BRAZILIAN_MAIN_MEAL_V1", role: "MAIN_MEAL", label: "Prato principal brasileiro",
    requiredRoles: [["LEAN_PROTEIN", "PROTEIN"], ["STARCH"], ["VEGETABLE"]],
    optionalRoles: [["LEGUME"], ["CULINARY_FAT"]], maximumItems: 6,
  },
  PRE_WORKOUT: {
    id: "BRAZILIAN_PRE_WORKOUT_V1", role: "PRE_WORKOUT", label: "Pré-treino leve",
    requiredRoles: [["FRUIT", "STARCH", "WHOLE_GRAIN"], ["LEAN_PROTEIN", "PROTEIN", "DAIRY"]],
    optionalRoles: [["FRUIT"]], maximumItems: 4,
  },
  POST_WORKOUT: {
    id: "BRAZILIAN_POST_WORKOUT_V1", role: "POST_WORKOUT", label: "Pós-treino de recuperação",
    requiredRoles: [["LEAN_PROTEIN", "PROTEIN", "DAIRY"], ["FRUIT", "STARCH", "WHOLE_GRAIN"]],
    optionalRoles: [["FRUIT"], ["LEGUME"]], maximumItems: 5,
  },
  SNACK: {
    id: "BRAZILIAN_SNACK_V1", role: "SNACK", label: "Lanche prático",
    requiredRoles: [["FRUIT", "STARCH", "WHOLE_GRAIN"], ["PROTEIN", "DAIRY", "FAT"]],
    optionalRoles: [["FRUIT"]], maximumItems: 4,
  },
  EVENING_MEAL: {
    id: "BRAZILIAN_EVENING_MEAL_V1", role: "EVENING_MEAL", label: "Jantar brasileiro",
    requiredRoles: [["LEAN_PROTEIN", "PROTEIN"], ["STARCH"], ["VEGETABLE"]],
    optionalRoles: [["VEGETABLE"], ["LEGUME"]], maximumItems: 6,
  },
};

export function mealArchetypeFor(role: MealRole, goal: NutritionQualityGoal): MealArchetype {
  void goal;
  return BASE_ARCHETYPES[role];
}

export function archetypeAcceptsRoles(archetype: MealArchetype, roles: CulinaryRole[]): boolean {
  return archetype.requiredRoles.every((alternatives) => alternatives.some((role) => roles.includes(role)));
}

export function allBrazilianMealArchetypes(): MealArchetype[] {
  return Object.values(BASE_ARCHETYPES);
}
