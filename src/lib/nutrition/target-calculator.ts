export const NUTRITION_TARGET_ALGORITHM_VERSION = 'praxe-nutrition-target-msj-v1' as const;

export const NUTRITION_ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
} as const;

export const NUTRITION_GOAL_ADJUSTMENTS = {
  fat_loss: 0.85,
  body_recomposition: 0.95,
  hypertrophy: 1.08,
  strength: 1.05,
  conditioning: 1,
  health: 1,
} as const;

export const NUTRITION_PROTEIN_GRAMS_PER_KG = {
  fat_loss: 1.8,
  body_recomposition: 1.8,
  hypertrophy: 1.6,
  strength: 1.6,
  conditioning: 1.4,
  health: 1.2,
} as const;

export const NUTRITION_TARGET_AUTO_DOMAIN = {
  minimumAgeYears: 18,
  maximumAgeYears: 100,
  minimumWeightKg: 30,
  maximumWeightKg: 300,
  minimumHeightCm: 120,
  maximumHeightCm: 230,
  minimumTargetCalories: 1200,
  maximumTargetCalories: 5000,
} as const;

export type NutritionActivityLevel = keyof typeof NUTRITION_ACTIVITY_MULTIPLIERS;
export type NutritionGoal = keyof typeof NUTRITION_GOAL_ADJUSTMENTS;
export type MetabolicSexBasis = 'male' | 'female';

export type NutritionTargetReviewReason =
  | 'invalid_effective_date'
  | 'invalid_birth_date'
  | 'under_18'
  | 'age_outside_auto_domain'
  | 'pregnancy'
  | 'lactation'
  | 'pregnancy_status_unknown'
  | 'lactation_status_unknown'
  | 'clinical_review_required'
  | 'invalid_weight'
  | 'weight_outside_auto_domain'
  | 'invalid_height'
  | 'height_outside_auto_domain'
  | 'undefined_metabolic_sex'
  | 'missing_activity_level'
  | 'unsupported_goal'
  | 'target_calories_outside_auto_domain'
  | 'negative_carbohydrate_budget';

export interface NutritionTargetInput {
  effectiveDate: string;
  birthDate: string | null | undefined;
  weightKg: number | null | undefined;
  heightCm: number | null | undefined;
  biologicalSex: string | null | undefined;
  activityLevel: string | null | undefined;
  goal: string | null | undefined;
  pregnant?: boolean | null;
  lactating?: boolean | null;
  requiresClinicalReview?: boolean;
}

