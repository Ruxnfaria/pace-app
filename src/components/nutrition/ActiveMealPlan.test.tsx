import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ActiveMealPlan from "./ActiveMealPlan.tsx";
import type { ActiveMealPlan as ActiveMealPlanModel } from "@/lib/nutrition/meal-plan/active-plan";

function activePlanFixture(): ActiveMealPlanModel {
  const roles = ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"];
  const foods = ["Frango grelhado", "Farinha de mandioca", "Castanha-do-Brasil", "Goiaba"];
  return {
    id: "plan-1",
    version: 1,
    strategyVersion: "strategy-v1",
    generatorVersion: "generator-v1",
    validatorVersion: "validator-v1",
    recommendedMealsPerDay: 4,
    validFrom: "2026-10-26",
    actualTotals: { calories: 1600, proteinG: 160, carbsG: 320, fatG: 80, fiberG: 32 },
    meals: roles.map((role, mealIndex) => ({
      id: `meal-${mealIndex + 1}`,
      position: mealIndex + 1,
      role,
      label: `Meal ${mealIndex + 1}`,
      windowStart: mealIndex === 3 ? "00:58:00" : "11:32:00",
      windowEnd: mealIndex === 3 ? "02:28:00" : "13:02:00",
      windowStartDayOffset: mealIndex === 3 ? 1 : 0,
      windowEndDayOffset: mealIndex === 3 ? 1 : 0,
      targetCalories: 625,
      targetProteinG: 27.5,
      targetCarbsG: 89.94,
      targetFatG: 17.25,
      targetFiberG: 8.75,
      actualCalories: 400,
      actualProteinG: 40,
      actualCarbsG: 80,
      actualFatG: 20,
      actualFiberG: 8,
      items: foods.map((foodName, itemIndex) => ({
        id: `meal-${mealIndex + 1}-item-${itemIndex + 1}`,
        position: itemIndex + 1,
        foodCatalogEntryId: `taco-${itemIndex + 1}`,
        foodName,
        quantityGrams: [49, 48, 12, 29][itemIndex],
        calories: 100,
        proteinG: 10,
        carbsG: 20,
        fatG: 5,
        fiberG: 2,
        catalogSource: "TACO",
        catalogSourceVersion: "taco-4ed-ampliada-2011",
      })),
    })),
  };
}

test("renders the persisted four-meal TACO fixture with actual daily totals", () => {
  const html = renderToStaticMarkup(<ActiveMealPlan plan={activePlanFixture()} />);
  for (const label of ["Café da manhã", "Pré-treino", "Pós-treino", "Refeição noturna"]) assert.match(html, new RegExp(label));
  for (const food of ["Frango grelhado", "Farinha de mandioca", "Castanha-do-Brasil", "Goiaba"]) assert.match(html, new RegExp(food));
  assert.equal(html.match(/<li /g)?.length, 16);
  assert.match(html, /1\.600/);
  assert.match(html, /160 g/);
  assert.match(html, /00:58 — 02:28 · dia seguinte/);
  assert.match(html, /Valores do plano gerado/);
  assert.doesNotMatch(html, /consumid[oa]s?/i);
});
