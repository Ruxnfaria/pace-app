import type { SupabaseClient } from "@supabase/supabase-js";

export type MealPlanTotals = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
};

export type ActiveMealPlanItem = MealPlanTotals & {
  id: string;
  position: number;
  foodCatalogEntryId: string;
  foodName: string;
  quantityGrams: number;
  catalogSource: string;
  catalogSourceVersion: string;
};

export type ActiveMealPlanMeal = {
  id: string;
  position: number;
  role: string;
  label: string;
  windowStart: string;
  windowEnd: string;
  windowStartDayOffset: number;
  windowEndDayOffset: number;
  targetCalories: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  targetFiberG: number;
  actualCalories: number;
  actualProteinG: number;
  actualCarbsG: number;
  actualFatG: number;
  actualFiberG: number;
  items: ActiveMealPlanItem[];
};

export type ActiveMealPlan = {
  id: string;
  version: number;
  strategyVersion: string;
  generatorVersion: string;
  validatorVersion: string;
  recommendedMealsPerDay: number;
  validFrom: string;
  meals: ActiveMealPlanMeal[];
  actualTotals: MealPlanTotals;
};

type PlanRow = Record<string, unknown> & {
  id: unknown;
  version: unknown;
  strategy_version: unknown;
  generator_version: unknown;
  validator_version: unknown;
  recommended_meals_per_day: unknown;
  valid_from: unknown;
};

type MealRow = Record<string, unknown> & {
  id: unknown;
  meal_plan_id: unknown;
  position: unknown;
  role: unknown;
  label: unknown;
  window_start: unknown;
  window_end: unknown;
  window_start_day_offset: unknown;
  window_end_day_offset: unknown;
  target_calories: unknown;
  target_protein_g: unknown;
  target_carbs_g: unknown;
  target_fat_g: unknown;
  target_fiber_g: unknown;
};

type ItemRow = Record<string, unknown> & {
  id: unknown;
  meal_id: unknown;
  position: unknown;
  food_catalog_entry_id: unknown;
  food_name: unknown;
  quantity_grams: unknown;
  calories: unknown;
  protein_g: unknown;
  carbs_g: unknown;
  fat_g: unknown;
  fiber_g: unknown;
  catalog_source: unknown;
  catalog_source_version: unknown;
};

const EMPTY_TOTALS: MealPlanTotals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Invalid active meal plan field: ${field}`);
  return value;
}

function numberValue(value: unknown, field: string, minimum = 0): number {
  const parsed = typeof value === "number" ? value
    : typeof value === "string" && value.trim() !== "" ? Number(value)
    : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < minimum) throw new Error(`Invalid active meal plan field: ${field}`);
  return parsed;
}

function integerValue(value: unknown, field: string, minimum = 0): number {
  const parsed = numberValue(value, field, minimum);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid active meal plan field: ${field}`);
  return parsed;
}

