export type FitnessContextSource = "v1" | "v2";

export type FitnessContextErrorCode =
  | "PROFILE_NOT_FOUND"
  | "READ_FAILED"
  | "V2_INCOMPLETE";

export class FitnessContextError extends Error {
  readonly code: FitnessContextErrorCode;
  readonly missingDomains: readonly string[];

  constructor(
    code: FitnessContextErrorCode,
    message: string,
    missingDomains: readonly string[] = []
  ) {
    super(message);
    this.name = "FitnessContextError";
    this.code = code;
    this.missingDomains = missingDomains;
  }
}

export type TrainingActivity = {
  activityCode: string;
  otherActivityLabel: string | null;
  scheduleType: string;
  availableWeekdays: number[] | null;
  sessionsPerWeek: number | null;
};

export type NutritionRestriction = {
  restrictionType: string;
  restrictionCode: string | null;
  declaredLabel: string;
};

export type DeclaredFood = {
  foodCode: string | null;
  declaredLabel: string;
};

export type Supplement = {
  supplementCode: string | null;
  declaredLabel: string;
};

export type UserFitnessContext = {
  source: FitnessContextSource;
  onboardingVersion: number | null;
  identity: {
    name: string | null;
  };
  health: {
    primaryGoal: string | null;
    birthDate: string | null;
    age: number | null;
    biologicalSex: string | null;
    heightCm: number | null;
    weightKg: number | null;
    targetWeightKg: number | null;
  };
  training: {
    primaryGoal: string | null;
    trainingExperience: string | null;
    exerciseConfidence: string | null;
    recentTrainingBreak: string | null;
    initialTrainingLevel: string | null;
    trainingDaysPerWeek: number | null;
    availableWeekdays: number[] | null;
    sessionDurationMin: number | null;
    sessionDurationIsPlus: boolean | null;
    trainingLocation: string | null;
    otherLocationLabel: string | null;
    availableEquipment: string[] | null;
    otherEquipmentLabel: string | null;
    painOrLimitation: boolean | null;
    affectedBodyAreas: string[] | null;
    priorityMuscles: string[] | null;
    activities: TrainingActivity[] | null;
  };
  nutrition: {
    mealsPerDay: number | null;
    mealScheduleFlexibility: string | null;
    foodPreparationStyle: string | null;
    foodBudgetStyle: string | null;
    dietaryPattern: string | null;
    dietaryPatternOtherLabel: string | null;
    hasFoodRestrictions: boolean | null;
    usesSupplements: boolean | null;
    acceptsEggs: boolean | null;
    acceptsDairy: boolean | null;
    restrictions: NutritionRestriction[] | null;
    dislikedFoods: DeclaredFood[] | null;
    preferredFoods: DeclaredFood[] | null;
    supplements: Supplement[] | null;
  };
};

export type LegacyProfileRow = {
  nome: string | null;
  onboarding_version: number | null;
  objetivo: string | null;
  nivel_experiencia: string | null;
  dias_treino: number | null;
  idade: number | null;
  sexo: string | null;
  peso: number | null;
  altura: number | null;
};

export type V2HealthRow = {
  birth_date: string;
  biological_sex: string;
  height_cm: number;
  weight_kg: number;
  target_weight_kg: number | null;
  primary_goal: string;
};

export type V2TrainingRow = {
  primary_goal: string;
  priority_muscles: string[];
  training_experience: string;
  exercise_confidence: string;
  recent_training_break: string | null;
  initial_training_level: string;
  training_days_per_week: number;
  available_weekdays: number[];
  session_duration_min: number;
  session_duration_is_plus: boolean;
  training_location: string;
  other_location_label: string | null;
  available_equipment: string[];
  other_equipment_label: string | null;
  pain_or_limitation: boolean;
  affected_body_areas: string[];
};

export type V2NutritionRow = {
  meals_per_day: number | null;
  meal_schedule_flexibility: string | null;
  food_preparation_style: string;
  food_budget_style: string;
  dietary_pattern: string;
  dietary_pattern_other_label: string | null;
  has_food_restrictions: boolean;
  uses_supplements: boolean;
  accepts_eggs: boolean | null;
  accepts_dairy: boolean | null;
};

export type V2ContextRows = {
  health: V2HealthRow | null;
  training: V2TrainingRow | null;
  nutrition: V2NutritionRow | null;
  activities?: Array<{
    activity_code: string;
    other_activity_label: string | null;
    schedule_type: string;
    available_weekdays: number[] | null;
    sessions_per_week: number | null;
  }>;
  restrictions?: Array<{
    restriction_type: string;
    restriction_code: string | null;
    declared_label: string;
  }>;
  dislikedFoods?: Array<{ food_code: string | null; declared_label: string }>;
  preferredFoods?: Array<{ food_code: string | null; declared_label: string }>;
  supplements?: Array<{
    supplement_code: string | null;
    declared_label: string;
  }>;
};

