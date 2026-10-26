import type { NutritionFoodCatalogEntry } from "../food-catalog/domain";
import { hasCompleteEffectiveNutrients, resolveEffectiveNutrients } from "../food-catalog/effective-nutrients";
import { canUseFoodForRestrictions } from "../food-catalog/restrictions";
import { TACO_SOURCE_VERSION } from "../food-catalog/taco/constants";
import type {
  CatalogSnapshot,
  MealPlanCatalogCandidate,
  MealPlanFoodPool,
  MealPlanGenerationContext,
  MealPlanMealSlotPrescription,
} from "./domain";

export const MAX_MEAL_PLAN_CANDIDATES_PER_POOL = 24;
export const MAX_MEAL_PLAN_CANDIDATES = MAX_MEAL_PLAN_CANDIDATES_PER_POOL * 4;

const POOL_ORDER: MealPlanFoodPool[] = [
  "PROTEIN_ANCHOR",
  "CARB_ANCHOR",
  "FAT_ANCHOR",
  "PRODUCE_FIBER",
];

export function isMealPlanGenerationCandidate(entry: NutritionFoodCatalogEntry): boolean {
  return entry.isActive
    && entry.source === "TACO"
    && entry.sourceVersion === TACO_SOURCE_VERSION
    && entry.catalogScope === "PRODUCTION"
    && hasCompleteEffectiveNutrients(entry);
}

function poolScores(entry: NutritionFoodCatalogEntry): Partial<Record<MealPlanFoodPool, number>> {
  const nutrients = resolveEffectiveNutrients(entry);
  if (Object.values(nutrients).some((value) => value === null)) return {};
  const calories = Math.max(nutrients.calories!, 1);
  const proteinShare = nutrients.proteinG! * 4 / calories;
  const carbShare = nutrients.carbsG! * 4 / calories;
  const fatShare = nutrients.fatG! * 9 / calories;
  const scores: Partial<Record<MealPlanFoodPool, number>> = {};

  if (nutrients.proteinG! >= 8 && proteinShare >= 0.22 && nutrients.fatG! <= nutrients.proteinG! * 1.5 + 5) {
    scores.PROTEIN_ANCHOR = nutrients.proteinG! * 4 + proteinShare * 100 - nutrients.fatG! * 0.5;
  }
  if (nutrients.carbsG! >= 10 && carbShare >= 0.35 && fatShare <= 0.5) {
    scores.CARB_ANCHOR = nutrients.carbsG! * 2 + carbShare * 100 - nutrients.fatG!;
  }
  if (nutrients.fatG! >= 5 && fatShare >= 0.3) {
    scores.FAT_ANCHOR = nutrients.fatG! * 3 + fatShare * 100;
  }
  const produceGroup = /fruit|vegetable|legume|frut|veget|verdura|folha|legumin/i.test(entry.foodGroup);
  if (nutrients.fiberG! >= 1.5 && (produceGroup || nutrients.fiberG! >= 3)) {
    scores.PRODUCE_FIBER = nutrients.fiberG! * 8 - calories / 100 + (produceGroup ? 10 : 0);
  }
  return scores;
}

export function classifyMealPlanFoodPools(entry: NutritionFoodCatalogEntry): MealPlanFoodPool[] {
  const scores = poolScores(entry);
  return POOL_ORDER.filter((pool) => scores[pool] !== undefined);
}

function compareForPool(pool: MealPlanFoodPool, left: NutritionFoodCatalogEntry, right: NutritionFoodCatalogEntry): number {
  const scoreDelta = (poolScores(right)[pool] ?? Number.NEGATIVE_INFINITY)
    - (poolScores(left)[pool] ?? Number.NEGATIVE_INFINITY);
  return scoreDelta || left.normalizedName.localeCompare(right.normalizedName) || left.id.localeCompare(right.id);
}

function toPromptCandidate(entry: NutritionFoodCatalogEntry): MealPlanCatalogCandidate {
  const nutrients = resolveEffectiveNutrients(entry);
  if (Object.values(nutrients).some((value) => value === null)) throw new Error("INCOMPLETE_MEAL_PLAN_CANDIDATE");
  return {
    catalogEntryId: entry.id,
    canonicalName: entry.canonicalName,
    source: "TACO",
    sourceFoodId: entry.sourceFoodId,
    sourceVersion: entry.sourceVersion,
    preparationState: entry.preparationState,
    calories: nutrients.calories!,
    proteinG: nutrients.proteinG!,
    carbsG: nutrients.carbsG!,
    fatG: nutrients.fatG!,
    fiberG: nutrients.fiberG!,
    pools: classifyMealPlanFoodPools(entry),
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
    });

  const selected = new Map<string, NutritionFoodCatalogEntry>();
  for (const pool of POOL_ORDER) {
    eligible
      .filter((entry) => classifyMealPlanFoodPools(entry).includes(pool))
      .sort((left, right) => compareForPool(pool, left, right))
      .slice(0, MAX_MEAL_PLAN_CANDIDATES_PER_POOL)
      .forEach((entry) => selected.set(entry.id, entry));
  }

  return [...selected.values()]
    .sort((left, right) => {
      const best = (entry: NutritionFoodCatalogEntry) => Math.max(...Object.values(poolScores(entry)));
      return best(right) - best(left)
        || left.normalizedName.localeCompare(right.normalizedName)
        || left.id.localeCompare(right.id);
    })
    .slice(0, MAX_MEAL_PLAN_CANDIDATES)
    .map(toPromptCandidate);
}

export function buildMealPlanMealSlots(
  context: MealPlanGenerationContext,
  candidates: MealPlanCatalogCandidate[],
): MealPlanMealSlotPrescription[] {
  const idsFor = (pool: MealPlanFoodPool) => candidates
    .filter((candidate) => candidate.pools.includes(pool))
    .map((candidate) => candidate.catalogEntryId);
  return context.mealRoles.map((role, index) => ({
    position: index + 1,
    role,
    slots: POOL_ORDER.map((pool) => ({
      pool,
      required: pool !== "FAT_ANCHOR",
      catalogEntryIds: idsFor(pool),
    })),
  }));
}
