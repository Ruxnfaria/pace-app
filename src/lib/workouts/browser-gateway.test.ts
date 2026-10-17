import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkoutHistory,
  loadPreviousWorkoutNote,
  resolveActiveWorkoutSession,
  resolvePendingWorkoutDisplayName,
  withSessionDisplayName,
  withWorkoutDisplayName,
} from "./browser-gateway.ts";

test("sessão ativa antiga deriva somente o nome de apresentação e preserva IDs e snapshot", () => {
  const session = {
    id: "session-active", status: "in_progress" as const, workoutId: "workout-a",
    scheduleOccurrenceId: "occurrence-a", scheduledForDate: "2026-10-17",
    workoutTitle: "Treino A", startedAt: "2026-10-17T12:00:00.000Z",
    completedAt: null, note: "Manter técnica",
  };
  const displayed = withSessionDisplayName(session, [
    { id: "exercise-1", sessionId: session.id, exerciseKey: "bench", name: "Supino reto", position: 0, sets: "3", reps: "10", rest: null, tip: null, completedAt: null },
    { id: "exercise-2", sessionId: session.id, exerciseKey: "triceps", name: "Tríceps testa", position: 1, sets: "3", reps: "10", rest: null, tip: null, completedAt: null },
  ]);

  assert.equal(displayed.workoutTitle, "Peito + Tríceps");
  assert.equal(displayed.id, session.id);
  assert.equal(displayed.workoutId, session.workoutId);
  assert.equal(displayed.scheduleOccurrenceId, session.scheduleOccurrenceId);
  assert.equal(session.workoutTitle, "Treino A");
});

test("histórico usa snapshots duráveis e exclui o log coberto pela bridge", () => {
  const result = buildWorkoutHistory({
    workouts: [{ id: "workout-1", title: "Título atual", exercises: [], rawText: null, createdAt: "2026-10-01T00:00:00.000Z" }],
    completedSessions: [{ id: "session-1", status: "completed", workoutId: "workout-1", scheduleOccurrenceId: "occurrence-1", scheduledForDate: "2026-10-07", workoutTitle: "Snapshot histórico", startedAt: "2026-10-08T12:00:00.000Z", completedAt: "2026-10-08T12:30:00.000Z", note: "Nota real" }],
    exercises: [{ id: "exercise-1", sessionId: "session-1", exerciseKey: "squat", name: "Agachamento snapshot", position: 0, sets: "3", reps: "10", rest: "60s", tip: "Controle", completedAt: "2026-10-08T12:20:00.000Z" }],
    bridges: new Map([["session-1", "log-1"]]),
    logs: [
      { id: "log-1", workout_id: "workout-1", workout_date: "2026-10-08" },
      { id: "log-legacy", workout_id: "workout-1", workout_date: "2026-10-01" },
    ],
  });
  assert.equal(result.durableHistory.length, 1);
  assert.equal(result.durableHistory[0].session.workoutTitle, "Snapshot histórico");
  assert.equal(result.durableHistory[0].exercises[0].name, "Agachamento snapshot");
  assert.equal(result.durableHistory[0].durationSeconds, 1800);
  assert.equal(result.durableHistory[0].session.note, "Nota real");
  assert.deepEqual(result.legacyHistory, [{
    kind: "legacy",
    id: "log-legacy",
    workoutId: "workout-1",
    workoutDate: "2026-10-01",
    currentWorkoutTitle: "Título atual",
  }]);
});

test("fallback legado não inventa título quando o workout não sobrevive", () => {
  const result = buildWorkoutHistory({
    workouts: [], completedSessions: [], exercises: [], bridges: new Map(),
    logs: [{ id: "log-old", workout_id: "deleted", workout_date: "2026-09-01" }],
  });
  assert.equal(result.durableHistory.length, 0);
  assert.deepEqual(result.legacyHistory[0], {
    kind: "legacy", id: "log-old", workoutId: "deleted",
    workoutDate: "2026-09-01", currentWorkoutTitle: null,
  });
});

test("histórico técnico usa somente o snapshot de exercícios da própria sessão", () => {
  const result = buildWorkoutHistory({
    workouts: [{
      id: "workout-1", title: "Treino A", rawText: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      exercises: [{ id: "current", name: "Agachamento", sets: "3", reps: "10", rest: null, tip: null }],
    }],
    completedSessions: [{
      id: "session-1", status: "completed", workoutId: "workout-1",
      scheduleOccurrenceId: null, scheduledForDate: null, workoutTitle: "Treino A",
      startedAt: "2026-10-08T12:00:00.000Z", completedAt: "2026-10-08T12:30:00.000Z", note: null,
    }],
    exercises: [
      { id: "chest", sessionId: "session-1", exerciseKey: null, name: "Supino reto", position: 0, sets: "3", reps: "10", rest: null, tip: null, completedAt: "2026-10-08T12:10:00.000Z" },
      { id: "triceps", sessionId: "session-1", exerciseKey: null, name: "Tríceps testa", position: 1, sets: "3", reps: "10", rest: null, tip: null, completedAt: "2026-10-08T12:20:00.000Z" },
    ],
    bridges: new Map([["session-1", "log-1"]]),
    logs: [
      { id: "log-1", workout_id: "workout-1", workout_date: "2026-10-08" },
      { id: "legacy", workout_id: "workout-1", workout_date: "2026-10-07" },
    ],
  });
  assert.equal(result.durableHistory[0].session.workoutTitle, "Peito + Tríceps");
  assert.equal(result.legacyHistory[0].currentWorkoutTitle, "Pernas");
});

