import type { NutritionFoodCatalogEntry } from "../../food-catalog/domain";
import type { CulinaryRole } from "../../meal-quality/domain";
import type { MealRole } from "../../meal-plan/domain";
import type { MealIntent, MealStyle } from "../daily-blueprint/domain";
import type { MealPlanFoodPool } from "../domain";

export const CULINARY_LIBRARY_VERSION = "praxe-culinary-library-v1" as const;
export const RECIPE_VALIDATOR_VERSION = "praxe-recipe-validator-v1" as const;

export const RECIPE_PREPARATION_STATES = [
  "RAW", "COOKED", "GRILLED", "ROASTED", "BOILED", "READY_TO_EAT", "NOT_APPLICABLE",
] as const;
export type RecipePreparationState = (typeof RECIPE_PREPARATION_STATES)[number];

export type NutritionAuthorityType = "TACO" | "SUPPLEMENT_LABEL";
export type RecipeStatus = "ACTIVE" | "BLOCKED_MISSING_SUPPLEMENT_AUTHORITY";
export type RecipeDisplayUnit = "g" | "ml" | "count" | "slice";

export interface CountableMeasurementAuthority {
  catalogEntryId: string;
  gramsPerCount: number;
  singularName: string;
  pluralName: string;
  source: string;
  sourceVersion: string;
  authorityType: "CURATED_PORTION" | "SOURCE_PORTION";
  displayUnit?: "count" | "slice";
}

export interface SupplementLabelAuthority {
  authorityType: "SUPPLEMENT_LABEL";
  catalogEntryId: string;
  manufacturer: string;
  productName: string;
  servingSize: number;
  servingUnit: "g" | "ml";
  nutritionPerServing: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
  };
  sourceVersion: string;
  labelVersion: string;
  capturedAt: string;
}

export interface LiquidMeasurementAuthority {
  catalogEntryId: string;
  displayUnit: "ml";
  gramsPerMl: number;
  displayIncrementMl: number;
  source: string;
  sourceVersion: string;
  authorityType: "CATALOG_DENSITY" | "LAB_MEASUREMENT" | "MANUFACTURER_LABEL";
}

export interface RecipeIngredientTemplate {
  componentId: string;
  displayName: string;
  culinaryRole: CulinaryRole;
  required: boolean;
  slot: MealPlanFoodPool;
  allowedCatalogEntryIds: string[];
  nutritionQuantityUnit: "g";
  displayUnit: RecipeDisplayUnit;
  minimumQuantity: number;
  maximumQuantity: number;
  increment: number;
  referenceQuantity: number;
  referenceIncluded: boolean;
  preparationState: RecipePreparationState;
  presentationOrder: number;
  nutritionAuthority: NutritionAuthorityType;
}

export interface RecipeTemplate {
  id: string;
  variantId: string;
  version: typeof CULINARY_LIBRARY_VERSION;
  displayName: string;
  familyId: string;
  culture: "BRAZILIAN";
  mealStyles: MealStyle[];
  allowedMealRoles: MealRole[];
  allowedMealIntents: MealIntent[];
  compatibleRealMealTemplateIds: string[];
  preparationDescription: string | null;
  ingredients: RecipeIngredientTemplate[];
  maximumOptionalComponents: number;
  status: RecipeStatus;
  humanRecognitionApproved: true;
}

export interface RecipeIngredientSelection {
  componentId: string;
  catalogEntryId: string;
  nutritionQuantityGrams: number;
}

export interface RecipeSelection {
  recipeId: string;
  variantId: string;
  ingredients: RecipeIngredientSelection[];
}

export const RECIPE_VALIDATION_CODES = [
  "UNKNOWN_RECIPE", "UNKNOWN_VARIANT", "RECIPE_BLOCKED", "UNKNOWN_COMPONENT", "DUPLICATE_COMPONENT",
  "FOOD_NOT_ALLOWED_FOR_COMPONENT", "REQUIRED_INGREDIENT_MISSING", "QUANTITY_BELOW_MINIMUM",
  "QUANTITY_ABOVE_MAXIMUM", "QUANTITY_INCREMENT_INVALID", "PREPARATION_STATE_MISMATCH",
  "MAX_OPTIONAL_COMPONENTS_EXCEEDED",
] as const;
export type RecipeValidationCode = (typeof RECIPE_VALIDATION_CODES)[number];

export interface RecipeValidationIssue {
  code: RecipeValidationCode;
  message: string;
  componentId?: string;
}

export interface RecipeValidationReport {
  valid: boolean;
  recognized: boolean;
  validatorVersion: typeof RECIPE_VALIDATOR_VERSION;
  issues: RecipeValidationIssue[];
}

export interface RecipePresentationIngredient {
  componentId: string;
  displayName: string;
  nutritionQuantityGrams: number;
  displayQuantity: number;
  displayUnit: RecipeDisplayUnit;
  preparationState: RecipePreparationState;
  presentationOrder: number;
}

export interface RecipePresentation {
  recipeId: string;
  variantId: string;
  recipeDisplayName: string;
  ingredients: RecipePresentationIngredient[];
  lines: RecipePresentationLine[];
  preparationDescription: string | null;
}

export interface RecipePresentationLine {
  text: string;
  componentIds: string[];
  nutritionQuantityGrams: number;
}

export type RecipeFeasibilityStatus = "FEASIBLE" | "BLOCKED_MISSING_AUTHORITY"
  | "BLOCKED_NUTRIENT_INCOMPLETE" | "BLOCKED_PORTION_REALISM" | "BLOCKED_NO_MACRO_SOLUTION";

export interface RecipeFeasibilityResult {
  recipeId: string;
  variantId: string;
  status: RecipeFeasibilityStatus;
  reasons: string[];
}

export interface CulinaryLibrary {
  version: typeof CULINARY_LIBRARY_VERSION;
  recipes: RecipeTemplate[];
  catalogEntries: NutritionFoodCatalogEntry[];
}
