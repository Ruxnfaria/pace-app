import assert from "node:assert/strict";
import test from "node:test";

import { resolveWorkoutMissionCompletedToday } from "../../../../lib/workouts/runtime-policy.ts";
import {
  applyNewGeneratedMissionCompletion,
  insertNewGeneratedMissionAfterInvariant,
  reconcileExistingGeneratedMission,
} from "./mission-containment.ts";

type MissionState = {
  currentValue: number;
  completed: boolean;
  completedAt: string | null;
};

function createEffects() {
  const calls = { energy: 0, streak: 0, chest: 0 };
  return {
    calls,
    effects: {
      awardEnergy: async () => { calls.energy += 1; },
      recordStreak: async () => { calls.streak += 1; },
      syncChests: async () => { calls.chest += 1; },
    },
  };
}

function createNewMissionOrchestration(options: {
  persistenceV2Enabled: boolean;
  category: string;
  currentValue: number;
  completed: boolean;
  completedAt: string | null;
}) {
  const calls = { insert: 0, completion: 0, energy: 0, streak: 0, chest: 0 };

  return {
    calls,
    execute: async () => {
      const inserted = await insertNewGeneratedMissionAfterInvariant({
        ...options,
        insert: async () => {
          calls.insert += 1;
          return { id: "mission-id" };
        },
      });
      calls.completion += 1;
      const completion = await applyNewGeneratedMissionCompletion({
        persistenceV2Enabled: options.persistenceV2Enabled,
        category: options.category,
        completed: options.completed,
        effects: {
          awardEnergy: async () => { calls.energy += 1; },
          recordStreak: async () => { calls.streak += 1; },
          syncChests: async () => { calls.chest += 1; },
        },
      });
      return { inserted, completion };
    },
  };
}

async function exerciseExistingMission(options: {
  persistenceV2Enabled: boolean;
  category: string;
  state: MissionState;
  nextCurrentValue: number;
  missionCompleted: boolean;
}) {
  const { calls, effects } = createEffects();
  let updateCalls = 0;
  let completionCalls = 0;
  const result = await reconcileExistingGeneratedMission({
    persistenceV2Enabled: options.persistenceV2Enabled,
    category: options.category,
    existingCompleted: options.state.completed,
    missionCompleted: options.missionCompleted,
    updateCurrentValue: async () => {
      updateCalls += 1;
      options.state.currentValue = options.nextCurrentValue;
    },
    completeMission: async () => {
      completionCalls += 1;
      options.state.currentValue = options.nextCurrentValue;
      options.state.completed = true;
      options.state.completedAt = "now";
      return true;
    },
    effects,
  });

  return { result, updateCalls, completionCalls, ...calls };
}

test("orquestração preserva workout mission existente incompleta com flag ON", async () => {
  const state: MissionState = { currentValue: 2, completed: false, completedAt: null };
  const outcome = await exerciseExistingMission({
    persistenceV2Enabled: true,
    category: "workout",
    state,
    nextCurrentValue: 0,
    missionCompleted: false,
  });

  assert.deepEqual(state, { currentValue: 2, completed: false, completedAt: null });
  assert.deepEqual(outcome, {
    result: { preserved: true, completedNow: false },
    updateCalls: 0,
    completionCalls: 0,
    energy: 0,
    streak: 0,
    chest: 0,
  });
});

test("orquestração preserva workout mission existente concluída com flag ON", async () => {
  const completedAt = "2026-10-07T12:00:00.000Z";
  const state: MissionState = { currentValue: 1, completed: true, completedAt };
  const outcome = await exerciseExistingMission({
    persistenceV2Enabled: true,
    category: "workout",
    state,
    nextCurrentValue: 0,
    missionCompleted: false,
  });

  assert.deepEqual(state, { currentValue: 1, completed: true, completedAt });
  assert.equal(outcome.updateCalls, 0);
  assert.equal(outcome.completionCalls, 0);
  assert.deepEqual([outcome.energy, outcome.streak, outcome.chest], [0, 0, 0]);
});

