import type { AllergenTag, NutritionFoodCatalogEntry } from "./domain";

export interface FoodRestrictionContext {
  dietaryPattern: "omnivore" | "vegetarian" | "vegan" | "pescatarian" | "other";
  allergenRestrictions: AllergenTag[];
}

export type FoodRestrictionDecision = { allowed: true } | {
  allowed: false;
  reason: "DIETARY_PATTERN_VIOLATION" | "ALLERGEN_DATA_INCOMPLETE" | "ALLERGY_OR_RESTRICTION_VIOLATION";
};

export function canUseFoodForRestrictions(
  entry: NutritionFoodCatalogEntry,
  context: FoodRestrictionContext,
): FoodRestrictionDecision {
  if (context.dietaryPattern === "vegan" && !entry.dietaryTags.includes("vegan")) {
    return { allowed: false, reason: "DIETARY_PATTERN_VIOLATION" };
  }
  if (context.dietaryPattern === "vegetarian" && !entry.dietaryTags.some((tag) => tag === "vegan" || tag === "vegetarian")) {
    return { allowed: false, reason: "DIETARY_PATTERN_VIOLATION" };
  }
  if (context.allergenRestrictions.length > 0 && !entry.allergenDataComplete) {
    return { allowed: false, reason: "ALLERGEN_DATA_INCOMPLETE" };
  }
  if (context.allergenRestrictions.some((tag) => entry.allergenTags.includes(tag))) {
    return { allowed: false, reason: "ALLERGY_OR_RESTRICTION_VIOLATION" };
  }
  return { allowed: true };
}
