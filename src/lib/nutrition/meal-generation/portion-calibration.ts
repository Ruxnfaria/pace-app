import { calculateFoodNutrients } from "../food-catalog/nutrients";
import type { NutritionFoodCatalogEntry } from "../food-catalog/domain";
import type {
  AiMealPlanCandidate,
  CatalogSnapshot,
  MealPlanCatalogCandidate,
  MealPlanGenerationContext,
  MealPlanCalibrationFeedback,
  MealPlanNumericValidationDiagnostics,
  PortionCalibrationStatus,
} from "./domain";
import { MEAL_VALIDATION_POLICY as POLICY } from "./policy";

export const MAX_CALIBRATION_ITERATIONS = 12;
export const MIN_PORTION_GRAMS = 10;
export const MAX_PORTION_GRAMS = POLICY.portions.maximumItemGrams;

type NutrientKey = "calories" | "proteinG" | "carbsG" | "fatG" | "fiberG";
type Totals = Record<NutrientKey, number>;

export interface MealPortionCalibrationDiagnostics {
  iterations: number;
  adjustedItemCount: number;
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
  food: NutritionFoodCatalogEntry;
  perGram: Totals;
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function itemMaximum(foodRole: string | null, foodGroup: string): number {
  return foodRole === "fat" || foodGroup === "oils_fats"
    ? POLICY.portions.maximumOilFatGrams
    : MAX_PORTION_GRAMS;
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
  return { daily, meals };
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
    + 3 * normalized(state.daily.proteinG, target.proteinG) ** 2
    + 2 * normalized(state.daily.carbsG, target.carbsG) ** 2
    + 2 * normalized(state.daily.fatG, target.fatG) ** 2;
  if (state.daily.fiberG < target.fiberG) targetDistance += normalized(state.daily.fiberG, target.fiberG) ** 2;
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
  };
}

function possibleQuantities(
  item: AdjustableItem,
  current: number,
  context: MealPlanGenerationContext,
  state: ReturnType<typeof calculateState>,
  iteration: number,
): number[] {
  const values = new Set<number>([current, MIN_PORTION_GRAMS, item.maximumGrams]);
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
    .map((value) => round(clamp(value, MIN_PORTION_GRAMS, item.maximumGrams), 1));
  return roundedValues
    .flatMap((value) => [value - 1, value - 0.1, value, value + 0.1, value + 1])
    .map((value) => round(clamp(value, MIN_PORTION_GRAMS, item.maximumGrams), 1))
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((left, right) => left - right);
}

