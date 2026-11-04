import { canUseFoodForRestrictions } from "../../food-catalog/restrictions";
import { hasCompleteEffectiveNutrients, resolveEffectiveNutrients } from "../../food-catalog/effective-nutrients";
import { normalizeFoodQuery } from "../../food-catalog/normalization";
import { TACO_SOURCE_VERSION } from "../../food-catalog/taco/constants";
import { classifyFoodSuitability } from "../../meal-quality/food-suitability";
import type { CatalogSnapshot, MealPlanCatalogCandidate, MealPlanGenerationContext } from "../domain";
import { allRealMealTemplates } from "./registry";
import type { RealMealTemplateAvailability, RealMealTemplateOption, RealMealTemplateSlot } from "./domain";
import { resolveDailyMealBlueprint } from "../daily-blueprint/resolver";

function foodAllowedByUser(context: MealPlanGenerationContext, entry: CatalogSnapshot["entries"][number]): boolean {
  const disliked = new Set(context.dislikedFoods.map(normalizeFoodQuery));
  if (disliked.has(entry.normalizedName) || disliked.has(normalizeFoodQuery(entry.canonicalName))) return false;
  if (!context.hasFoodRestriction && context.dietaryPattern === "omnivore" && context.allergenRestrictions.length === 0) return true;
  return canUseFoodForRestrictions(entry, {
    dietaryPattern: context.dietaryPattern === "unknown" ? "other" : context.dietaryPattern,
    allergenRestrictions: context.allergenRestrictions,
  }).allowed;
}

function usableEntries(context: MealPlanGenerationContext, catalog: CatalogSnapshot) {
  return catalog.entries.filter((entry) => entry.isActive && entry.source === "TACO"
    && entry.sourceVersion === TACO_SOURCE_VERSION && entry.catalogScope === "PRODUCTION"
    && hasCompleteEffectiveNutrients(entry) && foodAllowedByUser(context, entry));
}

function supportsComponent(entry: CatalogSnapshot["entries"][number], componentId: string,
  slot: import("../domain").MealPlanFoodPool): boolean {
  const nutrients = resolveEffectiveNutrients(entry);
  if (componentId === "COFFEE") return entry.sourceFoodId === "471";
  if (slot === "PROTEIN_ANCHOR") return (nutrients.proteinG ?? 0) >= 3;
  if (slot === "CARB_ANCHOR") return (nutrients.carbsG ?? 0) >= 5;
  if (slot === "LEGUME_ANCHOR") return (nutrients.fiberG ?? 0) >= 1.5;
  if (slot === "FAT_ANCHOR") return (nutrients.fatG ?? 0) >= 3;
  return (nutrients.fiberG ?? 0) >= 1 || componentId === "VEGETABLES" || componentId === "FRUIT";
}

export function auditRealMealTemplateAvailability(
  context: MealPlanGenerationContext,
  catalog: CatalogSnapshot,
): RealMealTemplateAvailability[] {
  const bySourceId = new Map(usableEntries(context, catalog).map((entry) => [entry.sourceFoodId, entry]));
  return allRealMealTemplates().flatMap((template) => template.variants.map((variant) => {
    const reasons: string[] = [];
    if (!template.mealRoles.some((role) => context.mealRoles.includes(role))) reasons.push("ROLE_NOT_REQUESTED");
    if (!template.goalCompatibility.includes(context.goal)) reasons.push("GOAL_NOT_COMPATIBLE");
    for (const definition of template.components.filter((value) => value.required)) {
      const sourceIds = variant.componentSourceFoodIds[definition.id] ?? definition.allowedSourceFoodIds;
      if (!sourceIds.some((sourceId) => {
        const entry = bySourceId.get(sourceId);
        return entry && supportsComponent(entry, definition.id, definition.slot);
      })) reasons.push(`MISSING_${definition.id}`);
    }
    return { templateId: template.id, variantId: variant.id, feasible: reasons.length === 0, reasons };
  }));
}

