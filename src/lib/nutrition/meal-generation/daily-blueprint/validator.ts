import type { AiMealPlanCandidate, MealPlanGenerationContext } from "../domain";
import { realMealTemplateById } from "../real-meal-templates/registry";
import type { DailyBlueprintIssue, DailyBlueprintValidationReport } from "./domain";
import { resolveDailyMealBlueprint } from "./resolver";

function issue(code: DailyBlueprintIssue["code"], severity: DailyBlueprintIssue["severity"], message: string,
  mealPosition?: number): DailyBlueprintIssue {
  return { code, severity, message, ...(mealPosition === undefined ? {} : { mealPosition }) };
}

export function validateDailyMealBlueprint(
  context: MealPlanGenerationContext,
  candidate: AiMealPlanCandidate,
): DailyBlueprintValidationReport {
  const blueprint = resolveDailyMealBlueprint(context);
  const issues: DailyBlueprintIssue[] = [];
  const templates = candidate.meals.map((meal) => realMealTemplateById(meal.templateId));
  templates.forEach((template, index) => {
    const prescribed = blueprint.mealIntents[index];
    if (!template || !prescribed || !template.allowedIntents.includes(prescribed.intent)) {
      issues.push(issue("MEAL_INTENT_TEMPLATE_MISMATCH", "HARD_FAILURE",
        "Selected template does not match the server-prescribed meal intent", index + 1));
    }
    if (prescribed?.intent === "POST_WORKOUT_MAIN" && template?.mealStyle !== "MAIN") {
      issues.push(issue("POST_WORKOUT_MAIN_EXPECTED", "HARD_FAILURE",
        "A substantial post-workout main meal was prescribed", index + 1));
    }
    if (prescribed?.intent === "EVENING_SNACK" && template?.mealStyle === "MAIN") {
      issues.push(issue("EVENING_SNACK_EXPECTED", "HARD_FAILURE",
        "An evening snack was prescribed after the day's main meal", index + 1));
    }
  });
  const mainMealCount = templates.filter((template) => template?.mealStyle === "MAIN").length;
  const snackStyleMealCount = templates.filter((template) => template?.mealStyle !== "MAIN").length;
  if (mainMealCount < blueprint.minimumMainMeals) {
    issues.push(issue("DAILY_MAIN_MEAL_MISSING", "HARD_FAILURE", "Daily product blueprint requires a cooked main meal"));
  }
  if (snackStyleMealCount > blueprint.maximumSnackMeals) {
    issues.push(issue("TOO_MANY_SNACK_STYLE_MEALS", "HARD_FAILURE", "Too many snack-style meals were selected"));
  }
  const familyCounts = new Map<string, number>();
  const stapleFamilies = new Set<string>();
  const proteinFamilies = new Set<string>();
  templates.forEach((template) => {
    if (!template) return;
    familyCounts.set(template.familyId, (familyCounts.get(template.familyId) ?? 0) + 1);
    if (template.stapleFamily !== "OTHER") stapleFamilies.add(template.stapleFamily);
    if (template.proteinFamily !== "OTHER") proteinFamilies.add(template.proteinFamily);
  });
  if ([...familyCounts.values()].some((count) => count > blueprint.maximumTemplateFamilyOccurrences)) {
    issues.push(issue("EXCESSIVE_TEMPLATE_FAMILY_REPETITION", "HARD_FAILURE",
      "One template family repeats too often across the day"));
  }
  if (stapleFamilies.size < blueprint.minimumStapleFamilies) {
    issues.push(issue("LOW_STAPLE_DIVERSITY", "WARNING", "Daily plan uses too few staple-food families"));
  }
  return {
    valid: !issues.some((value) => value.severity === "HARD_FAILURE"), blueprint, mainMealCount, snackStyleMealCount,
    templateFamilyCount: familyCounts.size, stapleFamilyCount: stapleFamilies.size,
    proteinFamilyCount: proteinFamilies.size, issues,
  };
}
