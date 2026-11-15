import type { NutritionFoodCatalogEntry } from "../../food-catalog/domain";
import { RECIPE_VALIDATOR_VERSION, type CulinaryLibrary, type RecipeIngredientTemplate,
  type RecipePreparationState, type RecipeSelection, type RecipeValidationIssue,
  type RecipeTemplate, type RecipeValidationReport } from "./domain";
import type { MealIntent } from "../daily-blueprint/domain";
import { recipeById } from "./registry";

function issue(code: RecipeValidationIssue["code"], message: string, componentId?: string): RecipeValidationIssue {
  return { code, message, ...(componentId ? { componentId } : {}) };
}

export function authoritativePreparationState(entry: NutritionFoodCatalogEntry): RecipePreparationState {
  const value = `${entry.canonicalName} ${entry.preparationState}`.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/grelhad/.test(value)) return "GRILLED";
  if (/assad/.test(value)) return "ROASTED";
  if (/cozid|cocca|coccao|boiled/.test(value)) {
    return /\bovo\b/.test(value) ? "BOILED" : "COOKED";
  }
  if (/\bcru|\bcrua|\braw\b/.test(value)) return "RAW";
  if (/ready.to.eat|pronto.*consumo/.test(value)) return "READY_TO_EAT";
  return "NOT_APPLICABLE";
}

function quantityOnIncrement(value: number, ingredient: RecipeIngredientTemplate): boolean {
  const steps = (value - ingredient.minimumQuantity) / ingredient.increment;
  return Math.abs(steps - Math.round(steps)) <= 0.001;
}

export function validateRecipeSelection(
  library: CulinaryLibrary,
  selection: RecipeSelection,
): RecipeValidationReport {
  const issues: RecipeValidationIssue[] = [];
  const recipe = recipeById(library, selection.recipeId);
  if (!recipe) {
    return { valid: false, recognized: false, validatorVersion: RECIPE_VALIDATOR_VERSION,
      issues: [issue("UNKNOWN_RECIPE", "Recipe is not present in the server-defined culinary library")] };
  }
  if (recipe.variantId !== selection.variantId) {
    issues.push(issue("UNKNOWN_VARIANT", "Variant is not server-defined for this recipe"));
  }
  if (recipe.status !== "ACTIVE") issues.push(issue("RECIPE_BLOCKED", "Recipe is not generation-eligible"));
  const catalogById = new Map(library.catalogEntries.map((entry) => [entry.id, entry]));
  const selectedByComponent = new Map<string, typeof selection.ingredients>();
  for (const selected of selection.ingredients) {
    const values = selectedByComponent.get(selected.componentId) ?? [];
    values.push(selected);
    selectedByComponent.set(selected.componentId, values);
    const ingredient = recipe.ingredients.find((value) => value.componentId === selected.componentId);
    if (!ingredient) {
      issues.push(issue("UNKNOWN_COMPONENT", "Component does not belong to the selected recipe", selected.componentId));
      continue;
    }
    if (!ingredient.allowedCatalogEntryIds.includes(selected.catalogEntryId)) {
      issues.push(issue("FOOD_NOT_ALLOWED_FOR_COMPONENT", "Food is not authorized for this recipe component",
        selected.componentId));
      continue;
    }
    if (selected.nutritionQuantityGrams < ingredient.minimumQuantity - 0.001) {
      issues.push(issue("QUANTITY_BELOW_MINIMUM", "Quantity is below the recipe minimum", selected.componentId));
    }
    if (selected.nutritionQuantityGrams > ingredient.maximumQuantity + 0.001) {
      issues.push(issue("QUANTITY_ABOVE_MAXIMUM", "Quantity is above the recipe maximum", selected.componentId));
    }
    if (!quantityOnIncrement(selected.nutritionQuantityGrams, ingredient)) {
      issues.push(issue("QUANTITY_INCREMENT_INVALID", "Quantity does not respect the authorized increment",
        selected.componentId));
    }
    const entry = catalogById.get(selected.catalogEntryId);
    if (entry && ingredient.preparationState !== "NOT_APPLICABLE"
      && authoritativePreparationState(entry) !== ingredient.preparationState) {
      issues.push(issue("PREPARATION_STATE_MISMATCH",
        "Catalog preparation state does not match the recipe ingredient", selected.componentId));
    }
  }
  for (const ingredient of recipe.ingredients.filter((value) => value.required)) {
    if (!selectedByComponent.has(ingredient.componentId)) {
      issues.push(issue("REQUIRED_INGREDIENT_MISSING", "Required recipe ingredient is missing", ingredient.componentId));
    }
  }
  for (const [componentId, selected] of selectedByComponent) {
    if (selected.length > 1) issues.push(issue("DUPLICATE_COMPONENT", "Recipe component was selected more than once", componentId));
  }
  const optionalCount = selection.ingredients.filter((selected) =>
    recipe.ingredients.some((ingredient) => ingredient.componentId === selected.componentId && !ingredient.required)).length;
  if (optionalCount > recipe.maximumOptionalComponents) {
    issues.push(issue("MAX_OPTIONAL_COMPONENTS_EXCEEDED", "Recipe optional-component limit was exceeded"));
  }
  return { valid: issues.length === 0, recognized: issues.length === 0 && recipe.humanRecognitionApproved,
    validatorVersion: RECIPE_VALIDATOR_VERSION, issues };
}

export function defaultRecipeSelection(library: CulinaryLibrary, recipeId: string): RecipeSelection | null {
  const recipe = recipeById(library, recipeId);
  if (!recipe) return null;
  return {
    recipeId: recipe.id,
    variantId: recipe.variantId,
    ingredients: recipe.ingredients.filter((value) => value.referenceIncluded && value.allowedCatalogEntryIds.length > 0)
      .map((value) => ({ componentId: value.componentId, catalogEntryId: value.allowedCatalogEntryIds[0],
        nutritionQuantityGrams: value.referenceQuantity })),
  };
}

export function recipeSupportsIntent(recipe: RecipeTemplate, intent: MealIntent): boolean {
  return recipe.allowedMealIntents.includes(intent);
}

export function recipeAllowsIngredient(
  recipe: RecipeTemplate,
  componentId: string,
  catalogEntryId: string,
): boolean {
  return recipe.ingredients.some((ingredient) => ingredient.componentId === componentId
    && ingredient.allowedCatalogEntryIds.includes(catalogEntryId));
}

export function recipeAllowsFatCompletion(
  recipe: RecipeTemplate,
  componentId: string,
  catalogEntryId: string,
): boolean {
  return recipe.ingredients.some((ingredient) => !ingredient.required && ingredient.slot === "FAT_ANCHOR"
    && ingredient.componentId === componentId && ingredient.allowedCatalogEntryIds.includes(catalogEntryId));
}
