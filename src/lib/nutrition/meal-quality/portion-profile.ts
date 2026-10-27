import type { NutritionFoodCatalogEntry } from "../food-catalog/domain";
import type { MealPlanFoodPool } from "../meal-generation/domain";
import type { MealRole } from "../meal-plan/domain";
import type { FoodPortionProfile } from "./domain";
import { classifyFoodSuitability } from "./food-suitability";

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function foodPortionProfile(
  food: NutritionFoodCatalogEntry,
  slot: MealPlanFoodPool,
  mealRole: MealRole,
): FoodPortionProfile {
  const suitability = classifyFoodSuitability(food);
  const name = normalized(food.canonicalName);
  const group = normalized(food.foodGroup);
  if (suitability.specialPortionGuard) {
    return { minimumGrams: 0, typicalMinimumGrams: 0, typicalMaximumGrams: 0, maximumAutogenerationGrams: 0,
      incrementGrams: 1, quantityMode: "CONTINUOUS", householdUnitCapability: "GRAMS_ONLY",
      refinementPriority: "LOCKED", rationale: "SPECIAL_PORTION_GUARD" };
  }
  if (slot === "FAT_ANCHOR" || suitability.culinaryRoles.includes("CULINARY_FAT")) {
    return { minimumGrams: 5, typicalMinimumGrams: 5, typicalMaximumGrams: 15, maximumAutogenerationGrams: 20,
      incrementGrams: 1, quantityMode: "CONTINUOUS", householdUnitCapability: "GRAMS_ONLY",
      refinementPriority: "SECONDARY", rationale: "ADDED_FAT_SUPPORT" };
  }
  if (slot === "PROTEIN_ANCHOR" && (group === "eggs" || /\bovo\b/.test(name))) {
    return { minimumGrams: 50, typicalMinimumGrams: 50, typicalMaximumGrams: 150, maximumAutogenerationGrams: 150,
      incrementGrams: 50, quantityMode: "DISCRETE_GRAM_EQUIVALENT", householdUnitCapability: "CATALOG_REQUIRED",
      refinementPriority: "PRIMARY", rationale: "EGG_NATURAL_UNIT_GRAM_EQUIVALENT" };
  }
  if (slot === "PROTEIN_ANCHOR") {
    return { minimumGrams: 70, typicalMinimumGrams: 90, typicalMaximumGrams: 180, maximumAutogenerationGrams: 250,
      incrementGrams: 10, quantityMode: "CONTINUOUS", householdUnitCapability: "GRAMS_ONLY",
      refinementPriority: "PRIMARY", rationale: `PROTEIN_ANCHOR_${mealRole}` };
  }
  if (slot === "CARB_ANCHOR") {
    const breadLike = /bread/.test(group) || /\b(pao|tapioca)\b/.test(name);
    return { minimumGrams: breadLike ? 40 : 70, typicalMinimumGrams: breadLike ? 50 : 100,
      typicalMaximumGrams: breadLike ? 150 : 250, maximumAutogenerationGrams: breadLike ? 200 : 350,
      incrementGrams: 10, quantityMode: "CONTINUOUS", householdUnitCapability: "GRAMS_ONLY",
      refinementPriority: "PRIMARY", rationale: breadLike ? "BREAD_OR_HANDHELD_CARB_ANCHOR" : "COOKED_STARCH_ANCHOR" };
  }
  if (slot === "LEGUME_ANCHOR") {
    return { minimumGrams: 60, typicalMinimumGrams: 80, typicalMaximumGrams: 180, maximumAutogenerationGrams: 250,
      incrementGrams: 10, quantityMode: "CONTINUOUS", householdUnitCapability: "GRAMS_ONLY",
      refinementPriority: "SECONDARY", rationale: "LEGUME_COMPONENT" };
  }
  if (suitability.culinaryRoles.includes("FRUIT")) {
    return { minimumGrams: 60, typicalMinimumGrams: 80, typicalMaximumGrams: 180, maximumAutogenerationGrams: 200,
      incrementGrams: 10, quantityMode: "DISCRETE_GRAM_EQUIVALENT", householdUnitCapability: "CATALOG_REQUIRED",
      refinementPriority: "LOCKED", rationale: "FRUIT_COMPONENT_NOT_MACRO_PATCH" };
  }
  if (suitability.culinaryRoles.includes("VEGETABLE")) {
    return { minimumGrams: 50, typicalMinimumGrams: 80, typicalMaximumGrams: 200, maximumAutogenerationGrams: 300,
      incrementGrams: 10, quantityMode: "CONTINUOUS", householdUnitCapability: "GRAMS_ONLY",
      refinementPriority: "LOCKED", rationale: "VEGETABLE_PRODUCE_COMPONENT" };
  }
  if (suitability.qualityClass === "SUPPORTING" && suitability.culinaryRoles.includes("FAT")) {
    return { minimumGrams: 10, typicalMinimumGrams: 10, typicalMaximumGrams: 25, maximumAutogenerationGrams: 30,
      incrementGrams: 5, quantityMode: "CONTINUOUS", householdUnitCapability: "GRAMS_ONLY",
      refinementPriority: "LOCKED", rationale: "NUT_OR_SEED_SUPPORT" };
  }
  return { minimumGrams: 10, typicalMinimumGrams: 20, typicalMaximumGrams: 250, maximumAutogenerationGrams: 500,
    incrementGrams: 5, quantityMode: "CONTINUOUS", householdUnitCapability: "GRAMS_ONLY",
    refinementPriority: "SECONDARY", rationale: `GENERAL_${suitability.form}` };
}

export function snapGramsToPortionProfile(value: number, profile: FoodPortionProfile): number {
  if (profile.maximumAutogenerationGrams === 0) return 0;
  const bounded = Math.min(profile.maximumAutogenerationGrams, Math.max(profile.minimumGrams, value));
  const steps = Math.round((bounded - profile.minimumGrams) / profile.incrementGrams);
  return Number(Math.min(profile.maximumAutogenerationGrams,
    profile.minimumGrams + steps * profile.incrementGrams).toFixed(1));
}
