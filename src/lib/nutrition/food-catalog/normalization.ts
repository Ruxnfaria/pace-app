import type { NutritionFoodAlias, NutritionFoodCatalogEntry } from "./domain";

export function normalizeFoodQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type FoodCatalogResolution =
  | { status: "EXACT_MATCH"; entry: NutritionFoodCatalogEntry }
  | { status: "ALIAS_MATCH"; entry: NutritionFoodCatalogEntry; alias: NutritionFoodAlias }
  | { status: "AMBIGUOUS"; candidates: NutritionFoodCatalogEntry[] }
  | { status: "NOT_FOUND" };

function uniqueEntries(entries: NutritionFoodCatalogEntry[]): NutritionFoodCatalogEntry[] {
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()];
}

export function resolveFoodCatalogEntry(
  query: string,
  entries: readonly NutritionFoodCatalogEntry[],
  aliases: readonly NutritionFoodAlias[],
): FoodCatalogResolution {
  const normalized = normalizeFoodQuery(query);
  if (!normalized) return { status: "NOT_FOUND" };
  const active = entries.filter((entry) => entry.isActive);
  const exact = uniqueEntries(active.filter((entry) => entry.normalizedName === normalized));
  if (exact.length === 1) return { status: "EXACT_MATCH", entry: exact[0] };
  if (exact.length > 1) return { status: "AMBIGUOUS", candidates: exact };

  const aliasMatches = aliases.filter((alias) => alias.normalizedAlias === normalized);
  const byId = new Map(active.map((entry) => [entry.id, entry]));
  const candidates = uniqueEntries(aliasMatches.flatMap((alias) => {
    const entry = byId.get(alias.foodId);
    return entry ? [entry] : [];
  }));
  if (candidates.length > 1) return { status: "AMBIGUOUS", candidates };
  if (candidates.length === 1) {
    const alias = aliasMatches.find((item) => item.foodId === candidates[0].id);
    if (alias) return { status: "ALIAS_MATCH", entry: candidates[0], alias };
  }
  return { status: "NOT_FOUND" };
}
