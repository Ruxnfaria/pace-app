import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import { resolveMealPlanGenerationEligibility } from "../food-catalog/eligibility";
import { normalizeFoodQuery } from "../food-catalog/normalization";
import { calculateFoodNutrients, sumMealNutrients } from "../food-catalog/nutrients";
import { canUseFoodForRestrictions } from "../food-catalog/restrictions";
import { TACO_SOURCE_VERSION } from "../food-catalog/taco/constants";
import {
  MEAL_PLAN_GENERATOR_VERSION,
  MEAL_PLAN_VALIDATOR_VERSION,
  MEAL_VALIDATION_POLICY_VERSION,
  type AiMealPlanCandidate,
  type CatalogSnapshot,
  type MealPlanGenerationContext,
  type MealPlanCatalogCandidate,
  type MealPlanNumericValidationDiagnostics,
  type MealPlanValidationIssue,
  type MealPlanValidationReport,
  type ResolvedMeal,
  type ResolvedMealPlan,
} from "./domain";
import { MEAL_VALIDATION_POLICY as POLICY } from "./policy";

function issue(code: MealPlanValidationIssue["code"], severity: MealPlanValidationIssue["severity"], message: string,
  mealPosition?: number, itemPosition?: number): MealPlanValidationIssue {
  return { code, severity, message, ...(mealPosition === undefined ? {} : { mealPosition }), ...(itemPosition === undefined ? {} : { itemPosition }) };
}

function knownTotals(values: Array<{ calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number }>) {
  const sum = (key: "calories" | "proteinG" | "carbsG" | "fatG" | "fiberG") => Number(values.reduce((total, value) => total + value[key], 0).toFixed(2));
  return { calories: sum("calories"), proteinG: sum("proteinG"), carbsG: sum("carbsG"), fatG: sum("fatG"), fiberG: sum("fiberG") };
}

function outside(value: number, target: number, lowRatio: number, highRatio: number): boolean {
  return value < target * lowRatio || value > target * highRatio;
}

function rounded(value: number): number {
  return Number(value.toFixed(2));
}

function numericDiagnostics(
  plan: ResolvedMealPlan,
  context: MealPlanGenerationContext,
): MealPlanNumericValidationDiagnostics {
  const target = context.target;
  const mealProteinDistributionIssues = context.goal === "hypertrophy"
    ? plan.meals.flatMap((meal) => {
      const minimumProteinG = meal.target.proteinG * POLICY.distribution.minimumHypertrophyMealProteinTargetRatio;
      if (meal.totals.proteinG >= minimumProteinG) return [];
      return [{
        mealPosition: meal.position,
        targetProteinG: rounded(meal.target.proteinG),
        minimumProteinG: rounded(minimumProteinG),
        actualProteinG: rounded(meal.totals.proteinG),
        proteinDelta: rounded(meal.totals.proteinG - meal.target.proteinG),
      }];
    })
    : [];
  return {
    targetKcal: rounded(target.calories), actualKcal: rounded(plan.totals.calories),
    kcalDelta: rounded(plan.totals.calories - target.calories),
    kcalDeviationPercent: rounded(((plan.totals.calories - target.calories) / target.calories) * 100),
    targetProteinG: rounded(target.proteinG), actualProteinG: rounded(plan.totals.proteinG),
    proteinDelta: rounded(plan.totals.proteinG - target.proteinG),
    targetCarbsG: rounded(target.carbsG), actualCarbsG: rounded(plan.totals.carbsG),
    carbsDelta: rounded(plan.totals.carbsG - target.carbsG),
    targetFatG: rounded(target.fatG), actualFatG: rounded(plan.totals.fatG),
    fatDelta: rounded(plan.totals.fatG - target.fatG),
    targetFiberG: rounded(target.fiberG), actualFiberG: rounded(plan.totals.fiberG),
    fiberDelta: rounded(plan.totals.fiberG - target.fiberG),
    mealProteinDistributionIssues,
  };
}

