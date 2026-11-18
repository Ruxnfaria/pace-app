import type { AiMealPlanCandidate, ResolvedMealPlan } from "../domain";
import type { RealMealTemplateOption, RealMealTemplateSlot } from "../real-meal-templates/domain";
import type { CulinaryRecipeOption, CulinaryRecipeSlot } from "./integration";

export const DAILY_CULINARY_VARIETY_VERSION = "praxe-daily-culinary-variety-v1" as const;

export interface DailyVarietySelectionState {
  recipeFamilies: string[];
  templateFamilies: string[];
  stapleFamilies: string[];
  proteinFamilies: string[];
  catalogEntryIds: string[];
  fruitCatalogEntryIds: string[];
}

export interface DailyCulinaryVarietyReport {
  version: typeof DAILY_CULINARY_VARIETY_VERSION;
  score: number;
  recipeFamilies: string[];
  repeatedRecipeFamilies: string[];
  repeatedTemplateFamilies: string[];
  repeatedStapleFamilies: string[];
  repeatedProteinFamilies: string[];
  repeatedCatalogEntryIds: string[];
  repeatedFruitCatalogEntryIds: string[];
}

export function emptyDailyVarietyState(): DailyVarietySelectionState {
  return { recipeFamilies: [], templateFamilies: [], stapleFamilies: [], proteinFamilies: [], catalogEntryIds: [], fruitCatalogEntryIds: [] };
}

function includesAny(selected: string[], candidates: string[]): boolean {
  return candidates.some((candidate) => selected.includes(candidate));
}

export function scoreDailyVarietyOption(
  option: CulinaryRecipeOption,
  template: RealMealTemplateOption,
  state: DailyVarietySelectionState,
): number {
  let score = 0;
  score += state.recipeFamilies.includes(option.recipeFamilyId) ? -4 : 5;
  const templateFamilyUses = state.templateFamilies.filter((value) => value === template.familyId).length;
  score += templateFamilyUses >= 2 ? -20 : templateFamilyUses === 1 ? -3 : 3;
  score += state.stapleFamilies.includes(template.stapleFamily) ? -2 : 3;
  score += state.proteinFamilies.includes(template.proteinFamily) ? -1 : 2;
  for (const component of option.components.filter((value) => value.required)) {
    const repeated = includesAny(state.catalogEntryIds, component.catalogEntryIds);
    score += repeated ? -1 : 1;
    if (component.componentId === "FRUIT") {
      score += includesAny(state.fruitCatalogEntryIds, component.catalogEntryIds) ? -4 : 2;
    }
  }
  return score;
}

export function recordDailyVarietySelection(
  state: DailyVarietySelectionState,
  option: CulinaryRecipeOption,
  template: RealMealTemplateOption,
  selectedCatalogEntryIds: string[],
): void {
  state.recipeFamilies.push(option.recipeFamilyId);
  state.templateFamilies.push(template.familyId);
  state.stapleFamilies.push(template.stapleFamily);
  state.proteinFamilies.push(template.proteinFamily);
  state.catalogEntryIds.push(...selectedCatalogEntryIds);
  option.components.filter((component) => component.componentId === "FRUIT").forEach((component) => {
    const selected = selectedCatalogEntryIds.find((id) => component.catalogEntryIds.includes(id));
    if (selected) state.fruitCatalogEntryIds.push(selected);
  });
}

function repeated(values: string[]): string[] {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts].filter(([, count]) => count > 1).map(([value]) => value).sort();
}

export function assessDailyCulinaryVariety(
  candidate: AiMealPlanCandidate | ResolvedMealPlan,
  recipeSlots: CulinaryRecipeSlot[],
  templateSlots: RealMealTemplateSlot[],
): DailyCulinaryVarietyReport {
  const state = emptyDailyVarietyState();
  let score = 0;
  candidate.meals.forEach((meal, index) => {
    const option = recipeSlots[index]?.options.find((value) => value.recipeId === meal.recipeId
      && value.recipeVariantId === meal.recipeVariantId && value.templateId === meal.templateId
      && value.templateVariantId === meal.variantId);
    const template = templateSlots[index]?.options.find((value) => value.templateId === meal.templateId
      && value.variantId === meal.variantId);
    if (!option || !template) return;
    score += scoreDailyVarietyOption(option, template, state);
    recordDailyVarietySelection(state, option, template, meal.items.map((item) =>
      "catalogEntryId" in item ? item.catalogEntryId : item.food.id));
  });
  return {
    version: DAILY_CULINARY_VARIETY_VERSION,
    score,
    recipeFamilies: [...state.recipeFamilies],
    repeatedRecipeFamilies: repeated(state.recipeFamilies),
    repeatedTemplateFamilies: repeated(state.templateFamilies),
    repeatedStapleFamilies: repeated(state.stapleFamilies),
    repeatedProteinFamilies: repeated(state.proteinFamilies),
    repeatedCatalogEntryIds: repeated(state.catalogEntryIds),
    repeatedFruitCatalogEntryIds: repeated(state.fruitCatalogEntryIds),
  };
}
