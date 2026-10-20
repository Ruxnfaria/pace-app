import assert from "node:assert/strict";
import test from "node:test";

import { resolveWorkoutPrescription } from "../prescription/engine.ts";
import type {
  GeneratedExerciseSelection,
  GeneratedSessionSelection,
  WorkoutValidationIssueCode,
} from "./domain.ts";
import { validationContext, validSelectionPlan } from "./test-fixtures.ts";
import { validateWorkoutPrescription } from "./validator.ts";

function codes(report: ReturnType<typeof validateWorkoutPrescription>) {
  return new Set(report.issues.map((item) => item.code));
}

function expectHardFailure(
  report: ReturnType<typeof validateWorkoutPrescription>,
  expectedCode: WorkoutValidationIssueCode,
) {
  assert.equal(report.valid, false);
  assert.ok(report.hardFailures > 0);
  assert.ok(codes(report).has(expectedCode), `missing ${expectedCode}`);
}

const archetypes = [
  ["hypertrophy", "intermediate", 6, 90],
  ["hypertrophy", "beginner", 6, 45],
  ["fat_loss", "beginner", 3, 45],
  ["fat_loss", "intermediate", 5, 60],
  ["conditioning", "beginner", 3, 45],
  ["conditioning", "intermediate", 5, 60],
] as const;

test("os seis arquétipos aprovados passam pelo validator v1", () => {
  for (const [goal, level, availableFrequency, duration] of archetypes) {
    const prescription = resolveWorkoutPrescription(validationContext({ goal, level, availableFrequency, duration }));
    const report = validateWorkoutPrescription(prescription, validSelectionPlan(prescription));
    assert.equal(report.valid, true, `${goal}/${level}/${availableFrequency}/${duration}`);
    assert.equal(report.hardFailures, 0);
    assert.equal(report.validatorVersion, "praxe-workout-validator-v1");
  }
});

test("hypertrophy duplicado em peito e sem pernas falha", () => {
  const prescription = resolveWorkoutPrescription(validationContext({ goal: "hypertrophy", level: "intermediate", availableFrequency: 6, duration: 90 }));
  const plan = structuredClone(validSelectionPlan(prescription));
  const legSession = plan.sessions.find((session) => session.session_id === "session-03")!;
  for (const exercise of legSession.exercises) exercise.name = "Supino reto com halteres";
  expectHardFailure(validateWorkoutPrescription(prescription, plan), "REQUIRED_MOVEMENT_PATTERN_MISSING");
});

test("hypertrophy com sessão somente de core falha", () => {
  const prescription = resolveWorkoutPrescription(validationContext({ goal: "hypertrophy", level: "intermediate", availableFrequency: 6, duration: 90 }));
  const plan = structuredClone(validSelectionPlan(prescription));
  for (const exercise of plan.sessions[0].exercises) exercise.name = "Prancha frontal";
  expectHardFailure(validateWorkoutPrescription(prescription, plan), "STANDALONE_CORE_MISUSE");
});

test("fat loss beginner rejeita HIIT não autorizado", () => {
  const prescription = resolveWorkoutPrescription(validationContext({ goal: "fat_loss", level: "beginner", availableFrequency: 3, duration: 45 }));
  const plan = structuredClone(validSelectionPlan(prescription));
  for (const session of plan.sessions) {
    session.cardio = {
      kind: "INTERVAL", duration_minutes: 20, effort_method: "rpe", target_rpe_min: 8,
      target_rpe_max: 9, talk_test: "short_phrases", interval_work_seconds: 60,
      interval_recovery_seconds: 60, rounds: 10,
    };
  }
  expectHardFailure(validateWorkoutPrescription(prescription, plan), "CARDIO_PRESCRIPTION_VIOLATION");
});

test("fat loss sem resistência falha", () => {
  const prescription = resolveWorkoutPrescription(validationContext({ goal: "fat_loss", level: "intermediate", availableFrequency: 5, duration: 60 }));
  const plan = structuredClone(validSelectionPlan(prescription));
  for (const session of plan.sessions) session.session_kind = "AEROBIC_BASE";
  expectHardFailure(validateWorkoutPrescription(prescription, plan), "GOAL_MISALIGNMENT");
});

test("conditioning sem aeróbico falha", () => {
  const prescription = resolveWorkoutPrescription(validationContext({ goal: "conditioning", level: "intermediate", availableFrequency: 5, duration: 60 }));
  const plan = structuredClone(validSelectionPlan(prescription));
  for (const session of plan.sessions) {
    session.session_kind = "STRENGTH_SUPPORT";
    session.cardio = null;
  }
  expectHardFailure(validateWorkoutPrescription(prescription, plan), "GOAL_MISALIGNMENT");
});

