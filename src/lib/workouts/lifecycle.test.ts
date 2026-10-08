import assert from "node:assert/strict";
import test from "node:test";

import {
  WorkoutLifecycleCoordinator,
  type WorkoutLifecycleGateway,
  type WorkoutLifecycleSnapshot,
} from "./lifecycle.ts";
import { WorkoutPersistenceError } from "./persistence.ts";

const session = {
  id: "session-1",
  status: "in_progress" as const,
  workoutId: "workout-1",
  scheduleOccurrenceId: "occurrence-1",
  scheduledForDate: "2026-10-08",
  workoutTitle: "Treino A",
  startedAt: "2026-10-08T12:00:00.000Z",
  completedAt: null,
  note: null,
};

const exercises = [
  { id: "exercise-1", sessionId: session.id, exerciseKey: "squat", name: "Agachamento", position: 0, sets: "3", reps: "10", rest: "60s", tip: null, completedAt: "2026-10-08T12:05:00.000Z" },
  { id: "exercise-2", sessionId: session.id, exerciseKey: "row", name: "Remada", position: 1, sets: "3", reps: "12", rest: "60s", tip: null, completedAt: "2026-10-08T12:10:00.000Z" },
];

function snapshot(overrides: Partial<WorkoutLifecycleSnapshot> = {}): WorkoutLifecycleSnapshot {
  return {
    workouts: [], schedule: [], pending: null, activeSession: null,
    activeExercises: [], durableHistory: [], legacyHistory: [], previousNote: null,
    ...overrides,
  };
}

function gateway(overrides: Partial<WorkoutLifecycleGateway> = {}) {
  const calls: string[] = [];
  const implementation: WorkoutLifecycleGateway = {
    materialize: async () => { calls.push("materialize"); return 1; },
    loadSnapshot: async () => { calls.push("load"); return snapshot(); },
    start: async (input) => { calls.push(`start:${input.clientRequestId}`); return session; },
    setExercise: async (input) => { calls.push(`exercise:${input.exerciseId}:${input.completed}`); return { exerciseId: input.exerciseId, completedAt: input.completed ? "now" : null }; },
    saveNote: async (input) => { calls.push(`note:${input.note}`); return { note: input.note || null }; },
    abandon: async () => { calls.push("abandon"); },
    skip: async (input) => { calls.push(`skip:${input.reason}`); },
    updateSchedule: async (assignments) => { calls.push(`schedule:${assignments.length}`); return { effectiveFromDate: "2026-10-09" }; },
    restoreSchedule: async () => { calls.push("restore"); return { effectiveFromDate: "2026-10-09" }; },
    complete: async () => { calls.push("complete"); return { energyAwarded: 0, replayed: false }; },
    ...overrides,
  };
  return { calls, implementation };
}

test("bootstrap materializa antes de carregar o estado", async () => {
  const fake = gateway();
  await new WorkoutLifecycleCoordinator(fake.implementation).bootstrap();
  assert.deepEqual(fake.calls, ["materialize", "load"]);
});

test("bootstrap falha fechado quando a materialização está dormente", async () => {
  const fake = gateway({ materialize: async () => { throw new Error("permission denied"); } });
  await assert.rejects(new WorkoutLifecycleCoordinator(fake.implementation).bootstrap(), /permission denied/);
  assert.deepEqual(fake.calls, []);
});

test("start contém clique duplo e reutiliza o mesmo client_request_id", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let starts = 0;
  const fake = gateway({
    start: async (input) => { starts += 1; fake.calls.push(`start:${input.clientRequestId}`); await gate; return session; },
  });
  const coordinator = new WorkoutLifecycleCoordinator(fake.implementation, () => "request-stable");
  const input = { intentKey: "occurrence:1", workoutId: "workout-1", occurrenceId: "occurrence-1" };
  const first = coordinator.start(input);
  const second = coordinator.start(input);
  assert.equal(first, second);
  release();
  await Promise.all([first, second]);
  assert.equal(starts, 1);
  assert.deepEqual(fake.calls, ["start:request-stable", "load"]);
});

test("start preserva request id após falha para replay idempotente", async () => {
  const ids: string[] = [];
  let attempt = 0;
  const fake = gateway({ start: async (input) => {
    ids.push(input.clientRequestId); attempt += 1;
    if (attempt === 1) throw new Error("network");
    return session;
  } });
  const coordinator = new WorkoutLifecycleCoordinator(fake.implementation, () => "request-stable");
  const input = { intentKey: "workout:1", workoutId: "workout-1", occurrenceId: null };
  await assert.rejects(coordinator.start(input), /network/);
  await coordinator.start(input);
  assert.deepEqual(ids, ["request-stable", "request-stable"]);
});

