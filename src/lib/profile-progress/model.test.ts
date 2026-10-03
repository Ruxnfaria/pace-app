import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProfileFitnessUpdate,
  buildProgressSummary,
  currentWeightUpdateTarget,
  ProfileProgressError,
  resolveProfileFitnessFields,
  runWithFreshFitnessSource,
  type HealthProfile,
  type LegacyFitnessProfile,
  type MeasurementRecord,
} from "./model.ts";

const legacy: LegacyFitnessProfile = {
  onboarding_version: null,
  peso: 68,
  altura: 175,
  objetivo: "massa",
};

const v2Health: HealthProfile = {
  weight_kg: 72,
  height_cm: 180,
  target_weight_kg: 76,
  primary_goal: "hypertrophy",
};

const history: MeasurementRecord[] = [
  {
    id: "first",
    weight: 70,
    waist: 80,
    hip: 90,
    chest: 95,
    measuredAt: "01/09",
  },
  {
    id: "latest",
    weight: 71,
    waist: 79,
    hip: 90,
    chest: 96,
    measuredAt: "15/09",
  },
];

test("Profile V1 continua lendo e escrevendo os campos legados", () => {
  const fields = resolveProfileFitnessFields(legacy, null);
  assert.deepEqual(fields, {
    source: "v1",
    weight: 68,
    height: 175,
    targetWeight: null,
    goal: "massa",
    goalEditable: true,
  });
  assert.deepEqual(
    buildProfileFitnessUpdate("v1", {
      weight: 69,
      height: 176,
      goal: "definicao",
    }),
    {
      table: "profiles",
      values: { peso: 69, altura: 176, objetivo: "definicao" },
    }
  );
});

test("Profile V2 usa health e ignora legado conflitante", () => {
  const fields = resolveProfileFitnessFields(
    { ...legacy, onboarding_version: 2, peso: 999, altura: 299 },
    v2Health
  );
  assert.equal(fields.weight, 72);
  assert.equal(fields.height, 180);
  assert.equal(fields.goal, "hypertrophy");
  assert.equal(fields.goalEditable, false);
});

test("Profile V2 nunca inclui objetivo na escrita canônica", () => {
  assert.deepEqual(
    buildProfileFitnessUpdate("v2", {
      weight: 73,
      height: 181,
      goal: "fat_loss",
    }),
    {
      table: "user_health_profiles",
      values: { weight_kg: 73, height_cm: 181 },
    }
  );
});

test("V2_INCOMPLETE não cai nos valores V1", () => {
  assert.throws(
    () => resolveProfileFitnessFields({ ...legacy, onboarding_version: 2 }, null),
    (error) =>
      error instanceof ProfileProgressError && error.code === "V2_INCOMPLETE"
  );
});

test("Progress V1 preserva histórico, peso atual e destino legado", () => {
  const summary = buildProgressSummary(legacy, null, history);
  assert.equal(summary.currentWeight, 71);
  assert.equal(summary.baselineWeight, 70);
  assert.equal(summary.weightChange, 1);
  assert.deepEqual(summary.history, history);
  assert.deepEqual(currentWeightUpdateTarget("v1"), {
    table: "profiles",
    column: "peso",
  });
});

test("Progress V1 usa peso legado como baseline sem histórico", () => {
  const summary = buildProgressSummary(legacy, null, []);
  assert.equal(summary.currentWeight, 68);
  assert.equal(summary.baselineWeight, 68);
  assert.equal(summary.history[0]?.measuredAt, "Inicial");
});

test("Progress V1 sem peso não inventa baseline zero", () => {
  const summary = buildProgressSummary({ ...legacy, peso: null }, null, []);
  assert.equal(summary.currentWeight, null);
  assert.equal(summary.baselineWeight, null);
  assert.deepEqual(summary.history, []);
});

test("Progress V2 usa weight_kg como peso atual e não profiles.peso", () => {
  const summary = buildProgressSummary(
    { ...legacy, onboarding_version: 2, peso: 999 },
    v2Health,
    history
  );
  assert.equal(summary.currentWeight, 72);
  assert.equal(summary.baselineWeight, 70);
  assert.equal(summary.weightChange, 2);
  assert.deepEqual(summary.history, history);
});

test("nova medição V2 aponta somente para a fonte canônica V2", () => {
  assert.deepEqual(currentWeightUpdateTarget("v2"), {
    table: "user_health_profiles",
    column: "weight_kg",
  });
});

test("Progress V2 usa weight_kg como baseline provisório sem histórico", () => {
  const summary = buildProgressSummary(
    { ...legacy, onboarding_version: 2 },
    v2Health,
    []
  );
  assert.equal(summary.baselineWeight, 72);
  assert.equal(summary.currentWeight, 72);
  assert.equal(summary.weightChange, 0);
  assert.equal(summary.history[0]?.id, "onboarding-initial-weight");
});

