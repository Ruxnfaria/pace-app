import { createClient } from "@supabase/supabase-js";
import { assessTrustedNutritionCatalog } from "../src/lib/nutrition/food-catalog/capabilities";
import { importNutritionCatalog } from "../src/lib/nutrition/food-catalog/importer";
import { normalizeFoodQuery } from "../src/lib/nutrition/food-catalog/normalization";
import { CURATED_TACO_ALIASES } from "../src/lib/nutrition/food-catalog/taco/aliases";
import {
  assertNoActiveTacoVersionConflict,
  buildTacoDatabaseRows,
  chunkTacoRows,
} from "../src/lib/nutrition/food-catalog/taco/database-import";
import { TACO_SOURCE_REFERENCE, TACO_SOURCE_VERSION } from "../src/lib/nutrition/food-catalog/taco/constants";
import { parseTacoDataset } from "../src/lib/nutrition/food-catalog/taco/parser";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main(): Promise<void> {
  const sourceFile = requiredEnvironment("TACO_SOURCE_FILE");
  const supabaseUrl = requiredEnvironment("SUPABASE_URL");
  const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const targetProjectRef = requiredEnvironment("TACO_TARGET_PROJECT_REF");
  if (new URL(supabaseUrl).hostname !== `${targetProjectRef}.supabase.co`) {
    throw new Error("SUPABASE_URL does not match TACO_TARGET_PROJECT_REF");
  }
  const parsed = await parseTacoDataset(sourceFile);
  const rejectionRate = parsed.report.totalRows === 0 ? 1 : parsed.report.rejected / parsed.report.totalRows;
  if (rejectionRate > 0.01 || parsed.report.duplicateSourceIds.length > 0) {
    throw new Error(`TACO import refused: ${JSON.stringify(parsed.report)}`);
  }
  const validated = importNutritionCatalog(parsed.records, {
    source: "TACO", sourceVersion: TACO_SOURCE_VERSION,
    sourceReference: TACO_SOURCE_REFERENCE, catalogScope: "PRODUCTION",
  });
  const readiness = assessTrustedNutritionCatalog(validated.acceptedRecords.map((record, index) => ({ id: `preflight-${index}`, ...record })));
  if (readiness.level !== "CATALOG_BASE_NUTRITION_READY" && readiness.level !== "CATALOG_RESTRICTION_SAFE") {
    throw new Error(`TACO readiness gate failed: ${JSON.stringify(readiness.reasons)}`);
  }

  const databaseRows = buildTacoDatabaseRows(parsed.records);
  const sourceIds = new Set(databaseRows.map((row) => row.source_food_id));
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: existing, error: existingError } = await client
    .from("nutrition_food_catalog")
    .select("source_food_id,source_version")
    .eq("source", "TACO")
    .eq("is_active", true);
  if (existingError) throw existingError;
  assertNoActiveTacoVersionConflict(existing ?? [], sourceIds);

  let upserted = 0;
  for (const batch of chunkTacoRows(databaseRows)) {
    const { error } = await client.from("nutrition_food_catalog").upsert(batch, {
      onConflict: "source,source_food_id,source_version",
      ignoreDuplicates: false,
    });
    if (error) throw error;
    upserted += batch.length;
  }

  const { data: importedFoods, error: importedFoodsError } = await client
    .from("nutrition_food_catalog")
    .select("id,source_food_id")
    .eq("source", "TACO")
    .eq("source_version", TACO_SOURCE_VERSION);
  if (importedFoodsError) throw importedFoodsError;
  const foodIdBySourceId = new Map((importedFoods ?? []).map((food) => [food.source_food_id, food.id]));
  const aliases = CURATED_TACO_ALIASES.map((alias) => ({
    food_id: foodIdBySourceId.get(alias.sourceFoodId),
    alias: alias.alias,
    normalized_alias: normalizeFoodQuery(alias.alias),
    locale: "pt-BR",
    source: "TACO",
    confidence: "CURATED",
  }));
  if (aliases.some((alias) => !alias.food_id)) throw new Error("TACO alias target missing after catalog import");
  const { error: aliasError } = await client.from("nutrition_food_aliases").upsert(aliases, {
    onConflict: "food_id,normalized_alias,locale",
    ignoreDuplicates: false,
  });
  if (aliasError) throw aliasError;

  console.log(JSON.stringify({ ...parsed.report, readiness: readiness.level, coverage: readiness.coverage, upserted, aliasesUpserted: aliases.length }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unknown TACO import failure");
  process.exitCode = 1;
});
