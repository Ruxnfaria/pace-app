import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkoutHistory,
  loadPreviousWorkoutNote,
  resolveActiveWorkoutSession,
} from "./browser-gateway.ts";

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
