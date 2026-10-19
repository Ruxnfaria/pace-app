import type { TrustedCatalogStatus } from "./capabilities";

export interface MealPlanEligibilityUserContext {
  isAdult: boolean;
  hasCriticalAllergy: boolean;
  hasFoodRestriction: boolean;
  dietaryPattern: "omnivore" | "vegetarian" | "vegan" | "pescatarian" | "other" | "unknown";
  restrictionSafetyKnown: boolean;
}

export type MealPlanGenerationEligibility =
  | { status: "ELIGIBLE"; reasons: [] }
  | { status: "NOT_ELIGIBLE" | "REQUIRES_REVIEW"; reasons: string[] };

export function resolveMealPlanGenerationEligibility(
  userContext: MealPlanEligibilityUserContext,
  catalogStatus: TrustedCatalogStatus,
): MealPlanGenerationEligibility {
  const reasons: string[] = [];
  if (!userContext.isAdult) reasons.push("ADULT_ONLY_POLICY");
  if (catalogStatus.level === "CATALOG_NOT_AVAILABLE" || catalogStatus.level === "CATALOG_DEVELOPMENT_ONLY") {
    reasons.push("BASE_NUTRITION_CATALOG_NOT_READY");
  }
  const needsRestrictionSafety = userContext.hasCriticalAllergy || userContext.hasFoodRestriction ||
    userContext.dietaryPattern !== "omnivore";
  if (needsRestrictionSafety && (!userContext.restrictionSafetyKnown || catalogStatus.level !== "CATALOG_RESTRICTION_SAFE")) {
    reasons.push("RESTRICTION_SAFETY_NOT_ESTABLISHED");
  }
  if (["pescatarian", "other", "unknown"].includes(userContext.dietaryPattern)) {
    reasons.push("DIETARY_PATTERN_REQUIRES_REVIEW");
  }
  if (reasons.includes("ADULT_ONLY_POLICY") || reasons.includes("BASE_NUTRITION_CATALOG_NOT_READY")) {
    return { status: "NOT_ELIGIBLE", reasons };
  }
  if (reasons.length > 0) return { status: "REQUIRES_REVIEW", reasons };
  return { status: "ELIGIBLE", reasons: [] };
}
