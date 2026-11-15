import type { CulinaryLibrary, RecipeSelection } from "./domain";
import { recipeById } from "./registry";
import { validateRecipeSelection } from "./validator";

/**
 * The culinary solver contract is intentionally narrow: it may change grams
 * for an ingredient already selected by a server-defined recipe, never recipe
 * identity, component identity, or catalog identity.
 */
export function adjustRecipeQuantities(
  library: CulinaryLibrary,
  selection: RecipeSelection,
  quantitiesByComponent: Readonly<Record<string, number>>,
): RecipeSelection | null {
  const recipe = recipeById(library, selection.recipeId);
  if (!recipe || Object.keys(quantitiesByComponent).some((componentId) =>
    !selection.ingredients.some((ingredient) => ingredient.componentId === componentId))) return null;
  const adjusted: RecipeSelection = {
    recipeId: selection.recipeId,
    variantId: selection.variantId,
    ingredients: selection.ingredients.map((ingredient) => ({ ...ingredient,
      nutritionQuantityGrams: quantitiesByComponent[ingredient.componentId] ?? ingredient.nutritionQuantityGrams })),
  };
  return validateRecipeSelection(library, adjusted).valid ? adjusted : null;
}