export interface NutritionTargetCalculation {
  algorithmVersion: typeof NUTRITION_TARGET_ALGORITHM_VERSION;
  status: 'active' | 'requires_review';
  reasons: NutritionTargetReviewReason[];
  effectiveDate: string;
  ageYears: number | null;
  weightKg: number | null;
  heightCm: number | null;
  biologicalSexBasis: MetabolicSexBasis | null;
  activityLevel: NutritionActivityLevel | null;
  activityMultiplier: number | null;
  goal: NutritionGoal | null;
  goalAdjustment: number | null;
  bmr: number | null;
  tdee: number | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  macroCalories: number | null;
  macroCalorieDelta: number | null;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function parseCalendarDate(value: string | null | undefined): CalendarDate | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function ageOnDate(birthDate: CalendarDate, effectiveDate: CalendarDate): number {
  let age = effectiveDate.year - birthDate.year;
  if (
    effectiveDate.month < birthDate.month ||
    (effectiveDate.month === birthDate.month && effectiveDate.day < birthDate.day)
  ) {
    age -= 1;
  }
  return age;
}

function roundTo(value: number, increment: number): number {
  return Number((Math.round((value + Number.EPSILON) / increment) * increment).toFixed(6));
}

export function mapNutritionGoal(value: unknown): NutritionGoal | null {
  return typeof value === 'string' && value in NUTRITION_GOAL_ADJUSTMENTS
    ? (value as NutritionGoal)
    : null;
}

export function mapMetabolicSexBasis(value: unknown): MetabolicSexBasis | null {
  return value === 'male' || value === 'female' ? value : null;
}

function mapActivityLevel(value: unknown): NutritionActivityLevel | null {
  return typeof value === 'string' && value in NUTRITION_ACTIVITY_MULTIPLIERS
    ? (value as NutritionActivityLevel)
    : null;
}

function emptyCalculation(
  input: NutritionTargetInput,
  reasons: NutritionTargetReviewReason[],
  ageYears: number | null,
  sexBasis: MetabolicSexBasis | null,
  activityLevel: NutritionActivityLevel | null,
  goal: NutritionGoal | null,
): NutritionTargetCalculation {
  return {
    algorithmVersion: NUTRITION_TARGET_ALGORITHM_VERSION,
    status: 'requires_review',
    reasons,
    effectiveDate: input.effectiveDate,
    ageYears,
    weightKg: typeof input.weightKg === 'number' && Number.isFinite(input.weightKg) ? input.weightKg : null,
    heightCm: typeof input.heightCm === 'number' && Number.isFinite(input.heightCm) ? input.heightCm : null,
    biologicalSexBasis: sexBasis,
    activityLevel,
    activityMultiplier: activityLevel ? NUTRITION_ACTIVITY_MULTIPLIERS[activityLevel] : null,
    goal,
    goalAdjustment: goal ? NUTRITION_GOAL_ADJUSTMENTS[goal] : null,
    bmr: null,
    tdee: null,
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    macroCalories: null,
    macroCalorieDelta: null,
  };
}

/**
 * Deterministic adult target calculation. The auto-domain thresholds are
 * review gates, not clinical safety limits: values are never silently clamped.
 */
export function calculateNutritionTarget(
  input: NutritionTargetInput,
): NutritionTargetCalculation {
  const reasons: NutritionTargetReviewReason[] = [];
  const effectiveDate = parseCalendarDate(input.effectiveDate);
  const birthDate = parseCalendarDate(input.birthDate);
  const ageYears = effectiveDate && birthDate ? ageOnDate(birthDate, effectiveDate) : null;
  const sexBasis = mapMetabolicSexBasis(input.biologicalSex);
  const activityLevel = mapActivityLevel(input.activityLevel);
  const goal = mapNutritionGoal(input.goal);

  if (!effectiveDate) reasons.push('invalid_effective_date');
  if (!birthDate || (ageYears !== null && ageYears < 0)) reasons.push('invalid_birth_date');
  if (ageYears !== null && ageYears < NUTRITION_TARGET_AUTO_DOMAIN.minimumAgeYears) {
    reasons.push('under_18');
  } else if (ageYears !== null && ageYears > NUTRITION_TARGET_AUTO_DOMAIN.maximumAgeYears) {
    reasons.push('age_outside_auto_domain');
  }

  if (input.pregnant === true) reasons.push('pregnancy');
  if (input.lactating === true) reasons.push('lactation');
  if (sexBasis === 'female' && input.pregnant == null) reasons.push('pregnancy_status_unknown');
  if (sexBasis === 'female' && input.lactating == null) reasons.push('lactation_status_unknown');
  if (input.requiresClinicalReview === true) reasons.push('clinical_review_required');

  if (typeof input.weightKg !== 'number' || !Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    reasons.push('invalid_weight');
  } else if (
    input.weightKg < NUTRITION_TARGET_AUTO_DOMAIN.minimumWeightKg ||
    input.weightKg > NUTRITION_TARGET_AUTO_DOMAIN.maximumWeightKg
  ) {
    reasons.push('weight_outside_auto_domain');
  }

  if (typeof input.heightCm !== 'number' || !Number.isFinite(input.heightCm) || input.heightCm <= 0) {
    reasons.push('invalid_height');
  } else if (
    input.heightCm < NUTRITION_TARGET_AUTO_DOMAIN.minimumHeightCm ||
    input.heightCm > NUTRITION_TARGET_AUTO_DOMAIN.maximumHeightCm
  ) {
    reasons.push('height_outside_auto_domain');
  }

  if (!sexBasis) reasons.push('undefined_metabolic_sex');
  if (!activityLevel) reasons.push('missing_activity_level');
  if (!goal) reasons.push('unsupported_goal');

  if (
    reasons.length > 0 ||
    ageYears === null ||
    !sexBasis ||
    !activityLevel ||
    !goal ||
    typeof input.weightKg !== 'number' ||
    typeof input.heightCm !== 'number'
  ) {
    return emptyCalculation(input, reasons, ageYears, sexBasis, activityLevel, goal);
  }

  const sexOffset = sexBasis === 'male' ? 5 : -161;
  const bmr = 10 * input.weightKg + 6.25 * input.heightCm - 5 * ageYears + sexOffset;
  const activityMultiplier = NUTRITION_ACTIVITY_MULTIPLIERS[activityLevel];
  const goalAdjustment = NUTRITION_GOAL_ADJUSTMENTS[goal];
  const tdee = bmr * activityMultiplier;
  const rawTargetCalories = tdee * goalAdjustment;
  const calories = roundTo(rawTargetCalories, 10);

  const proteinG = Math.round(input.weightKg * NUTRITION_PROTEIN_GRAMS_PER_KG[goal]);
  const minimumFatG = Math.max(calories * 0.25 / 9, input.weightKg * 0.6);
  const maximumFatG = calories * 0.35 / 9;
  const fatG = Math.min(Math.round(minimumFatG), Math.floor(maximumFatG));
  const rawCarbsG = (calories - proteinG * 4 - fatG * 9) / 4;

  if (
    rawTargetCalories < NUTRITION_TARGET_AUTO_DOMAIN.minimumTargetCalories ||
    rawTargetCalories > NUTRITION_TARGET_AUTO_DOMAIN.maximumTargetCalories
  ) {
    reasons.push('target_calories_outside_auto_domain');
  }
  if (rawCarbsG < 0) reasons.push('negative_carbohydrate_budget');

  const carbsG = rawCarbsG < 0 ? null : roundTo(rawCarbsG, 0.25);
  const fiberG = Math.round(calories / 1000 * 14);
  const macroCalories = carbsG === null ? null : proteinG * 4 + fatG * 9 + carbsG * 4;

  return {
    algorithmVersion: NUTRITION_TARGET_ALGORITHM_VERSION,
    status: reasons.length === 0 ? 'active' : 'requires_review',
    reasons,
    effectiveDate: input.effectiveDate,
    ageYears,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    biologicalSexBasis: sexBasis,
    activityLevel,
    activityMultiplier,
    goal,
    goalAdjustment,
    bmr: roundTo(bmr, 0.01),
    tdee: roundTo(tdee, 0.01),
    calories,
    proteinG,
    carbsG,
    fatG,
    fiberG,
    macroCalories,
    macroCalorieDelta: macroCalories === null ? null : roundTo(calories - macroCalories, 0.01),
  };
}
