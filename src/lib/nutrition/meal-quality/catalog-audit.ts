import type { NutritionFoodCatalogEntry } from "../food-catalog/domain";
import { FOOD_FORMS, FOOD_QUALITY_CLASSES, type FoodSuitabilityAudit, type PortionProfileAudit } from "./domain";
import { classifyFoodSuitability } from "./food-suitability";
import { foodPortionProfile } from "./portion-profile";

export function auditFoodSuitability(entries: NutritionFoodCatalogEntry[]): FoodSuitabilityAudit {
  const profiles = entries.map((entry) => ({ entry, profile: classifyFoodSuitability(entry) }));
  return {
    total: entries.length,
    autoGenerationEligible: profiles.filter(({ profile }) => profile.autoGenerationApproved).length,
    byQualityClass: Object.fromEntries(FOOD_QUALITY_CLASSES.map((quality) => [quality,
      profiles.filter(({ profile }) => profile.qualityClass === quality).length])) as FoodSuitabilityAudit["byQualityClass"],
    byForm: Object.fromEntries(FOOD_FORMS.map((form) => [form,
      profiles.filter(({ profile }) => profile.form === form).length])) as FoodSuitabilityAudit["byForm"],
    examples: Object.fromEntries(FOOD_QUALITY_CLASSES.map((quality) => [quality,
      profiles.filter(({ profile }) => profile.qualityClass === quality).slice(0, 5).map(({ entry }) => entry.canonicalName)])),
  };
}

export function auditPortionProfiles(entries: NutritionFoodCatalogEntry[]): PortionProfileAudit {
  const classified = entries.filter((entry) => {
    const suitability = classifyFoodSuitability(entry);
    const slot = suitability.culinaryRoles.some((role) => role === "PROTEIN" || role === "LEAN_PROTEIN")
      ? "PROTEIN_ANCHOR"
      : suitability.culinaryRoles.some((role) => role === "STARCH" || role === "WHOLE_GRAIN")
        ? "CARB_ANCHOR"
        : suitability.culinaryRoles.includes("LEGUME")
          ? "LEGUME_ANCHOR"
          : suitability.culinaryRoles.some((role) => role === "FAT" || role === "CULINARY_FAT")
            ? "FAT_ANCHOR"
            : "PRODUCE_FIBER";
    const profile = foodPortionProfile(entry, slot, "MAIN_MEAL");
    return Number.isFinite(profile.minimumGrams)
      && Number.isFinite(profile.maximumAutogenerationGrams)
      && profile.incrementGrams > 0
      && profile.rationale.length > 0;
  }).length;
  return {
    total: entries.length,
    classified,
    unclassified: entries.length - classified,
    coveragePercent: entries.length === 0 ? 100 : Number(((classified / entries.length) * 100).toFixed(2)),
  };
}
