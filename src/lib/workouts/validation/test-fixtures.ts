import {
  buildV24FitnessContext,
  type LegacyProfileRow,
  type V24ContextRows,
} from "../../fitness-context/model.ts";
import type { ResolvedWorkoutPrescription, TrainingLevel, WorkoutGoal } from "../prescription/domain.ts";
import {
  compatibleExercisesForPattern,
  EXERCISE_METADATA_CATALOG,
} from "./exercise-metadata.ts";
import type { GeneratedWorkoutSelectionPlan } from "./domain.ts";

const profile: LegacyProfileRow = {
  nome: "Pessoa",
  onboarding_version: 2,
  onboarding_completed: true,
  onboarding_completed_at: "2026-10-18T12:00:00Z",
  objetivo: null,
  nivel_experiencia: null,
  dias_treino: null,
  idade: null,
  sexo: null,
  peso: null,
  altura: null,
};

export function validationContext(options: {
  goal: WorkoutGoal;
  level: TrainingLevel;
  availableFrequency: number;
  duration: 30 | 45 | 60 | 90;
}) {
  const rows: V24ContextRows = {
    health: {
      birth_date: "1995-05-10",
      biological_sex: "not_specified",
      height_cm: 175,
      weight_kg: 75,
      target_weight_kg: null,
      primary_goal: options.goal,
    },
    training: {
      primary_goal: options.goal,
      priority_muscles: [],
      training_experience: options.level,
      exercise_confidence: "confident",
      recent_training_break: null,
      initial_training_level: options.level,
      training_days_per_week: options.availableFrequency,
      available_weekdays: [1, 2, 3, 4, 5, 6, 7],
      preferred_weekdays: null,
      preferred_training_period: "evening",
      session_duration_min: options.duration,
      session_duration_is_plus: options.duration === 90,
      session_duration_range: null,
      training_location: "full_gym",
      other_location_label: null,
      available_equipment: [],
      other_equipment_label: null,
      pain_or_limitation: false,
      affected_body_areas: [],
    },
    nutrition: {
      meals_per_day: null,
      meal_schedule_flexibility: "moderate",
      food_preparation_style: "cook_some",
      food_budget_style: "balanced",
      dietary_pattern: "omnivore",
      dietary_pattern_other_label: null,
      has_food_restrictions: false,
      uses_supplements: false,
      accepts_eggs: null,
      accepts_dairy: null,
    },
    activities: [],
    restrictions: [],
    dislikedFoods: [],
    preferredFoods: [],
    supplements: [],
  };
  return buildV24FitnessContext(profile, rows, 5, new Date("2026-10-18T12:00:00Z"));
}

export function validSelectionPlan(prescription: ResolvedWorkoutPrescription): GeneratedWorkoutSelectionPlan {
  return {
    sessions: prescription.sessions.map((session) => ({
      session_id: session.id,
      session_kind: session.kind,
      iso_weekday: session.isoWeekday,
      title: session.displayFocus,
      exercises: session.requiredSlots.map((slot) => {
        const compatible = compatibleExercisesForPattern(
          slot.movementPattern,
          slot.selectionConstraints.equipment,
          slot.selectionConstraints.affectedBodyAreas,
        )[0] ?? EXERCISE_METADATA_CATALOG.find((item) => item.movementPattern === slot.movementPattern);
        if (!compatible) throw new Error(`Missing test metadata for ${slot.movementPattern}`);
        return {
          slot_id: slot.id,
          name: compatible.canonicalName,
          sets: slot.sets,
          rep_min: slot.repRange.min,
          rep_max: slot.repRange.max,
          rest_seconds: slot.restSeconds,
          tip: "Execução controlada",
        };
      }),
      cardio: session.cardio ? {
        kind: session.cardio.kind,
        duration_minutes: session.cardio.durationMinutes,
        effort_method: session.cardio.effortMethod,
        target_rpe_min: session.cardio.targetRpeRange[0],
        target_rpe_max: session.cardio.targetRpeRange[1],
        talk_test: session.cardio.talkTest,
        interval_work_seconds: session.cardio.intervalWorkSeconds,
        interval_recovery_seconds: session.cardio.intervalRecoverySeconds,
        rounds: session.cardio.rounds,
      } : null,
    })),
  };
}
