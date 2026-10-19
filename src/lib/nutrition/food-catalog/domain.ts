export const FOOD_CATALOG_SCHEMA_VERSION = "praxe-food-catalog-v1" as const;

export const NUTRITION_FOOD_SOURCES = ["TBCA", "TACO", "MANUAL_CURATED", "FUTURE_PROVIDER"] as const;
export const NUTRITION_DATA_QUALITIES = ["ANALYTICAL", "CALCULATED", "ATTRIBUTED", "IMPORTED"] as const;
export const FOOD_CATALOG_SCOPES = ["PRODUCTION", "TEST_ONLY"] as const;
export const FOOD_ROLES = ["protein", "carb", "fat", "fruit", "vegetable", "mixed"] as const;
export const BUDGET_TIERS = ["economical", "standard", "premium"] as const;
export const PREPARATION_COMPLEXITIES = ["low", "medium", "high"] as const;
export const DIETARY_TAGS = ["vegan", "vegetarian"] as const;
export const ALLERGEN_TAGS = [
  "contains_milk", "contains_gluten", "contains_egg", "contains_fish",
  "contains_shellfish", "contains_peanut", "contains_tree_nut", "contains_soy",
] as const;

export type NutritionFoodSource = (typeof NUTRITION_FOOD_SOURCES)[number];
export type NutritionDataQuality = (typeof NUTRITION_DATA_QUALITIES)[number];
export type FoodCatalogScope = (typeof FOOD_CATALOG_SCOPES)[number];
export type FoodRole = (typeof FOOD_ROLES)[number];
export type BudgetTier = (typeof BUDGET_TIERS)[number];
export type PreparationComplexity = (typeof PREPARATION_COMPLEXITIES)[number];
export type DietaryTag = (typeof DIETARY_TAGS)[number];
export type AllergenTag = (typeof ALLERGEN_TAGS)[number];

export interface NutrientsPer100g {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

export type NutrientCompleteness = "COMPLETE" | "PARTIAL" | "INSUFFICIENT";

export interface NutritionFoodCatalogEntry {
  id: string;
  canonicalName: string;
  normalizedName: string;
  source: NutritionFoodSource;
  sourceFoodId: string;
  sourceVersion: string;
  sourceReference: string;
  foodGroup: string;
  preparationState: string;
  nutrientsPer100g: NutrientsPer100g;
  nutrientCompleteness: NutrientCompleteness;
  ediblePortion: number | null;
  densityGPerMl: number | null;
  dataQuality: NutritionDataQuality;
  catalogScope: FoodCatalogScope;
  dietaryTags: DietaryTag[];
  allergenTags: AllergenTag[];
  allergenDataComplete: boolean;
  foodRole: FoodRole | null;
  budgetTier: BudgetTier | null;
  preparationComplexity: PreparationComplexity | null;
  sourceMetadata: Record<string, unknown>;
  isActive: boolean;
}

export interface NutritionFoodAlias {
  id: string;
  foodId: string;
  alias: string;
  normalizedAlias: string;
  locale: string;
  source: NutritionFoodSource;
  confidence: "CURATED" | "SOURCE_PROVIDED";
}

export interface NutritionFoodPortion {
  id: string;
  foodId: string;
  label: string;
  grams: number;
  locale: string;
  source: NutritionFoodSource;
  sourceReference: string;
}

export const FOOD_COVERAGE_CATEGORIES = [
  "cereals", "legumes", "meats", "poultry", "fish", "eggs", "dairy",
  "fruits", "vegetables", "roots_tubers", "breads", "pasta", "oils_fats",
  "nuts_seeds", "vegetarian_staples",
] as const;

export type FoodCoverageCategory = (typeof FOOD_COVERAGE_CATEGORIES)[number];

export const MEAL_PLAN_GENERATION_AVAILABLE = false as const;
