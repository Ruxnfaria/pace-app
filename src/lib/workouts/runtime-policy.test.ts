import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAT_WORKOUT_SAVE_UNAVAILABLE,
  getChatWorkoutSaveContainment,
  isWorkoutPersistenceV2Enabled,
  resolveWorkoutMissionCompletedToday,
} from "./runtime-policy.ts";

test("Workout persistence V2 fica OFF por padrão e exige true explícito", () => {
  assert.equal(isWorkoutPersistenceV2Enabled(undefined), false);
  assert.equal(isWorkoutPersistenceV2Enabled("false"), false);
  assert.equal(isWorkoutPersistenceV2Enabled("1"), false);
  assert.equal(isWorkoutPersistenceV2Enabled(" TRUE "), true);
});

test("Chat bloqueia somente salvar treino quando o flag está ON", () => {
  assert.deepEqual(getChatWorkoutSaveContainment(false), { blocked: false });
  assert.deepEqual(getChatWorkoutSaveContainment(true), {
    blocked: true,
    notice: CHAT_WORKOUT_SAVE_UNAVAILABLE,
  });
});

test("missão de treino não infere conclusão por log legado quando o flag está ON", async () => {
  let legacyReads = 0;
  const enabled = await resolveWorkoutMissionCompletedToday({
    persistenceV2Enabled: true,
    loadLegacyWorkoutCompletion: async () => {
      legacyReads += 1;
      return true;
    },
  });
  assert.equal(enabled, false);
  assert.equal(legacyReads, 0);

  const disabled = await resolveWorkoutMissionCompletedToday({
    persistenceV2Enabled: false,
    loadLegacyWorkoutCompletion: async () => {
      legacyReads += 1;
      return true;
    },
  });
  assert.equal(disabled, true);
  assert.equal(legacyReads, 1);
});
