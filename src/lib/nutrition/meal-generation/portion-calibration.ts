import { calculateFoodNutrients } from "../food-catalog/nutrients";
import type { NutritionFoodCatalogEntry } from "../food-catalog/domain";
import { resolveEffectiveNutrients } from "../food-catalog/effective-nutrients";
import { classifyFoodSuitability } from "../meal-quality/food-suitability";
import { foodPortionProfile, snapGramsToPortionProfile } from "../meal-quality/portion-profile";
import type { FoodPortionProfile } from "../meal-quality/domain";
import type {
  AiMealPlanCandidate,
  CatalogSnapshot,
  MealPlanCatalogCandidate,
  MealPlanGenerationContext,
  MealPlanCalibrationFeedback,
  MealPlanFoodPool,
  MealPlanNumericValidationDiagnostics,
  PortionCalibrationStatus,
} from "./domain";
import { MEAL_VALIDATION_POLICY as POLICY } from "./policy";
import { realMealTemplateById } from "./real-meal-templates/registry";
import { findCulinaryRecipeOption, type CulinaryRecipeSlot } from "./culinary-library/integration";
import { assessHumanPortionBalance } from "./culinary-library/human-portion-balance";
import type { CountableMeasurementAuthority } from "./culinary-library/domain";

export const MAX_CALIBRATION_ITERATIONS = 12;
export const MIN_PORTION_GRAMS = 10;
export const MAX_PORTION_GRAMS = POLICY.portions.maximumItemGrams;

type NutrientKey = "calories" | "proteinG" | "carbsG" | "fatG" | "fiberG";
type Totals = Record<NutrientKey, number>;

export interface MealPortionCalibrationDiagnostics {
  iterations: number;
  adjustedItemCount: number;
  jointAdjustmentUsed: boolean;
  fiberProximityOptimized: boolean;
  before: MealPlanNumericValidationDiagnostics | null;
  after: MealPlanNumericValidationDiagnostics | null;
  feedback: MealPlanCalibrationFeedback | null;
}

export interface MealPortionCalibrationResult {
  candidate: AiMealPlanCandidate;
  diagnostics: MealPortionCalibrationDiagnostics;
}

interface AdjustableItem {
  mealIndex: number;
  itemIndex: number;
  originalGrams: number;
  maximumGrams: number;
  minimumGrams: number;
  incrementGrams: number;
  discreteGramsPerCount: number | null;
  portionProfile: FoodPortionProfile;
  food: NutritionFoodCatalogEntry;
  perGram: Totals;
  pool: MealPlanFoodPool;
}

function snapItemQuantity(item: Pick<AdjustableItem,
  "minimumGrams" | "maximumGrams" | "incrementGrams" | "discreteGramsPerCount">, value: number): number {
  if (item.discreteGramsPerCount === null) {
    return snapToRangeIncrement(value, item.minimumGrams, item.maximumGrams, item.incrementGrams);
  }
  const minimumCount = Math.ceil(item.minimumGrams / item.discreteGramsPerCount);
  const maximumCount = Math.floor(item.maximumGrams / item.discreteGramsPerCount);
  if (minimumCount > maximumCount) {
    return snapToRangeIncrement(value, item.minimumGrams, item.maximumGrams, item.incrementGrams);
  }
  const count = Math.max(minimumCount, Math.min(maximumCount, Math.round(value / item.discreteGramsPerCount)));
  return round(count * item.discreteGramsPerCount);
}

const NUTRIENT_KEYS: NutrientKey[] = ["calories", "proteinG", "carbsG", "fatG", "fiberG"];

interface Range { minimum: number; maximum: number }