async function exerciseFreshRouting(
  loadedSource: "v1" | "v2",
  profile: LegacyFitnessProfile,
  health: HealthProfile | null
) {
  const events: string[] = [];
  const writers: string[] = [];

  const result = await runWithFreshFitnessSource({
    loadedSource,
    readCurrent: async () => {
      events.push("read-current");
      return { profile, health };
    },
    write: async (source) => {
      events.push(`write-${source}`);
      writers.push(source);
      return currentWeightUpdateTarget(source);
    },
  });

  return { events, writers, result };
}

test("Profile: load V1 e save ainda V1 permite somente writer V1", async () => {
  const execution = await exerciseFreshRouting("v1", legacy, null);
  assert.deepEqual(execution.events, ["read-current", "write-v1"]);
  assert.deepEqual(execution.writers, ["v1"]);
});

test("Profile: load V2 e save ainda V2 permite somente writer V2", async () => {
  const execution = await exerciseFreshRouting(
    "v2",
    { ...legacy, onboarding_version: 2 },
    v2Health
  );
  assert.deepEqual(execution.events, ["read-current", "write-v2"]);
  assert.deepEqual(execution.writers, ["v2"]);
});

test("Profile: load V1 que virou V2 falha antes de qualquer writer", async () => {
  let writerCalls = 0;
  await assert.rejects(
    runWithFreshFitnessSource({
      loadedSource: "v1",
      readCurrent: async () => ({
        profile: { ...legacy, onboarding_version: 2 },
        health: v2Health,
      }),
      write: async () => {
        writerCalls += 1;
      },
    }),
    (error) =>
      error instanceof ProfileProgressError && error.code === "VERSION_CHANGED"
  );
  assert.equal(writerCalls, 0);
});

test("Profile: versão futura falha fechada sem fallback V1", async () => {
  let writerCalls = 0;
  await assert.rejects(
    runWithFreshFitnessSource({
      loadedSource: "v2",
      readCurrent: async () => ({
        profile: { ...legacy, onboarding_version: 3 },
        health: null,
      }),
      write: async () => {
        writerCalls += 1;
      },
    }),
    (error) =>
      error instanceof ProfileProgressError &&
      error.code === "UNSUPPORTED_VERSION"
  );
  assert.equal(writerCalls, 0);
});

test("Profile: writer V1 não é chamado após transição V1 para V2", async () => {
  const called = { v1: 0, v2: 0 };
  await assert.rejects(
    runWithFreshFitnessSource({
      loadedSource: "v1",
      readCurrent: async () => ({
        profile: { ...legacy, onboarding_version: 2 },
        health: v2Health,
      }),
      write: async (source) => {
        called[source] += 1;
      },
    }),
    ProfileProgressError
  );
  assert.deepEqual(called, { v1: 0, v2: 0 });
});

test("Progress: load V1 e medida ainda V1 roteia snapshot legado", async () => {
  const execution = await exerciseFreshRouting("v1", legacy, null);
  assert.deepEqual(execution.result, { table: "profiles", column: "peso" });
});

test("Progress: load V2 e medida ainda V2 roteia snapshot health", async () => {
  const execution = await exerciseFreshRouting(
    "v2",
    { ...legacy, onboarding_version: 2 },
    v2Health
  );
  assert.deepEqual(execution.result, {
    table: "user_health_profiles",
    column: "weight_kg",
  });
});

test("Progress: load V1 que virou V2 não inicia operação de escrita", async () => {
  const events: string[] = [];
  await assert.rejects(
    runWithFreshFitnessSource({
      loadedSource: "v1",
      readCurrent: async () => {
        events.push("read-current");
        return {
          profile: { ...legacy, onboarding_version: 2 },
          health: v2Health,
        };
      },
      write: async () => {
        events.push("insert-measurement");
      },
    }),
    ProfileProgressError
  );
  assert.deepEqual(events, ["read-current"]);
});

test("Progress: nenhuma mutation ocorre quando a revalidação falha", async () => {
  let mutationCount = 0;
  await assert.rejects(
    runWithFreshFitnessSource({
      loadedSource: "v2",
      readCurrent: async () => ({
        profile: { ...legacy, onboarding_version: 2 },
        health: null,
      }),
      write: async () => {
        mutationCount += 1;
      },
    }),
    (error) =>
      error instanceof ProfileProgressError && error.code === "V2_INCOMPLETE"
  );
  assert.equal(mutationCount, 0);
});

test("Progress: estado atual V2 nunca seleciona profiles.peso", async () => {
  const execution = await exerciseFreshRouting(
    "v2",
    { ...legacy, onboarding_version: 2 },
    v2Health
  );
  assert.notEqual(execution.result.table, "profiles");
  assert.notEqual(execution.result.column, "peso");
});

test("Progress: decisão fresca sempre antecede o primeiro write", async () => {
  const execution = await exerciseFreshRouting("v1", legacy, null);
  assert.deepEqual(execution.events, ["read-current", "write-v1"]);
});