test("flag ON ignora legacy workout_log e mantém nova workout mission neutra", async () => {
  let legacyLogReads = 0;
  const completed = await resolveWorkoutMissionCompletedToday({
    persistenceV2Enabled: true,
    loadLegacyWorkoutCompletion: async () => {
      legacyLogReads += 1;
      return true;
    },
  });
  const orchestration = createNewMissionOrchestration({
    persistenceV2Enabled: true,
    category: "workout",
    currentValue: completed ? 1 : 0,
    completed,
    completedAt: completed ? "now" : null,
  });
  const result = await orchestration.execute();

  assert.equal(legacyLogReads, 0);
  assert.deepEqual(
    { current_value: completed ? 1 : 0, completed, completed_at: completed ? "now" : null },
    { current_value: 0, completed: false, completed_at: null }
  );
  assert.deepEqual(result.completion, { awarded: false });
  assert.deepEqual(orchestration.calls, {
    insert: 1,
    completion: 1,
    energy: 0,
    streak: 0,
    chest: 0,
  });
});

for (const invalidState of [
  { label: "completed=true", currentValue: 0, completed: true, completedAt: null },
  { label: "current_value não neutro", currentValue: 1, completed: false, completedAt: null },
  { label: "completed_at preenchido", currentValue: 0, completed: false, completedAt: "now" },
]) {
  test(`nova workout mission rejeita ${invalidState.label} antes do insert`, async () => {
    const orchestration = createNewMissionOrchestration({
      persistenceV2Enabled: true,
      category: "workout",
      currentValue: invalidState.currentValue,
      completed: invalidState.completed,
      completedAt: invalidState.completedAt,
    });

    await assert.rejects(
      orchestration.execute,
      /deve iniciar com progresso neutro e incompleta/
    );
    assert.deepEqual(orchestration.calls, {
      insert: 0,
      completion: 0,
      energy: 0,
      streak: 0,
      chest: 0,
    });
  });
}

test("invariante pré-insert não restringe nutrition e protein", async () => {
  for (const category of ["nutrition", "protein"]) {
    const orchestration = createNewMissionOrchestration({
      persistenceV2Enabled: true,
      category,
      currentValue: 1,
      completed: true,
      completedAt: "now",
    });

    await orchestration.execute();
    assert.deepEqual(orchestration.calls, {
      insert: 1,
      completion: 1,
      energy: 1,
      streak: 1,
      chest: 1,
    });
  }
});

test("invariante pré-insert preserva nova workout legacy com flag OFF", async () => {
  const orchestration = createNewMissionOrchestration({
    persistenceV2Enabled: false,
    category: "workout",
    currentValue: 1,
    completed: true,
    completedAt: "now",
  });

  await orchestration.execute();
  assert.deepEqual(orchestration.calls, {
    insert: 1,
    completion: 1,
    energy: 1,
    streak: 1,
    chest: 1,
  });
});

test("flag OFF preserva completion e side effects legados de workout", async () => {
  const state: MissionState = { currentValue: 0, completed: false, completedAt: null };
  const outcome = await exerciseExistingMission({
    persistenceV2Enabled: false,
    category: "workout",
    state,
    nextCurrentValue: 1,
    missionCompleted: true,
  });

  assert.deepEqual(state, { currentValue: 1, completed: true, completedAt: "now" });
  assert.equal(outcome.completionCalls, 1);
  assert.deepEqual([outcome.energy, outcome.streak, outcome.chest], [1, 1, 1]);
});

test("nutrition e protein preservam completion e chest side effects com flag ON", async () => {
  for (const category of ["nutrition", "protein"]) {
    const state: MissionState = { currentValue: 0, completed: false, completedAt: null };
    const outcome = await exerciseExistingMission({
      persistenceV2Enabled: true,
      category,
      state,
      nextCurrentValue: 1,
      missionCompleted: true,
    });

    assert.deepEqual(state, { currentValue: 1, completed: true, completedAt: "now" });
    assert.equal(outcome.completionCalls, 1);
    assert.deepEqual([outcome.energy, outcome.streak, outcome.chest], [1, 1, 1]);
  }
});