test("novo start após sucesso recebe um novo client_request_id", async () => {
  const ids: string[] = [];
  let sequence = 0;
  const fake = gateway({ start: async (input) => { ids.push(input.clientRequestId); return session; } });
  const coordinator = new WorkoutLifecycleCoordinator(fake.implementation, () => `request-${++sequence}`);
  const input = { intentKey: "workout:1", workoutId: "workout-1", occurrenceId: null };
  await coordinator.start(input);
  await coordinator.start(input);
  assert.deepEqual(ids, ["request-1", "request-2"]);
});

test("start recupera somente o conflito esperado recarregando a sessão ativa", async () => {
  const conflict = new WorkoutPersistenceError("start_workout_session", "conflict", {
    code: "23505",
    message: "duplicate key value violates unique constraint",
    details: "workout_sessions_one_in_progress_per_user_unique",
  });
  const fake = gateway({
    start: async () => { throw conflict; },
    loadSnapshot: async () => snapshot({ activeSession: session, activeExercises: exercises }),
  });
  const coordinator = new WorkoutLifecycleCoordinator(fake.implementation, () => "request-conflict");
  const result = await coordinator.start({
    intentKey: "workout:conflict", workoutId: "workout-1", occurrenceId: null,
  });
  assert.equal(result.activeSession?.id, session.id);
});

test("start não esconde erro 23505 de outra constraint", async () => {
  const conflict = new WorkoutPersistenceError("start_workout_session", "conflict", {
    code: "23505", details: "workout_sessions_user_request_unique",
  });
  const fake = gateway({ start: async () => { throw conflict; } });
  await assert.rejects(new WorkoutLifecycleCoordinator(fake.implementation).start({
    intentKey: "workout:unexpected", workoutId: "workout-1", occurrenceId: null,
  }), (error) => error === conflict);
});

test("starts concorrentes de intents diferentes são serializados e retomam a mesma sessão", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let starts = 0;
  const fake = gateway({
    start: async () => {
      starts += 1;
      fake.calls.push(`start:${starts}`);
      if (starts === 1) await gate;
      return session;
    },
    loadSnapshot: async () => {
      fake.calls.push("load");
      return snapshot({ activeSession: session, activeExercises: exercises });
    },
  });
  const coordinator = new WorkoutLifecycleCoordinator(fake.implementation, (() => {
    let sequence = 0;
    return () => `request-${++sequence}`;
  })());
  const first = coordinator.start({
    intentKey: "workout:one", workoutId: "workout-1", occurrenceId: null,
  });
  const second = coordinator.start({
    intentKey: "workout:two", workoutId: "workout-2", occurrenceId: null,
  });
  await Promise.resolve();
  assert.equal(starts, 1);
  release();
  const [firstSnapshot, secondSnapshot] = await Promise.all([first, second]);
  assert.equal(firstSnapshot.activeSession?.id, session.id);
  assert.equal(secondSnapshot.activeSession?.id, session.id);
  assert.deepEqual(fake.calls, ["start:1", "load", "start:2", "load"]);
});

test("exercício só recarrega a UI depois da confirmação do RPC", async () => {
  const fake = gateway();
  await new WorkoutLifecycleCoordinator(fake.implementation).setExercise({ sessionId: session.id, exerciseId: "exercise-1", completed: false });
  assert.deepEqual(fake.calls, ["exercise:exercise-1:false", "load"]);
});

test("falha de exercício não carrega nem confirma estado novo", async () => {
  const fake = gateway({ setExercise: async () => { throw new Error("rpc failed"); } });
  await assert.rejects(new WorkoutLifecycleCoordinator(fake.implementation).setExercise({ sessionId: session.id, exerciseId: "exercise-1", completed: true }), /rpc failed/);
  assert.deepEqual(fake.calls, []);
});

test("abandonar e pular rematerializam antes de recarregar", async () => {
  const abandoned = gateway();
  await new WorkoutLifecycleCoordinator(abandoned.implementation).abandon(session.id);
  assert.deepEqual(abandoned.calls, ["abandon", "materialize", "load"]);
  const skipped = gateway();
  await new WorkoutLifecycleCoordinator(skipped.implementation).skip("occurrence-1", "viagem");
  assert.deepEqual(skipped.calls, ["skip:viagem", "materialize", "load"]);
});

test("agenda exige payload completo e expõe vigência prospectiva", async () => {
  const fake = gateway();
  const assignments = Array.from({ length: 7 }, (_, index) => ({ iso_weekday: index + 1, workout_id: null }));
  const result = await new WorkoutLifecycleCoordinator(fake.implementation).updateSchedule(assignments);
  assert.equal(result.effectiveFromDate, "2026-10-09");
  assert.deepEqual(fake.calls, ["schedule:7", "load"]);
});

test("restore recarrega agenda e mantém a vigência retornada", async () => {
  const fake = gateway();
  const result = await new WorkoutLifecycleCoordinator(fake.implementation).restoreSchedule();
  assert.equal(result.effectiveFromDate, "2026-10-09");
  assert.deepEqual(fake.calls, ["restore", "load"]);
});

