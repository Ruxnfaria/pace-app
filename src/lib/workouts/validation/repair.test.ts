import assert from "node:assert/strict";
import test from "node:test";

import {
  FitnessRouteServiceError,
  runWorkoutGenerationRoute,
} from "../../fitness-context/route-pipeline.ts";
import { resolveWorkoutPrescription } from "../prescription/engine.ts";
import type { GeneratedWorkoutSelectionPlan, WorkoutValidationAudit } from "./domain.ts";
import { runControlledWorkoutRepair } from "./repair.ts";
import { validationContext, validSelectionPlan } from "./test-fixtures.ts";
import { validateWorkoutPrescription } from "./validator.ts";

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key] extends readonly (infer Item)[]
    ? Mutable<Item>[]
    : T[Key] extends object
      ? Mutable<T[Key]>
      : T[Key];
};

function mutablePlan(plan: GeneratedWorkoutSelectionPlan): Mutable<GeneratedWorkoutSelectionPlan> {
  return structuredClone(plan) as Mutable<GeneratedWorkoutSelectionPlan>;
}

test("repair corrige conflito de equipamento em uma tentativa", async () => {
  const prescription = structuredClone(resolveWorkoutPrescription(validationContext({
    goal: "hypertrophy", level: "beginner", availableFrequency: 4, duration: 45,
  })));
  const slot = prescription.sessions[0].requiredSlots.find((item) => item.movementPattern === "horizontal_press")!;
  slot.selectionConstraints = { ...slot.selectionConstraints, equipment: ["bodyweight"] };
  const valid = validSelectionPlan(prescription);
  const invalid = mutablePlan(valid);
  invalid.sessions[0].exercises.find((item) => item.slot_id === slot.id)!.name = "Supino reto com halteres";
  const initialReport = validateWorkoutPrescription(prescription, invalid);
  assert.equal(initialReport.valid, false);
  let calls = 0;
  const result = await runControlledWorkoutRepair({
    prescription,
    generated: invalid,
    report: initialReport,
    invokeRepair: async (prompt) => {
      calls += 1;
      assert.match(prompt, /EQUIPMENT_CONFLICT/);
      assert.match(prompt, /Preserve exatamente goal/);
      return valid;
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.repairAttempted, true);
  assert.equal(result.repairSucceeded, true);
  assert.equal(result.report.valid, true);
});

for (const repairCase of ["missing-slot", "time-overflow"] as const) {
  test(`repair corrige ${repairCase} em uma tentativa`, async () => {
    const prescription = resolveWorkoutPrescription(validationContext({
      goal: "fat_loss", level: "beginner", availableFrequency: 3, duration: 45,
    }));
    const valid = validSelectionPlan(prescription);
    const invalid = mutablePlan(valid);
    if (repairCase === "missing-slot") invalid.sessions[0].exercises.pop();
    else for (const exercise of invalid.sessions[0].exercises) exercise.rest_seconds = 900;
    const report = validateWorkoutPrescription(prescription, invalid);
    const result = await runControlledWorkoutRepair({
      prescription,
      generated: invalid,
      report,
      invokeRepair: async () => valid,
    });
    assert.equal(result.repairAttempted, true);
    assert.equal(result.repairSucceeded, true);
  });
}

test("repair que tenta alterar split ou dias é rejeitado", async () => {
  const prescription = resolveWorkoutPrescription(validationContext({
    goal: "conditioning", level: "intermediate", availableFrequency: 5, duration: 60,
  }));
  const valid = validSelectionPlan(prescription);
  const invalid = mutablePlan(valid);
  invalid.sessions[0].exercises[0].name = "Exercício desconhecido";
  const changedStructure = mutablePlan(valid);
  changedStructure.sessions[1].iso_weekday = changedStructure.sessions[0].iso_weekday;
  const result = await runControlledWorkoutRepair({
    prescription,
    generated: invalid,
    report: validateWorkoutPrescription(prescription, invalid),
    invokeRepair: async () => changedStructure,
  });
  assert.equal(result.repairAttempted, true);
  assert.equal(result.repairSucceeded, false);
  assert.equal(result.report.valid, false);
  assert.ok(result.report.issues.some((item) => item.code === "RECOVERY_STRUCTURE_VIOLATION"));
});

test("pipeline persiste somente após repair válido", async () => {
  const context = validationContext({ goal: "fat_loss", level: "beginner", availableFrequency: 3, duration: 45 });
  const prescription = resolveWorkoutPrescription(context);
  const valid = validSelectionPlan(prescription);
  const invalid = mutablePlan(valid);
  invalid.sessions[0].exercises[0].name = "Exercício desconhecido";
  let aiCalls = 0;
  let persistCalls = 0;
  const audits: WorkoutValidationAudit[] = [];
  await runWorkoutGenerationRoute({
    requireActiveSubscription: async () => ({ client: {}, userId: "id" }),
    loadFitnessContext: async () => context,
    invokeOpenAI: async () => JSON.stringify(aiCalls++ === 0 ? invalid : valid),
    onValidationAudit: (value) => { audits.push(value); },
    persistWorkouts: async () => { persistCalls += 1; },
  });
  assert.equal(aiCalls, 2);
  assert.equal(persistCalls, 1);
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.validatorVersion, "praxe-workout-validator-v1");
  assert.equal(audits[0]?.repairAttempted, true);
  assert.equal(audits[0]?.repairSucceeded, true);
});

test("segunda resposta inválida bloqueia persistência e não inicia terceiro attempt", async () => {
  const context = validationContext({ goal: "fat_loss", level: "beginner", availableFrequency: 3, duration: 45 });
  const prescription = resolveWorkoutPrescription(context);
  const invalid = mutablePlan(validSelectionPlan(prescription));
  invalid.sessions[0].exercises[0].name = "Exercício desconhecido";
  let aiCalls = 0;
  let persistCalls = 0;
  await assert.rejects(
    runWorkoutGenerationRoute({
      requireActiveSubscription: async () => ({ client: {}, userId: "id" }),
      loadFitnessContext: async () => context,
      invokeOpenAI: async () => { aiCalls += 1; return JSON.stringify(invalid); },
      persistWorkouts: async () => { persistCalls += 1; },
    }),
    (error) => error instanceof FitnessRouteServiceError
      && error.code === "WORKOUT_VALIDATION_FAILED"
      && error.status === 422,
  );
  assert.equal(aiCalls, 2);
  assert.equal(persistCalls, 0);
});