function validateDaily(plan: ResolvedMealPlan, context: MealPlanGenerationContext, issues: MealPlanValidationIssue[]): void {
  const { totals } = plan;
  const target = context.target;
  const calorieTolerance = Math.max(target.calories * POLICY.daily.calories.relative, POLICY.daily.calories.absoluteKcal);
  if (Math.abs(totals.calories - target.calories) > calorieTolerance) issues.push(issue("CALORIES_OUT_OF_RANGE", "HARD_FAILURE", "Daily calories exceed policy tolerance"));
  if (outside(totals.proteinG, target.proteinG, POLICY.daily.protein.minimumRatio, POLICY.daily.protein.maximumRatio)) issues.push(issue("PROTEIN_OUT_OF_RANGE", "HARD_FAILURE", "Daily protein exceeds policy tolerance"));
  if (outside(totals.carbsG, target.carbsG, 1 - POLICY.daily.carbs.toleranceRatio, 1 + POLICY.daily.carbs.toleranceRatio)) issues.push(issue("CARBS_OUT_OF_RANGE", "HARD_FAILURE", "Daily carbohydrate exceeds policy tolerance"));
  if (outside(totals.fatG, target.fatG, 1 - POLICY.daily.fat.toleranceRatio, 1 + POLICY.daily.fat.toleranceRatio)) issues.push(issue("FAT_OUT_OF_RANGE", "HARD_FAILURE", "Daily fat exceeds policy tolerance"));
  if (totals.fiberG < target.fiberG * POLICY.daily.fiber.minimumRatio) issues.push(issue("FIBER_TOO_LOW", "HARD_FAILURE", "Daily fiber is below policy minimum"));
  if (!Object.values(totals).every(Number.isFinite)) issues.push(issue("INVALID_TOTALS", "HARD_FAILURE", "Daily totals are not finite"));
}

function validateDistribution(plan: ResolvedMealPlan, context: MealPlanGenerationContext, issues: MealPlanValidationIssue[]): void {
  for (const meal of plan.meals) {
    if (plan.totals.calories > 0 && meal.totals.calories / plan.totals.calories > POLICY.distribution.maximumMealCalorieShare) {
      issues.push(issue("ENERGY_CONCENTRATION", "HARD_FAILURE", "One meal contains an implausible share of daily energy", meal.position));
    }
    if (context.goal === "hypertrophy" && meal.totals.proteinG < meal.target.proteinG * POLICY.distribution.minimumHypertrophyMealProteinTargetRatio) {
      issues.push(issue("PROTEIN_DISTRIBUTION", "HARD_FAILURE", "Hypertrophy protein is poorly distributed", meal.position));
    }
    if (context.goal === "conditioning" && (meal.role === "PRE_WORKOUT" || meal.role === "POST_WORKOUT") &&
      meal.totals.carbsG < meal.target.carbsG * 0.5) {
      issues.push(issue("TRAINING_CARB_DISTRIBUTION", "HARD_FAILURE", "Conditioning training meal lacks carbohydrate support", meal.position));
    }
  }
  if (plan.totals.calories > 0 && plan.totals.fatG * 9 / plan.totals.calories > POLICY.distribution.maximumFatCalorieShare) {
    issues.push(issue("FAT_DOMINATED_PLAN", "WARNING", "A disproportionate share of energy comes from fat"));
  }
  const canonicalNames = plan.meals.flatMap((meal) => meal.items.map((item) => item.food.normalizedName));
  if (canonicalNames.length >= plan.meals.length && new Set(canonicalNames).size === 1) {
    issues.push(issue("LOW_FOOD_VARIETY", "WARNING", "The same food is repeated throughout the plan"));
  }
}

