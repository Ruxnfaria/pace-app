import type { NutritionFoodCatalogEntry } from "../domain";
import { normalizeFoodQuery } from "../normalization";
import type { NutritionCatalogImportRecord } from "../importer";
import { TACO_SOURCE_REFERENCE, TACO_SOURCE_VERSION } from "./constants";

export interface TacoCatalogDatabaseRow {
  canonical_name: string;
  normalized_name: string;
  source: "TACO";
  source_food_id: string;
  source_version: typeof TACO_SOURCE_VERSION;
  source_reference: typeof TACO_SOURCE_REFERENCE;
  food_group: string;
  preparation_state: string;
  calories_per_100g: number | null;
  protein_g_per_100g: number | null;
  carbs_g_per_100g: number | null;
  fat_g_per_100g: number | null;
  fiber_g_per_100g: number | null;
  nutrient_completeness: NutritionFoodCatalogEntry["nutrientCompleteness"];
  edible_portion: number | null;
  density_g_per_ml: number | null;
  data_quality: NutritionFoodCatalogEntry["dataQuality"];
  catalog_scope: "PRODUCTION";
  dietary_tags: NutritionFoodCatalogEntry["dietaryTags"];
  allergen_tags: NutritionFoodCatalogEntry["allergenTags"];
  allergen_data_complete: false;
  food_role: NutritionFoodCatalogEntry["foodRole"];
  budget_tier: NutritionFoodCatalogEntry["budgetTier"];
  preparation_complexity: NutritionFoodCatalogEntry["preparationComplexity"];
  source_metadata: Record<string, unknown>;
  is_active: true;
}

function completeness(record: NutritionCatalogImportRecord): NutritionFoodCatalogEntry["nutrientCompleteness"] {
  const available = Object.values(record.nutrientsPer100g).filter((value) => value !== null).length;
  return available === 5 ? "COMPLETE" : available === 4 ? "PARTIAL" : "INSUFFICIENT";
}

export function buildTacoDatabaseRows(records: readonly NutritionCatalogImportRecord[]): TacoCatalogDatabaseRow[] {
  return records.map((record) => ({
    canonical_name: record.canonicalName,
    normalized_name: normalizeFoodQuery(record.canonicalName),
    source: "TACO",
    source_food_id: record.sourceFoodId,
    source_version: TACO_SOURCE_VERSION,
    source_reference: TACO_SOURCE_REFERENCE,
    food_group: record.foodGroup,
    preparation_state: record.preparationState,
    calories_per_100g: record.nutrientsPer100g.calories,
    protein_g_per_100g: record.nutrientsPer100g.proteinG,
    carbs_g_per_100g: record.nutrientsPer100g.carbsG,
    fat_g_per_100g: record.nutrientsPer100g.fatG,
    fiber_g_per_100g: record.nutrientsPer100g.fiberG,
    nutrient_completeness: completeness(record),
    edible_portion: record.ediblePortion,
    density_g_per_ml: record.densityGPerMl,
    data_quality: record.dataQuality,
    catalog_scope: "PRODUCTION",
    dietary_tags: record.dietaryTags,
    allergen_tags: record.allergenTags,
    allergen_data_complete: false,
    food_role: record.foodRole,
    budget_tier: record.budgetTier,
    preparation_complexity: record.preparationComplexity,
    source_metadata: record.sourceMetadata,
    is_active: true,
  }));
}

export function assertNoActiveTacoVersionConflict(
  existing: readonly { source_food_id: string; source_version: string }[],
  incomingSourceIds: ReadonlySet<string>,
): void {
  const conflict = existing.find((row) => incomingSourceIds.has(row.source_food_id) && row.source_version !== TACO_SOURCE_VERSION);
  if (conflict) throw new Error(`ACTIVE_TACO_VERSION_CONFLICT:${conflict.source_food_id}:${conflict.source_version}`);
}

export function chunkTacoRows<T>(rows: readonly T[], batchSize = 100): T[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error("Invalid TACO batch size");
  return Array.from({ length: Math.ceil(rows.length / batchSize) }, (_, index) => rows.slice(index * batchSize, (index + 1) * batchSize));
}