test("conditioning beginner rejeita intervalo obrigatório", () => {
  const prescription = resolveWorkoutPrescription(validationContext({ goal: "conditioning", level: "beginner", availableFrequency: 3, duration: 45 }));
  const plan = structuredClone(validSelectionPlan(prescription));
  plan.sessions[0].cardio = {
    kind: "INTERVAL", duration_minutes: 30, effort_method: "rpe", target_rpe_min: 8,
    target_rpe_max: 9, talk_test: "short_phrases", interval_work_seconds: 30,
    interval_recovery_seconds: 30, rounds: 15,
  };
  expectHardFailure(validateWorkoutPrescription(prescription, plan), "CARDIO_PRESCRIPTION_VIOLATION");
});

test("conflito determinável de equipamento falha", () => {
  const prescription = structuredClone(resolveWorkoutPrescription(validationContext({ goal: "hypertrophy", level: "beginner", availableFrequency: 4, duration: 45 })));
  const slot = prescription.sessions[0].requiredSlots.find((item) => item.movementPattern === "horizontal_press")!;
  slot.selectionConstraints = { ...slot.selectionConstraints, equipment: ["bodyweight"] };
  const plan = structuredClone(validSelectionPlan(prescription));
  plan.sessions[0].exercises.find((item) => item.slot_id === slot.id)!.name = "Supino reto com halteres";
  expectHardFailure(validateWorkoutPrescription(prescription, plan), "EQUIPMENT_CONFLICT");
});

test("conflito determinável de área afetada falha sem diagnóstico", () => {
  const prescription = structuredClone(resolveWorkoutPrescription(validationContext({ goal: "fat_loss", level: "beginner", availableFrequency: 3, duration: 45 })));
  const slot = prescription.sessions.flatMap((session) => session.requiredSlots)
    .find((item) => item.movementPattern === "knee_dominant")!;
  slot.selectionConstraints = { ...slot.selectionConstraints, affectedBodyAreas: ["knee"] };
  const plan = structuredClone(validSelectionPlan(prescription));
  const session = plan.sessions.find((item) => item.exercises.some((exercise) => exercise.slot_id === slot.id))!;
  session.exercises.find((item) => item.slot_id === slot.id)!.name = "Agachamento livre com barra";
  expectHardFailure(validateWorkoutPrescription(prescription, plan), "PAIN_LIMITATION_CONFLICT");
});

test("overflow recalculado falha", () => {
  const prescription = resolveWorkoutPrescription(validationContext({ goal: "hypertrophy", level: "beginner", availableFrequency: 4, duration: 45 }));
  const plan = structuredClone(validSelectionPlan(prescription));
  for (const exercise of plan.sessions[0].exercises) exercise.rest_seconds = 900;
  expectHardFailure(validateWorkoutPrescription(prescription, plan), "TIME_BUDGET_EXCEEDED");
});

test("slot ausente e sessão extra falham", () => {
  const prescription = resolveWorkoutPrescription(validationContext({ goal: "fat_loss", level: "beginner", availableFrequency: 3, duration: 45 }));
  const missing = structuredClone(validSelectionPlan(prescription));
  (missing.sessions[0].exercises as GeneratedExerciseSelection[]).pop();
  expectHardFailure(validateWorkoutPrescription(prescription, missing), "REQUIRED_SLOT_MISSING");

  const extra = structuredClone(validSelectionPlan(prescription));
  (extra.sessions as GeneratedSessionSelection[]).push({
    ...structuredClone(extra.sessions[0]),
    session_id: "session-extra",
  });
  expectHardFailure(validateWorkoutPrescription(prescription, extra), "EXTRA_UNAUTHORIZED_SESSION");
});

test("exercício desconhecido falha fechado", () => {
  const prescription = resolveWorkoutPrescription(validationContext({ goal: "fat_loss", level: "beginner", availableFrequency: 3, duration: 45 }));
  const plan = structuredClone(validSelectionPlan(prescription));
  plan.sessions[0].exercises[0].name = "Exercício inventado pela IA";
  expectHardFailure(validateWorkoutPrescription(prescription, plan), "UNKNOWN_EXERCISE_METADATA");
});

test("dia ou kind alterado produz violação de recuperação", () => {
  const prescription = resolveWorkoutPrescription(validationContext({ goal: "conditioning", level: "intermediate", availableFrequency: 5, duration: 60 }));
  const plan = structuredClone(validSelectionPlan(prescription));
  plan.sessions[1].iso_weekday = plan.sessions[0].iso_weekday;
  expectHardFailure(validateWorkoutPrescription(prescription, plan), "RECOVERY_STRUCTURE_VIOLATION");
});
