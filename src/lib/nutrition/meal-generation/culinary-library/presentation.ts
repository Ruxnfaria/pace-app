import type { CulinaryLibrary, LiquidMeasurementAuthority, RecipePresentation, RecipeSelection } from "./domain";
import { recipeById } from "./registry";
import { validateRecipeSelection } from "./validator";

function rounded(value: number): number {
  return Number(value.toFixed(1));
}

export function presentRecipe(
  library: CulinaryLibrary,
  selection: RecipeSelection,
  liquidAuthorities: readonly LiquidMeasurementAuthority[] = [],
): RecipePresentation | null {
  if (!validateRecipeSelection(library, selection).valid) return null;
  const recipe = recipeById(library, selection.recipeId);
  if (!recipe) return null;
  const componentById = new Map(recipe.ingredients.map((ingredient) => [ingredient.componentId, ingredient]));
  const liquidByCatalogId = new Map(liquidAuthorities.map((authority) => [authority.catalogEntryId, authority]));
  const ingredients = selection.ingredients.map((selected) => {
    const ingredient = componentById.get(selected.componentId)!;
    const liquidAuthority = liquidByCatalogId.get(selected.catalogEntryId);
    return {
      componentId: selected.componentId,
      displayName: ingredient.displayName,
      nutritionQuantityGrams: selected.nutritionQuantityGrams,
      displayQuantity: liquidAuthority
        ? rounded(selected.nutritionQuantityGrams / liquidAuthority.gramsPerMl)
        : selected.nutritionQuantityGrams,
      displayUnit: liquidAuthority ? "ml" as const : "g" as const,
      preparationState: ingredient.preparationState,
      presentationOrder: ingredient.presentationOrder,
    };
  }).sort((left, right) => left.presentationOrder - right.presentationOrder);
  return {
    recipeId: recipe.id, variantId: recipe.variantId, recipeDisplayName: recipe.displayName,
    ingredients, preparationDescription: recipe.preparationDescription,
  };
}
