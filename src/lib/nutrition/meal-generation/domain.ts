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
export const MEAL_PLAN_FOOD_POOLS = [
  "PROTEIN_ANCHOR",
  "CARB_ANCHOR",
  "FAT_ANCHOR",
  "PRODUCE_FIBER",
] as const;
export type MealPlanFoodPool = (typeof MEAL_PLAN_FOOD_POOLS)[number];

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
  catalogEntryId: string;
  slot: MealPlanFoodPool;
  quantityGrams: number;
  preparationNote?: string;
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
    catalogEntryIdSelectionOnly: true;
    supportedQuantityUnit: "g";
    restrictionMetadataComplete: boolean;
    dietaryPatternMetadataComplete: boolean;
  };
  candidates: MealPlanCatalogCandidate[];
  mealSlots: MealPlanMealSlotPrescription[];
}

export interface MealPlanMealSlotPrescription {
  position: number;
  role: MealRole;
  slots: Array<{
    pool: MealPlanFoodPool;
    required: boolean;
    catalogEntryIds: string[];
  }>;
}

export interface MealPlanCatalogCandidate {
  catalogEntryId: string;
  canonicalName: string;
  source: "TACO";
  sourceFoodId: string;
  sourceVersion: string;
  preparationState: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  pools: MealPlanFoodPool[];
}

export interface ResolvedMealPlanItem {
  food: NutritionFoodCatalogEntry;
  foodQuery: string;
  displayName: string;
  quantityValue: number;
  quantityUnit: FoodQuantityUnit;
  quantityGrams: number;
  preparationNote: string | null;
  resolution: "CATALOG_ENTRY_ID";
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
  "CATALOG_NOT_READY", "USER_NOT_ELIGIBLE", "UNKNOWN_CATALOG_ENTRY_ID", "UNKNOWN_FOOD", "AMBIGUOUS_FOOD", "INVALID_QUANTITY",
  "UNKNOWN_REQUIRED_NUTRIENT", "MEAL_COUNT_MISMATCH", "MEAL_ROLE_MISMATCH", "MEAL_WINDOW_CONFLICT", "FOOD_SLOT_MISMATCH",
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

export interface MealProteinDistributionIssue {
  mealPosition: number;
  targetProteinG: number;
  minimumProteinG: number;
  actualProteinG: number;
  proteinDelta: number;
}

export type PortionCalibrationStatus =
  | "CONVERGED"
  | "PORTION_CALIBRATION_NO_FEASIBLE_SOLUTION"
  | "INVALID_INPUT";

export interface MealPlanNutrientTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface MealPlanCalibrationFeedback {
  status: PortionCalibrationStatus;
  normalizedDeviations: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
  };
  directions: {
    calories: "below" | "within" | "above";
    proteinG: "below" | "within" | "above";
    carbsG: "below" | "within" | "above";
    fatG: "below" | "within" | "above";
    fiberG: "below" | "within" | "above";
  };
  existingCatalogEntryIds: string[];
  iterations: number;
  adjustedItemCount: number;
  violatedConstraints: string[];
  before: MealPlanNutrientTotals;
  after: MealPlanNutrientTotals;
}

export interface MealPlanNumericValidationDiagnostics {
  targetKcal: number;
  actualKcal: number;
  kcalDelta: number;
  kcalDeviationPercent: number;
  targetProteinG: number;
  actualProteinG: number;
  proteinDelta: number;
  targetCarbsG: number;
  actualCarbsG: number;
  carbsDelta: number;
  targetFatG: number;
  actualFatG: number;
  fatDelta: number;
  targetFiberG: number;
  actualFiberG: number;
  fiberDelta: number;
  mealProteinDistributionIssues: MealProteinDistributionIssue[];
  portionCalibration?: MealPlanCalibrationFeedback;
}

export interface MealPlanValidationReport {
  valid: boolean;
  validatorVersion: typeof MEAL_PLAN_VALIDATOR_VERSION;
  policyVersion: typeof MEAL_VALIDATION_POLICY_VERSION;
  issues: MealPlanValidationIssue[];
  plan: ResolvedMealPlan | null;
  preferenceScore: number;
  diagnostics: MealPlanNumericValidationDiagnostics | null;
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
