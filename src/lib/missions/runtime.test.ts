import assert from "node:assert/strict";
import test from "node:test";

import { resolveCurrentMissionCapabilities } from "./capabilities.ts";
import type { MissionDailyContext } from "./domain.ts";
import { runDailyMissionGeneration, type MaterializedMission } from "./runtime.ts";
import { resolveWorkoutPrescription } from "../workouts/prescription/engine.ts";
import { validationContext } from "../workouts/validation/test-fixtures.ts";

function dailyContext(completed = false): MissionDailyContext {
  const prescription = resolveWorkoutPrescription(validationContext({
    goal: "hypertrophy",
    level: "intermediate",
    availableFrequency: 5,
    duration: 60,
  }));
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    date: "2026-10-19",
    goal: "hypertrophy",
    workoutPrescription: prescription,
    scheduledWorkout: {
      occurrenceId: "22222222-2222-4222-8222-222222222222",
      title: "Treino programado",
      sessionKind: "RESISTANCE",
      completed,
    },
    scheduledCardio: null,
    recentMissionHistory: [],
    supportedCapabilities: resolveCurrentMissionCapabilities(),
    completedScheduledWorkoutsTrailing7Days: completed ? 2 : 1,
  };
}

test("retry usa conjunto já materializado e não insere novamente", async () => {
  let rows: MaterializedMission[] = [];
  let materializeCalls = 0;
  const dependencies = {
    loadContext: async () => dailyContext(),
    loadExisting: async () => rows,
    materialize: async (_context: MissionDailyContext, missions: readonly { code: string }[]) => {
      materializeCalls += 1;
      rows = missions.map((mission, index) => ({ id: `mission-${index}`, missionCode: mission.code, completed: false }));
      return rows;
    },
    syncProgress: async () => ({ completedNow: false }),
  };
  const first = await runDailyMissionGeneration(dependencies);
  const second = await runDailyMissionGeneration(dependencies);
  assert.equal(first.created, 2);
  assert.equal(second.created, 0);
  assert.equal(materializeCalls, 1);
  assert.deepEqual(rows.map((row) => row.missionCode), ["scheduled_resistance_workout", "weekly_workout_consistency"]);
});

test("conclusão deriva de contexto autoritativo e é sincronizada server-side", async () => {
  const synced: Array<{ code: string; current: number; completed: boolean }> = [];
  const context = dailyContext(true);
  const rows: MaterializedMission[] = [
    { id: "mission-workout", missionCode: "scheduled_resistance_workout", completed: false },
    { id: "mission-consistency", missionCode: "weekly_workout_consistency", completed: false },
  ];
  const result = await runDailyMissionGeneration({
    loadContext: async () => context,
    loadExisting: async () => rows,
    materialize: async () => { throw new Error("must not materialize"); },
    syncProgress: async ({ mission, currentValue, completed }) => {
      synced.push({ code: mission.missionCode, current: currentValue, completed });
      return { completedNow: completed };
    },
  });
  assert.deepEqual(synced, [
    { code: "scheduled_resistance_workout", current: 1, completed: true },
    { code: "weekly_workout_consistency", current: 2, completed: true },
  ]);
  assert.equal(result.completedNow, 2);
});

test("conjunto parcialmente existente é preservado sem troca silenciosa", async () => {
  const existing = [{ id: "mission-existing", missionCode: "weekly_workout_consistency", completed: false }];
  let materializeCalls = 0;
  const result = await runDailyMissionGeneration({
    loadContext: async () => dailyContext(),
    loadExisting: async () => existing,
    materialize: async () => { materializeCalls += 1; return []; },
    syncProgress: async () => ({ completedNow: false }),
  });
  assert.equal(materializeCalls, 0);
  assert.equal(result.materialized, 1);
  assert.equal(result.created, 0);
});

test("rest day with zero occurrence materializes only capability-backed consistency", async () => {
  const context = { ...dailyContext(), scheduledWorkout: null, scheduledCardio: null };
  let codes: string[] = [];
  const result = await runDailyMissionGeneration({
    loadContext: async () => context,
    loadExisting: async () => [],
    materialize: async (_loadedContext, missions) => {
      codes = missions.map((mission) => mission.code);
      return missions.map((mission, index) => ({ id: `rest-${index}`, missionCode: mission.code, completed: false }));
    },
    syncProgress: async () => ({ completedNow: false }),
  });
  assert.deepEqual(codes, ["weekly_workout_consistency"]);
  assert.equal(result.created, 1);
});
