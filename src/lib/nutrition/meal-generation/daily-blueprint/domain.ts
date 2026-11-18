import type { MealDisplayType, MealRole, TrainingPeriod, TrainingRelation } from "../../meal-plan/domain";

export const DAILY_MEAL_BLUEPRINT_VERSION = "praxe-daily-meal-blueprint-v1" as const;

export const MEAL_INTENTS = [
  "BREAKFAST", "MAIN_MEAL", "LIGHT_MEAL", "SNACK", "PRE_WORKOUT_SNACK", "PRE_WORKOUT_MEAL",
  "POST_WORKOUT_MAIN", "POST_WORKOUT_SNACK", "EVENING_MAIN", "EVENING_SNACK",
] as const;
export type MealIntent = (typeof MEAL_INTENTS)[number];
export type MealStyle = "BREAKFAST" | "MAIN" | "SNACK";
export type StapleFamily = "BREAD" | "RICE" | "OATS" | "CORN" | "TUBER" | "PASTA" | "OTHER";
export type ProteinFamily = "EGGS" | "DAIRY" | "POULTRY" | "BEEF" | "FISH" | "MIXED" | "OTHER";

export interface DailyMealIntent {
  position: number;
  role: MealRole;
  intent: MealIntent;
  mealDisplayType: MealDisplayType;
  trainingRelation: TrainingRelation;
  rationale: string[];
}

export interface DailyMealBlueprint {
  id: string;
  version: typeof DAILY_MEAL_BLUEPRINT_VERSION;
  mealCount: number;
  trainingPeriod: TrainingPeriod;
  mealIntents: DailyMealIntent[];
  minimumMainMeals: number;
  maximumSnackMeals: number;
  minimumStapleFamilies: number;
  maximumTemplateFamilyOccurrences: number;
}

export const DAILY_BLUEPRINT_ISSUE_CODES = [
  "DAILY_MAIN_MEAL_MISSING", "TOO_MANY_SNACK_STYLE_MEALS", "MEAL_INTENT_TEMPLATE_MISMATCH",
  "EXCESSIVE_TEMPLATE_FAMILY_REPETITION", "LOW_STAPLE_DIVERSITY", "POST_WORKOUT_MAIN_EXPECTED",
  "EVENING_SNACK_EXPECTED", "MAIN_MEAL_DISTRIBUTION_INVALID",
] as const;
export type DailyBlueprintIssueCode = (typeof DAILY_BLUEPRINT_ISSUE_CODES)[number];

export interface DailyBlueprintIssue {
  code: DailyBlueprintIssueCode;
  severity: "HARD_FAILURE" | "WARNING";
  message: string;
  mealPosition?: number;
}

export interface DailyBlueprintValidationReport {
  valid: boolean;
  blueprint: DailyMealBlueprint;
  mainMealCount: number;
  snackStyleMealCount: number;
  templateFamilyCount: number;
  stapleFamilyCount: number;
  proteinFamilyCount: number;
  issues: DailyBlueprintIssue[];
}
