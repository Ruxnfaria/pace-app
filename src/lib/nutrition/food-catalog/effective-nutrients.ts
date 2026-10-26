import type { NutritionFoodCatalogEntry, NutrientsPer100g } from "./domain";

export const TACO_UNKNOWN_NUTRIENT_MARKERS = [
  "TRACE",
  "NOT_REQUESTED",
  "NOT_REEVALUATED",
  "UNDER_REEVALUATION",
  "REEVALUATION",
] as const;

function valueMarkers(entry: NutritionFoodCatalogEntry): Record<string, unknown> {
  const markers = entry.sourceMetadata.valueMarkers;
  return markers && typeof markers === "object" && !Array.isArray(markers)
    ? markers as Record<string, unknown>
    : {};
}

/**
 * Resolves values that are safe for calculations while preserving the imported
 * TACO record. Only fibre explicitly marked NOT_APPLICABLE has the documented
 * effective-zero meaning. Every other missing value remains unknown.
 */
export function resolveEffectiveNutrients(entry: NutritionFoodCatalogEntry): NutrientsPer100g {
  const raw = entry.nutrientsPer100g;
  const markers = valueMarkers(entry);
  return {
    ...raw,
    fiberG: raw.fiberG === null && markers.fiber === "NOT_APPLICABLE" ? 0 : raw.fiberG,
  };
}

export function hasCompleteEffectiveNutrients(entry: NutritionFoodCatalogEntry): boolean {
  return Object.values(resolveEffectiveNutrients(entry)).every(
    (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
}