export function validateMealPlanCandidate(
  context: MealPlanGenerationContext,
  candidate: AiMealPlanCandidate,
  catalog: CatalogSnapshot,
  allowedCandidates: MealPlanCatalogCandidate[],
): MealPlanValidationReport {
  const issues: MealPlanValidationIssue[] = [];
  let preferenceScore = 0;
  const catalogStatus = assessTrustedNutritionCatalog(catalog.entries);
  if (catalog.readiness !== "CATALOG_BASE_NUTRITION_READY" && catalog.readiness !== "CATALOG_RESTRICTION_SAFE") {
    issues.push(issue("CATALOG_NOT_READY", "HARD_FAILURE", "Authoritative catalog is not ready"));
  }
  const eligibility = resolveMealPlanGenerationEligibility({
    isAdult: true,
    hasCriticalAllergy: context.allergenRestrictions.length > 0,
    hasFoodRestriction: context.hasFoodRestriction,
    dietaryPattern: context.dietaryPattern,
    restrictionSafetyKnown: context.restrictionSafetyKnown,
  }, catalogStatus);
  if (eligibility.status !== "ELIGIBLE") issues.push(issue("USER_NOT_ELIGIBLE", "HARD_FAILURE", eligibility.reasons.join(",")));
  if (context.allergenRestrictions.length > 0 && !catalogStatus.restrictionMetadataComplete) issues.push(issue("ALLERGEN_SAFETY_UNVERIFIED", "HARD_FAILURE", "Allergen metadata is incomplete"));
  if (context.dietaryPattern !== "omnivore" && !catalogStatus.restrictionMetadataComplete) issues.push(issue("DIETARY_PATTERN_UNVERIFIED", "HARD_FAILURE", "Dietary-pattern metadata is incomplete"));
  if (candidate.meals.length !== context.mealCount) issues.push(issue("MEAL_COUNT_MISMATCH", "HARD_FAILURE", "Candidate changed the prescribed meal count"));
  if (context.mealWindows.length !== context.mealCount || context.mealMacroTargets.length !== context.mealCount ||
      context.mealWindows.some((window, index) => window.position !== index + 1)) {
    issues.push(issue("MEAL_WINDOW_CONFLICT", "HARD_FAILURE", "Prescribed meal windows are inconsistent"));
  }
  if (candidate.meals.some((meal, index) => meal.role !== context.mealRoles[index])) issues.push(issue("MEAL_ROLE_MISMATCH", "HARD_FAILURE", "Candidate changed prescribed meal roles"));
  const structureKeys = candidate.meals.map((meal) => `${meal.role}:${normalizeFoodQuery(meal.label)}`);
  if (new Set(structureKeys).size !== structureKeys.length) issues.push(issue("DUPLICATE_MEAL_STRUCTURE", "HARD_FAILURE", "Candidate duplicated a meal structure"));

  const resolvedMeals: ResolvedMeal[] = [];
  const allowedIds = new Set(allowedCandidates.map((value) => value.catalogEntryId));
  const catalogById = new Map(catalog.entries.map((entry) => [entry.id, entry]));
  const disliked = new Set(context.dislikedFoods.map(normalizeFoodQuery));
  const preferred = new Set(context.preferredFoods.map(normalizeFoodQuery));
  for (let mealIndex = 0; mealIndex < candidate.meals.length; mealIndex += 1) {
    const meal = candidate.meals[mealIndex];
    const position = mealIndex + 1;
    if (meal.items.length === 0) {
      issues.push(issue("EMPTY_MEAL", "HARD_FAILURE", "Meal has no food items", position));
      continue;
    }
    const resolvedItems: ResolvedMeal["items"] = [];
    let mealGrams = 0;
    for (let itemIndex = 0; itemIndex < meal.items.length; itemIndex += 1) {
      const item = meal.items[itemIndex];
      if (!allowedIds.has(item.catalogEntryId)) {
        issues.push(issue("UNKNOWN_CATALOG_ENTRY_ID", "HARD_FAILURE", "Food ID was not offered in the generation candidate set", position, itemIndex + 1));
        continue;
      }
      const food = catalogById.get(item.catalogEntryId);
      if (!food) {
        issues.push(issue("UNKNOWN_CATALOG_ENTRY_ID", "HARD_FAILURE", "Food ID is absent from the authoritative catalog", position, itemIndex + 1));
        continue;
      }
      if (food.source !== "TACO" || food.sourceVersion !== TACO_SOURCE_VERSION) {
        issues.push(issue("UNKNOWN_CATALOG_ENTRY_ID", "HARD_FAILURE", "Food is outside the recognized TACO authority", position, itemIndex + 1)); continue;
      }
      const restriction = canUseFoodForRestrictions(food, {
        dietaryPattern: context.dietaryPattern === "unknown" ? "other" : context.dietaryPattern,
        allergenRestrictions: context.allergenRestrictions,
      });
      if (!restriction.allowed) {
        const code = restriction.reason === "ALLERGEN_DATA_INCOMPLETE" ? "ALLERGEN_SAFETY_UNVERIFIED" : "RESTRICTION_VIOLATION";
        issues.push(issue(code, "HARD_FAILURE", restriction.reason, position, itemIndex + 1));
      }
      if (disliked.has(food.normalizedName)) {
        issues.push(issue("DISLIKED_FOOD_VIOLATION", "HARD_FAILURE", "A disliked food was selected", position, itemIndex + 1));
      }
      if (preferred.has(food.normalizedName)) preferenceScore += 1;
      const grams = item.quantityGrams;
      if (typeof grams !== "number" || !Number.isFinite(grams) || grams <= 0) {
        issues.push(issue("INVALID_QUANTITY", "HARD_FAILURE", "Quantity in grams must be a positive finite number", position, itemIndex + 1));
        continue;
      }
      const max = food.foodRole === "fat" || food.foodGroup === "oils_fats" ? POLICY.portions.maximumOilFatGrams : POLICY.portions.maximumItemGrams;
      if (grams > max) { issues.push(issue("IMPOSSIBLE_PORTION", "HARD_FAILURE", "Food quantity exceeds conservative policy", position, itemIndex + 1)); continue; }
      mealGrams += grams;
      const nutrients = calculateFoodNutrients(food, grams);
      if ([nutrients.calories, nutrients.proteinG, nutrients.carbsG, nutrients.fatG, nutrients.fiberG].some((value) => value === null)) {
        issues.push(issue("UNKNOWN_REQUIRED_NUTRIENT", "HARD_FAILURE", "Required TACO nutrient is unknown", position, itemIndex + 1));
        continue;
      }
      resolvedItems.push({
        food, foodQuery: food.canonicalName, displayName: food.canonicalName, quantityValue: grams,
        quantityUnit: "g", quantityGrams: grams, preparationNote: item.preparationNote?.trim() || null,
        resolution: "CATALOG_ENTRY_ID",
        nutrients: { calories: nutrients.calories, proteinG: nutrients.proteinG, carbsG: nutrients.carbsG, fatG: nutrients.fatG, fiberG: nutrients.fiberG } as ResolvedMeal["items"][number]["nutrients"],
      });
    }
    if (mealGrams > POLICY.portions.maximumMealGrams) issues.push(issue("IMPOSSIBLE_PORTION", "HARD_FAILURE", "Meal mass exceeds conservative policy", position));
    const totals = sumMealNutrients(resolvedItems.map((item) => ({ ...item.nutrients, grams: item.quantityGrams, macroDerivedEnergy: null, qualityWarnings: [] })));
    if ([totals.calories, totals.proteinG, totals.carbsG, totals.fatG, totals.fiberG].some((value) => value === null)) continue;
    resolvedMeals.push({ position, role: meal.role, label: meal.label.trim(), window: context.mealWindows[mealIndex],
      target: context.mealMacroTargets[mealIndex], items: resolvedItems,
      totals: { calories: totals.calories, proteinG: totals.proteinG, carbsG: totals.carbsG, fatG: totals.fatG, fiberG: totals.fiberG } as ResolvedMeal["totals"] });
  }
  const plan: ResolvedMealPlan | null = resolvedMeals.length === context.mealCount ? {
    generatorVersion: MEAL_PLAN_GENERATOR_VERSION, validatorVersion: MEAL_PLAN_VALIDATOR_VERSION,
    validationPolicyVersion: MEAL_VALIDATION_POLICY_VERSION, targetSnapshotId: context.targetSnapshotId,
    strategyVersion: context.strategyVersion, mealDistributionVersion: context.mealDistributionVersion,
    meals: resolvedMeals, totals: knownTotals(resolvedMeals.map((meal) => meal.totals)),
  } : null;
  if (plan) { validateDaily(plan, context, issues); validateDistribution(plan, context, issues); }
  const valid = !issues.some((value) => value.severity === "HARD_FAILURE");
  return { valid, validatorVersion: MEAL_PLAN_VALIDATOR_VERSION, policyVersion: MEAL_VALIDATION_POLICY_VERSION,
    issues, plan: valid ? plan : null, preferenceScore, diagnostics: plan ? numericDiagnostics(plan, context) : null };
}