test("complete bloqueia sessão incompleta antes de qualquer RPC", async () => {
  const fake = gateway();
  await assert.rejects(new WorkoutLifecycleCoordinator(fake.implementation).complete({
    sessionId: session.id,
    exercises: [{ ...exercises[0], completedAt: null }],
    note: "", persistedNote: null,
  }), /Conclua todos/);
  assert.deepEqual(fake.calls, []);
});

test("complete salva nota suja, conclui uma vez e não concede Energy", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let completes = 0;
  const fake = gateway({ complete: async () => { completes += 1; fake.calls.push("complete"); await gate; return { energyAwarded: 0, replayed: false }; } });
  const coordinator = new WorkoutLifecycleCoordinator(fake.implementation);
  const input = { sessionId: session.id, exercises, note: "nova", persistedNote: "antiga" };
  const first = coordinator.complete(input);
  const second = coordinator.complete(input);
  assert.equal(first, second);
  release();
  await Promise.all([first, second]);
  assert.equal(completes, 1);
  assert.deepEqual(fake.calls, ["note:nova", "complete", "load"]);
});

test("complete rejeita qualquer Energy fora do contrato", async () => {
  const fake = gateway({ complete: async () => ({ energyAwarded: 1 as 0, replayed: false }) });
  await assert.rejects(new WorkoutLifecycleCoordinator(fake.implementation).complete({
    sessionId: session.id, exercises, note: "", persistedNote: null,
  }), /Energy fora do contrato/);
  assert.deepEqual(fake.calls, []);
});

test("nota de sessão concluída usa o mesmo RPC editável", async () => {
  const fake = gateway();
  await new WorkoutLifecycleCoordinator(fake.implementation).saveNote("completed-session", "revisão");
  assert.deepEqual(fake.calls, ["note:revisão", "load"]);
});

test("save-note termina antes de complete e snapshot antigo não vence", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const fake = gateway({
    saveNote: async () => { fake.calls.push("note:queued"); await gate; return { note: "queued" }; },
  });
  const coordinator = new WorkoutLifecycleCoordinator(fake.implementation);
  const note = coordinator.saveNote(session.id, "queued");
  const completion = coordinator.complete({
    sessionId: session.id, exercises, note: "queued", persistedNote: "queued",
  });
  await Promise.resolve();
  assert.deepEqual(fake.calls, ["note:queued"]);
  release();
  await Promise.all([note, completion]);
  assert.deepEqual(fake.calls, ["note:queued", "load", "complete", "load"]);
});

test("exercise antigo termina antes de abandon e não reabre a sessão", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const fake = gateway({
    setExercise: async () => {
      fake.calls.push("exercise:queued"); await gate;
      return { exerciseId: "exercise-1", completedAt: "now" };
    },
  });
  const coordinator = new WorkoutLifecycleCoordinator(fake.implementation);
  const exercise = coordinator.setExercise({
    sessionId: session.id, exerciseId: "exercise-1", completed: true,
  });
  const abandon = coordinator.abandon(session.id);
  await Promise.resolve();
  assert.deepEqual(fake.calls, ["exercise:queued"]);
  release();
  await Promise.all([exercise, abandon]);
  assert.deepEqual(fake.calls, ["exercise:queued", "load", "abandon", "materialize", "load"]);
});

test("toggles rápidos do mesmo exercício confirmam a última intenção por último", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const fake = gateway({
    setExercise: async (input) => {
      calls += 1;
      fake.calls.push(`exercise:${input.completed}`);
      if (calls === 1) await gate;
      return { exerciseId: input.exerciseId, completedAt: input.completed ? "now" : null };
    },
  });
  const coordinator = new WorkoutLifecycleCoordinator(fake.implementation);
  const first = coordinator.setExercise({
    sessionId: session.id, exerciseId: "exercise-1", completed: true,
  });
  const second = coordinator.setExercise({
    sessionId: session.id, exerciseId: "exercise-1", completed: false,
  });
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(fake.calls, ["exercise:true", "load", "exercise:false", "load"]);
});

test("update schedule e restore aplicam snapshots na ordem intencional", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const fake = gateway({
    updateSchedule: async () => {
      fake.calls.push("schedule:queued"); await gate;
      return { effectiveFromDate: "2026-10-09" };
    },
  });
  const coordinator = new WorkoutLifecycleCoordinator(fake.implementation);
  const assignments = Array.from({ length: 7 }, (_, index) => ({
    iso_weekday: index + 1, workout_id: null,
  }));
  const update = coordinator.updateSchedule(assignments);
  const restore = coordinator.restoreSchedule();
  await Promise.resolve();
  assert.deepEqual(fake.calls, ["schedule:queued"]);
  release();
  await Promise.all([update, restore]);
  assert.deepEqual(fake.calls, ["schedule:queued", "load", "restore", "load"]);
});
