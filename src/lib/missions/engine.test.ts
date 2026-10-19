import assert from "node:assert/strict";
import test from "node:test";

import { resolveCurrentMissionCapabilities } from "./capabilities.ts";
import {
  MISSION_ALGORITHM_VERSION,
  type MissionDailyContext,
  type MissionHistoryEntry,
} from "./domain.ts";
import { resolveAvailableMissionDefinitions, selectDailyMissions } from "./engine.ts";
import { resolveWorkoutPrescription } from "../workouts/prescription/engine.ts";
import { validationContext } from "../workouts/validation/test-fixtures.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function context(options: {
  goal: "fat_loss" | "hypertrophy" | "conditioning";
  sessionKind?: "RESISTANCE" | "AEROBIC_BASE" | "INTERVAL" | "STRENGTH_SUPPORT";
  completed?: boolean;
  noPlan?: boolean;
  recent?: readonly MissionHistoryEntry[];
  consistency?: number;
}): MissionDailyContext {
  const fitness = validationContext({ goal: options.goal, level: "intermediate", availableFrequency: 5, duration: 60 });
  const prescription = options.noPlan ? null : resolveWorkoutPrescription(fitness);
  const scheduled = options.sessionKind ? {
    occurrenceId: "22222222-2222-4222-8222-222222222222",
    title: "Sessão programada",
    sessionKind: options.sessionKind,
    completed: options.completed ?? false,
  } : null;
  return {
    userId: USER_ID,
    date: "2026-10-19",
    goal: options.goal,
    workoutPrescription: prescription,
    scheduledWorkout: scheduled,
    scheduledCardio: options.sessionKind === "AEROBIC_BASE" || options.sessionKind === "INTERVAL" ? scheduled : null,
    recentMissionHistory: options.recent ?? [],
    supportedCapabilities: resolveCurrentMissionCapabilities(),
    completedScheduledWorkoutsTrailing7Days: options.consistency ?? 0,
  };
}

test("hypertrophy resistance day gera treino específico e consistência, sem nutrição falsa", () => {
  const result = selectDailyMissions(context({ goal: "hypertrophy", sessionKind: "RESISTANCE" }));
  assert.deepEqual(result.missions.map((mission) => mission.code), [
    "scheduled_resistance_workout",
    "weekly_workout_consistency",
  ]);
  assert.equal(result.missions.some((mission) => mission.category === "NUTRITION"), false);
});

test("fat-loss resistance day respeita força e não inventa cardio", () => {
  const result = selectDailyMissions(context({ goal: "fat_loss", sessionKind: "RESISTANCE" }));
  assert.equal(result.missions.some((mission) => mission.code === "scheduled_resistance_workout"), true);
  assert.equal(result.missions.some((mission) => mission.category === "CARDIO"), false);
});

test("fat-loss strength + cardio day aceita duas ações distintas e mensuráveis", () => {
  const input = context({ goal: "fat_loss", sessionKind: "RESISTANCE" });
  const result = selectDailyMissions({
    ...input,
    scheduledCardio: {
      occurrenceId: "33333333-3333-4333-8333-333333333333",
      title: "Base aeróbica programada",
      sessionKind: "AEROBIC_BASE",
      completed: false,
    },
  });
  assert.deepEqual(new Set(result.missions.map((mission) => mission.category)), new Set([
    "TRAINING",
    "CARDIO",
    "CONSISTENCY",
  ]));
  assert.equal(new Set(result.missions.map((mission) => mission.sourceOccurrenceId).filter(Boolean)).size, 2);
});

test("conditioning aerobic-base day usa copy específica", () => {
  const result = selectDailyMissions(context({ goal: "conditioning", sessionKind: "AEROBIC_BASE" }));
  const cardio = result.missions.find((mission) => mission.category === "CARDIO");
  assert.equal(cardio?.code, "scheduled_aerobic_base");
  assert.match(cardio?.title ?? "", /aeróbico/);
});

test("conditioning interval day reconhece INTERVAL", () => {
  const result = selectDailyMissions(context({ goal: "conditioning", sessionKind: "INTERVAL" }));
  assert.equal(result.missions.find((mission) => mission.category === "CARDIO")?.code, "scheduled_intervals");
});

test("rest day retorna apenas consistência mensurável e nunca treino", () => {
  const result = selectDailyMissions(context({ goal: "fat_loss" }));
  assert.deepEqual(result.missions.map((mission) => mission.code), ["weekly_workout_consistency"]);
  assert.equal(result.shortfallReasons.includes("NO_SCHEDULED_WORKOUT"), true);
});

