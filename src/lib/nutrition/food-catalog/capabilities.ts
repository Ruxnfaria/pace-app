import {
  FOOD_COVERAGE_CATEGORIES,
  type FoodCoverageCategory,
  type NutritionFoodCatalogEntry,
} from "./domain";
import {
  TACO_CORE_NUTRIENT_COVERAGE_MINIMUM,
  TACO_READINESS_REQUIRED_CATEGORIES,
  TACO_SOURCE_REFERENCE,
  TACO_SOURCE_VERSION,
} from "./taco/constants";

export const CATALOG_READINESS_LEVELS = [
  "CATALOG_NOT_AVAILABLE",
  "CATALOG_DEVELOPMENT_ONLY",
  "CATALOG_BASE_NUTRITION_READY",
  "CATALOG_RESTRICTION_SAFE",
] as const;
export type CatalogReadinessLevel = (typeof CATALOG_READINESS_LEVELS)[number];

export interface CatalogCoverage {
  totalActiveEntries: number;
  completeNutrientEntries: number;
  productionEntries: number;
  coreNutrientCoverage: number;
  countByCategory: Record<FoodCoverageCategory, number>;
  coveredCategories: FoodCoverageCategory[];
  missingCategories: FoodCoverageCategory[];
}

export interface TrustedCatalogStatus {
  level: CatalogReadinessLevel;
  coverage: CatalogCoverage;
  authoritativeSourceImported: boolean;
  recognizedVersion: boolean;
  provenanceValid: boolean;
  restrictionMetadataComplete: boolean;
  reasons: string[];
}

function categoriesFor(entry: NutritionFoodCatalogEntry): FoodCoverageCategory[] {
  const metadataCategories = entry.sourceMetadata.coverageCategories;
  const values = Array.isArray(metadataCategories) ? metadataCategories : [entry.foodGroup];
  return [...new Set(values.filter((value): value is FoodCoverageCategory =>
    typeof value === "string" && FOOD_COVERAGE_CATEGORIES.includes(value as FoodCoverageCategory)))];
}

export function calculateCatalogCoverage(entries: readonly NutritionFoodCatalogEntry[]): CatalogCoverage {
  const active = entries.filter((entry) => entry.isActive);
  const countByCategory = Object.fromEntries(FOOD_COVERAGE_CATEGORIES.map((category) => [category, 0])) as Record<FoodCoverageCategory, number>;
  for (const entry of active) for (const category of categoriesFor(entry)) countByCategory[category] += 1;
  const coveredCategories = FOOD_COVERAGE_CATEGORIES.filter((category) => countByCategory[category] > 0);
  const completeNutrientEntries = active.filter((entry) => entry.nutrientCompleteness === "COMPLETE").length;
  const knownCoreNutrients = active.reduce((total, entry) =>
    total + Object.values(entry.nutrientsPer100g).filter((value) => value !== null).length, 0);
  return {
    totalActiveEntries: active.length,
    completeNutrientEntries,
    productionEntries: active.filter((entry) => entry.catalogScope === "PRODUCTION").length,
    coreNutrientCoverage: active.length === 0 ? 0 : knownCoreNutrients / (active.length * 5),
    countByCategory,
    coveredCategories,
    missingCategories: FOOD_COVERAGE_CATEGORIES.filter((category) => countByCategory[category] === 0),
  };
}

export function assessTrustedNutritionCatalog(entries: readonly NutritionFoodCatalogEntry[]): TrustedCatalogStatus {
  const active = entries.filter((entry) => entry.isActive);
  const coverage = calculateCatalogCoverage(active);
  if (active.length === 0) {
    return { level: "CATALOG_NOT_AVAILABLE", coverage, authoritativeSourceImported: false, recognizedVersion: false,
      provenanceValid: false, restrictionMetadataComplete: false, reasons: ["NO_ACTIVE_CATALOG_ENTRIES"] };
  }
  const production = active.filter((entry) => entry.catalogScope === "PRODUCTION");
  const authoritative = production.filter((entry) => entry.source === "TACO");
  const recognized = authoritative.length > 0 && authoritative.every((entry) => entry.sourceVersion === TACO_SOURCE_VERSION);
  const provenanceValid = authoritative.length > 0 && authoritative.every((entry) => entry.sourceReference === TACO_SOURCE_REFERENCE);
  const categoryCoverageAdequate = TACO_READINESS_REQUIRED_CATEGORIES.every((category) => coverage.countByCategory[category] > 0);
  const coreCoverageAdequate = coverage.coreNutrientCoverage >= TACO_CORE_NUTRIENT_COVERAGE_MINIMUM;
  const baseReady = authoritative.length > 0 && recognized && provenanceValid && categoryCoverageAdequate && coreCoverageAdequate;
  const restrictionMetadataComplete = baseReady && authoritative.every((entry) => entry.allergenDataComplete);
  const reasons: string[] = [];
  if (production.length === 0) reasons.push("PRODUCTION_SOURCE_NOT_IMPORTED");
  if (!recognized) reasons.push("SOURCE_VERSION_NOT_RECOGNIZED");
  if (!provenanceValid) reasons.push("PROVENANCE_INVALID");
  if (!categoryCoverageAdequate) reasons.push("CATEGORY_COVERAGE_INADEQUATE");
  if (!coreCoverageAdequate) reasons.push("CORE_NUTRIENT_COVERAGE_INADEQUATE");
  if (baseReady && !restrictionMetadataComplete) reasons.push("RESTRICTION_METADATA_INCOMPLETE");
  return {
    level: restrictionMetadataComplete ? "CATALOG_RESTRICTION_SAFE" : baseReady ? "CATALOG_BASE_NUTRITION_READY" : "CATALOG_DEVELOPMENT_ONLY",
    coverage,
    authoritativeSourceImported: authoritative.length > 0,
    recognizedVersion: recognized,
    provenanceValid,
    restrictionMetadataComplete,
    reasons,
  };
}

export function isTrustedNutritionCatalogReady(entries: readonly NutritionFoodCatalogEntry[]): boolean {
  const level = assessTrustedNutritionCatalog(entries).level;
  return level === "CATALOG_BASE_NUTRITION_READY" || level === "CATALOG_RESTRICTION_SAFE";
}
