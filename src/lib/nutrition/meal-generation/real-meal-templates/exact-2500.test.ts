import assert from "node:assert/strict";
import test from "node:test";
import { assessTrustedNutritionCatalog } from "../../food-catalog/capabilities";
import { validateDailyMealQuality } from "../../meal-quality/daily-quality";
import { validatePortionRealism } from "../../meal-quality/portion-realism";
import { buildMealPlanPromptContext } from "../generator";
import { calibrateMealPlanPortions } from "../portion-calibration";
import { generationContext, officialTestCatalog } from "../test-helpers";
import { validateMealPlanCandidate } from "../validator";
import { humanReadableMealPlan } from "./presentation";
import { validateRealMealTemplates } from "./validator";
import { validateDailyMealBlueprint } from "../daily-blueprint/validator";

test("exact 2500 kcal target converges inside a valid whole-day blueprint", (t) => {
  const base = officialTestCatalog();
  const catalog = { ...base, portions: [], readiness: assessTrustedNutritionCatalog(base.entries).level };
  const roles = ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"] as const;
  const context = generationContext("hypertrophy", [...roles]);
  context.trainingPeriod = "evening";
  context.mealWindows = [
    { position: 1, start: "11:32", end: "12:02", startDayOffset: 0, endDayOffset: 0 },
    { position: 2, start: "16:01", end: "16:31", startDayOffset: 0, endDayOffset: 0 },
    { position: 3, start: "20:29", end: "21:00", startDayOffset: 0, endDayOffset: 0 },
    { position: 4, start: "00:58", end: "01:28", startDayOffset: 1, endDayOffset: 1 },
  ];
  context.target = { status: "active", calories: 2500, proteinG: 110, carbsG: 359.75, fatG: 69, fiberG: 35 };
  context.mealMacroTargets = roles.map((role, index) => ({ position: index + 1, role,
    calories: 625, proteinG: 27.5, carbsG: 89.9375, fatG: 17.25, fiberG: 8.75 }));
  const prompt = buildMealPlanPromptContext(context, catalog);
  const variantIds = ["BREAD_EGGS_FRENCH_BANANA", "PRE_BREAD_CHEESE_FRENCH_BANANA",
    "WHITE_CARIOCA_BEEF_BROCCOLI", "POST_SKIM_YOGURT_PAPAYA_OATS"];
  const optionalIds: Array<string | false> = ["SPREAD", false, "AVOCADO_SIDE", false];
  const initialQuantities: Array<Record<string, number>> = [
    { BREAD: 140, EGGS: 100, FRUIT: 130, SPREAD: 20 },
    { BREAD: 140, CHEESE: 70, FRUIT: 130 },
    { RICE: 300, BEANS: 100, PROTEIN: 70, VEGETABLES: 150, AVOCADO_SIDE: 100 },
    { YOGURT: 200, OATS: 70, FRUIT: 130 },
  ];
  const candidate = { meals: variantIds.map((variantId, index) => {
    const option = prompt.templateSlots[index].options.find((value) => value.variantId === variantId)!;
    return {
      role: roles[index], templateId: option.templateId, variantId: option.variantId, label: option.displayName,
      items: option.components.filter((component) => component.required || component.componentId === optionalIds[index])
        .map((component) => ({
          componentId: component.componentId, slot: component.slot, catalogEntryId: component.catalogEntryIds[0],
          quantityGrams: initialQuantities[index][component.componentId]
            ?? Math.round((component.minimumGrams + component.maximumGrams) / 2 / 5) * 5,
          ...(component.preparationNote ? { preparationNote: component.preparationNote } : {}),
        })),
    };
  }) };
  const calibrated = calibrateMealPlanPortions(context, candidate, catalog, prompt.candidates);
  const report = validateMealPlanCandidate(context, calibrated.candidate, catalog, prompt.candidates, prompt.templateSlots);
  assert.equal(report.valid, true, JSON.stringify({ issues: report.issues, diagnostics: report.diagnostics,
    candidate: calibrated.candidate }));
  assert.ok(report.plan);
  assert.equal(validateRealMealTemplates(context, calibrated.candidate, prompt.templateSlots).valid, true);
  assert.equal(validateDailyMealBlueprint(context, calibrated.candidate).valid, true);
  assert.equal(report.coherence?.valid, true);
  assert.equal(validateDailyMealQuality(report.plan!).valid, true);
  assert.equal(validatePortionRealism(report.plan!).valid, true);
  assert.equal(calibrated.diagnostics.fiberProximityOptimized, true);
  assert.ok(report.plan!.totals.fiberG < 60.57);
  assert.match(humanReadableMealPlan(report.plan!), /Pão|Arroz/);
  t.diagnostic(`DAILY_BLUEPRINT_ID=${prompt.dailyBlueprint.id}`);
  t.diagnostic(`FINAL_TOTALS=${JSON.stringify(report.plan!.totals)}`);
  t.diagnostic(`HUMAN_READABLE_DAY=\n${humanReadableMealPlan(report.plan!)}`);
});
