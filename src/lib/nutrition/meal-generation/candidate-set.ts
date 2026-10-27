import type { NutritionFoodCatalogEntry } from "../food-catalog/domain";
import { hasCompleteEffectiveNutrients, resolveEffectiveNutrients } from "../food-catalog/effective-nutrients";
import { canUseFoodForRestrictions } from "../food-catalog/restrictions";
import { TACO_SOURCE_VERSION } from "../food-catalog/taco/constants";
import { deriveMealFuelLevel, fuelCarbohydratePortionRange } from "../meal-quality/fuel-level";
import { classifyFoodSuitability, isSuitableForMealRole } from "../meal-quality/food-suitability";
import { mealArchetypeFor } from "../meal-quality/meal-archetypes";
import type {
  CatalogSnapshot,
  MealPlanCatalogCandidate,
  MealPlanFoodPool,
  MealPlanGenerationContext,
  MealPlanMealSlotPrescription,
} from "./domain";

export const MAX_MEAL_PLAN_CANDIDATES_PER_POOL = 24;
export const MAX_MEAL_PLAN_CANDIDATES = MAX_MEAL_PLAN_CANDIDATES_PER_POOL * 5;

// TACO source ids are stable inside 4_edicao_2011. These staples preserve
// culturally coherent options when nutrient-density ranking would otherwise
// fill a bounded pool with unusual foods. Database UUIDs are intentionally not used.
const PRAXE_MEAL_FOODS_V1_PRIORITY_SOURCE_IDS = new Set([
  "1", "3", "52", "53", "88", "100", "129", "182", "225", "226", "260",
  "410", "448", "488", "533", "561", "567", "577", "597",
]);

const POOL_ORDER: MealPlanFoodPool[] = [
  "PROTEIN_ANCHOR",
  "CARB_ANCHOR",
  "FAT_ANCHOR",
  "LEGUME_ANCHOR",
  "PRODUCE_FIBER",
];

export function isMealPlanGenerationCandidate(entry: NutritionFoodCatalogEntry): boolean {
  const suitability = classifyFoodSuitability(entry);
  return entry.isActive
    && entry.source === "TACO"
    && entry.sourceVersion === TACO_SOURCE_VERSION
    && entry.catalogScope === "PRODUCTION"
    && hasCompleteEffectiveNutrients(entry)
    && (suitability.autoGenerationApproved
      || (suitability.qualityClass === "INGREDIENT_ONLY" && suitability.culinaryRoles.includes("CULINARY_FAT")));
}

