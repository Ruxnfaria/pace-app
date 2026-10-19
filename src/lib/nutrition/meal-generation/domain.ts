import type { AllergenTag, NutritionFoodCatalogEntry, NutritionFoodSource } from "../food-catalog/domain";
import type { CatalogReadinessLevel } from "../food-catalog/capabilities";
import type { FoodQuantityUnit } from "../food-catalog/quantity";
import type {
  AuthoritativeNutritionTarget,
  FoodPreparationStyle,
  MealBreakAvailability,
  MealMacroTarget,
  MealRole,
  MealWindow,
  RoutinePredictability,
  SupportedNutritionGoal,
  TrainingPeriod,
} from "../meal-plan/domain";

export const MEAL_PLAN_GENERATOR_VERSION = "praxe-meal-plan-generator-v1" as const;
export const MEAL_PLAN_VALIDATOR_VERSION = "praxe-meal-plan-validator-v1" as const;
export const MEAL_VALIDATION_POLICY_VERSION = "praxe-meal-validation-policy-v1" as const;

export interface MealPlanGenerationContext {
  userId: string;
  targetSnapshotId: string;
  goal: SupportedNutritionGoal;
  target: AuthoritativeNutritionTarget;
  strategyVersion: string;
  mealDistributionVersion: string;
  mealCount: number;
  mealRoles: MealRole[];
  mealWindows: MealWindow[];
  mealMacroTargets: MealMacroTarget[];
  catalogReadiness: CatalogReadinessLevel;
  dietaryPattern: "omnivore" | "vegetarian" | "vegan" | "pescatarian" | "other" | "unknown";
  allergenRestrictions: AllergenTag[];
  hasFoodRestriction: boolean;
  restrictionSafetyKnown: boolean;
  preferredFoods: string[];
  dislikedFoods: string[];
  preparationStyle: FoodPreparationStyle;
  budget: "economic" | "balanced" | "varied" | "unknown";
  routinePredictability: RoutinePredictability;
  mealBreakAvailability: MealBreakAvailability;
  trainingPeriod: TrainingPeriod;
  supplements: string[];
}

export interface AiMealPlanItemCandidate {
  foodQuery: string;
  quantityValue: number;
  quantityUnit: FoodQuantityUnit;
  preparationNote?: string;
  catalogHint?: string;
}

export interface AiMealCandidate {
  role: MealRole;
  label: string;
  items: AiMealPlanItemCandidate[];
}

export interface AiMealPlanCandidate {
  meals: AiMealCandidate[];
}

export interface MealPlanCatalogPromptContext {
  readiness: CatalogReadinessLevel;
  authority: {
    source: "TACO";
    sourceVersion: string;
    catalogVersion: string;
  };
  capabilities: {
    exactOrAliasResolutionOnly: true;
    supportedQuantityUnits: FoodQuantityUnit[];
    restrictionMetadataComplete: boolean;
    dietaryPatternMetadataComplete: boolean;
  };
  allowedCatalogNames: string[];
}

export interface ResolvedMealPlanItem {
  food: NutritionFoodCatalogEntry;
  foodQuery: string;
  displayName: string;
  quantityValue: number;
  quantityUnit: FoodQuantityUnit;
  quantityGrams: number;
  preparationNote: string | null;
  resolution: "EXACT_MATCH" | "ALIAS_MATCH";
  nutrients: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number };
}

export interface ResolvedMeal {
  position: number;
  role: MealRole;
  label: string;
  window: MealWindow;
  target: MealMacroTarget;
  items: ResolvedMealPlanItem[];
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number };
}

export interface ResolvedMealPlan {
  generatorVersion: typeof MEAL_PLAN_GENERATOR_VERSION;
  validatorVersion: typeof MEAL_PLAN_VALIDATOR_VERSION;
  validationPolicyVersion: typeof MEAL_VALIDATION_POLICY_VERSION;
  targetSnapshotId: string;
  strategyVersion: string;
  mealDistributionVersion: string;
  meals: ResolvedMeal[];
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number };
}

export const MEAL_PLAN_VALIDATION_CODES = [
  "CATALOG_NOT_READY", "USER_NOT_ELIGIBLE", "UNKNOWN_FOOD", "AMBIGUOUS_FOOD", "INVALID_QUANTITY",
  "UNKNOWN_REQUIRED_NUTRIENT", "MEAL_COUNT_MISMATCH", "MEAL_ROLE_MISMATCH", "MEAL_WINDOW_CONFLICT",
  "DIETARY_PATTERN_UNVERIFIED", "ALLERGEN_SAFETY_UNVERIFIED", "RESTRICTION_VIOLATION",
  "DISLIKED_FOOD_VIOLATION", "CALORIES_OUT_OF_RANGE", "PROTEIN_OUT_OF_RANGE", "CARBS_OUT_OF_RANGE",
  "FAT_OUT_OF_RANGE", "FIBER_TOO_LOW", "EMPTY_MEAL", "IMPOSSIBLE_PORTION", "DUPLICATE_MEAL_STRUCTURE",
  "INVALID_TOTALS", "ENERGY_CONCENTRATION", "PROTEIN_DISTRIBUTION", "TRAINING_CARB_DISTRIBUTION",
  "FAT_DOMINATED_PLAN", "LOW_FOOD_VARIETY", "BUDGET_METADATA_UNAVAILABLE", "PREPARATION_METADATA_UNAVAILABLE",
] as const;
export type MealPlanValidationCode = (typeof MEAL_PLAN_VALIDATION_CODES)[number];
export type MealPlanValidationSeverity = "HARD_FAILURE" | "WARNING" | "INFO";

export interface MealPlanValidationIssue {
  code: MealPlanValidationCode;
  severity: MealPlanValidationSeverity;
  message: string;
  mealPosition?: number;
  itemPosition?: number;
}

export interface MealPlanValidationReport {
  valid: boolean;
  validatorVersion: typeof MEAL_PLAN_VALIDATOR_VERSION;
  policyVersion: typeof MEAL_VALIDATION_POLICY_VERSION;
  issues: MealPlanValidationIssue[];
  plan: ResolvedMealPlan | null;
  preferenceScore: number;
}

export interface CatalogSnapshot {
  entries: NutritionFoodCatalogEntry[];
  aliases: import("../food-catalog/domain").NutritionFoodAlias[];
  portions: import("../food-catalog/domain").NutritionFoodPortion[];
  readiness: CatalogReadinessLevel;
}

export interface PersistedMealItemSnapshot {
  foodCatalogEntryId: string;
  catalogSource: NutritionFoodSource;
  catalogSourceVersion: string;
  quantityGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  displayFoodName: string;
}
