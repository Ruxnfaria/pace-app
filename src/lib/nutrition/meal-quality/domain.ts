import type { MealRole } from "../meal-plan/domain";

export const MEAL_COHERENCE_VALIDATOR_VERSION = "praxe-meal-coherence-validator-v1" as const;

export const FOOD_FORMS = [
  "WHOLE_FOOD", "COOKED_COMPONENT", "PREPARED_COMPOSITE", "READY_TO_EAT_FOOD", "CULINARY_INGREDIENT",
  "CONDIMENT", "BEVERAGE", "SWEET", "POWDER_OR_MIX", "SPORTS_FUEL", "UNKNOWN",
] as const;
export type FoodForm = (typeof FOOD_FORMS)[number];

export const FOOD_QUALITY_CLASSES = [
  "CORE", "SUPPORTING", "OCCASIONAL", "INGREDIENT_ONLY", "EXCLUDE_FROM_AUTOGENERATION",
] as const;
export type FoodQualityClass = (typeof FOOD_QUALITY_CLASSES)[number];

export const CULINARY_ROLES = [
  "LEAN_PROTEIN", "PROTEIN", "STARCH", "LEGUME", "FRUIT", "VEGETABLE", "DAIRY",
  "WHOLE_GRAIN", "FAT", "CULINARY_FAT", "SWEETENER", "BEVERAGE", "CONDIMENT", "OTHER",
] as const;
export type CulinaryRole = (typeof CULINARY_ROLES)[number];

export type MealFuelLevel = "LOW" | "MODERATE" | "HIGH";
export type NutritionQualityGoal =
  | "fat_loss" | "body_recomposition" | "hypertrophy" | "strength" | "conditioning" | "health";

export interface StableFoodIdentity {
  source: "TACO";
  sourceVersion: string;
  sourceFoodId: string;
}

export interface FoodSuitabilityProfile {
  identity: StableFoodIdentity;
  form: FoodForm;
  qualityClass: FoodQualityClass;
  culinaryRoles: CulinaryRole[];
  preparedState: "PREPARED" | "RAW_READY" | "REQUIRES_PREPARATION" | "AS_DESCRIBED";
  suitableMealRoles: MealRole[];
  trainingSuitability: "SUITABLE" | "LIMITED" | "UNSUITABLE";
  standaloneSuitability: "SUITABLE" | "WITH_MEAL_ONLY" | "NOT_STANDALONE";
  autoGenerationApproved: boolean;
  specialPortionGuard: "HIGH_MICRONUTRIENT_DENSITY" | null;
  rationaleCodes: string[];
}

export interface MealArchetype {
  id: string;
  role: MealRole;
  label: string;
  requiredRoles: CulinaryRole[][];
  optionalRoles: CulinaryRole[][];
  maximumItems: number;
}

export const MEAL_COHERENCE_CODES = [
  "CULINARY_INGREDIENT_STANDALONE", "SWEET_AS_PRIMARY_CARB", "POWDER_AS_MEAL_COMPONENT",
  "BREAKFAST_ROLE_MISMATCH", "MEAL_ARCHETYPE_INVALID", "MAIN_MEAL_MISSING_PRODUCE",
  "PRE_WORKOUT_TOO_FAT_DENSE", "FOOD_PORTION_IMPLAUSIBLE", "FOOD_NOT_AUTOGENERATION_APPROVED",
  "SUPPORTING_ITEM_DOMINATES_MEAL", "COMPOSITE_DISH_SLOT_CONFLICT", "MEAL_REQUIRED_SLOT_MISSING",
  "FRUIT_PORTION_IMPLAUSIBLE", "PRODUCE_USED_AS_MACRO_COMPENSATOR", "PROTEIN_ANCHOR_TOO_SMALL",
  "ADDED_FAT_PORTION_IMPLAUSIBLE", "MEAL_PROTEIN_DISTRIBUTION_IMBALANCED", "PORTION_PROFILE_MISSING",
  "EXCESSIVE_REPETITION", "LOW_DAILY_VARIETY", "PROTEIN_SOURCE_REPETITION",
] as const;
export type MealCoherenceCode = (typeof MEAL_COHERENCE_CODES)[number];
export type MealCoherenceSeverity = "HARD_FAILURE" | "WARNING";

export interface MealCoherenceIssue {
  code: MealCoherenceCode;
  severity: MealCoherenceSeverity;
  message: string;
  mealPosition?: number;
  itemPosition?: number;
}

export interface MealCoherenceReport {
  valid: boolean;
  validatorVersion: typeof MEAL_COHERENCE_VALIDATOR_VERSION;
  issues: MealCoherenceIssue[];
}

export interface FoodPortionProfile {
  minimumGrams: number;
  typicalMinimumGrams: number;
  typicalMaximumGrams: number;
  maximumAutogenerationGrams: number;
  incrementGrams: number;
  quantityMode: "DISCRETE_GRAM_EQUIVALENT" | "CONTINUOUS";
  householdUnitCapability: "CATALOG_REQUIRED" | "GRAMS_ONLY";
  refinementPriority: "PRIMARY" | "SECONDARY" | "LOCKED";
  rationale: string;
}

export interface PortionRealismReport {
  valid: boolean;
  issues: MealCoherenceIssue[];
}

export interface PortionProfileAudit {
  total: number;
  classified: number;
  unclassified: number;
  coveragePercent: number;
}

export interface FoodSuitabilityAudit {
  total: number;
  autoGenerationEligible: number;
  byQualityClass: Record<FoodQualityClass, number>;
  byForm: Record<FoodForm, number>;
  examples: Partial<Record<FoodQualityClass, string[]>>;
}