function poolScores(entry: NutritionFoodCatalogEntry): Partial<Record<MealPlanFoodPool, number>> {
  const nutrients = resolveEffectiveNutrients(entry);
  if (Object.values(nutrients).some((value) => value === null)) return {};
  const calories = Math.max(nutrients.calories!, 1);
  const proteinShare = nutrients.proteinG! * 4 / calories;
  const carbShare = nutrients.carbsG! * 4 / calories;
  const fatShare = nutrients.fatG! * 9 / calories;
  const scores: Partial<Record<MealPlanFoodPool, number>> = {};
  const suitability = classifyFoodSuitability(entry);

  if (suitability.culinaryRoles.some((role) => role === "PROTEIN" || role === "LEAN_PROTEIN")
    && nutrients.proteinG! >= 3 && proteinShare >= 0.12 && nutrients.fatG! <= nutrients.proteinG! * 1.5 + 5) {
    scores.PROTEIN_ANCHOR = nutrients.proteinG! * 4 + proteinShare * 100 - nutrients.fatG! * 0.5;
  }
  if (suitability.culinaryRoles.some((role) => ["STARCH", "FRUIT", "WHOLE_GRAIN", "DAIRY"].includes(role))
    && nutrients.carbsG! >= 5 && carbShare >= 0.25 && fatShare <= 0.5) {
    scores.CARB_ANCHOR = nutrients.carbsG! * 2 + carbShare * 100 - nutrients.fatG!;
  }
  if (suitability.culinaryRoles.some((role) => role === "FAT" || role === "CULINARY_FAT")
    && nutrients.fatG! >= 5 && fatShare >= 0.3) {
    scores.FAT_ANCHOR = nutrients.fatG! * 3 + fatShare * 100;
  }
  if (suitability.culinaryRoles.includes("LEGUME") && nutrients.fiberG! >= 1.5) {
    scores.LEGUME_ANCHOR = nutrients.fiberG! * 8 + nutrients.proteinG! * 2 - calories / 100;
  }
  const produceGroup = suitability.culinaryRoles.some((role) => role === "FRUIT" || role === "VEGETABLE");
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
  const suitability = classifyFoodSuitability(entry);
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
    form: suitability.form,
    qualityClass: suitability.qualityClass,
    culinaryRoles: suitability.culinaryRoles,
    suitableMealRoles: suitability.suitableMealRoles,
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
    const ranked = eligible
      .filter((entry) => classifyMealPlanFoodPools(entry).includes(pool))
      .sort((left, right) => compareForPool(pool, left, right));
    const poolSelection = new Map<string, NutritionFoodCatalogEntry>();
    ranked.filter((entry) => PRAXE_MEAL_FOODS_V1_PRIORITY_SOURCE_IDS.has(entry.sourceFoodId))
      .forEach((entry) => poolSelection.set(entry.id, entry));
    for (const role of [...new Set(context.mealRoles)]) {
      ranked
        .filter((entry) => isSuitableForMealRole(entry, role)
          || (pool === "FAT_ANCHOR" && classifyFoodSuitability(entry).culinaryRoles.includes("CULINARY_FAT")))
        .slice(0, 4)
        .forEach((entry) => poolSelection.set(entry.id, entry));
    }
    ranked.forEach((entry) => {
      if (poolSelection.size < MAX_MEAL_PLAN_CANDIDATES_PER_POOL) poolSelection.set(entry.id, entry);
    });
    [...poolSelection.values()].slice(0, MAX_MEAL_PLAN_CANDIDATES_PER_POOL)
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
  const byId = new Map(candidates.map((candidate) => [candidate.catalogEntryId, candidate]));
  const idsFor = (pool: MealPlanFoodPool, role: MealPlanGenerationContext["mealRoles"][number]) => candidates
    .filter((candidate) => candidate.pools.includes(pool))
    .filter((candidate) => candidate.suitableMealRoles.includes(role)
      || (pool === "FAT_ANCHOR" && candidate.culinaryRoles.includes("CULINARY_FAT")))
    .map((candidate) => candidate.catalogEntryId);
  return context.mealRoles.map((role, index) => {
    const fuelLevel = deriveMealFuelLevel({ goal: context.goal, role, targetCarbsG: context.mealMacroTargets[index]?.carbsG ?? 0 });
    const carbohydrateRange = fuelCarbohydratePortionRange(fuelLevel);
    return {
      position: index + 1,
      role,
      archetypeId: mealArchetypeFor(role, context.goal).id,
      fuelLevel,
      slots: POOL_ORDER.map((pool) => ({
        pool,
        required: pool === "PROTEIN_ANCHOR" || pool === "CARB_ANCHOR"
          || ((role === "MAIN_MEAL" || role === "EVENING_MEAL") && pool === "PRODUCE_FIBER"),
        catalogEntryIds: idsFor(pool, role).filter((id) => {
          const candidate = byId.get(id);
          if (!candidate) return false;
          if (pool === "PRODUCE_FIBER" && (role === "MAIN_MEAL" || role === "EVENING_MEAL")) {
            return candidate.culinaryRoles.includes("VEGETABLE");
          }
          return candidate.culinaryRoles.length > 0;
        }),
        minimumGrams: pool === "CARB_ANCHOR" ? carbohydrateRange.minimumGrams : 10,
        maximumGrams: pool === "CARB_ANCHOR" ? carbohydrateRange.maximumGrams : pool === "FAT_ANCHOR" ? 25 : 1000,
      })),
    };
  });
}
