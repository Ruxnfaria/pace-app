import {
  ALLERGEN_TAGS,
  BUDGET_TIERS,
  DIETARY_TAGS,
  FOOD_CATALOG_SCOPES,
  FOOD_ROLES,
  NUTRITION_DATA_QUALITIES,
  NUTRITION_FOOD_SOURCES,
  PREPARATION_COMPLEXITIES,
  type NutritionFoodCatalogEntry,
  type NutritionFoodSource,
  type NutrientCompleteness,
  type NutrientsPer100g,
} from "./domain";
import { normalizeFoodQuery } from "./normalization";

export interface NutritionCatalogSourceMetadata {
  source: NutritionFoodSource;
  sourceVersion: string;
  sourceReference: string;
  catalogScope: "PRODUCTION" | "TEST_ONLY";
}

export type NutritionCatalogImportRecord = Omit<
  NutritionFoodCatalogEntry,
  "id" | "normalizedName" | "source" | "sourceVersion" | "sourceReference" | "catalogScope" | "nutrientCompleteness" | "isActive"
>;

export interface NutritionCatalogImportRejection {
  index: number;
  sourceFoodId: string | null;
  codes: string[];
}

export interface NutritionCatalogImportReport {
  inserted: number;
  versioned: number;
  rejected: number;
  warnings: string[];
  acceptedRecords: Array<Omit<NutritionFoodCatalogEntry, "id">>;
  rejections: NutritionCatalogImportRejection[];
}

export interface NutritionCatalogImporter {
  importNutritionCatalog(
    records: readonly NutritionCatalogImportRecord[],
    metadata: NutritionCatalogSourceMetadata,
    existingSourceKeys?: ReadonlySet<string>,
  ): NutritionCatalogImportReport;
}

const MAX_NUTRIENT_PER_100G = { calories: 1000, proteinG: 100, carbsG: 100, fatG: 100, fiberG: 100 } as const;

function completeness(nutrients: NutrientsPer100g): NutrientCompleteness {
  const available = Object.values(nutrients).filter((value) => value !== null).length;
  return available === 5 ? "COMPLETE" : available >= 4 ? "PARTIAL" : "INSUFFICIENT";
}

function invalidNutrients(nutrients: NutrientsPer100g): boolean {
  return (Object.keys(MAX_NUTRIENT_PER_100G) as Array<keyof NutrientsPer100g>).some((key) => {
    const value = nutrients[key];
    return value !== null && (!Number.isFinite(value) || value < 0 || value > MAX_NUTRIENT_PER_100G[key]);
  });
}

function validateMetadata(metadata: NutritionCatalogSourceMetadata): void {
  if (!NUTRITION_FOOD_SOURCES.includes(metadata.source) || !metadata.sourceVersion.trim() || !metadata.sourceReference.trim()) {
    throw new Error("Import source metadata and provenance are required");
  }
  if (!FOOD_CATALOG_SCOPES.includes(metadata.catalogScope)) throw new Error("Invalid catalog scope");
}

export const nutritionCatalogImporter: NutritionCatalogImporter = {
  importNutritionCatalog(records, metadata, existingSourceKeys = new Set()) {
    validateMetadata(metadata);
    const seen = new Set<string>();
    const acceptedRecords: Array<Omit<NutritionFoodCatalogEntry, "id">> = [];
    const rejections: NutritionCatalogImportRejection[] = [];
    const warnings: string[] = [];
    let versioned = 0;

    records.forEach((record, index) => {
      const codes: string[] = [];
      const key = `${metadata.source}:${record.sourceFoodId}:${metadata.sourceVersion}`;
      if (!record.sourceFoodId?.trim()) codes.push("MISSING_SOURCE_ID");
      if (seen.has(key)) codes.push("DUPLICATE_SOURCE_ID");
      if (!record.canonicalName?.trim()) codes.push("EMPTY_CANONICAL_NAME");
      if (!record.foodGroup?.trim() || !record.preparationState?.trim()) codes.push("MISSING_FOOD_CLASSIFICATION");
      if (invalidNutrients(record.nutrientsPer100g)) codes.push("INVALID_NUTRIENTS");
      if (!NUTRITION_DATA_QUALITIES.includes(record.dataQuality)) codes.push("INVALID_DATA_QUALITY");
      if (!record.dietaryTags.every((tag) => DIETARY_TAGS.includes(tag))) codes.push("INVALID_DIETARY_TAG");
      if (!record.allergenTags.every((tag) => ALLERGEN_TAGS.includes(tag))) codes.push("INVALID_ALLERGEN_TAG");
      if (record.foodRole !== null && !FOOD_ROLES.includes(record.foodRole)) codes.push("INVALID_FOOD_ROLE");
      if (record.budgetTier !== null && !BUDGET_TIERS.includes(record.budgetTier)) codes.push("INVALID_BUDGET_TIER");
      if (record.preparationComplexity !== null && !PREPARATION_COMPLEXITIES.includes(record.preparationComplexity)) codes.push("INVALID_PREPARATION_COMPLEXITY");
      if (!record.sourceMetadata || Array.isArray(record.sourceMetadata)) codes.push("INVALID_SOURCE_METADATA");
      if (record.ediblePortion !== null && (!Number.isFinite(record.ediblePortion) || record.ediblePortion <= 0 || record.ediblePortion > 1)) codes.push("INVALID_EDIBLE_PORTION");
      if (record.densityGPerMl !== null && (!Number.isFinite(record.densityGPerMl) || record.densityGPerMl <= 0 || record.densityGPerMl > 5)) codes.push("INVALID_DENSITY");

      seen.add(key);
      if (codes.length > 0) {
        rejections.push({ index, sourceFoodId: record.sourceFoodId || null, codes });
        return;
      }
      const nutrientCompleteness = completeness(record.nutrientsPer100g);
      if (nutrientCompleteness !== "COMPLETE") warnings.push(`${record.sourceFoodId}:INCOMPLETE_NUTRIENTS`);
      if (!record.allergenDataComplete) warnings.push(`${record.sourceFoodId}:ALLERGEN_DATA_INCOMPLETE`);
      if (existingSourceKeys.has(`${metadata.source}:${record.sourceFoodId}`)) versioned += 1;
      acceptedRecords.push({
        ...record,
        normalizedName: normalizeFoodQuery(record.canonicalName),
        source: metadata.source,
        sourceVersion: metadata.sourceVersion,
        sourceReference: metadata.sourceReference,
        catalogScope: metadata.catalogScope,
        nutrientCompleteness,
        isActive: true,
      });
    });

    return {
      inserted: acceptedRecords.length - versioned,
      versioned,
      rejected: rejections.length,
      warnings,
      acceptedRecords,
      rejections,
    };
  },
};

export function importNutritionCatalog(
  records: readonly NutritionCatalogImportRecord[],
  metadata: NutritionCatalogSourceMetadata,
  existingSourceKeys?: ReadonlySet<string>,
): NutritionCatalogImportReport {
  return nutritionCatalogImporter.importNutritionCatalog(records, metadata, existingSourceKeys);
}
