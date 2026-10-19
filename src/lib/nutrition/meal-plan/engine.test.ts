import assert from "node:assert/strict";
import test from "node:test";
import type { AuthoritativeNutritionTarget, MealPlanContext } from "./domain";
import { resolveRecommendedMealStructure } from "./engine";
import { getNutritionGoalStrategy } from "./strategies";

function target(overrides: Partial<AuthoritativeNutritionTarget> = {}): AuthoritativeNutritionTarget {
  return { status: "active", calories: 2200, proteinG: 160, carbsG: 250, fatG: 62, fiberG: 31, ...overrides };
}

function context(overrides: Partial<MealPlanContext> = {}): MealPlanContext {
  return {
    wakeTime: "07:00", sleepTime: "23:00", routinePredictability: "predictable",
    mealBreakAvailability: "limited", preferredTrainingPeriod: "evening",
    preparationStyle: "cook_some", goal: "fat_loss", ...overrides,
  };
}

function resolve(c: MealPlanContext, t: AuthoritativeNutritionTarget) {
  return resolveRecommendedMealStructure(c, t, getNutritionGoalStrategy(c.goal));
}

function sum(values: number[]): number {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(1));
}

function assertReconciled(result: ReturnType<typeof resolve>, expected: AuthoritativeNutritionTarget) {
  assert.equal(sum(result.macroDistribution.map((meal) => meal.calories)), expected.calories);
  assert.equal(sum(result.macroDistribution.map((meal) => meal.proteinG)), expected.proteinG);
  assert.equal(sum(result.macroDistribution.map((meal) => meal.carbsG)), expected.carbsG);
  assert.equal(sum(result.macroDistribution.map((meal) => meal.fatG)), expected.fatG);
  assert.equal(sum(result.macroDistribution.map((meal) => meal.fiberG)), expected.fiberG);
  assert.deepEqual(result.reconciliation, {
    caloriesDelta: 0, proteinGDelta: 0, carbsGDelta: 0, fatGDelta: 0, fiberGDelta: 0,
  });
}

test("fat loss com pausas limitadas distribui proteína, pré/pós e reconcilia o target", () => {
  const t = target();
  const result = resolve(context(), t);
  assert.equal(result.recommendedMealsPerDay, 3);
  assert.ok(result.mealRoles.includes("PRE_WORKOUT"));
  assert.ok(result.mealRoles.includes("POST_WORKOUT"));
  const proteins = result.macroDistribution.map((meal) => meal.proteinG);
  assert.ok(Math.max(...proteins) - Math.min(...proteins) < 10);
  assertReconciled(result, t);
});

test("hypertrophy com 2500+ kcal usa 4–5 ocasiões e concentra mais carbo em torno do treino", () => {
  const c = context({ goal: "hypertrophy", mealBreakAvailability: "flexible", preferredTrainingPeriod: "afternoon" });
  const t = target({ calories: 2850, proteinG: 180, carbsG: 380, fatG: 68, fiberG: 40 });
  const result = resolve(c, t);
  assert.ok(result.recommendedMealsPerDay >= 4 && result.recommendedMealsPerDay <= 5);
  const workoutCarbs = result.macroDistribution.filter((meal) => meal.role === "PRE_WORKOUT" || meal.role === "POST_WORKOUT").map((meal) => meal.carbsG);
  const otherCarbs = result.macroDistribution.filter((meal) => meal.role !== "PRE_WORKOUT" && meal.role !== "POST_WORKOUT").map((meal) => meal.carbsG);
  assert.ok(Math.min(...workoutCarbs) > Math.max(...otherCarbs));
  assertReconciled(result, t);
});

test("conditioning matinal prioriza pré/pós digeríveis sem inventar déficit", () => {
  const c = context({ goal: "conditioning", mealBreakAvailability: "flexible", preferredTrainingPeriod: "morning" });
  const t = target({ calories: 2600, proteinG: 150, carbsG: 360, fatG: 62, fiberG: 36 });
  const result = resolve(c, t);
  const pre = result.macroDistribution.find((meal) => meal.role === "PRE_WORKOUT");
  const post = result.macroDistribution.find((meal) => meal.role === "POST_WORKOUT");
  assert.ok(pre && post);
  assert.ok(pre.fiberG < Math.max(...result.macroDistribution.map((meal) => meal.fiberG)));
  assert.ok(post.carbsG > 0);
  assertReconciled(result, t);
});

test("cross-midnight mantém janelas em ordem absoluta", () => {
  const result = resolve(context({ wakeTime: "11:00", sleepTime: "03:00", preferredTrainingPeriod: "afternoon" }), target());
  const absoluteStarts = result.mealWindows.map((window) => {
    const [hour, minute] = window.start.split(":").map(Number);
    return hour * 60 + minute + window.startDayOffset * 1440;
  });
  assert.deepEqual(absoluteStarts, [...absoluteStarts].sort((a, b) => a - b));
  assert.ok(result.mealWindows.some((window) => window.startDayOffset === 1));
});

test("pausas difíceis nunca geram cinco refeições inviáveis", () => {
  const result = resolve(context({ mealBreakAvailability: "difficult" }), target({ calories: 3400, proteinG: 210 }));
  assert.equal(result.recommendedMealsPerDay, 3);
});

test("treino variável não inventa horários fixos de pré/pós", () => {
  const result = resolve(context({ preferredTrainingPeriod: "variable" }), target());
  assert.equal(result.mealRoles.includes("PRE_WORKOUT"), false);
  assert.equal(result.mealRoles.includes("POST_WORKOUT"), false);
});

test("target requires_review não produz distribuição ativa", () => {
  assert.throws(() => resolve(context(), target({ status: "requires_review" })), { code: "TARGET_REQUIRES_REVIEW" });
});

test("arredondamento em 0,1 mantém targets fracionários dentro de 0,05 g", () => {
  const t = target({ carbsG: 250.25 });
  const result = resolve(context(), t);
  assert.ok(Math.abs(result.reconciliation.carbsGDelta) <= 0.05);
  assert.equal(sum(result.macroDistribution.map((meal) => meal.carbsG)), 250.3);
});