test("usuário sem plano não recebe workout, cardio ou consistência", () => {
  const result = selectDailyMissions(context({ goal: "hypertrophy", noPlan: true }));
  assert.equal(result.missions.length, 0);
  assert.equal(result.shortfallReasons.includes("NO_WORKOUT_PLAN"), true);
});

test("nutrition consumption indisponível mantém missões nutricionais bloqueadas", () => {
  const availability = resolveAvailableMissionDefinitions(context({ goal: "hypertrophy", sessionKind: "RESISTANCE" }));
  for (const code of ["log_meals", "reach_protein_target"]) {
    const item = availability.find((candidate) => candidate.definition.code === code);
    assert.deepEqual(item && !item.available ? item.reason : null, "NO_CONSUMPTION_CONTRACT");
  }
});

test("mesma pessoa, data e versão produzem seleção idêntica em retries", () => {
  const input = context({ goal: "conditioning", sessionKind: "INTERVAL", consistency: 2 });
  assert.deepEqual(selectDailyMissions(input), selectDailyMissions(structuredClone(input)));
  assert.equal(selectDailyMissions(input).algorithmVersion, MISSION_ALGORITHM_VERSION);
});

test("repetição recente recebe penalidade sem introduzir aleatoriedade", () => {
  const baseline = context({ goal: "conditioning", sessionKind: "INTERVAL" });
  const repeated = context({
    goal: "conditioning",
    sessionKind: "INTERVAL",
    recent: [{ code: "weekly_workout_consistency", category: "CONSISTENCY", localDate: "2026-10-18" }],
  });
  const initial = selectDailyMissions(baseline).missions.find((mission) => mission.code === "weekly_workout_consistency")!;
  const penalized = selectDailyMissions(repeated).missions.find((mission) => mission.code === "weekly_workout_consistency")!;
  assert.ok(penalized.score < initial.score);
});

test("penalidade recente troca a combinação quando há alternativa real", () => {
  const input = context({ goal: "fat_loss", sessionKind: "RESISTANCE" });
  const capabilities = {
    ...input.supportedCapabilities,
    STEP_TARGET: {
      ...input.supportedCapabilities.STEP_TARGET,
      supported: true,
      canVerifyServerSide: true,
      measurementSource: "test-step-source",
      reasonUnavailable: undefined,
    },
    RECOVERY_TRACKING: {
      ...input.supportedCapabilities.RECOVERY_TRACKING,
      supported: true,
      canVerifyServerSide: true,
      measurementSource: "test-recovery-source",
      reasonUnavailable: undefined,
    },
  };
  const first = selectDailyMissions({ ...input, supportedCapabilities: capabilities });
  const repeatedCodes = first.missions.map((mission) => ({
    code: mission.code,
    category: mission.category,
    localDate: "2026-10-18",
  }));
  const second = selectDailyMissions({
    ...input,
    supportedCapabilities: capabilities,
    recentMissionHistory: repeatedCodes,
  });
  assert.notDeepEqual(second.missions.map((mission) => mission.code), first.missions.map((mission) => mission.code));
});

test("capability não suportada nunca é selecionada", () => {
  const result = selectDailyMissions(context({ goal: "hypertrophy", sessionKind: "RESISTANCE" }));
  assert.equal(result.missions.some((mission) => ["log_meals", "reach_protein_target", "progressive_overload"].includes(mission.code)), false);
});

test("não cria múltiplas missões para o mesmo evento", () => {
  const result = selectDailyMissions(context({ goal: "conditioning", sessionKind: "INTERVAL" }));
  const occurrenceIds = result.missions.map((mission) => mission.sourceOccurrenceId).filter(Boolean);
  assert.equal(new Set(occurrenceIds).size, occurrenceIds.length);
});

test("target 3 só é preenchido quando três capabilities reais estão habilitadas", () => {
  const input = context({ goal: "fat_loss", sessionKind: "RESISTANCE" });
  const capabilities = {
    ...input.supportedCapabilities,
    STEP_TARGET: {
      ...input.supportedCapabilities.STEP_TARGET,
      supported: true,
      canVerifyServerSide: true,
      measurementSource: "test-step-source",
      reasonUnavailable: undefined,
    },
  };
  const result = selectDailyMissions({ ...input, supportedCapabilities: capabilities });
  assert.equal(result.missions.length, 3);
  assert.equal(new Set(result.missions.map((mission) => mission.category)).size, 3);
});