function findFeasibleBoundaryAdjustment(
  context: MealPlanGenerationContext,
  candidate: AiMealPlanCandidate,
  items: AdjustableItem[],
): AiMealPlanCandidate | null {
  const baselineState = calculateState(candidate, items);
  let bestObjective = objective(context, baselineState);
  let bestCandidate: AiMealPlanCandidate | null = null;
  for (const item of items) {
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

function findFeasibleJointAdjustment(
  context: MealPlanGenerationContext,
  candidate: AiMealPlanCandidate,
  items: AdjustableItem[],
): AiMealPlanCandidate | null {
  const baselineState = calculateState(candidate, items);
  const ranges = acceptedRanges(context);
  const violatedKey = NUTRIENT_KEYS.find((key) => direction(baselineState.daily[key], ranges[key]) !== "within");
  if (!violatedKey) return cloneCandidate(candidate);
  const requiredDirection = direction(baselineState.daily[violatedKey], ranges[violatedKey]);
  const primaryItems = [...items]
    .filter((item) => item.perGram[violatedKey] > 0)
    .sort((left, right) => {
      if (requiredDirection === "below") {
        return (right.perGram[violatedKey] / Math.max(right.perGram.calories, 0.01))
          - (left.perGram[violatedKey] / Math.max(left.perGram.calories, 0.01));
      }
      const leftGrams = candidate.meals[left.mealIndex].items[left.itemIndex].quantityGrams;
      const rightGrams = candidate.meals[right.mealIndex].items[right.itemIndex].quantityGrams;
      return right.perGram[violatedKey] * rightGrams - left.perGram[violatedKey] * leftGrams;
    })
    .slice(0, 6);
  let bestObjective = objective(context, baselineState);
  let bestCandidate: AiMealPlanCandidate | null = null;
  for (const primary of primaryItems) {
    const primaryCandidate = candidate.meals[primary.mealIndex].items[primary.itemIndex];
    const primaryOriginal = primaryCandidate.quantityGrams;
    const primaryQuantities = possibleQuantities(
      primary, primaryOriginal, context, baselineState, MAX_CALIBRATION_ITERATIONS - 1,
    ).filter((quantity) => requiredDirection === "below" ? quantity > primaryOriginal : quantity < primaryOriginal);
    for (const primaryQuantity of primaryQuantities) {
      primaryCandidate.quantityGrams = primaryQuantity;
      const intermediateState = calculateState(candidate, items);
      for (const secondary of items) {
        if (secondary === primary) continue;
        const secondaryCandidate = candidate.meals[secondary.mealIndex].items[secondary.itemIndex];
        const secondaryOriginal = secondaryCandidate.quantityGrams;
        for (const secondaryQuantity of possibleQuantities(
          secondary, secondaryOriginal, context, intermediateState, MAX_CALIBRATION_ITERATIONS - 1,
        )) {
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
): MealPortionCalibrationResult {
  const candidate = cloneCandidate(input);
  const catalogById = new Map(catalog.entries.map((entry) => [entry.id, entry]));
  const allowedIds = new Set(allowedCandidates.map((entry) => entry.catalogEntryId));
  const items: AdjustableItem[] = [];
  for (let mealIndex = 0; mealIndex < candidate.meals.length; mealIndex += 1) {
    for (let itemIndex = 0; itemIndex < candidate.meals[mealIndex].items.length; itemIndex += 1) {
      const candidateItem = candidate.meals[mealIndex].items[itemIndex];
      const food = catalogById.get(candidateItem.catalogEntryId);
      if (!food || !allowedIds.has(candidateItem.catalogEntryId) || !Number.isFinite(candidateItem.quantityGrams)
        || candidateItem.quantityGrams <= 0 || Object.values(food.nutrientsPer100g).some((value) => value === null)) {
        return { candidate: input, diagnostics: { iterations: 0, adjustedItemCount: 0, before: null, after: null, feedback: null } };
      }
      const per100g = calculateFoodNutrients(food, 100);
      items.push({
        mealIndex, itemIndex, originalGrams: candidateItem.quantityGrams,
        maximumGrams: itemMaximum(food.foodRole, food.foodGroup), food,
        perGram: {
          calories: per100g.calories! / 100, proteinG: per100g.proteinG! / 100,
          carbsG: per100g.carbsG! / 100, fatG: per100g.fatG! / 100, fiberG: per100g.fiberG! / 100,
        },
      });
      candidateItem.quantityGrams = round(clamp(candidateItem.quantityGrams, MIN_PORTION_GRAMS, items.at(-1)!.maximumGrams), 1);
    }
  }
  if (items.length === 0 || candidate.meals.length !== context.mealCount) {
    return { candidate: input, diagnostics: { iterations: 0, adjustedItemCount: 0, before: null, after: null, feedback: null } };
  }

  const beforeState = calculateState(candidate, items);
  const energyScale = context.target.calories / beforeState.daily.calories;
  const scaled = cloneCandidate(candidate);
  for (const item of items) {
    const value = scaled.meals[item.mealIndex].items[item.itemIndex];
    value.quantityGrams = round(clamp(value.quantityGrams * energyScale, MIN_PORTION_GRAMS, item.maximumGrams), 1);
  }
  if (isBetter(objective(context, calculateState(scaled, items)), objective(context, beforeState))) {
    candidate.meals = scaled.meals;
  }

  let iterations = 0;
  let bestCandidate = cloneCandidate(candidate);
  let bestObjective = objective(context, calculateState(candidate, items));
  for (; iterations < MAX_CALIBRATION_ITERATIONS; iterations += 1) {
    if (bestObjective.violationCount === 0) break;
    let improved = false;
    const sweeps = [items, [...items].reverse()];
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
  const feasibleBoundaryCandidate = findFeasibleBoundaryAdjustment(context, candidate, items);
  if (feasibleBoundaryCandidate) candidate.meals = feasibleBoundaryCandidate.meals;
  const finalPreJointState = calculateState(candidate, items);
  const finalPreJointObjective = objective(context, finalPreJointState);
  const fatRange = acceptedRanges(context).fatG;
  if (finalPreJointObjective.violationCount === 1 && direction(finalPreJointState.daily.fatG, fatRange) !== "within") {
    const feasibleJointCandidate = findFeasibleJointAdjustment(context, candidate, items);
    if (feasibleJointCandidate) candidate.meals = feasibleJointCandidate.meals;
  }
  const afterState = calculateState(candidate, items);
  const status: PortionCalibrationStatus = objective(context, afterState).violationCount === 0
    ? "CONVERGED"
    : "PORTION_CALIBRATION_NO_FEASIBLE_SOLUTION";
  return {
    candidate,
    diagnostics: {
      iterations,
      adjustedItemCount: items.filter((item) => candidate.meals[item.mealIndex].items[item.itemIndex].quantityGrams !== item.originalGrams).length,
      before: toNumericDiagnostics(context, beforeState),
      after: toNumericDiagnostics(context, afterState),
      feedback: calibrationFeedback(context, afterState, status, candidate),
    },
  };
}