test("histórico mantém fallback técnico quando o snapshot não traz evidência suficiente", () => {
  const result = buildWorkoutHistory({
    workouts: [],
    completedSessions: [{
      id: "session-legacy", status: "completed", workoutId: "workout-a",
      scheduleOccurrenceId: null, scheduledForDate: null, workoutTitle: "Treino A",
      startedAt: "2026-10-08T12:00:00.000Z", completedAt: "2026-10-08T12:30:00.000Z", note: null,
    }],
    exercises: [{
      id: "custom", sessionId: "session-legacy", exerciseKey: null,
      name: "Movimento personalizado", position: 0, sets: "3", reps: "10",
      rest: null, tip: null, completedAt: "2026-10-08T12:20:00.000Z",
    }],
    bridges: new Map([["session-legacy", "log-legacy"]]),
    logs: [{ id: "log-legacy", workout_id: "workout-a", workout_date: "2026-10-08" }],
  });

  assert.equal(result.durableHistory[0].session.workoutTitle, "Treino A");
});

test("home, agenda e próximo treino compartilham projeção descritiva sem alterar identificadores", () => {
  const workout = {
    id: "workout-b", title: "Treino B", rawText: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    exercises: [
      { id: "back", name: "Puxada alta", sets: "3", reps: "10", rest: null, tip: null },
      { id: "biceps", name: "Rosca direta", sets: "3", reps: "10", rest: null, tip: null },
    ],
  };
  const displayed = withWorkoutDisplayName(workout);

  assert.equal(displayed.title, "Costas + Bíceps");
  assert.equal(displayed.id, workout.id);
  assert.deepEqual(displayed.exercises, workout.exercises);
  assert.equal(workout.title, "Treino B");
});

test("treino pendente prioriza snapshot materializado e mantém fallback seguro", () => {
  const sourceWorkout = {
    id: "workout-a", title: "Treino A", rawText: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    exercises: [{ id: "legs", name: "Agachamento", sets: "3", reps: "10", rest: null, tip: null }],
  };

  assert.equal(resolvePendingWorkoutDisplayName({
    title: "Treino A",
    occurrenceExerciseNames: ["Supino reto", "Tríceps testa"],
    sourceWorkout,
  }), "Peito + Tríceps");
  assert.equal(resolvePendingWorkoutDisplayName({
    title: "Treino A",
    occurrenceExerciseNames: [],
    sourceWorkout,
  }), "Pernas");
  assert.equal(resolvePendingWorkoutDisplayName({
    title: "Treino A",
    occurrenceExerciseNames: ["Movimento personalizado"],
    sourceWorkout: null,
  }), "Treino A");
});

test("bridge por workout_log exclui fallback mesmo fora da janela de 40 sessões", () => {
  const result = buildWorkoutHistory({
    workouts: [], completedSessions: [], exercises: [],
    bridges: new Map([["session-outside-window", "log-covered"]]),
    logs: [
      { id: "log-covered", workout_id: "workout-old", workout_date: "2025-01-01" },
      { id: "log-legacy", workout_id: "workout-old", workout_date: "2024-12-01" },
    ],
  });
  assert.deepEqual(result.legacyHistory.map((item) => item.id), ["log-legacy"]);
});

test("sessão ativa aceita zero ou uma e falha fechado em multiplicidade", () => {
  assert.equal(resolveActiveWorkoutSession([]), null);
  const row = {
    id: "session-1", status: "in_progress", workout_id: "workout-1",
    schedule_occurrence_id: null, scheduled_for_date: null,
    workout_title: "Treino", started_at: "2026-10-08T12:00:00.000Z",
    completed_at: null, note: null,
  };
  assert.equal(resolveActiveWorkoutSession([row])?.id, "session-1");
  assert.throws(
    () => resolveActiveWorkoutSession([row, { ...row, id: "session-2" }]),
    /mais de uma sessão de treino está em andamento/,
  );
});

test("nota anterior usa query dedicada sem depender da janela do histórico", async () => {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    select(...args: unknown[]) { calls.push(["select", ...args]); return this; },
    eq(...args: unknown[]) { calls.push(["eq", ...args]); return this; },
    not(...args: unknown[]) { calls.push(["not", ...args]); return this; },
    order(...args: unknown[]) { calls.push(["order", ...args]); return this; },
    limit(...args: unknown[]) { calls.push(["limit", ...args]); return this; },
    async maybeSingle() {
      calls.push(["maybeSingle"]);
      return { data: { note: "Nota fora das 40 sessões", completed_at: "2025-01-01" }, error: null };
    },
  };
  const client = {
    from(table: string) { calls.push(["from", table]); return query; },
  };
  assert.equal(
    await loadPreviousWorkoutNote(client as never, "user-1", "workout-1"),
    "Nota fora das 40 sessões",
  );
  assert.deepEqual(calls, [
    ["from", "workout_sessions"],
    ["select", "note, completed_at"],
    ["eq", "user_id", "user-1"],
    ["eq", "workout_id", "workout-1"],
    ["eq", "status", "completed"],
    ["not", "note", "is", null],
    ["order", "completed_at", { ascending: false }],
    ["limit", 1],
    ["maybeSingle"],
  ]);

  calls.length = 0;
  assert.equal(await loadPreviousWorkoutNote(client as never, "user-1", null), null);
  assert.deepEqual(calls, []);
});
