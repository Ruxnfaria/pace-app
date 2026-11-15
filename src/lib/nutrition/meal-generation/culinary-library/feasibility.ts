import { hasCompleteEffectiveNutrients } from "../../food-catalog/effective-nutrients";
import { foodPortionProfile } from "../../meal-quality/portion-profile";
import type { CulinaryLibrary, RecipeFeasibilityResult, RecipeTemplate } from "./domain";

export function auditRecipeFeasibility(library: CulinaryLibrary, recipe: RecipeTemplate): RecipeFeasibilityResult {
  const reasons: string[] = [];
  if (recipe.status === "BLOCKED_MISSING_SUPPLEMENT_AUTHORITY") {
    return { recipeId: recipe.id, variantId: recipe.variantId, status: "BLOCKED_MISSING_AUTHORITY",
      reasons: ["SUPPLEMENT_LABEL_AUTHORITY_MISSING"] };
  }
  const catalogById = new Map(library.catalogEntries.map((entry) => [entry.id, entry]));
  for (const ingredient of recipe.ingredients.filter((value) => value.required)) {
    if (ingredient.allowedCatalogEntryIds.length === 0) reasons.push(`MISSING_AUTHORITY:${ingredient.componentId}`);
    const entries = ingredient.allowedCatalogEntryIds.flatMap((id) => {
      const entry = catalogById.get(id);
      return entry ? [entry] : [];
    });
    if (entries.length > 0 && entries.every((entry) => !hasCompleteEffectiveNutrients(entry))) {
      reasons.push(`NUTRIENT_INCOMPLETE:${ingredient.componentId}`);
    }
    const portionProfiles = entries.map((entry) => foodPortionProfile(entry, ingredient.slot,
      recipe.allowedMealRoles[0]));
    const hasPolicyOverlap = portionProfiles.some((profile) => Math.max(ingredient.minimumQuantity,
      profile.minimumGrams) <= Math.min(ingredient.maximumQuantity, profile.maximumAutogenerationGrams));
    if (ingredient.minimumQuantity > ingredient.maximumQuantity || ingredient.increment <= 0
      || ingredient.referenceQuantity < ingredient.minimumQuantity
      || ingredient.referenceQuantity > ingredient.maximumQuantity || (entries.length > 0 && !hasPolicyOverlap)) {
      reasons.push(`PORTION_REALISM:${ingredient.componentId}`);
    }
  }
  const status = reasons.some((reason) => reason.startsWith("MISSING_AUTHORITY")) ? "BLOCKED_MISSING_AUTHORITY"
    : reasons.some((reason) => reason.startsWith("NUTRIENT_INCOMPLETE")) ? "BLOCKED_NUTRIENT_INCOMPLETE"
      : reasons.some((reason) => reason.startsWith("PORTION_REALISM")) ? "BLOCKED_PORTION_REALISM"
        : "FEASIBLE";
  return { recipeId: recipe.id, variantId: recipe.variantId, status, reasons };
}

export function auditCulinaryLibrary(library: CulinaryLibrary): RecipeFeasibilityResult[] {
  return library.recipes.map((recipe) => auditRecipeFeasibility(library, recipe));
}
