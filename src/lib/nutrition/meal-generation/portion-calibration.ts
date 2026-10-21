import { calculateFoodNutrients } from "../food-catalog/nutrients";
import type {
  AiMealPlanCandidate,
  CatalogSnapshot,
  MealPlanCatalogCandidate,
  MealPlanGenerationContext,
  MealPlanNumericValidationDiagnostics,
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
  perGram: Totals;
}

const NUTRIENT_KEYS: NutrientKey[] = ["calories", "proteinG", "carbsG", "fatG", "fiberG"];

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
  const daily = emptyTotals();
  const meals = candidate.meals.map(() => ({ ...emptyTotals(), grams: 0 }));
  for (const item of items) {
    const grams = candidate.meals[item.mealIndex].items[item.itemIndex].quantityGrams;
    meals[item.mealIndex].grams += grams;
    for (const key of NUTRIENT_KEYS) {
      const value = item.perGram[key] * grams;
      daily[key] += value;
      meals[item.mealIndex][key] += value;
    }
  }
  for (const key of NUTRIENT_KEYS) daily[key] = round(daily[key]);
  for (const meal of meals) {
    meal.grams = round(meal.grams, 1);
    for (const key of NUTRIENT_KEYS) meal[key] = round(meal[key]);
  }
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

function score(context: MealPlanGenerationContext, state: ReturnType<typeof calculateState>): number {
  const target = context.target;
  const normalized = (actual: number, expected: number) => expected > 0 ? (actual - expected) / expected : 0;
  let value = 4 * normalized(state.daily.calories, target.calories) ** 2
    + 3 * normalized(state.daily.proteinG, target.proteinG) ** 2
    + 2 * normalized(state.daily.carbsG, target.carbsG) ** 2
    + 2 * normalized(state.daily.fatG, target.fatG) ** 2;
  if (state.daily.fiberG < target.fiberG) value += normalized(state.daily.fiberG, target.fiberG) ** 2;
  for (let index = 0; index < state.meals.length; index += 1) {
    const meal = state.meals[index];
    const mealTarget = context.mealMacroTargets[index];
    value += 0.2 * normalized(meal.calories, mealTarget.calories) ** 2;
    if (context.goal === "hypertrophy") {
      const minimumProtein = mealTarget.proteinG * POLICY.distribution.minimumHypertrophyMealProteinTargetRatio;
      if (meal.proteinG < minimumProtein) value += 4 * normalized(meal.proteinG, mealTarget.proteinG) ** 2;
    }
    if (meal.grams > POLICY.portions.maximumMealGrams) {
      value += 100 + ((meal.grams - POLICY.portions.maximumMealGrams) / POLICY.portions.maximumMealGrams) ** 2;
    }
  }
  return value;
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
  for (const key of NUTRIENT_KEYS) {
    if (item.perGram[key] <= 0) continue;
    values.add(current + (targetByKey[key] - state.daily[key]) / item.perGram[key]);
  }
  const mealTarget = context.mealMacroTargets[item.mealIndex];
  if (item.perGram.proteinG > 0) {
    values.add(current + (mealTarget.proteinG - state.meals[item.mealIndex].proteinG) / item.perGram.proteinG);
  }
  return [...values]
    .map((value) => round(clamp(value, MIN_PORTION_GRAMS, item.maximumGrams), 1))
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((left, right) => left - right);
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
        return { candidate: input, diagnostics: { iterations: 0, adjustedItemCount: 0, before: null, after: null } };
      }
      const per100g = calculateFoodNutrients(food, 100);
      items.push({
        mealIndex, itemIndex, originalGrams: candidateItem.quantityGrams,
        maximumGrams: itemMaximum(food.foodRole, food.foodGroup),
        perGram: {
          calories: per100g.calories! / 100, proteinG: per100g.proteinG! / 100,
          carbsG: per100g.carbsG! / 100, fatG: per100g.fatG! / 100, fiberG: per100g.fiberG! / 100,
        },
      });
      candidateItem.quantityGrams = round(clamp(candidateItem.quantityGrams, MIN_PORTION_GRAMS, items.at(-1)!.maximumGrams), 1);
    }
  }
  if (items.length === 0 || candidate.meals.length !== context.mealCount) {
    return { candidate: input, diagnostics: { iterations: 0, adjustedItemCount: 0, before: null, after: null } };
  }

  const beforeState = calculateState(candidate, items);
  const energyScale = context.target.calories / beforeState.daily.calories;
  const scaled = cloneCandidate(candidate);
  for (const item of items) {
    const value = scaled.meals[item.mealIndex].items[item.itemIndex];
    value.quantityGrams = round(clamp(value.quantityGrams * energyScale, MIN_PORTION_GRAMS, item.maximumGrams), 1);
  }
  if (score(context, calculateState(scaled, items)) < score(context, beforeState)) {
    candidate.meals = scaled.meals;
  }

  let iterations = 0;
  for (; iterations < MAX_CALIBRATION_ITERATIONS; iterations += 1) {
    let improved = false;
    for (const item of items) {
      const targetItem = candidate.meals[item.mealIndex].items[item.itemIndex];
      const current = targetItem.quantityGrams;
      const state = calculateState(candidate, items);
      let bestQuantity = current;
      let bestScore = score(context, state);
      for (const quantity of possibleQuantities(item, current, context, state, iterations)) {
        targetItem.quantityGrams = quantity;
        const trialScore = score(context, calculateState(candidate, items));
        if (trialScore < bestScore - 1e-9) {
          bestScore = trialScore;
          bestQuantity = quantity;
        }
      }
      targetItem.quantityGrams = bestQuantity;
      if (bestQuantity !== current) improved = true;
    }
    if (!improved) { iterations += 1; break; }
  }
  const afterState = calculateState(candidate, items);
  return {
    candidate,
    diagnostics: {
      iterations,
      adjustedItemCount: items.filter((item) => candidate.meals[item.mealIndex].items[item.itemIndex].quantityGrams !== item.originalGrams).length,
      before: toNumericDiagnostics(context, beforeState),
      after: toNumericDiagnostics(context, afterState),
    },
  };
}
