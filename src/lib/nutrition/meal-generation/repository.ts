import type { SupabaseClient } from "@supabase/supabase-js";
import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import type { NutritionFoodAlias, NutritionFoodCatalogEntry, NutritionFoodPortion } from "../food-catalog/domain";
import type { CatalogSnapshot } from "./domain";

export interface NutritionFoodCatalogRepository {
  loadSnapshot(): Promise<CatalogSnapshot>;
}

export class InMemoryNutritionFoodCatalogRepository implements NutritionFoodCatalogRepository {
  constructor(
    private readonly entries: NutritionFoodCatalogEntry[],
    private readonly aliases: NutritionFoodAlias[] = [],
    private readonly portions: NutritionFoodPortion[] = [],
  ) {}

  async loadSnapshot(): Promise<CatalogSnapshot> {
    return { entries: this.entries, aliases: this.aliases, portions: this.portions,
      readiness: assessTrustedNutritionCatalog(this.entries).level };
  }
}

type CatalogRow = {
  id: string; canonical_name: string; normalized_name: string; source: NutritionFoodCatalogEntry["source"];
  source_food_id: string; source_version: string; source_reference: string; food_group: string; preparation_state: string;
  calories_per_100g: number | null; protein_g_per_100g: number | null; carbs_g_per_100g: number | null;
  fat_g_per_100g: number | null; fiber_g_per_100g: number | null; nutrient_completeness: NutritionFoodCatalogEntry["nutrientCompleteness"];
  edible_portion: number | null; density_g_per_ml: number | null; data_quality: NutritionFoodCatalogEntry["dataQuality"];
  catalog_scope: NutritionFoodCatalogEntry["catalogScope"]; dietary_tags: NutritionFoodCatalogEntry["dietaryTags"];
  allergen_tags: NutritionFoodCatalogEntry["allergenTags"]; allergen_data_complete: boolean;
  food_role: NutritionFoodCatalogEntry["foodRole"]; budget_tier: NutritionFoodCatalogEntry["budgetTier"];
  preparation_complexity: NutritionFoodCatalogEntry["preparationComplexity"]; source_metadata: Record<string, unknown>; is_active: boolean;
};

function mapEntry(row: CatalogRow): NutritionFoodCatalogEntry {
  return {
    id: row.id, canonicalName: row.canonical_name, normalizedName: row.normalized_name, source: row.source,
    sourceFoodId: row.source_food_id, sourceVersion: row.source_version, sourceReference: row.source_reference,
    foodGroup: row.food_group, preparationState: row.preparation_state,
    nutrientsPer100g: { calories: row.calories_per_100g, proteinG: row.protein_g_per_100g, carbsG: row.carbs_g_per_100g,
      fatG: row.fat_g_per_100g, fiberG: row.fiber_g_per_100g },
    nutrientCompleteness: row.nutrient_completeness, ediblePortion: row.edible_portion, densityGPerMl: row.density_g_per_ml,
    dataQuality: row.data_quality, catalogScope: row.catalog_scope, dietaryTags: row.dietary_tags,
    allergenTags: row.allergen_tags, allergenDataComplete: row.allergen_data_complete, foodRole: row.food_role,
    budgetTier: row.budget_tier, preparationComplexity: row.preparation_complexity,
    sourceMetadata: row.source_metadata, isActive: row.is_active,
  };
}

export class DatabaseNutritionFoodCatalogRepository implements NutritionFoodCatalogRepository {
  constructor(private readonly client: SupabaseClient) {}

  async loadSnapshot(): Promise<CatalogSnapshot> {
    const foods = await this.client.from("nutrition_food_catalog").select("*").eq("source", "TACO").eq("source_version", "4_edicao_2011").eq("is_active", true);
    if (foods.error) throw new Error("CATALOG_READ_FAILED");
    const entries = ((foods.data ?? []) as CatalogRow[]).map(mapEntry);
    const ids = entries.map((entry) => entry.id);
    if (ids.length === 0) return { entries, aliases: [], portions: [], readiness: "CATALOG_NOT_AVAILABLE" };
    const [aliasesResult, portionsResult] = await Promise.all([
      this.client.from("nutrition_food_aliases").select("id,food_id,alias,normalized_alias,locale,source,confidence").in("food_id", ids),
      this.client.from("nutrition_food_portions").select("id,food_id,label,grams,locale,source,source_reference").in("food_id", ids),
    ]);
    if (aliasesResult.error || portionsResult.error) throw new Error("CATALOG_RELATIONS_READ_FAILED");
    const aliases: NutritionFoodAlias[] = (aliasesResult.data ?? []).map((row) => ({
      id: row.id, foodId: row.food_id, alias: row.alias, normalizedAlias: row.normalized_alias,
      locale: row.locale, source: row.source, confidence: row.confidence,
    }));
    const portions: NutritionFoodPortion[] = (portionsResult.data ?? []).map((row) => ({
      id: row.id, foodId: row.food_id, label: row.label, grams: row.grams,
      locale: row.locale, source: row.source, sourceReference: row.source_reference,
    }));
    return { entries, aliases, portions, readiness: assessTrustedNutritionCatalog(entries).level };
  }
}
