import assert from "node:assert/strict";
import test from "node:test";

import {
  buildV24FitnessContext,
  type LegacyProfileRow,
  type V24ContextRows,
} from "../../fitness-context/model.ts";
import {
  INDIRECT_SET_HEURISTIC_INTERPRETATION,
  INDIRECT_SET_HEURISTIC_VERSION,
  MUSCLE_TAXONOMY,
  type TrainingLevel,
  type WorkoutGoal,
} from "./domain.ts";
import {
  resolveEffectiveTrainingFrequency,
  resolveWorkoutPrescription,
} from "./engine.ts";
import { GOAL_STRATEGY_REGISTRY, getGoalPrescriptionStrategy } from "./registry.ts";

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

function context(options: {
  goal: WorkoutGoal;
  level: TrainingLevel;
  availableFrequency: number;
  duration: 30 | 45 | 60 | 90;
  preferredWeekdays?: number[];
  location?: string;
  equipment?: string[];
  pain?: boolean;
  affectedBodyAreas?: string[];
}) {
  const durationRange = options.duration === 30
    ? null
    : options.duration === 45
      ? null
      : options.duration === 60
        ? null
        : null;
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
      available_weekdays: options.preferredWeekdays ?? [1, 2, 3, 4, 5, 6, 7],
      preferred_weekdays: null,
      preferred_training_period: "evening",
      session_duration_min: options.duration,
      session_duration_is_plus: options.duration === 90,
      session_duration_range: durationRange,
      training_location: options.location ?? "full_gym",
      other_location_label: null,
      available_equipment: options.location && options.location !== "full_gym"
        ? options.equipment ?? ["bodyweight"]
        : [],
      other_equipment_label: null,
      pain_or_limitation: options.pain ?? false,
      affected_body_areas: options.affectedBodyAreas ?? [],
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

function sessionKinds(plan: ReturnType<typeof resolveWorkoutPrescription>) {
  return plan.sessions.map((session) => session.kind);
}

function muscle(plan: ReturnType<typeof resolveWorkoutPrescription>, name: (typeof MUSCLE_TAXONOMY)[number]) {
  return plan.muscleVolumes.find((item) => item.muscle === name)!;
}

function assertNoSessionBudgetOverflow(plan: ReturnType<typeof resolveWorkoutPrescription>) {
  assert.ok(plan.sessions.every((session) => session.sessionBudgetOverflowMinutes === 0));
  assert.ok(plan.sessions.every((session) =>
    session.estimatedResistanceMinutes + (session.cardio?.durationMinutes ?? 0)
      <= session.durationBudgetMinutes
  ));
}

function movementPatterns(plan: ReturnType<typeof resolveWorkoutPrescription>) {
  return new Set(plan.sessions.flatMap((session) =>
    session.requiredSlots.map((slot) => slot.movementPattern)
  ));
}

test("registry central contém somente as três strategies V1 e declara políticas distintas", () => {
  assert.deepEqual(Object.keys(GOAL_STRATEGY_REGISTRY).sort(), ["conditioning", "fat_loss", "hypertrophy"]);
  assert.equal(getGoalPrescriptionStrategy("hypertrophy").resistancePriority, "dominant");
  assert.equal(getGoalPrescriptionStrategy("fat_loss").cardioPriority, "moderate_high");
  assert.equal(getGoalPrescriptionStrategy("conditioning").cardioPriority, "central");
  assert.notDeepEqual(
    getGoalPrescriptionStrategy("hypertrophy").effectiveFrequencyPolicy,
    getGoalPrescriptionStrategy("conditioning").effectiveFrequencyPolicy,
  );
});

test("taxonomia e heurística indireta são explícitas e versionadas", () => {
  assert.deepEqual(MUSCLE_TAXONOMY, [
    "chest", "back", "quadriceps", "hamstrings", "glutes",
    "shoulders", "biceps", "triceps", "calves", "core",
  ]);
  assert.equal(INDIRECT_SET_HEURISTIC_VERSION, "v1");
  assert.equal(INDIRECT_SET_HEURISTIC_INTERPRETATION, "NOT_PHYSIOLOGICAL_EQUIVALENCE");
});

test("hypertrophy beginner com disponibilidade 6 recebe frequência efetiva 4 com rationale", () => {
  const userContext = context({ goal: "hypertrophy", level: "beginner", availableFrequency: 6, duration: 60 });
  const resolved = resolveEffectiveTrainingFrequency(getGoalPrescriptionStrategy("hypertrophy"), userContext);
  assert.equal(resolved.availabilityCap, 6);
  assert.equal(resolved.effectiveFrequency, 4);
  assert.ok(resolved.rationale.includes("reduced_from_availability=2"));
});

test("regressão hypertrophy intermediate 6x 90+ produz PPL equilibrado sem abs-only", () => {
  const plan = resolveWorkoutPrescription(context({
    goal: "hypertrophy",
    level: "intermediate",
    availableFrequency: 6,
    duration: 90,
  }));
  assert.equal(plan.effectiveFrequency, 6);
  assert.equal(plan.selectedSplitId, "hypertrophy-ppl-6");
  assert.deepEqual(plan.sessions.map((session) => session.focus), ["PUSH", "PULL", "LEGS", "PUSH", "PULL", "LEGS"]);
  assert.equal(plan.sessions.some((session) => session.requiredSlots.every((slot) => slot.primaryMuscles.includes("core"))), false);
  for (const muscle of ["chest", "back", "quadriceps", "hamstrings"] as const) {
    const volume = plan.muscleVolumes.find((item) => item.muscle === muscle)!;
    assert.ok(volume.plannedDirectSets >= volume.minWeeklySets, `${muscle} below policy`);
    assert.ok(volume.plannedDirectSets <= volume.maxWeeklySets, `${muscle} above policy`);
    assert.ok(volume.weeklyFrequency >= 2, `${muscle} lacks distributed exposure`);
  }
  const chest = plan.muscleVolumes.find((item) => item.muscle === "chest")!;
  const back = plan.muscleVolumes.find((item) => item.muscle === "back")!;
  assert.ok(Math.abs(chest.plannedDirectSets - back.plannedDirectSets) <= 2);
});

test("hypertrophy 4 dias seleciona upper/lower x2", () => {
  const plan = resolveWorkoutPrescription(context({ goal: "hypertrophy", level: "intermediate", availableFrequency: 4, duration: 60 }));
  assert.equal(plan.selectedSplitId, "hypertrophy-upper-lower-4");
  assert.deepEqual(plan.sessions.map((session) => session.focus), ["UPPER", "LOWER", "UPPER", "LOWER"]);
});

test("fat loss beginner 3x45 preserva força, inclui base e não obriga intervalos", () => {
  const plan = resolveWorkoutPrescription(context({ goal: "fat_loss", level: "beginner", availableFrequency: 3, duration: 45 }));
  assert.equal(plan.sessions.filter((session) => session.kind === "RESISTANCE").length, 3);
  assert.ok(plan.cardioPrescriptions.length >= 2);
  assert.equal(plan.cardioPrescriptions.some((cardio) => cardio.kind === "INTERVAL"), false);
  assert.ok(plan.cardioPrescriptions.every((cardio) => cardio.effortMethod === "talk_test"));
});

test("fat loss intermediate 5x60 combina três forças e cardio real", () => {
  const plan = resolveWorkoutPrescription(context({ goal: "fat_loss", level: "intermediate", availableFrequency: 5, duration: 60 }));
  assert.equal(plan.sessions.filter((session) => session.kind === "RESISTANCE").length, 3);
  assert.equal(plan.sessions.filter((session) => session.kind === "AEROBIC_BASE").length, 2);
  assert.notDeepEqual(sessionKinds(plan), Array(5).fill("RESISTANCE"));
  assert.equal(plan.cardioPrescriptions.length, 2);
  assert.ok(plan.cardioWeeklyMinutes >= plan.cardioWeeklyTargetMinutes);
});

test("conditioning beginner 3x45 usa base dominante e força de suporte sem intervalos", () => {
  const plan = resolveWorkoutPrescription(context({ goal: "conditioning", level: "beginner", availableFrequency: 3, duration: 45 }));
  assert.equal(plan.sessions.filter((session) => session.kind === "STRENGTH_SUPPORT").length, 2);
  assert.equal(plan.cardioPrescriptions.length, 3);
  assert.equal(plan.cardioPrescriptions.some((cardio) => cardio.kind === "INTERVAL"), false);
  const cardioMinutes = plan.cardioPrescriptions.reduce((sum, cardio) => sum + cardio.durationMinutes, 0);
  const strengthMinutes = plan.sessions.reduce((sum, session) => sum + session.resistanceBudgetMinutes, 0);
  assert.ok(cardioMinutes > strengthMinutes);
});

test("conditioning intermediate 5x60 contém base, intervalo e força", () => {
  const plan = resolveWorkoutPrescription(context({ goal: "conditioning", level: "intermediate", availableFrequency: 5, duration: 60 }));
  assert.ok(sessionKinds(plan).includes("AEROBIC_BASE"));
  assert.ok(sessionKinds(plan).includes("INTERVAL"));
  assert.equal(plan.sessions.filter((session) => session.kind === "STRENGTH_SUPPORT").length, 2);
  const intervalPrescription = plan.cardioPrescriptions.find((cardio) => cardio.kind === "INTERVAL")!;
  assert.equal(intervalPrescription.intervalWorkSeconds, 60);
  assert.equal(intervalPrescription.intervalRecoverySeconds, 120);
  assert.ok((intervalPrescription.rounds ?? 0) >= 4);
});

test("30 minutos reduz slots e 90+ amplia volume viável sem filler", () => {
  const compact = resolveWorkoutPrescription(context({ goal: "hypertrophy", level: "intermediate", availableFrequency: 4, duration: 30 }));
  const extended = resolveWorkoutPrescription(context({ goal: "hypertrophy", level: "intermediate", availableFrequency: 4, duration: 90 }));
  const compactSlots = Math.max(...compact.sessions.map((session) => session.requiredSlots.filter((slot) => slot.role !== "cardio").length));
  const extendedSlots = Math.max(...extended.sessions.map((session) => session.requiredSlots.filter((slot) => slot.role !== "cardio").length));
  assert.ok(compactSlots <= 4);
  assert.ok(extendedSlots > compactSlots);
  assert.ok(extendedSlots <= 8);
});

test("slots carregam equipment e pain constraints sem diagnóstico", () => {
  const plan = resolveWorkoutPrescription(context({
    goal: "hypertrophy",
    level: "beginner",
    availableFrequency: 3,
    duration: 45,
    location: "home",
    equipment: ["bodyweight", "resistance_bands"],
    pain: true,
    affectedBodyAreas: ["knee"],
  }));
  for (const session of plan.sessions) {
    for (const exerciseSlot of session.requiredSlots) {
      assert.deepEqual(exerciseSlot.selectionConstraints.equipment, ["bodyweight", "resistance_bands"]);
      assert.deepEqual(exerciseSlot.selectionConstraints.affectedBodyAreas, ["knee"]);
      assert.equal(exerciseSlot.selectionConstraints.conservativeSelectionRequired, true);
    }
  }
});

test("agenda usa dias preferidos como preferência e mantém dias únicos", () => {
  const plan = resolveWorkoutPrescription(context({
    goal: "hypertrophy",
    level: "beginner",
    availableFrequency: 6,
    duration: 60,
    preferredWeekdays: [1, 2, 4, 6, 7, 3],
  }));
  const weekdays = plan.sessions.map((session) => session.isoWeekday);
  assert.equal(new Set(weekdays).size, plan.effectiveFrequency);
  assert.ok(weekdays.every((day) => day >= 1 && day <= 7));
});

test("seis arquétipos endurecidos mantêm orçamento, cobertura e recuperação obrigatórios", async (t) => {
  const case1 = resolveWorkoutPrescription(context({
    goal: "hypertrophy", level: "intermediate", availableFrequency: 6, duration: 90,
  }));
  const case2 = resolveWorkoutPrescription(context({
    goal: "hypertrophy", level: "beginner", availableFrequency: 6, duration: 45,
  }));
  const case3 = resolveWorkoutPrescription(context({
    goal: "fat_loss", level: "beginner", availableFrequency: 3, duration: 45,
  }));
  const case4 = resolveWorkoutPrescription(context({
    goal: "fat_loss", level: "intermediate", availableFrequency: 5, duration: 60,
  }));
  const case5 = resolveWorkoutPrescription(context({
    goal: "conditioning", level: "beginner", availableFrequency: 3, duration: 45,
  }));
  const case6 = resolveWorkoutPrescription(context({
    goal: "conditioning", level: "intermediate", availableFrequency: 5, duration: 60,
  }));

  await t.test("CASE 1 continua como regressão positiva", () => {
    assert.equal(case1.selectedSplitId, "hypertrophy-ppl-6");
    assert.equal(case1.recoveryViolations.length, 0);
    assertNoSessionBudgetOverflow(case1);
  });
  await t.test("CASE 2 cobre panturrilhas e targets diretos sem exceder hard limits", () => {
    assert.equal(case2.effectiveFrequency, 4);
    assert.ok(muscle(case2, "calves").plannedDirectSets > 0);
    assert.ok(case2.muscleVolumes.every((item) => item.coverageSatisfied));
    assert.ok(case2.muscleVolumes.every((item) => !item.directHardLimitExceeded));
    assertNoSessionBudgetOverflow(case2);
  });
  await t.test("CASE 3 usa M/W/F, cobre padrões e não encadeia Lower em Full Body", () => {
    assert.deepEqual(case3.sessions.map((session) => session.isoWeekday), [1, 3, 5]);
    assert.equal(case3.recoveryViolations.length, 0);
    assert.ok(muscle(case3, "calves").plannedDirectSets > 0);
    for (const pattern of ["horizontal_press", "horizontal_pull", "knee_dominant", "hip_hinge"] as const) {
      assert.ok(movementPatterns(case3).has(pattern));
    }
    assertNoSessionBudgetOverflow(case3);
  });
  await t.test("CASE 4 usa orçamento semanal de cardio e limites diretos", () => {
    assert.equal(case4.cardioPrescriptions.length, 2);
    assert.ok(case4.cardioWeeklyMinutes >= case4.cardioWeeklyTargetMinutes);
    assert.ok(muscle(case4, "calves").plannedDirectSets > 0);
    assert.ok(case4.muscleVolumes.every((item) => !item.directHardLimitExceeded));
    assertNoSessionBudgetOverflow(case4);
  });
  await t.test("CASE 5 separa strength-support e cobre posterior chain", () => {
    const strengthDays = case5.sessions
      .filter((session) => session.kind === "STRENGTH_SUPPORT")
      .map((session) => session.isoWeekday);
    assert.deepEqual(strengthDays, [3, 5]);
    assert.equal(case5.recoveryViolations.length, 0);
    assert.ok(movementPatterns(case5).has("hip_hinge"));
    assert.ok(muscle(case5, "hamstrings").plannedDirectSets > 0);
    assert.ok(muscle(case5, "calves").plannedDirectSets > 0);
    assertNoSessionBudgetOverflow(case5);
  });
  await t.test("CASE 6 cobre shoulders e calves dentro da policy", () => {
    assert.equal(muscle(case6, "shoulders").coverageSatisfied, true);
    assert.ok(muscle(case6, "calves").plannedDirectSets > 0);
    assert.equal(case6.recoveryViolations.length, 0);
    assertNoSessionBudgetOverflow(case6);
  });
});

test("dias consecutivos só permanecem quando a disponibilidade explícita obriga e geram rationale", () => {
  const plan = resolveWorkoutPrescription(context({
    goal: "fat_loss",
    level: "beginner",
    availableFrequency: 3,
    duration: 45,
    preferredWeekdays: [1, 2, 3],
  }));
  assert.deepEqual(plan.sessions.map((session) => session.isoWeekday), [1, 2, 3]);
  assert.ok(plan.recoveryViolations.length > 0);
  assert.ok(plan.scheduleRationale.includes("recovery_constraint_limited_by_available_weekdays"));
});
