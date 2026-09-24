import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProfileFitnessUpdate,
  buildProgressSummary,
  currentWeightUpdateTarget,
  ProfileProgressError,
  resolveProfileFitnessFields,
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
