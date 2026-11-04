import type { MealPlanFoodPool } from "../domain";
import type { MealRole, SupportedNutritionGoal } from "../../meal-plan/domain";
import type { MealIntent, MealStyle, ProteinFamily, StapleFamily } from "../daily-blueprint/domain";

export const REAL_MEAL_TEMPLATE_VERSION = "praxe-real-meal-templates-v1" as const;
export const REAL_MEAL_TEMPLATE_VALIDATOR_VERSION = "praxe-real-meal-template-validator-v1" as const;

export type RealMealCulture = "BRAZILIAN";
export type RealMealType = "BREAKFAST" | "MAIN_MEAL" | "SNACK" | "PRE_WORKOUT_MEAL"
  | "PRE_WORKOUT_SNACK" | "POST_WORKOUT_MEAL" | "POST_WORKOUT_SNACK" | "EVENING_MEAL";

export interface RealMealComponentDefinition {
  id: string;
  slot: MealPlanFoodPool;
  required: boolean;
  allowedSourceFoodIds: string[];
  minimumGrams: number;
  maximumGrams: number;
  presentationGroup: string;
  preparationNote?: string;
}

export interface RealMealTemplateVariant {
  id: string;
  displayName: string;
  componentSourceFoodIds: Record<string, string[]>;
  energyProfile: "LIGHT" | "STANDARD" | "SCALABLE";
}

export interface RealMealTemplate {
  id: string;
  version: typeof REAL_MEAL_TEMPLATE_VERSION;
  displayName: string;
  culture: RealMealCulture;
  mealType: RealMealType;
  familyId: string;
  mealStyle: MealStyle;
  allowedIntents: MealIntent[];
  stapleFamily: StapleFamily;
  proteinFamily: ProteinFamily;
  mealRoles: MealRole[];
  components: RealMealComponentDefinition[];
  variants: RealMealTemplateVariant[];
  goalCompatibility: SupportedNutritionGoal[];
  maximumOptionalComponents: number;
  preparationDescription: string;
  pairingRules: string[];
  portionRules: string[];
}

export interface RealMealTemplateComponentOption {
  componentId: string;
  slot: MealPlanFoodPool;
  required: boolean;
  catalogEntryIds: string[];
  minimumGrams: number;
  maximumGrams: number;
  presentationGroup: string;
  preparationNote?: string;
}

export interface RealMealTemplateOption {
  templateId: string;
  variantId: string;
  displayName: string;
  mealType: RealMealType;
  familyId: string;
  mealStyle: MealStyle;
  stapleFamily: StapleFamily;
  proteinFamily: ProteinFamily;
  preparationDescription: string;
  energyProfile: RealMealTemplateVariant["energyProfile"];
  maximumOptionalComponents: number;
  components: RealMealTemplateComponentOption[];
}

export interface RealMealTemplateSlot {
  position: number;
  role: MealRole;
  intent: MealIntent;
  options: RealMealTemplateOption[];
}

export interface RealMealTemplateAvailability {
  templateId: string;
  variantId: string;
  feasible: boolean;
  reasons: string[];
}

export const REAL_MEAL_TEMPLATE_VALIDATION_CODES = [
  "VALID_TEMPLATE_ID",
  "REQUIRED_COMPONENTS_COMPLETE",
  "NO_DUPLICATE_COMPONENT_ASSIGNMENT",
  "FOOD_ALLOWED_FOR_COMPONENT",
  "PAIRING_VALID",
  "OPTIONAL_COMPONENT_ALLOWED",
  "MAX_OPTIONAL_COMPONENTS",
  "TEMPLATE_ROLE_MATCH",
  "TEMPLATE_GOAL_COMPATIBLE",
  "TEMPLATE_TIMING_COMPATIBLE",
  "COMPONENT_PORTION_RANGE",
] as const;

export type RealMealTemplateValidationCode = (typeof REAL_MEAL_TEMPLATE_VALIDATION_CODES)[number];

export interface RealMealTemplateIssue {
  code: RealMealTemplateValidationCode;
  message: string;
  mealPosition: number;
  itemPosition?: number;
}

export interface RealMealTemplateValidationReport {
  valid: boolean;
  validatorVersion: typeof REAL_MEAL_TEMPLATE_VALIDATOR_VERSION;
  issues: RealMealTemplateIssue[];
}
