import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWeeklySchedule, getDurationLabel, getNextWorkoutState, getPendingWorkoutPresentation,
  getPreviousWorkoutNote,
  getSessionDurationSeconds, normalizeWorkout,
  type Workout,
} from "./model.ts";

const workout = (id: string, title: string): Workout => ({
  id, title, exercises: [], rawText: null, createdAt: "2026-10-01T12:00:00.000Z",
});

test("normaliza exercícios sem carregar URLs legadas de mídia", () => {
  const result = normalizeWorkout({ id: "legs", title: "Pernas", created_at: "2026-10-01T12:00:00.000Z",
    exercises: JSON.stringify([{ name: "Agachamento", sets: "4", reps: "10", rest: "60s", tip: "Controle", gif_url: "https://invalid.example/a.gif" }]) });
  assert.ok(result);
  assert.equal("gif_url" in result.exercises[0], false);
});

test("mantém o treino não concluído como pendente após o dia programado", () => {
  const workouts = [workout("legs", "Pernas"), workout("chest", "Peito")];
  const result = getNextWorkoutState(workouts, buildWeeklySchedule(workouts, [1, 2]), [], "2026-10-06");
  assert.equal(result.workout?.id, "legs");
  assert.equal(result.kind, "pending");
  assert.equal(result.scheduledToday?.id, "chest");
});

test("mantém o treino pendente mesmo depois da virada da semana", () => {
  const workouts = [workout("legs", "Pernas"), workout("chest", "Peito")];
  const result = getNextWorkoutState(
    workouts,
    buildWeeklySchedule(workouts, [1, 2]),
    [],
    "2026-10-11"
  );
  assert.equal(result.workout?.id, "legs");
  assert.equal(result.kind, "pending");
});

test("troca concluída avança o ciclo sem modificar a agenda", () => {
  const workouts = [workout("legs", "Pernas"), workout("chest", "Peito"), workout("back", "Costas")];
  const schedule = buildWeeklySchedule(workouts, [1, 2, 4]);
  const result = getNextWorkoutState(workouts, schedule, [{ id: "log", workoutId: "chest", workoutDate: "2026-10-06" }], "2026-10-06");
  assert.equal(result.workout?.id, "back");
  assert.deepEqual(schedule.map((item) => item.workout.id), ["legs", "chest", "back"]);
});

test("expõe somente duração planejada existente", () => {
  assert.equal(getDurationLabel({ trainingDaysPerWeek: 3, availableWeekdays: [1,3,5], preferredWeekdays: null,
    sessionDurationMin: 60, sessionDurationIsPlus: false, sessionDurationRange: null }), "60 min");
  assert.equal(getDurationLabel({ trainingDaysPerWeek: 3, availableWeekdays: null, preferredWeekdays: [1,3,5],
    sessionDurationMin: null, sessionDurationIsPlus: null, sessionDurationRange: "45_60" }), "45–60 min");
});

test("calcula duração real da sessão concluída sem aceitar intervalo inválido", () => {
  assert.equal(getSessionDurationSeconds("2026-10-08T12:00:00.000Z", "2026-10-08T12:32:10.000Z"), 1930);
  assert.equal(getSessionDurationSeconds("2026-10-08T13:00:00.000Z", "2026-10-08T12:00:00.000Z"), 0);
  assert.equal(getSessionDurationSeconds("invalid", "2026-10-08T12:00:00.000Z"), 0);
});

test("recupera a nota anterior apenas do mesmo workout sobrevivente", () => {
  const history = [{
    kind: "durable" as const,
    session: { id: "session-old", status: "completed" as const, workoutId: "workout-1", scheduleOccurrenceId: null, scheduledForDate: null, workoutTitle: "Snapshot antigo", startedAt: "2026-10-01T12:00:00.000Z", completedAt: "2026-10-01T13:00:00.000Z", note: "Aumentar carga" },
    exercises: [], workoutLogId: "log-1", durationSeconds: 3600,
  }];
  assert.equal(getPreviousWorkoutNote(history, "workout-1"), "Aumentar carga");
  assert.equal(getPreviousWorkoutNote(history, "workout-deleted"), null);
  assert.equal(getPreviousWorkoutNote(history, null), null);
});

test("pending usa o título snapshot e não a definição live renomeada", () => {
  const live = workout("workout-1", "Título renomeado");
  const pending = getPendingWorkoutPresentation({
    id: "occurrence-1",
    scheduledForDate: "2026-10-07",
    sourceWorkoutId: live.id,
    workoutTitle: "Título snapshot",
  });
  assert.equal(pending.id, live.id);
  assert.equal(pending.title, "Título snapshot");
  assert.deepEqual(pending.exercises, []);
});
