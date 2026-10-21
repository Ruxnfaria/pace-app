import type { NutritionFoodCatalogEntry } from "../food-catalog/domain";
import { normalizeFoodQuery } from "../food-catalog/normalization";
import { canUseFoodForRestrictions } from "../food-catalog/restrictions";
import { TACO_SOURCE_VERSION } from "../food-catalog/taco/constants";
import type {
  CatalogSnapshot,
  MealPlanCatalogCandidate,
  MealPlanGenerationContext,
} from "./domain";

export const MEAL_PLAN_CANDIDATE_CATEGORY_QUOTA = 12;
export const MEAL_PLAN_CANDIDATE_CATEGORIES = [
  "staple_carb",
  "legume",
  "lean_protein",
  "egg_or_dairy",
  "fruit",
  "vegetable",
  "fat_source",
  "vegetarian_protein",
] as const;
export const MAX_MEAL_PLAN_CANDIDATES =
  MEAL_PLAN_CANDIDATE_CATEGORIES.length * MEAL_PLAN_CANDIDATE_CATEGORY_QUOTA;

export function isMealPlanGenerationCandidate(entry: NutritionFoodCatalogEntry): boolean {
  return entry.isActive
    && entry.source === "TACO"
    && entry.sourceVersion === TACO_SOURCE_VERSION
    && entry.catalogScope === "PRODUCTION"
    && entry.nutrientCompleteness === "COMPLETE"
    && Object.values(entry.nutrientsPer100g).every(
      (value) => typeof value === "number" && Number.isFinite(value),
    );
}

function candidateCategories(entry: NutritionFoodCatalogEntry): Set<(typeof MEAL_PLAN_CANDIDATE_CATEGORIES)[number]> {
  const value = normalizeFoodQuery(`${entry.foodGroup} ${entry.canonicalName} ${entry.foodRole ?? ""}`);
  const categories = new Set<(typeof MEAL_PLAN_CANDIDATE_CATEGORIES)[number]>();
  if (/cereal|bread|paes|pao|pasta|massa|root|tuber|arroz|batata|mandioca|carb/.test(value)) categories.add("staple_carb");
  if (/legume|feij|lentilha|ervilha|grao de bico/.test(value)) categories.add("legume");
  if (/meat|poultry|fish|carne|frango|peixe|protein/.test(value) && entry.nutrientsPer100g.fatG! <= 20) categories.add("lean_protein");
  if (/egg|dairy|ovo|leite|queijo|iogurte/.test(value)) categories.add("egg_or_dairy");
  if (/fruit|fruta|banana|maca|laranja/.test(value)) categories.add("fruit");
  if (/vegetable|vegetal|verdura|legume vegetal|folha/.test(value)) categories.add("vegetable");
  if (/oil|fat|nuts|seeds|oleo|azeite|gordura|castanha|semente/.test(value)) categories.add("fat_source");
  if (/legume|soy|soja|tofu|lentilha|feij|grao de bico|vegetarian/.test(value)) categories.add("vegetarian_protein");
  return categories;
}

function toPromptCandidate(entry: NutritionFoodCatalogEntry): MealPlanCatalogCandidate {
  const nutrients = entry.nutrientsPer100g;
  if (nutrients.calories === null || nutrients.proteinG === null || nutrients.carbsG === null
    || nutrients.fatG === null || nutrients.fiberG === null) {
    throw new Error("INCOMPLETE_MEAL_PLAN_CANDIDATE");
  }
  return {
    catalogEntryId: entry.id,
    canonicalName: entry.canonicalName,
    source: "TACO",
    sourceFoodId: entry.sourceFoodId,
    sourceVersion: entry.sourceVersion,
    preparationState: entry.preparationState,
    calories: nutrients.calories,
    proteinG: nutrients.proteinG,
    carbsG: nutrients.carbsG,
    fatG: nutrients.fatG,
    fiberG: nutrients.fiberG,
  };
}

export function buildMealPlanCandidateSet(
  context: MealPlanGenerationContext,
  catalog: CatalogSnapshot,
): MealPlanCatalogCandidate[] {
  const eligible = catalog.entries
    .filter(isMealPlanGenerationCandidate)
    .filter((entry) => {
      if (!context.hasFoodRestriction && context.dietaryPattern === "omnivore" && context.allergenRestrictions.length === 0) return true;
      return canUseFoodForRestrictions(entry, {
        dietaryPattern: context.dietaryPattern === "unknown" ? "other" : context.dietaryPattern,
        allergenRestrictions: context.allergenRestrictions,
      }).allowed;
    })
    .sort((left, right) => left.normalizedName.localeCompare(right.normalizedName) || left.id.localeCompare(right.id));

  const selected = new Map<string, NutritionFoodCatalogEntry>();
  for (const category of MEAL_PLAN_CANDIDATE_CATEGORIES) {
    let count = 0;
    for (const entry of eligible) {
      if (!candidateCategories(entry).has(category)) continue;
      selected.set(entry.id, entry);
      count += 1;
      if (count === MEAL_PLAN_CANDIDATE_CATEGORY_QUOTA) break;
    }
  }
  for (const entry of eligible) {
    if (selected.size === MAX_MEAL_PLAN_CANDIDATES) break;
    selected.set(entry.id, entry);
  }
  return [...selected.values()].slice(0, MAX_MEAL_PLAN_CANDIDATES).map(toPromptCandidate);
}
