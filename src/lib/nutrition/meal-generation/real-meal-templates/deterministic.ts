import type { AiMealPlanCandidate, MealPlanGenerationContext, MealPlanCatalogPromptContext } from "../domain";
import type { RealMealTemplateOption, RealMealTemplateSlot } from "./domain";

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
  const selectedFamilies: string[] = [];
  const selectedStaples: string[] = [];
  const selectedProteins: string[] = [];
  return {
    meals: prompt.templateSlots.map((slot, index) => {
      if (slot.options.length === 0) throw new Error("REAL_MEAL_TEMPLATE_UNAVAILABLE");
      const desiredProfile = context.goal === "hypertrophy" ? "SCALABLE"
        : context.goal === "fat_loss" ? "LIGHT" : "STANDARD";
      const ordered = [...slot.options].sort((left, right) => {
        const score = (option: RealMealTemplateOption) => Number(option.energyProfile === desiredProfile) * 6
          + Number(!selectedFamilies.includes(option.familyId)) * 4
          + Number(!selectedStaples.includes(option.stapleFamily)) * 2
          + Number(!selectedProteins.includes(option.proteinFamily));
        return score(right) - score(left) || left.variantId.localeCompare(right.variantId);
      });
      const bestScore = (() => {
        const option = ordered[0];
        return Number(option.energyProfile === desiredProfile) * 6 + Number(!selectedFamilies.includes(option.familyId)) * 4
          + Number(!selectedStaples.includes(option.stapleFamily)) * 2
          + Number(!selectedProteins.includes(option.proteinFamily));
      })();
      const best = ordered.filter((option) => Number(option.energyProfile === desiredProfile) * 6
        + Number(!selectedFamilies.includes(option.familyId)) * 4
        + Number(!selectedStaples.includes(option.stapleFamily)) * 2
        + Number(!selectedProteins.includes(option.proteinFamily)) === bestScore);
      const option = best[hash(`${seed}:${context.goal}:${slot.position}`) % best.length];
      selectedFamilies.push(option.familyId);
      selectedStaples.push(option.stapleFamily);
      selectedProteins.push(option.proteinFamily);
      const components = option.components.filter((value) => value.required);
      return {
        role: slot.role, templateId: option.templateId, variantId: option.variantId, label: option.displayName,
        items: components.map((component) => ({
          componentId: component.componentId, slot: component.slot,
          catalogEntryId: component.catalogEntryIds[hash(`${seed}:${index}:${component.componentId}`) % component.catalogEntryIds.length],
          quantityGrams: Math.round((component.minimumGrams + component.maximumGrams) / 2 / 5) * 5,
          ...(component.preparationNote ? { preparationNote: component.preparationNote } : {}),
        })),
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