interface CalibrationObjective {
  violationCount: number;
  violationMagnitude: number;
  targetDistance: number;
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function cloneCandidate(candidate: AiMealPlanCandidate): AiMealPlanCandidate {
  return {
    meals: candidate.meals.map((meal) => ({
      ...meal,
      items: meal.items.map((item) => ({ ...item })),
    })),
  };
}

function templateComponentRange(candidate: AiMealPlanCandidate, mealIndex: number, itemIndex: number) {
  const meal = candidate.meals[mealIndex];
  const item = meal.items[itemIndex];
  const component = realMealTemplateById(meal.templateId)?.components.find((value) => value.id === item.componentId);
  return component ? { minimum: component.minimumGrams, maximum: component.maximumGrams } : null;
}

function recipeComponentRange(candidate: AiMealPlanCandidate, mealIndex: number, itemIndex: number,
  recipeSlots?: CulinaryRecipeSlot[]) {
  if (!recipeSlots) return null;
  const meal = candidate.meals[mealIndex];
  const item = meal.items[itemIndex];
  const component = findCulinaryRecipeOption(recipeSlots, mealIndex, meal)?.components
    .find((value) => value.componentId === item.componentId && value.catalogEntryIds.includes(item.catalogEntryId));
  return component ? { minimum: component.minimumGrams, maximum: component.maximumGrams,
    increment: component.incrementGrams } : null;
}

function snapToRangeIncrement(value: number, minimum: number, maximum: number, increment: number): number {
  const bounded = Math.max(minimum, Math.min(maximum, value));
  return Math.max(minimum, Math.min(maximum,
    Number((minimum + Math.round((bounded - minimum) / increment) * increment).toFixed(2))));
}

export function snapToPlausiblePortions(
  context: MealPlanGenerationContext,
  input: AiMealPlanCandidate,
  catalog: CatalogSnapshot,
): AiMealPlanCandidate {
  const snapped = cloneCandidate(input);
  const catalogById = new Map(catalog.entries.map((entry) => [entry.id, entry]));
  snapped.meals.forEach((meal, mealIndex) => meal.items.forEach((item, itemIndex) => {
    const food = catalogById.get(item.catalogEntryId);
    if (!food) return;
    const profile = foodPortionProfile(food, item.slot, context.mealRoles[mealIndex]);
    const range = templateComponentRange(snapped, mealIndex, itemIndex);
    const snappedGrams = snapGramsToPortionProfile(item.quantityGrams, profile);
    item.quantityGrams = range ? Math.max(range.minimum, Math.min(range.maximum, snappedGrams)) : snappedGrams;
  }));
  return snapped;
}

function emptyTotals(): Totals {
  return { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
}

function calculateState(candidate: AiMealPlanCandidate, items: AdjustableItem[]) {
  const meals = candidate.meals.map(() => ({ ...emptyTotals(), grams: 0 }));
  for (const item of items) {
    const grams = candidate.meals[item.mealIndex].items[item.itemIndex].quantityGrams;
    const nutrients = calculateFoodNutrients(item.food, grams);
    meals[item.mealIndex].grams += grams;
    for (const key of NUTRIENT_KEYS) {
      meals[item.mealIndex][key] += nutrients[key]!;
    }
  }
  for (const meal of meals) {
    meal.grams = round(meal.grams, 1);
    for (const key of NUTRIENT_KEYS) meal[key] = round(meal[key]);
  }
  const daily = emptyTotals();
  for (const meal of meals) {
    for (const key of NUTRIENT_KEYS) daily[key] += meal[key];
  }
  for (const key of NUTRIENT_KEYS) daily[key] = round(daily[key]);
  const supportingDominance = meals.map((_, mealIndex) => {
    const mealItems = items.filter((item) => item.mealIndex === mealIndex);
    const caloriesFor = (item: AdjustableItem) =>
      item.perGram.calories * candidate.meals[item.mealIndex].items[item.itemIndex].quantityGrams;
    const largestPrimary = Math.max(...mealItems.flatMap((item) => {
      const profile = classifyFoodSuitability(item.food);
      return profile.qualityClass === "CORE" && item.pool !== "FAT_ANCHOR" ? [caloriesFor(item)] : [];
    }), 0);
    if (largestPrimary <= 0) return 0;
    return Math.max(...mealItems.flatMap((item) => (classifyFoodSuitability(item.food).qualityClass === "SUPPORTING"
      || item.pool === "FAT_ANCHOR")
      ? [Math.max(0, (caloriesFor(item) - largestPrimary + 0.01) / largestPrimary)] : []), 0);
  });
  const fruitMacroPatch = meals.map((_, mealIndex) => {
    const mealItems = items.filter((item) => item.mealIndex === mealIndex);
    const caloriesFor = (item: AdjustableItem) =>
      item.perGram.calories * candidate.meals[item.mealIndex].items[item.itemIndex].quantityGrams;
    const carbAnchorCalories = mealItems
      .filter((item) => item.pool === "CARB_ANCHOR")
      .reduce((total, item) => total + caloriesFor(item), 0);
    const fruitCalories = mealItems
      .filter((item) => classifyFoodSuitability(item.food).culinaryRoles.includes("FRUIT"))
      .reduce((total, item) => total + caloriesFor(item), 0);
    if (fruitCalories <= carbAnchorCalories || fruitCalories <= 0) return 0;
    return (fruitCalories - carbAnchorCalories) / Math.max(carbAnchorCalories, 1);
  });
  const humanBalance = assessHumanPortionBalance(candidate);
  return { daily, meals, supportingDominance, fruitMacroPatch, humanBalance };
}

function toNumericDiagnostics(
  context: MealPlanGenerationContext,
  state: ReturnType<typeof calculateState>,
): MealPlanNumericValidationDiagnostics {
  const target = context.target;
  const mealProteinDistributionIssues = context.goal === "hypertrophy"
    ? state.meals.flatMap((meal, index) => {
      const mealTarget = context.mealMacroTargets[index];
      const minimumProteinG = mealTarget.proteinG * POLICY.distribution.minimumHypertrophyMealProteinTargetRatio;
      return meal.proteinG >= minimumProteinG ? [] : [{
        mealPosition: index + 1,
        targetProteinG: round(mealTarget.proteinG), minimumProteinG: round(minimumProteinG),
        actualProteinG: round(meal.proteinG), proteinDelta: round(meal.proteinG - mealTarget.proteinG),
      }];
    })
    : [];
  return {
    targetKcal: round(target.calories), actualKcal: state.daily.calories,
    kcalDelta: round(state.daily.calories - target.calories),
    kcalDeviationPercent: round(((state.daily.calories - target.calories) / target.calories) * 100),
    targetProteinG: round(target.proteinG), actualProteinG: state.daily.proteinG,
    proteinDelta: round(state.daily.proteinG - target.proteinG),
    targetCarbsG: round(target.carbsG), actualCarbsG: state.daily.carbsG,
    carbsDelta: round(state.daily.carbsG - target.carbsG),
    targetFatG: round(target.fatG), actualFatG: state.daily.fatG,
    fatDelta: round(state.daily.fatG - target.fatG),
    targetFiberG: round(target.fiberG), actualFiberG: state.daily.fiberG,
    fiberDelta: round(state.daily.fiberG - target.fiberG),
    fiberDeltaPercent: round(((state.daily.fiberG - target.fiberG) / target.fiberG) * 100),
    mealProteinDistributionIssues,
  };
}

function acceptedRanges(context: MealPlanGenerationContext): Record<NutrientKey, Range> {
  const target = context.target;
  const calorieTolerance = Math.max(target.calories * POLICY.daily.calories.relative, POLICY.daily.calories.absoluteKcal);
  return {
    calories: { minimum: target.calories - calorieTolerance, maximum: target.calories + calorieTolerance },
    proteinG: { minimum: target.proteinG * POLICY.daily.protein.minimumRatio, maximum: target.proteinG * POLICY.daily.protein.maximumRatio },
    carbsG: { minimum: target.carbsG * (1 - POLICY.daily.carbs.toleranceRatio), maximum: target.carbsG * (1 + POLICY.daily.carbs.toleranceRatio) },
    fatG: { minimum: target.fatG * (1 - POLICY.daily.fat.toleranceRatio), maximum: target.fatG * (1 + POLICY.daily.fat.toleranceRatio) },
    fiberG: { minimum: target.fiberG * POLICY.daily.fiber.minimumRatio, maximum: Number.POSITIVE_INFINITY },
  };
}

function rangeViolation(actual: number, range: Range, target: number): number {
  if (actual < range.minimum) return (range.minimum - actual) / Math.max(target, 1);
  if (actual > range.maximum) return (actual - range.maximum) / Math.max(target, 1);
  return 0;
}

function objective(context: MealPlanGenerationContext, state: ReturnType<typeof calculateState>): CalibrationObjective {
  const target = context.target;
  const ranges = acceptedRanges(context);
  const normalized = (actual: number, expected: number) => expected > 0 ? (actual - expected) / expected : 0;
  const violations = NUTRIENT_KEYS.map((key) => rangeViolation(state.daily[key], ranges[key], target[key]));
  let targetDistance = 4 * normalized(state.daily.calories, target.calories) ** 2
    + 6 * normalized(state.daily.proteinG, target.proteinG) ** 2
    + 2 * normalized(state.daily.carbsG, target.carbsG) ** 2
    + 2 * normalized(state.daily.fatG, target.fatG) ** 2;
  // Fiber keeps its existing safety floor, while proximity is a lower-priority
  // product-quality objective. This is deliberately not a clinical upper limit.
  targetDistance += 0.75 * normalized(state.daily.fiberG, target.fiberG) ** 2;
  for (let index = 0; index < state.meals.length; index += 1) {
    const meal = state.meals[index];
    const mealTarget = context.mealMacroTargets[index];
    targetDistance += 0.2 * normalized(meal.calories, mealTarget.calories) ** 2;
    if (context.goal === "hypertrophy") {
      const minimumProtein = mealTarget.proteinG * POLICY.distribution.minimumHypertrophyMealProteinTargetRatio;
      const distributionViolation = meal.proteinG < minimumProtein
        ? (minimumProtein - meal.proteinG) / Math.max(mealTarget.proteinG, 1)
        : 0;
      violations.push(distributionViolation);
      if (distributionViolation > 0) targetDistance += 4 * normalized(meal.proteinG, mealTarget.proteinG) ** 2;
    }
    if (meal.grams > POLICY.portions.maximumMealGrams) {
      violations.push((meal.grams - POLICY.portions.maximumMealGrams) / POLICY.portions.maximumMealGrams);
      targetDistance += 100 + ((meal.grams - POLICY.portions.maximumMealGrams) / POLICY.portions.maximumMealGrams) ** 2;
    }
    const dominance = state.supportingDominance[index];
    violations.push(dominance);
    if (dominance > 0) targetDistance += 20 * dominance ** 2;
    const fruitMacroPatch = state.fruitMacroPatch[index];
    violations.push(fruitMacroPatch);
    if (fruitMacroPatch > 0) targetDistance += 30 * fruitMacroPatch ** 2;
    const preWorkoutFatDensity = context.mealRoles[index] === "PRE_WORKOUT" && meal.calories > 0
      ? Math.max(0, (meal.fatG * 9 / meal.calories - 0.35) / 0.35)
      : 0;
    violations.push(preWorkoutFatDensity);
    if (preWorkoutFatDensity > 0) targetDistance += 30 * preWorkoutFatDensity ** 2;
  }
  const humanBalanceViolations = state.humanBalance.issues.filter((issue) => issue.severity === "HARD_FAILURE")
    .map(() => 1);
  violations.push(...humanBalanceViolations);
  targetDistance += state.humanBalance.penalty;
  // Culinary proportion preference is a tie-breaker only after every safety,
  // macro and portion constraint is satisfied. It must never obstruct finding
  // a valid plan or weaken the authoritative validation ranges.
  if (violations.every((value) => value <= 1e-9)) {
    targetDistance += state.humanBalance.preferencePenalty;
  }
  return {
    violationCount: violations.filter((value) => value > 1e-9).length,
    violationMagnitude: violations.reduce((total, value) => total + value ** 2, 0),
    targetDistance,
  };
}

function isBetter(left: CalibrationObjective, right: CalibrationObjective): boolean {
  if (left.violationCount !== right.violationCount) return left.violationCount < right.violationCount;
  if (Math.abs(left.violationMagnitude - right.violationMagnitude) > 1e-12) return left.violationMagnitude < right.violationMagnitude;
  return left.targetDistance < right.targetDistance - 1e-12;
}

function direction(actual: number, range: Range): "below" | "within" | "above" {
  if (actual < range.minimum) return "below";
  if (actual > range.maximum) return "above";
  return "within";
}

function calibrationFeedback(
  context: MealPlanGenerationContext,
  state: ReturnType<typeof calculateState>,
  status: PortionCalibrationStatus,
  candidate: AiMealPlanCandidate,
  beforeState: ReturnType<typeof calculateState>,
  iterations: number,
  adjustedItemCount: number,
): MealPlanCalibrationFeedback {
  const ranges = acceptedRanges(context);
  const normalized = (actual: number, target: number) => round((actual - target) / Math.max(target, 1), 6);
  return {
    status,
    normalizedDeviations: {
      calories: normalized(state.daily.calories, context.target.calories),
      proteinG: normalized(state.daily.proteinG, context.target.proteinG),
      carbsG: normalized(state.daily.carbsG, context.target.carbsG),
      fatG: normalized(state.daily.fatG, context.target.fatG),
      fiberG: normalized(state.daily.fiberG, context.target.fiberG),
    },
    directions: {
      calories: direction(state.daily.calories, ranges.calories),
      proteinG: direction(state.daily.proteinG, ranges.proteinG),
      carbsG: direction(state.daily.carbsG, ranges.carbsG),
      fatG: direction(state.daily.fatG, ranges.fatG),
      fiberG: direction(state.daily.fiberG, ranges.fiberG),
    },
    existingCatalogEntryIds: [...new Set(candidate.meals.flatMap((meal) => meal.items.map((item) => item.catalogEntryId)))],
    iterations,
    adjustedItemCount,
    violatedConstraints: [
      ...NUTRIENT_KEYS.filter((key) => direction(state.daily[key], ranges[key]) !== "within"),
      ...state.meals.flatMap((meal, index) => {
        const values: string[] = [];
        if (meal.grams > POLICY.portions.maximumMealGrams) values.push(`meal_${index + 1}_maximum_grams`);
        if (context.goal === "hypertrophy"
          && meal.proteinG < context.mealMacroTargets[index].proteinG * POLICY.distribution.minimumHypertrophyMealProteinTargetRatio) {
          values.push(`meal_${index + 1}_protein_distribution`);
        }
        return values;
      }),
      ...state.humanBalance.issues.filter((issue) => issue.severity === "HARD_FAILURE")
        .map((issue) => `meal_${issue.mealPosition}_${issue.code.toLowerCase()}`),
    ],
    before: { ...beforeState.daily },
    after: { ...state.daily },
  };
}

function possibleQuantities(
  item: AdjustableItem,
  current: number,
  context: MealPlanGenerationContext,
  state: ReturnType<typeof calculateState>,
  iteration: number,
): number[] {
  if (item.portionProfile.refinementPriority === "LOCKED") return [current];
  const values = new Set<number>([current, item.minimumGrams, item.maximumGrams]);
  const stepRatio = [0.5, 0.25, 0.125, 0.0625][Math.min(3, Math.floor(iteration / 3))];
  values.add(current * (1 - stepRatio));
  values.add(current * (1 + stepRatio));
  const targetByKey: Record<NutrientKey, number> = {
    calories: context.target.calories,
    proteinG: context.target.proteinG,
    carbsG: context.target.carbsG,
    fatG: context.target.fatG,
    fiberG: context.target.fiberG,
  };
  const ranges = acceptedRanges(context);
  for (const key of NUTRIENT_KEYS) {
    if (item.perGram[key] <= 0) continue;
    values.add(current + (targetByKey[key] - state.daily[key]) / item.perGram[key]);
    if (Number.isFinite(ranges[key].minimum)) {
      values.add(current + (ranges[key].minimum - state.daily[key]) / item.perGram[key]);
    }
    if (Number.isFinite(ranges[key].maximum)) {
      values.add(current + (ranges[key].maximum - state.daily[key]) / item.perGram[key]);
    }
  }
  const mealTarget = context.mealMacroTargets[item.mealIndex];
  if (item.perGram.proteinG > 0) {
    values.add(current + (mealTarget.proteinG - state.meals[item.mealIndex].proteinG) / item.perGram.proteinG);
  }
  const roundedValues = [...values]
    .map((value) => snapItemQuantity(item, value));
  const neighborStep = item.discreteGramsPerCount ?? item.incrementGrams;
  return roundedValues
    .flatMap((value) => [value - neighborStep, value, value + neighborStep])
    .map((value) => snapItemQuantity(item, value))
    .filter((value) => value >= item.minimumGrams && value <= item.maximumGrams)
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((left, right) => left - right);
}

function findFeasibleBoundaryAdjustment(
  context: MealPlanGenerationContext,
  candidate: AiMealPlanCandidate,
  items: AdjustableItem[],
  eligible: (item: AdjustableItem) => boolean = () => true,
): AiMealPlanCandidate | null {
  const baselineState = calculateState(candidate, items);
  let bestObjective = objective(context, baselineState);
  let bestCandidate: AiMealPlanCandidate | null = null;
  for (const item of items.filter((value) => value.portionProfile.refinementPriority !== "LOCKED" && eligible(value))) {
    const targetItem = candidate.meals[item.mealIndex].items[item.itemIndex];
    const current = targetItem.quantityGrams;
    for (const quantity of possibleQuantities(item, current, context, baselineState, MAX_CALIBRATION_ITERATIONS - 1)) {
      targetItem.quantityGrams = quantity;
      const trialObjective = objective(context, calculateState(candidate, items));
      if (trialObjective.violationCount === 0 && isBetter(trialObjective, bestObjective)) {
        bestObjective = trialObjective;
        bestCandidate = cloneCandidate(candidate);
      }
    }
    targetItem.quantityGrams = current;
  }
  return bestCandidate;
}

function buildRoleScaledCandidate(
  context: MealPlanGenerationContext,
  candidate: AiMealPlanCandidate,
  items: AdjustableItem[],
): AiMealPlanCandidate {
  const scaled = cloneCandidate(candidate);
  const state = calculateState(candidate, items);
  const poolTargets: Array<[MealPlanFoodPool, NutrientKey]> = [
    ["PROTEIN_ANCHOR", "proteinG"],
    ["CARB_ANCHOR", "carbsG"],
    ["FAT_ANCHOR", "fatG"],
    ["PRODUCE_FIBER", "fiberG"],
  ];
  for (const [pool, nutrient] of poolTargets) {
    const poolItems = items.filter((item) => item.pool === pool
      && item.portionProfile.refinementPriority !== "LOCKED");
    const poolContribution = poolItems.reduce((total, item) => {
      const grams = candidate.meals[item.mealIndex].items[item.itemIndex].quantityGrams;
      return total + item.perGram[nutrient] * grams;
    }, 0);
    if (poolContribution <= 0) continue;
    const contributionOutsidePool = state.daily[nutrient] - poolContribution;
    const desiredPoolContribution = Math.max(0, context.target[nutrient] - contributionOutsidePool);
    const scale = desiredPoolContribution / poolContribution;
    for (const item of poolItems) {
      const value = scaled.meals[item.mealIndex].items[item.itemIndex];
      value.quantityGrams = snapItemQuantity(item, value.quantityGrams * scale);
    }
  }
  return scaled;
}

function findFeasibleJointAdjustment(
  context: MealPlanGenerationContext,
  candidate: AiMealPlanCandidate,
  items: AdjustableItem[],
  eligible: (item: AdjustableItem) => boolean = () => true,
): AiMealPlanCandidate | null {
  const baselineState = calculateState(candidate, items);
  const ranges = acceptedRanges(context);
  const violatedKeys = NUTRIENT_KEYS.filter((key) => direction(baselineState.daily[key], ranges[key]) !== "within");
  if (violatedKeys.length === 0) return cloneCandidate(candidate);
  const preferredPool: Partial<Record<NutrientKey, MealPlanFoodPool>> = {
    proteinG: "PROTEIN_ANCHOR", carbsG: "CARB_ANCHOR", fatG: "FAT_ANCHOR", fiberG: "PRODUCE_FIBER",
  };
  const adjustableItems = items.filter((item) => item.portionProfile.refinementPriority !== "LOCKED" && eligible(item));
  const primaryItems = [...adjustableItems]
    .sort((left, right) => {
      const relevance = (item: AdjustableItem) => violatedKeys.reduce((score, key) => {
        const roleBoost = preferredPool[key] === item.pool ? 10 : 0;
        return score + roleBoost + item.perGram[key] / Math.max(item.perGram.calories, 0.01);
      }, 0);
      return relevance(right) - relevance(left)
        || left.mealIndex - right.mealIndex
        || left.itemIndex - right.itemIndex;
    })
    .slice(0, 6);
  let bestObjective = objective(context, baselineState);
  let bestCandidate: AiMealPlanCandidate | null = null;
  for (const primary of primaryItems) {
    const primaryCandidate = candidate.meals[primary.mealIndex].items[primary.itemIndex];
    const primaryOriginal = primaryCandidate.quantityGrams;
    const primaryQuantities = possibleQuantities(
      primary, primaryOriginal, context, baselineState, MAX_CALIBRATION_ITERATIONS - 1,
    ).filter((quantity) => quantity !== primaryOriginal).slice(0, 12);
    for (const primaryQuantity of primaryQuantities) {
      primaryCandidate.quantityGrams = primaryQuantity;
      const intermediateState = calculateState(candidate, items);
      for (const secondary of adjustableItems) {
        if (secondary === primary) continue;
        const secondaryCandidate = candidate.meals[secondary.mealIndex].items[secondary.itemIndex];
        const secondaryOriginal = secondaryCandidate.quantityGrams;
        for (const secondaryQuantity of possibleQuantities(
          secondary, secondaryOriginal, context, intermediateState, MAX_CALIBRATION_ITERATIONS - 1,
        ).slice(0, 12)) {
          if (secondaryQuantity === secondaryOriginal) continue;
          secondaryCandidate.quantityGrams = secondaryQuantity;
          const trialObjective = objective(context, calculateState(candidate, items));
          if (trialObjective.violationCount === 0 && isBetter(trialObjective, bestObjective)) {
            bestObjective = trialObjective;
            bestCandidate = cloneCandidate(candidate);
          }
        }
        secondaryCandidate.quantityGrams = secondaryOriginal;
      }
    }
    primaryCandidate.quantityGrams = primaryOriginal;
  }
  return bestCandidate;
}

export function calibrateMealPlanPortions(
  context: MealPlanGenerationContext,
  input: AiMealPlanCandidate,
  catalog: CatalogSnapshot,
  allowedCandidates: MealPlanCatalogCandidate[],
  recipeSlots?: CulinaryRecipeSlot[],
  countableAuthorities: readonly CountableMeasurementAuthority[] = [],
): MealPortionCalibrationResult {
  const candidate = cloneCandidate(input);
  const catalogById = new Map(catalog.entries.map((entry) => [entry.id, entry]));
  const allowedIds = new Set(allowedCandidates.map((entry) => entry.catalogEntryId));
  const countableByCatalogId = new Map(countableAuthorities.map((authority) => [authority.catalogEntryId, authority]));
  const items: AdjustableItem[] = [];
  for (let mealIndex = 0; mealIndex < candidate.meals.length; mealIndex += 1) {
    for (let itemIndex = 0; itemIndex < candidate.meals[mealIndex].items.length; itemIndex += 1) {
      const candidateItem = candidate.meals[mealIndex].items[itemIndex];
      const food = catalogById.get(candidateItem.catalogEntryId);
      if (!food || !allowedIds.has(candidateItem.catalogEntryId) || !Number.isFinite(candidateItem.quantityGrams)
        || candidateItem.quantityGrams <= 0 || Object.values(resolveEffectiveNutrients(food)).some((value) => value === null)) {
        return { candidate: input, diagnostics: { iterations: 0, adjustedItemCount: 0, jointAdjustmentUsed: false,
          fiberProximityOptimized: false, before: null, after: null, feedback: null } };
      }
      const per100g = calculateFoodNutrients(food, 100);
      const portionProfile = foodPortionProfile(food, candidateItem.slot, candidate.meals[mealIndex].role);
      const templateRange = templateComponentRange(candidate, mealIndex, itemIndex);
      const recipeRange = recipeComponentRange(candidate, mealIndex, itemIndex, recipeSlots);
      if (recipeSlots && !recipeRange) {
        return { candidate: input, diagnostics: { iterations: 0, adjustedItemCount: 0, jointAdjustmentUsed: false,
          fiberProximityOptimized: false, before: null, after: null, feedback: null } };
      }
      const minimumGrams = Math.max(portionProfile.minimumGrams, templateRange?.minimum ?? Number.NEGATIVE_INFINITY,
        recipeRange?.minimum ?? Number.NEGATIVE_INFINITY);
      const maximumGrams = Math.min(portionProfile.maximumAutogenerationGrams,
        templateRange?.maximum ?? Number.POSITIVE_INFINITY, recipeRange?.maximum ?? Number.POSITIVE_INFINITY);
      const incrementGrams = recipeRange?.increment ?? portionProfile.incrementGrams;
      const discreteAuthority = countableByCatalogId.get(candidateItem.catalogEntryId);
      items.push({
        mealIndex, itemIndex, originalGrams: candidateItem.quantityGrams,
        maximumGrams,
        minimumGrams,
        incrementGrams,
        discreteGramsPerCount: discreteAuthority?.gramsPerCount ?? null,
        portionProfile,
        food,
        perGram: {
          calories: per100g.calories! / 100, proteinG: per100g.proteinG! / 100,
          carbsG: per100g.carbsG! / 100, fatG: per100g.fatG! / 100, fiberG: per100g.fiberG! / 100,
        },
        pool: candidateItem.slot,
      });
      candidateItem.quantityGrams = snapItemQuantity(items.at(-1)!,
        snapGramsToPortionProfile(candidateItem.quantityGrams, portionProfile));
    }
  }
  if (items.length === 0 || candidate.meals.length !== context.mealCount) {
    return { candidate: input, diagnostics: { iterations: 0, adjustedItemCount: 0, jointAdjustmentUsed: false,
      fiberProximityOptimized: false, before: null, after: null, feedback: null } };
  }

  const beforeState = calculateState(candidate, items);
  const energyScale = context.target.calories / beforeState.daily.calories;
  const scaled = cloneCandidate(candidate);
  for (const item of items) {
    if (item.portionProfile.refinementPriority === "LOCKED") continue;
    const value = scaled.meals[item.mealIndex].items[item.itemIndex];
    value.quantityGrams = snapItemQuantity(item, value.quantityGrams * energyScale);
  }
  const roleScaled = buildRoleScaledCandidate(context, candidate, items);
  for (const seed of [scaled, roleScaled]) {
    if (isBetter(objective(context, calculateState(seed, items)), objective(context, calculateState(candidate, items)))) {
      candidate.meals = seed.meals;
    }
  }

  let iterations = 0;
  let bestCandidate = cloneCandidate(candidate);
  let bestObjective = objective(context, calculateState(candidate, items));
  for (; iterations < MAX_CALIBRATION_ITERATIONS; iterations += 1) {
    if (bestObjective.violationCount === 0) break;
    let improved = false;
    const adjustableItems = items.filter((item) => item.portionProfile.refinementPriority !== "LOCKED");
    const sweeps = [adjustableItems, [...adjustableItems].reverse()];
    for (const sweepItems of sweeps) {
      for (const item of sweepItems) {
        const targetItem = candidate.meals[item.mealIndex].items[item.itemIndex];
        const current = targetItem.quantityGrams;
        const state = calculateState(candidate, items);
        let bestQuantity = current;
        let itemBestObjective = objective(context, state);
        for (const quantity of possibleQuantities(item, current, context, state, iterations)) {
          targetItem.quantityGrams = quantity;
          const trialObjective = objective(context, calculateState(candidate, items));
          if (isBetter(trialObjective, itemBestObjective)) {
            itemBestObjective = trialObjective;
            bestQuantity = quantity;
          }
        }
        targetItem.quantityGrams = bestQuantity;
        if (bestQuantity !== current) {
          improved = true;
          if (isBetter(itemBestObjective, bestObjective)) {
            bestObjective = itemBestObjective;
            bestCandidate = cloneCandidate(candidate);
          }
        }
        if (bestObjective.violationCount === 0) break;
      }
      if (bestObjective.violationCount === 0) break;
    }
    if (!improved) { iterations += 1; break; }
  }
  candidate.meals = bestCandidate.meals;
  for (let refinement = 0; refinement < MAX_CALIBRATION_ITERATIONS; refinement += 1) {
    const feasibleBoundaryCandidate = findFeasibleBoundaryAdjustment(context, candidate, items);
    if (!feasibleBoundaryCandidate) break;
    candidate.meals = feasibleBoundaryCandidate.meals;
  }
  const finalPreJointObjective = objective(context, calculateState(candidate, items));
  let jointAdjustmentUsed = false;
  if (finalPreJointObjective.violationCount > 0) {
    const feasibleJointCandidate = findFeasibleJointAdjustment(context, candidate, items);
    if (feasibleJointCandidate) {
      candidate.meals = feasibleJointCandidate.meals;
      jointAdjustmentUsed = true;
    }
  }
  candidate.meals = snapToPlausiblePortions(context, candidate, catalog).meals;
  const postSnapEligible = (item: AdjustableItem) => item.pool === "CARB_ANCHOR"
    || item.pool === "PROTEIN_ANCHOR"
    || item.pool === "LEGUME_ANCHOR";
  if (objective(context, calculateState(candidate, items)).violationCount > 0) {
    const boundaryRefinement = findFeasibleBoundaryAdjustment(context, candidate, items, postSnapEligible);
    if (boundaryRefinement) candidate.meals = boundaryRefinement.meals;
  }
  if (objective(context, calculateState(candidate, items)).violationCount > 0) {
    const jointRefinement = findFeasibleJointAdjustment(context, candidate, items, postSnapEligible);
    if (jointRefinement) {
      candidate.meals = jointRefinement.meals;
      jointAdjustmentUsed = true;
    }
  }
  const afterState = calculateState(candidate, items);
  const status: PortionCalibrationStatus = objective(context, afterState).violationCount === 0
    ? "CONVERGED"
    : "PORTION_CALIBRATION_NO_FEASIBLE_SOLUTION";
  const adjustedItemCount = items.filter((item) => candidate.meals[item.mealIndex].items[item.itemIndex].quantityGrams !== item.originalGrams).length;
  const beforeFiberDistance = Math.abs(beforeState.daily.fiberG - context.target.fiberG);
  const afterFiberDistance = Math.abs(afterState.daily.fiberG - context.target.fiberG);
  return {
    candidate,
    diagnostics: {
      iterations,
      adjustedItemCount,
      jointAdjustmentUsed,
      fiberProximityOptimized: afterFiberDistance < beforeFiberDistance - 0.01,
      before: toNumericDiagnostics(context, beforeState),
      after: toNumericDiagnostics(context, afterState),
      feedback: calibrationFeedback(context, afterState, status, candidate, beforeState, iterations, adjustedItemCount),
    },
  };
}