function buildOption(
  context: MealPlanGenerationContext,
  catalog: CatalogSnapshot,
  templateId: string,
  variantId: string,
): RealMealTemplateOption | null {
  const template = allRealMealTemplates().find((value) => value.id === templateId);
  const variant = template?.variants.find((value) => value.id === variantId);
  if (!template || !variant || !template.goalCompatibility.includes(context.goal)) return null;
  const bySourceId = new Map(usableEntries(context, catalog).map((entry) => [entry.sourceFoodId, entry]));
  const components = template.components.map((definition) => {
    const sourceIds = variant.componentSourceFoodIds[definition.id] ?? definition.allowedSourceFoodIds;
    return {
      componentId: definition.id, slot: definition.slot, required: definition.required,
      catalogEntryIds: sourceIds.flatMap((sourceId) => {
        const entry = bySourceId.get(sourceId);
        return entry && supportsComponent(entry, definition.id, definition.slot) ? [entry.id] : [];
      }),
      minimumGrams: definition.minimumGrams, maximumGrams: definition.maximumGrams,
      presentationGroup: definition.presentationGroup,
      ...(definition.preparationNote ? { preparationNote: definition.preparationNote } : {}),
    };
  });
  if (components.some((value) => value.required && value.catalogEntryIds.length === 0)) return null;
  return {
    templateId: template.id, variantId: variant.id, displayName: variant.displayName,
    mealType: template.mealType, preparationDescription: template.preparationDescription,
    familyId: template.familyId, mealStyle: template.mealStyle, stapleFamily: template.stapleFamily,
    proteinFamily: template.proteinFamily,
    energyProfile: variant.energyProfile,
    maximumOptionalComponents: template.maximumOptionalComponents,
    components: components.filter((value) => value.required || value.catalogEntryIds.length > 0),
  };
}

export function buildRealMealTemplateSlots(
  context: MealPlanGenerationContext,
  catalog: CatalogSnapshot,
): RealMealTemplateSlot[] {
  const blueprint = resolveDailyMealBlueprint(context);
  return context.mealRoles.map((role, index) => ({
    position: index + 1,
    role,
    intent: blueprint.mealIntents[index].intent,
    options: allRealMealTemplates()
      .filter((template) => template.mealRoles.includes(role) && template.goalCompatibility.includes(context.goal)
        && template.allowedIntents.includes(blueprint.mealIntents[index].intent))
      .flatMap((template) => template.variants.map((variant) => buildOption(context, catalog, template.id, variant.id)))
      .filter((value): value is RealMealTemplateOption => value !== null),
  }));
}

export function buildTemplateConstrainedCandidates(
  context: MealPlanGenerationContext,
  catalog: CatalogSnapshot,
  slots: RealMealTemplateSlot[],
): MealPlanCatalogCandidate[] {
  const allowedSlotsById = new Map<string, Set<MealPlanCatalogCandidate["pools"][number]>>();
  slots.forEach((slot) => slot.options.forEach((option) => option.components.forEach((component) =>
    component.catalogEntryIds.forEach((id) => {
      const pools = allowedSlotsById.get(id) ?? new Set();
      pools.add(component.slot);
      allowedSlotsById.set(id, pools);
    }))));
  const entries = usableEntries(context, catalog).filter((entry) => allowedSlotsById.has(entry.id));
  return entries.map((entry) => {
    const nutrients = resolveEffectiveNutrients(entry);
    const suitability = classifyFoodSuitability(entry);
    return {
      catalogEntryId: entry.id, canonicalName: entry.canonicalName, source: "TACO" as const,
      sourceFoodId: entry.sourceFoodId, sourceVersion: entry.sourceVersion,
      preparationState: entry.preparationState, calories: nutrients.calories!, proteinG: nutrients.proteinG!,
      carbsG: nutrients.carbsG!, fatG: nutrients.fatG!, fiberG: nutrients.fiberG!,
      pools: [...allowedSlotsById.get(entry.id)!], form: suitability.form,
      qualityClass: suitability.qualityClass, culinaryRoles: suitability.culinaryRoles,
      suitableMealRoles: [...new Set(slots.flatMap((slot) => slot.options.some((option) => option.components
        .some((component) => component.catalogEntryIds.includes(entry.id))) ? [slot.role] : []))],
    };
  }).sort((left, right) => left.sourceFoodId.localeCompare(right.sourceFoodId, "pt-BR", { numeric: true }));
}
