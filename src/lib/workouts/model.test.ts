import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWeeklySchedule, getDurationLabel, getNextWorkoutState, normalizeWorkout,
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
