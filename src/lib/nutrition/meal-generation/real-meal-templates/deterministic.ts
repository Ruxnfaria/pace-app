import type { AiMealPlanCandidate, MealPlanGenerationContext, MealPlanCatalogPromptContext } from "../domain";
import type { RealMealTemplateOption, RealMealTemplateSlot } from "./domain";
import type { CulinaryRecipeOption } from "../culinary-library/integration";
import { emptyDailyVarietyState, recordDailyVarietySelection, scoreDailyVarietyOption } from "../culinary-library/daily-variety";

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

export function buildDeterministicRealMealCandidate(
  context: MealPlanGenerationContext,
  prompt: MealPlanCatalogPromptContext,
  seed = context.targetSnapshotId,
): AiMealPlanCandidate {
  const varietyState = emptyDailyVarietyState();
  return {
    meals: prompt.recipeSlots.map((slot, index) => {
      if (slot.options.length === 0) throw new Error("CULINARY_RECIPE_UNAVAILABLE");
      const desiredProfile = context.goal === "hypertrophy" ? "SCALABLE"
        : context.goal === "fat_loss" ? "LIGHT" : "STANDARD";
      const ordered = [...slot.options].sort((left, right) => {
        const score = (option: CulinaryRecipeOption) => {
          const template = prompt.templateSlots[index].options.find((value) => value.templateId === option.templateId
            && value.variantId === option.templateVariantId)!;
          return Number(template.energyProfile === desiredProfile) * 6
            + scoreDailyVarietyOption(option, template, varietyState);
        };
        return score(right) - score(left) || left.recipeVariantId.localeCompare(right.recipeVariantId);
      });
      const bestScore = (() => {
        const option = ordered[0];
        const template = prompt.templateSlots[index].options.find((value) => value.templateId === option.templateId
          && value.variantId === option.templateVariantId)!;
        return Number(template.energyProfile === desiredProfile) * 6
          + scoreDailyVarietyOption(option, template, varietyState);
      })();
      const best = ordered.filter((option) => {
        const template = prompt.templateSlots[index].options.find((value) => value.templateId === option.templateId
          && value.variantId === option.templateVariantId)!;
        return Number(template.energyProfile === desiredProfile) * 6
          + scoreDailyVarietyOption(option, template, varietyState) === bestScore;
      });
      const option = best[hash(`${seed}:${context.goal}:${slot.position}`) % best.length];
      const template = prompt.templateSlots[index].options.find((value) => value.templateId === option.templateId
        && value.variantId === option.templateVariantId)!;
      const components = option.components.filter((value) => value.required);
      const items = components.map((component) => ({
        componentId: component.componentId, slot: component.slot,
        catalogEntryId: component.catalogEntryIds[hash(`${seed}:${index}:${component.componentId}`) % component.catalogEntryIds.length],
        quantityGrams: component.referenceGrams,
        ...(component.preparationNote ? { preparationNote: component.preparationNote } : {}),
      }));
      recordDailyVarietySelection(varietyState, option, template, items.map((item) => item.catalogEntryId));
      return {
        role: slot.role, templateId: option.templateId, variantId: option.templateVariantId,
        recipeId: option.recipeId, recipeVersion: option.recipeVersion, recipeFamilyId: option.recipeFamilyId,
        recipeVariantId: option.recipeVariantId, label: option.recipeDisplayName,
        items,
      };
    }),
  };
}

export function nextCompatibleRealMealTemplate(
  slot: RealMealTemplateSlot,
  currentTemplateId: string,
  currentVariantId: string,
): RealMealTemplateOption | null {
  if (slot.options.length < 2) return null;
  const currentIndex = slot.options.findIndex((option) => option.templateId === currentTemplateId
    && option.variantId === currentVariantId);
  return slot.options[(Math.max(currentIndex, 0) + 1) % slot.options.length] ?? null;
}
