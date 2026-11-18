import { foodPortionProfile } from "../../meal-quality/portion-profile";
import type { MealRole } from "../../meal-plan/domain";
import type { CatalogSnapshot, MealPlanGenerationContext } from "../domain";
import type { MealIntent } from "../daily-blueprint/domain";
import type { RealMealTemplateOption, RealMealTemplateSlot } from "../real-meal-templates/domain";
import { auditCulinaryLibrary } from "./feasibility";
import { buildCulinaryLibrary } from "./registry";
import type { RecipeDisplayUnit, RecipePreparationState, RecipeTemplate } from "./domain";

export interface CulinaryRecipeComponentOption {
  componentId: string;
  displayName: string;
  slot: import("../domain").MealPlanFoodPool;
  required: boolean;
  catalogEntryIds: string[];
  minimumGrams: number;
  maximumGrams: number;
  incrementGrams: number;
  referenceGrams: number;
  preparationState: RecipePreparationState;
  displayUnit: RecipeDisplayUnit;
  presentationOrder: number;
  preparationNote?: string;
}

export interface CulinaryRecipeOption {
  recipeId: string;
  recipeVersion: string;
  recipeFamilyId: string;
  recipeVariantId: string;
  recipeDisplayName: string;
  preparationDescription: string | null;
  templateId: string;
  templateVariantId: string;
  mealRole: MealRole;
  mealIntent: MealIntent;
  maximumOptionalComponents: number;
  components: CulinaryRecipeComponentOption[];
}

export interface CulinaryRecipeSlot {
  position: number;
  role: MealRole;
  intent: MealIntent;
  options: CulinaryRecipeOption[];
}

function compatibleOption(
  context: MealPlanGenerationContext,
  catalog: CatalogSnapshot,
  role: MealRole,
  intent: MealIntent,
  template: RealMealTemplateOption,
  recipe: RecipeTemplate,
): CulinaryRecipeOption | null {
  if (recipe.status !== "ACTIVE" || !recipe.allowedMealRoles.includes(role)
    || !recipe.allowedMealIntents.includes(intent)
    || !recipe.compatibleRealMealTemplateIds.includes(template.templateId)) return null;
  const catalogById = new Map(catalog.entries.map((entry) => [entry.id, entry]));
  const components = recipe.ingredients.flatMap((ingredient): CulinaryRecipeComponentOption[] => {
    const templateComponent = template.components.find((component) => component.componentId === ingredient.componentId
      && component.slot === ingredient.slot && component.required === ingredient.required);
    if (!templateComponent) return [];
    const authorized = ingredient.allowedCatalogEntryIds.filter((id) => templateComponent.catalogEntryIds.includes(id));
    const catalogEntryIds = authorized.filter((id) => {
      const entry = catalogById.get(id);
      if (!entry) return false;
      const profile = foodPortionProfile(entry, ingredient.slot, role);
      return Math.max(ingredient.minimumQuantity, templateComponent.minimumGrams, profile.minimumGrams)
        <= Math.min(ingredient.maximumQuantity, templateComponent.maximumGrams, profile.maximumAutogenerationGrams);
    });
    if (catalogEntryIds.length === 0) return [];
    const profiles = catalogEntryIds.map((id) => foodPortionProfile(catalogById.get(id)!, ingredient.slot, role));
    const minimumGrams = Math.max(ingredient.minimumQuantity, templateComponent.minimumGrams,
      ...profiles.map((profile) => profile.minimumGrams));
    const maximumGrams = Math.min(ingredient.maximumQuantity, templateComponent.maximumGrams,
      ...profiles.map((profile) => profile.maximumAutogenerationGrams));
    const referenceGrams = Math.max(minimumGrams, Math.min(maximumGrams, ingredient.referenceQuantity));
    return [{
      componentId: ingredient.componentId,
      displayName: ingredient.displayName,
      slot: ingredient.slot,
      required: ingredient.required,
      catalogEntryIds,
      minimumGrams,
      maximumGrams,
      incrementGrams: ingredient.increment,
      referenceGrams,
      preparationState: ingredient.preparationState,
      displayUnit: ingredient.displayUnit,
      presentationOrder: ingredient.presentationOrder,
      ...(templateComponent.preparationNote ? { preparationNote: templateComponent.preparationNote } : {}),
    }];
  });
  const componentById = new Map(components.map((component) => [component.componentId, component]));
  if (recipe.ingredients.some((ingredient) => ingredient.required && !componentById.has(ingredient.componentId))
    || template.components.some((component) => component.required && !componentById.get(component.componentId)?.required)) return null;

  return {
    recipeId: recipe.id,
    recipeVersion: recipe.version,
    recipeFamilyId: recipe.familyId,
    recipeVariantId: recipe.variantId,
    recipeDisplayName: recipe.displayName,
    preparationDescription: recipe.preparationDescription,
    templateId: template.templateId,
    templateVariantId: template.variantId,
    mealRole: role,
    mealIntent: intent,
    maximumOptionalComponents: Math.min(recipe.maximumOptionalComponents, template.maximumOptionalComponents),
    components: components.sort((left, right) => left.presentationOrder - right.presentationOrder),
  };
}

export function buildCulinaryRecipeSlots(
  context: MealPlanGenerationContext,
  catalog: CatalogSnapshot,
  templateSlots: RealMealTemplateSlot[],
): CulinaryRecipeSlot[] {
  const library = buildCulinaryLibrary(catalog.entries);
  const feasible = new Set(auditCulinaryLibrary(library)
    .filter((result) => result.status === "FEASIBLE")
    .map((result) => `${result.recipeId}:${result.variantId}`));
  return templateSlots.map((slot) => ({
    position: slot.position,
    role: slot.role,
    intent: slot.intent,
    options: slot.options.flatMap((template) => library.recipes
      .filter((recipe) => feasible.has(`${recipe.id}:${recipe.variantId}`))
      .flatMap((recipe) => {
        const option = compatibleOption(context, catalog, slot.role, slot.intent, template, recipe);
        return option ? [option] : [];
      })),
  }));
}

export function findCulinaryRecipeOption(
  slots: CulinaryRecipeSlot[],
  mealIndex: number,
  meal: { templateId: string; variantId: string; recipeId?: string; recipeVersion?: string;
    recipeFamilyId?: string; recipeVariantId?: string },
): CulinaryRecipeOption | undefined {
  return slots[mealIndex]?.options.find((option) => option.templateId === meal.templateId
    && option.templateVariantId === meal.variantId && option.recipeId === meal.recipeId
    && option.recipeVersion === meal.recipeVersion && option.recipeFamilyId === meal.recipeFamilyId
    && option.recipeVariantId === meal.recipeVariantId);
}

export function culinaryRecipeCoverage(slots: CulinaryRecipeSlot[]): Record<string, number> {
  const coverage: Record<string, number> = {};
  for (const slot of slots) coverage[slot.intent] = Math.max(coverage[slot.intent] ?? 0, slot.options.length);
  return coverage;
}