function roundNutrient(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addTotals(current: MealPlanTotals, value: MealPlanTotals): MealPlanTotals {
  return {
    calories: roundNutrient(current.calories + value.calories),
    proteinG: roundNutrient(current.proteinG + value.proteinG),
    carbsG: roundNutrient(current.carbsG + value.carbsG),
    fatG: roundNutrient(current.fatG + value.fatG),
    fiberG: roundNutrient(current.fiberG + value.fiberG),
  };
}

function parseItem(row: ItemRow): ActiveMealPlanItem & { mealId: string } {
  return {
    id: requiredString(row.id, "item.id"),
    mealId: requiredString(row.meal_id, "item.meal_id"),
    position: integerValue(row.position, "item.position", 1),
    foodCatalogEntryId: requiredString(row.food_catalog_entry_id, "item.food_catalog_entry_id"),
    foodName: requiredString(row.food_name, "item.food_name"),
    quantityGrams: numberValue(row.quantity_grams, "item.quantity_grams", Number.EPSILON),
    calories: numberValue(row.calories, "item.calories"),
    proteinG: numberValue(row.protein_g, "item.protein_g"),
    carbsG: numberValue(row.carbs_g, "item.carbs_g"),
    fatG: numberValue(row.fat_g, "item.fat_g"),
    fiberG: numberValue(row.fiber_g, "item.fiber_g"),
    catalogSource: requiredString(row.catalog_source, "item.catalog_source"),
    catalogSourceVersion: requiredString(row.catalog_source_version, "item.catalog_source_version"),
  };
}

export function buildActiveMealPlan(
  planRow: PlanRow,
  mealRows: readonly MealRow[],
  itemRows: readonly ItemRow[],
): ActiveMealPlan {
  const planId = requiredString(planRow.id, "plan.id");
  const parsedItems = itemRows.map(parseItem);
  const meals = mealRows
    .filter((meal) => requiredString(meal.meal_plan_id, "meal.meal_plan_id") === planId)
    .map((meal): ActiveMealPlanMeal => {
      const mealId = requiredString(meal.id, "meal.id");
      const items = parsedItems
        .filter((item) => item.mealId === mealId)
        .sort((left, right) => left.position - right.position)
        .map((item): ActiveMealPlanItem => ({
          id: item.id,
          position: item.position,
          foodCatalogEntryId: item.foodCatalogEntryId,
          foodName: item.foodName,
          quantityGrams: item.quantityGrams,
          calories: item.calories,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          fiberG: item.fiberG,
          catalogSource: item.catalogSource,
          catalogSourceVersion: item.catalogSourceVersion,
        }));
      const totals = items.reduce<MealPlanTotals>((sum, item) => addTotals(sum, item), { ...EMPTY_TOTALS });
      return {
        id: mealId,
        position: integerValue(meal.position, "meal.position", 1),
        role: requiredString(meal.role, "meal.role"),
        label: requiredString(meal.label, "meal.label"),
        windowStart: requiredString(meal.window_start, "meal.window_start"),
        windowEnd: requiredString(meal.window_end, "meal.window_end"),
        windowStartDayOffset: integerValue(meal.window_start_day_offset, "meal.window_start_day_offset"),
        windowEndDayOffset: integerValue(meal.window_end_day_offset, "meal.window_end_day_offset"),
        targetCalories: numberValue(meal.target_calories, "meal.target_calories"),
        targetProteinG: numberValue(meal.target_protein_g, "meal.target_protein_g"),
        targetCarbsG: numberValue(meal.target_carbs_g, "meal.target_carbs_g"),
        targetFatG: numberValue(meal.target_fat_g, "meal.target_fat_g"),
        targetFiberG: numberValue(meal.target_fiber_g, "meal.target_fiber_g"),
        actualCalories: totals.calories,
        actualProteinG: totals.proteinG,
        actualCarbsG: totals.carbsG,
        actualFatG: totals.fatG,
        actualFiberG: totals.fiberG,
        items,
      };
    })
    .sort((left, right) => left.position - right.position);
  const actualTotals = meals.reduce<MealPlanTotals>((sum, meal) => addTotals(sum, {
    calories: meal.actualCalories,
    proteinG: meal.actualProteinG,
    carbsG: meal.actualCarbsG,
    fatG: meal.actualFatG,
    fiberG: meal.actualFiberG,
  }), { ...EMPTY_TOTALS });

  return {
    id: planId,
    version: integerValue(planRow.version, "plan.version", 1),
    strategyVersion: requiredString(planRow.strategy_version, "plan.strategy_version"),
    generatorVersion: requiredString(planRow.generator_version, "plan.generator_version"),
    validatorVersion: requiredString(planRow.validator_version, "plan.validator_version"),
    recommendedMealsPerDay: integerValue(planRow.recommended_meals_per_day, "plan.recommended_meals_per_day", 1),
    validFrom: requiredString(planRow.valid_from, "plan.valid_from"),
    meals,
    actualTotals,
  };
}

function assertCompleteActivePlan(plan: ActiveMealPlan): ActiveMealPlan {
  if (plan.meals.length !== plan.recommendedMealsPerDay || plan.meals.some((meal) => meal.items.length === 0)) {
    throw new Error("Active meal plan is incomplete");
  }
  return plan;
}

export async function loadActiveMealPlan(client: SupabaseClient, userId: string): Promise<ActiveMealPlan | null> {
  const { data: plan, error: planError } = await client
    .from("nutrition_meal_plans")
    .select("id,version,strategy_version,generator_version,validator_version,recommended_meals_per_day,valid_from")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan) return null;

  const { data: meals, error: mealsError } = await client
    .from("nutrition_meal_plan_meals")
    .select("id,meal_plan_id,position,role,label,window_start,window_end,window_start_day_offset,window_end_day_offset,target_calories,target_protein_g,target_carbs_g,target_fat_g,target_fiber_g")
    .eq("meal_plan_id", plan.id)
    .order("position", { ascending: true });
  if (mealsError) throw mealsError;

  const mealIds = (meals ?? []).map((meal) => meal.id);
  if (mealIds.length === 0) throw new Error("Active meal plan is incomplete");

  const { data: items, error: itemsError } = await client
    .from("nutrition_meal_plan_items")
    .select("id,meal_id,position,food_catalog_entry_id,food_name,quantity_grams,calories,protein_g,carbs_g,fat_g,fiber_g,catalog_source,catalog_source_version")
    .in("meal_id", mealIds)
    .order("position", { ascending: true });
  if (itemsError) throw itemsError;

  return assertCompleteActivePlan(buildActiveMealPlan(plan as PlanRow, (meals ?? []) as MealRow[], (items ?? []) as ItemRow[]));
}

const ROLE_LABELS: Readonly<Record<string, string>> = {
  BREAKFAST: "Café da manhã",
  PRE_WORKOUT: "Pré-treino",
  POST_WORKOUT: "Pós-treino",
  EVENING_MEAL: "Refeição noturna",
  MAIN_MEAL: "Refeição principal",
  SNACK: "Lanche",
};

export function formatMealRole(role: string): string {
  return ROLE_LABELS[role] ?? "Refeição";
}

function formatTime(value: string): string {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return "--:--";
  return `${match[1]}:${match[2]}`;
}

export function formatMealWindow(start: string, end: string, startDayOffset: number, endDayOffset: number): string {
  const base = `${formatTime(start)} — ${formatTime(end)}`;
  if (startDayOffset > 0) return `${base} · dia seguinte`;
  if (endDayOffset > startDayOffset) return `${base} · termina no dia seguinte`;
  return base;
}