function finiteNumber(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function calculateAge(birthDate: string, today = new Date()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) {
    throw new FitnessContextError(
      "V2_INCOMPLETE",
      "O perfil V2 contém uma data de nascimento inválida.",
      ["health.birth_date"]
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  let age = today.getUTCFullYear() - year;
  const birthdayHasPassed =
    today.getUTCMonth() + 1 > month ||
    (today.getUTCMonth() + 1 === month && today.getUTCDate() >= day);

  if (!birthdayHasPassed) age -= 1;
  return age;
}

export function buildLegacyFitnessContext(
  profile: LegacyProfileRow
): UserFitnessContext {
  return {
    source: "v1",
    onboardingVersion: profile.onboarding_version,
    identity: { name: profile.nome },
    health: {
      primaryGoal: profile.objetivo,
      birthDate: null,
      age: finiteNumber(profile.idade),
      biologicalSex: profile.sexo,
      heightCm: finiteNumber(profile.altura),
      weightKg: finiteNumber(profile.peso),
      targetWeightKg: null,
    },
    training: {
      primaryGoal: profile.objetivo,
      trainingExperience: profile.nivel_experiencia,
      exerciseConfidence: null,
      recentTrainingBreak: null,
      initialTrainingLevel: null,
      trainingDaysPerWeek: finiteNumber(profile.dias_treino),
      availableWeekdays: null,
      sessionDurationMin: null,
      sessionDurationIsPlus: null,
      trainingLocation: null,
      otherLocationLabel: null,
      availableEquipment: null,
      otherEquipmentLabel: null,
      painOrLimitation: null,
      affectedBodyAreas: null,
      priorityMuscles: null,
      activities: null,
    },
    nutrition: {
      mealsPerDay: null,
      mealScheduleFlexibility: null,
      foodPreparationStyle: null,
      foodBudgetStyle: null,
      dietaryPattern: null,
      dietaryPatternOtherLabel: null,
      hasFoodRestrictions: null,
      usesSupplements: null,
      acceptsEggs: null,
      acceptsDairy: null,
      restrictions: null,
      dislikedFoods: null,
      preferredFoods: null,
      supplements: null,
    },
  };
}

export function buildV2FitnessContext(
  profile: LegacyProfileRow,
  rows: V2ContextRows,
  today?: Date
): UserFitnessContext {
  const missingDomains = [
    !rows.health && "health",
    !rows.training && "training",
    !rows.nutrition && "nutrition",
  ].filter((value): value is string => Boolean(value));

  if (missingDomains.length > 0) {
    throw new FitnessContextError(
      "V2_INCOMPLETE",
      `Perfil V2 inconsistente: dados obrigatórios ausentes (${missingDomains.join(", ")}).`,
      missingDomains
    );
  }

  const health = rows.health!;
  const training = rows.training!;
  const nutrition = rows.nutrition!;

  return {
    source: "v2",
    onboardingVersion: 2,
    identity: { name: profile.nome },
    health: {
      primaryGoal: health.primary_goal,
      birthDate: health.birth_date,
      age: calculateAge(health.birth_date, today),
      biologicalSex: health.biological_sex,
      heightCm: finiteNumber(Number(health.height_cm)),
      weightKg: finiteNumber(Number(health.weight_kg)),
      targetWeightKg:
        health.target_weight_kg === null
          ? null
          : finiteNumber(Number(health.target_weight_kg)),
    },
    training: {
      primaryGoal: training.primary_goal,
      trainingExperience: training.training_experience,
      exerciseConfidence: training.exercise_confidence,
      recentTrainingBreak: training.recent_training_break,
      initialTrainingLevel: training.initial_training_level,
      trainingDaysPerWeek: finiteNumber(Number(training.training_days_per_week)),
      availableWeekdays: training.available_weekdays,
      sessionDurationMin: finiteNumber(Number(training.session_duration_min)),
      sessionDurationIsPlus: training.session_duration_is_plus,
      trainingLocation: training.training_location,
      otherLocationLabel: training.other_location_label,
      availableEquipment: training.available_equipment,
      otherEquipmentLabel: training.other_equipment_label,
      painOrLimitation: training.pain_or_limitation,
      affectedBodyAreas: training.affected_body_areas,
      priorityMuscles: training.priority_muscles,
      activities: (rows.activities ?? []).map((activity) => ({
        activityCode: activity.activity_code,
        otherActivityLabel: activity.other_activity_label,
        scheduleType: activity.schedule_type,
        availableWeekdays: activity.available_weekdays,
        sessionsPerWeek: activity.sessions_per_week,
      })),
    },
    nutrition: {
      mealsPerDay: nutrition.meals_per_day,
      mealScheduleFlexibility: nutrition.meal_schedule_flexibility,
      foodPreparationStyle: nutrition.food_preparation_style,
      foodBudgetStyle: nutrition.food_budget_style,
      dietaryPattern: nutrition.dietary_pattern,
      dietaryPatternOtherLabel: nutrition.dietary_pattern_other_label,
      hasFoodRestrictions: nutrition.has_food_restrictions,
      usesSupplements: nutrition.uses_supplements,
      acceptsEggs: nutrition.accepts_eggs,
      acceptsDairy: nutrition.accepts_dairy,
      restrictions: (rows.restrictions ?? []).map((restriction) => ({
        restrictionType: restriction.restriction_type,
        restrictionCode: restriction.restriction_code,
        declaredLabel: restriction.declared_label,
      })),
      dislikedFoods: (rows.dislikedFoods ?? []).map((food) => ({
        foodCode: food.food_code,
        declaredLabel: food.declared_label,
      })),
      preferredFoods: (rows.preferredFoods ?? []).map((food) => ({
        foodCode: food.food_code,
        declaredLabel: food.declared_label,
      })),
      supplements: (rows.supplements ?? []).map((supplement) => ({
        supplementCode: supplement.supplement_code,
        declaredLabel: supplement.declared_label,
      })),
    },
  };
}
