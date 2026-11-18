import type { CountableMeasurementAuthority, CulinaryLibrary, LiquidMeasurementAuthority,
  RecipePresentation, RecipeSelection } from "./domain";
import { recipeById } from "./registry";
import { validateRecipeSelection } from "./validator";
import { buildNaturalRecipeLines } from "./natural-language";

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

export function presentRecipe(
  library: CulinaryLibrary,
  selection: RecipeSelection,
  liquidAuthorities: readonly LiquidMeasurementAuthority[] = [],
  countableAuthorities: readonly CountableMeasurementAuthority[] = [],
): RecipePresentation | null {
  if (!validateRecipeSelection(library, selection).valid) return null;
  const recipe = recipeById(library, selection.recipeId);
  if (!recipe) return null;
  const componentById = new Map(recipe.ingredients.map((ingredient) => [ingredient.componentId, ingredient]));
  const liquidByCatalogId = new Map(liquidAuthorities.map((authority) => [authority.catalogEntryId, authority]));
  const countableByCatalogId = new Map(countableAuthorities.map((authority) => [authority.catalogEntryId, authority]));
  const ingredients = selection.ingredients.map((selected) => {
    const ingredient = componentById.get(selected.componentId)!;
    const liquidAuthority = liquidByCatalogId.get(selected.catalogEntryId);
    const countableAuthority = countableByCatalogId.get(selected.catalogEntryId);
    const count = countableAuthority ? selected.nutritionQuantityGrams / countableAuthority.gramsPerCount : null;
    const exactCount = count !== null && Math.abs(count - Math.round(count)) <= 1e-9 ? Math.round(count) : null;
    const milliliters = liquidAuthority ? selected.nutritionQuantityGrams / liquidAuthority.gramsPerMl : null;
    const exactDisplayMl = milliliters !== null && liquidAuthority
      && Math.abs(milliliters / liquidAuthority.displayIncrementMl
        - Math.round(milliliters / liquidAuthority.displayIncrementMl)) <= 1e-9
      ? rounded(milliliters) : null;
    return {
      componentId: selected.componentId,
      displayName: exactCount !== null && countableAuthority
        ? exactCount === 1 ? countableAuthority.singularName : countableAuthority.pluralName
        : ingredient.displayName,
      nutritionQuantityGrams: selected.nutritionQuantityGrams,
      displayQuantity: exactCount ?? exactDisplayMl ?? selected.nutritionQuantityGrams,
      displayUnit: exactCount !== null ? countableAuthority?.displayUnit ?? "count" as const
        : exactDisplayMl !== null ? "ml" as const : "g" as const,
      preparationState: ingredient.preparationState,
      presentationOrder: ingredient.presentationOrder,
    };
  }).sort((left, right) => left.presentationOrder - right.presentationOrder);
  return {
    recipeId: recipe.id, variantId: recipe.variantId, recipeDisplayName: recipe.displayName,
    ingredients, lines: buildNaturalRecipeLines(ingredients), preparationDescription: recipe.preparationDescription,
  };
}
