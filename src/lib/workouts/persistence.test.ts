import assert from "node:assert/strict";
import test from "node:test";

import { buildLegacyFitnessContext, type LegacyProfileRow } from "../fitness-context/model.ts";
import type { GeneratedWorkout } from "../fitness-context/route-pipeline.ts";
import {
  abandonWorkoutSession,
  buildWorkoutPlanPayload,
  completeWorkoutSession,
  getPendingWorkoutOccurrence,
  materializeMyWorkoutSchedule,
  persistGeneratedWorkoutPlan,
  replaceUserWorkoutPlan,
  restoreOriginalWorkoutSchedule,
  setWorkoutSessionExerciseCompletion,
  skipWorkoutScheduleOccurrence,
  startWorkoutSession,
  updateWorkoutSessionNote,
  updateWorkoutWeeklySchedule,
  WorkoutPersistenceError,
  WorkoutPersistenceInputError,
  WorkoutPersistenceResponseError,
  type WorkoutPlanPayload,
  type WorkoutRpcClient,
  type WorkoutScheduleAssignment,
} from "./persistence.ts";

const IDS = {
  workout: "00000000-0000-4000-8000-000000000001",
  occurrence: "00000000-0000-4000-8000-000000000002",
  request: "00000000-0000-4000-8000-000000000003",
  session: "00000000-0000-4000-8000-000000000004",
  exercise: "00000000-0000-4000-8000-000000000005",
};

const timestamp = "2026-10-07T12:00:00.000Z";
const logicalDate = "2026-10-07";

const workouts: GeneratedWorkout[] = [
  {
    name: "Treino A",
    muscle_group: "Peito",
    exercises: [{ name: "Supino", sets: "4", reps: "10", rest: "60s", tip: "Controle" }],
  },
  {
    name: "Treino B",
    muscle_group: "Costas",
    exercises: [{ name: "Remada", sets: "3", reps: "12", rest: "60s", tip: "Postura" }],
  },
];

const context = buildLegacyFitnessContext({
  nome: "Pessoa",
  onboarding_version: null,
  objetivo: "saúde",
  nivel_experiencia: "iniciante",
  dias_treino: 3,
  idade: 30,
  sexo: null,
  peso: 70,
  altura: 170,
} satisfies LegacyProfileRow);

const sessionRow = {
  session_id: IDS.session,
  status: "in_progress",
  workout_id: IDS.workout,
  schedule_occurrence_id: null,
  scheduled_for_date: null,
  workout_title: "Treino A",
  started_at: timestamp,
  completed_at: null,
  note: null,
  replayed: false,
};

function validPlan(): WorkoutPlanPayload {
  return buildWorkoutPlanPayload(workouts, {
    ...context.training,
    preferredWeekdays: [1, 3, 5],
  });
}

function validAssignments(): WorkoutScheduleAssignment[] {
  return Array.from({ length: 7 }, (_, index) => ({
    iso_weekday: index + 1,
    workout_id: index % 2 === 0 ? IDS.workout : null,
  }));
}

function createClient(
  results: Record<string, unknown>,
  calls: Array<{ name: string; args?: Record<string, unknown> }> = []
): WorkoutRpcClient {
  return {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: results[name], error: null };
    },
  };
}

function jsonbTextByteLengthForFixture(value: unknown): number {
  function serialize(item: unknown): string {
    if (item === null || typeof item === "number" || typeof item === "boolean") {
      return JSON.stringify(item);
    }
    if (typeof item === "string") return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(serialize).join(", ")}]`;
    if (item && typeof item === "object") {
      return `{${Object.entries(item)
        .map(([key, nested]) => `${JSON.stringify(key)}: ${serialize(nested)}`)
        .join(", ")}}`;
    }
    throw new TypeError("Fixture is not JSON serializable");
  }

  const transportValue = JSON.parse(JSON.stringify(value)) as unknown;
  return new TextEncoder().encode(serialize(transportValue)).byteLength;
}

test("payload do plano é determinístico e contém sete dias", () => {
  const payload = buildWorkoutPlanPayload(workouts, {
    ...context.training,
    preferredWeekdays: [5, 1, 3, 3],
  });
  assert.deepEqual(payload.workouts.map((item) => item.client_key), ["workout-01", "workout-02"]);
  assert.deepEqual(payload.schedule, [
    { iso_weekday: 1, workout_key: "workout-01" },
    { iso_weekday: 2, workout_key: null },
    { iso_weekday: 3, workout_key: "workout-02" },
    { iso_weekday: 4, workout_key: null },
    { iso_weekday: 5, workout_key: "workout-01" },
    { iso_weekday: 6, workout_key: null },
    { iso_weekday: 7, workout_key: null },
  ]);
});

test("adapter valida as 11 RPCs, cardinalidades, respostas e argumentos exatos", async () => {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const results: Record<string, unknown> = {
    materialize_my_workout_schedule: 7,
    get_pending_workout_occurrence: [],
    start_workout_session: [sessionRow],
    set_workout_session_exercise_completion: [{ exercise_id: IDS.exercise, completed_at: timestamp }],
    update_workout_session_note: [{ session_id: IDS.session, note: "nota", updated_at: timestamp }],
    abandon_workout_session: [{ session_id: IDS.session, status: "abandoned" }],
    skip_workout_schedule_occurrence: [{ occurrence_id: IDS.occurrence, skipped_at: timestamp, skip_reason: "viagem" }],
    update_workout_weekly_schedule: [{ effective_from_date: logicalDate, updated_rows: 7 }],
    restore_original_workout_schedule: [{ effective_from_date: logicalDate, updated_rows: 7 }],
    replace_user_workout_plan: [{ workouts_created: 2, schedule_effective_from: logicalDate }],
    complete_workout_session: [{
      session_id: IDS.session,
      status: "completed",
      completed_at: timestamp,
      completion_date: logicalDate,
      workout_log_id: "9007199254740993",
      energy_awarded: 0,
      replayed: false,
    }],
  };
  const client = createClient(results, calls);
  const plan = validPlan();
  const assignments = validAssignments();

  assert.equal(await materializeMyWorkoutSchedule(client), 7);
  assert.equal(await getPendingWorkoutOccurrence(client), null);
  await startWorkoutSession(client, {
    workoutId: IDS.workout,
    occurrenceId: null,
    clientRequestId: IDS.request,
  });
  await setWorkoutSessionExerciseCompletion(client, {
    sessionId: IDS.session,
    exerciseId: IDS.exercise,
    completed: true,
  });
  await updateWorkoutSessionNote(client, { sessionId: IDS.session, note: "nota" });
  await abandonWorkoutSession(client, IDS.session);
  await skipWorkoutScheduleOccurrence(client, { occurrenceId: IDS.occurrence, reason: "viagem" });
  await updateWorkoutWeeklySchedule(client, assignments);
  await restoreOriginalWorkoutSchedule(client);
  await replaceUserWorkoutPlan(client, plan);
  const completion = await completeWorkoutSession(client, IDS.session);

  assert.equal(completion.workout_log_id, "9007199254740993");
  assert.deepEqual(calls.map((call) => call.name), [
    "materialize_my_workout_schedule",
    "get_pending_workout_occurrence",
    "start_workout_session",
    "set_workout_session_exercise_completion",
    "update_workout_session_note",
    "abandon_workout_session",
    "skip_workout_schedule_occurrence",
    "update_workout_weekly_schedule",
    "restore_original_workout_schedule",
    "replace_user_workout_plan",
    "complete_workout_session",
  ]);
  assert.deepEqual(calls[2].args, {
    p_workout_id: IDS.workout,
    p_schedule_occurrence_id: null,
    p_client_request_id: IDS.request,
  });
  assert.deepEqual(calls[3].args, {
    p_session_id: IDS.session,
    p_exercise_id: IDS.exercise,
    p_completed: true,
  });
  assert.deepEqual(calls[4].args, { p_session_id: IDS.session, p_note: "nota" });
  assert.deepEqual(calls[5].args, { p_session_id: IDS.session });
  assert.deepEqual(calls[6].args, { p_occurrence_id: IDS.occurrence, p_reason: "viagem" });
  assert.deepEqual(calls[7].args, { p_assignments: assignments });
  assert.deepEqual(calls[9].args, { p_plan: plan });
  assert.deepEqual(calls[10].args, { p_session_id: IDS.session });
});

test("pending occurrence aceita zero ou uma row e valida a row presente", async () => {
  const occurrence = {
    occurrence_id: IDS.occurrence,
    scheduled_for_date: logicalDate,
    source_workout_id: null,
    workout_title: "Treino A",
  };
  assert.deepEqual(
    await getPendingWorkoutOccurrence(createClient({ get_pending_workout_occurrence: [occurrence] })),
    occurrence
  );
  assert.equal(
    await getPendingWorkoutOccurrence(createClient({ get_pending_workout_occurrence: [] })),
    null
  );
});

test("timestamp aceita UTC e offsets até o limite PostgreSQL", async () => {
  for (const startedAt of [
    "2026-10-07T12:00:00Z",
    "2026-10-07T12:00:00+00:00",
    "2026-10-07T09:00:00-03:00",
    "2026-10-07T12:00:00+15:59",
    "2026-10-07T12:00:00-15:59",
  ]) {
    const result = await startWorkoutSession(
      createClient({ start_workout_session: [{ ...sessionRow, started_at: startedAt }] }),
      { workoutId: IDS.workout, occurrenceId: null, clientRequestId: IDS.request }
    );
    assert.equal(result.started_at, startedAt);
  }
});

test("respostas malformadas rejeitam null, cardinalidade, campos e tipos inválidos", async (t) => {
  const cases: Array<{ name: string; data: unknown }> = [
    { name: "null inesperado", data: null },
    { name: "objeto em vez de array", data: sessionRow },
    { name: "array vazio", data: [] },
    { name: "duas rows", data: [sessionRow, sessionRow] },
    { name: "campo obrigatório ausente", data: [{ ...sessionRow, session_id: undefined }] },
    { name: "tipo incompatível", data: [{ ...sessionRow, replayed: "false" }] },
    { name: "timestamp inválido", data: [{ ...sessionRow, started_at: "not-a-date" }] },
    { name: "dia de calendário impossível", data: [{ ...sessionRow, started_at: "2026-02-30T12:00:00Z" }] },
    { name: "mês inválido", data: [{ ...sessionRow, started_at: "2026-13-01T12:00:00Z" }] },
    { name: "hora inválida", data: [{ ...sessionRow, started_at: "2026-10-07T24:00:00Z" }] },
    { name: "offset positivo acima do limite", data: [{ ...sessionRow, started_at: "2026-10-07T12:00:00+16:00" }] },
    { name: "offset negativo acima do limite", data: [{ ...sessionRow, started_at: "2026-10-07T12:00:00-16:00" }] },
    { name: "offset muito acima do limite", data: [{ ...sessionRow, started_at: "2026-10-07T12:00:00+23:59" }] },
    { name: "minuto positivo de offset inválido", data: [{ ...sessionRow, started_at: "2026-10-07T12:00:00+15:60" }] },
    { name: "minuto negativo de offset inválido", data: [{ ...sessionRow, started_at: "2026-10-07T12:00:00-15:60" }] },
    { name: "data sem horário no timestamp", data: [{ ...sessionRow, started_at: logicalDate }] },
  ];
  for (const item of cases) {
    await t.test(item.name, async () => {
      await assert.rejects(
        startWorkoutSession(createClient({ start_workout_session: item.data }), {
          workoutId: IDS.workout,
          occurrenceId: null,
          clientRequestId: IDS.request,
        }),
        (error) => error instanceof WorkoutPersistenceResponseError
          && error.operation === "start_workout_session"
      );
    });
  }
});

test("scalar e cardinalidade zero-ou-um rejeitam shapes incompatíveis", async () => {
  await assert.rejects(
    materializeMyWorkoutSchedule(createClient({ materialize_my_workout_schedule: null })),
    WorkoutPersistenceResponseError
  );
  await assert.rejects(
    materializeMyWorkoutSchedule(createClient({ materialize_my_workout_schedule: [7] })),
    WorkoutPersistenceResponseError
  );
  await assert.rejects(
    getPendingWorkoutOccurrence(createClient({ get_pending_workout_occurrence: [{}, {}] })),
    WorkoutPersistenceResponseError
  );
});

test("bigint aceita string e safe integer, mas rejeita number inseguro", async () => {
  const base = {
    session_id: IDS.session,
    status: "completed",
    completed_at: timestamp,
    completion_date: logicalDate,
    energy_awarded: 0,
    replayed: false,
  };
  const fromString = await completeWorkoutSession(
    createClient({ complete_workout_session: [{ ...base, workout_log_id: "9007199254740993" }] }),
    IDS.session
  );
  assert.equal(fromString.workout_log_id, "9007199254740993");
  const fromSafeNumber = await completeWorkoutSession(
    createClient({ complete_workout_session: [{ ...base, workout_log_id: 42 }] }),
    IDS.session
  );
  assert.equal(fromSafeNumber.workout_log_id, "42");
  await assert.rejects(
    completeWorkoutSession(
      createClient({ complete_workout_session: [{ ...base, workout_log_id: Number.MAX_SAFE_INTEGER + 1 }] }),
      IDS.session
    ),
    WorkoutPersistenceResponseError
  );
});

test("erros RPC e autorização permanecem WorkoutPersistenceError", async () => {
  const client: WorkoutRpcClient = {
    rpc: async () => ({
      data: null,
      error: { code: "42501", message: "permission denied" },
    }),
  };
  await assert.rejects(
    materializeMyWorkoutSchedule(client),
    (error) => error instanceof WorkoutPersistenceError
      && !(error instanceof WorkoutPersistenceResponseError)
      && error.operation === "materialize_my_workout_schedule"
      && error.rpcError?.code === "42501"
      && error.cause === error.rpcError
  );
});

test("malformed success usa erro seguro sem serializar a resposta", async () => {
  const secret = "should-not-appear";
  await assert.rejects(
    startWorkoutSession(createClient({ start_workout_session: [{ secret }] }), {
      workoutId: IDS.workout,
      occurrenceId: null,
      clientRequestId: IDS.request,
    }),
    (error) => error instanceof WorkoutPersistenceResponseError
      && error.operation === "start_workout_session"
      && !error.message.includes(secret)
  );
});

test("replace plan rejeita payloads impossíveis antes da RPC", async (t) => {
  const invalidPlans: Array<{ name: string; mutate: (plan: WorkoutPlanPayload) => void }> = [
    { name: "zero workouts", mutate: (plan) => { plan.workouts = []; } },
    {
      name: "quinze workouts",
      mutate: (plan) => {
        plan.workouts = Array.from({ length: 15 }, (_, index) => ({
          ...plan.workouts[0],
          client_key: `workout-${index}`,
        }));
      },
    },
    {
      name: "client_key duplicado",
      mutate: (plan) => { plan.workouts[1].client_key = plan.workouts[0].client_key; },
    },
    { name: "schedule diferente de sete", mutate: (plan) => { plan.schedule.pop(); } },
    {
      name: "weekday duplicado",
      mutate: (plan) => { plan.schedule[1].iso_weekday = plan.schedule[0].iso_weekday; },
    },
    { name: "weekday inválido", mutate: (plan) => { plan.schedule[0].iso_weekday = 8; } },
    { name: "workout_key inexistente", mutate: (plan) => { plan.schedule[0].workout_key = "missing"; } },
    { name: "title vazio", mutate: (plan) => { plan.workouts[0].title = " "; } },
    { name: "exercises vazio", mutate: (plan) => { plan.workouts[0].exercises = []; } },
  ];
  for (const item of invalidPlans) {
    await t.test(item.name, async () => {
      const plan = structuredClone(validPlan());
      item.mutate(plan);
      let rpcCalls = 0;
      const client: WorkoutRpcClient = {
        rpc: async () => {
          rpcCalls += 1;
          return { data: null, error: null };
        },
      };
      await assert.rejects(replaceUserWorkoutPlan(client, plan), WorkoutPersistenceInputError);
      assert.equal(rpcCalls, 0);
    });
  }
});

test("replace plan válido chama a RPC exatamente uma vez", async () => {
  let rpcCalls = 0;
  const client: WorkoutRpcClient = {
    rpc: async (name) => {
      rpcCalls += 1;
      assert.equal(name, "replace_user_workout_plan");
      return {
        data: [{ workouts_created: 2, schedule_effective_from: logicalDate }],
        error: null,
      };
    },
  };
  await replaceUserWorkoutPlan(client, validPlan());
  assert.equal(rpcCalls, 1);
});

test("replace plan mede o limite total em bytes UTF-8 antes da RPC", async () => {
  const belowLimit = validPlan();
  let belowCalls = 0;
  await replaceUserWorkoutPlan({
    rpc: async () => {
      belowCalls += 1;
      return {
        data: [{ workouts_created: 2, schedule_effective_from: logicalDate }],
        error: null,
      };
    },
  }, belowLimit);
  assert.equal(belowCalls, 1);

  const multibytePlan = validPlan();
  multibytePlan.workouts = Array.from({ length: 14 }, (_, workoutIndex) => ({
    client_key: `workout-${workoutIndex}`,
    title: "Treino",
    exercises: Array.from({ length: 40 }, () => ({
      name: "Exercício",
      sets: "4",
      reps: "10",
      rest: "60s",
      tip: "é".repeat(250),
    })),
  }));
  multibytePlan.schedule = Array.from({ length: 7 }, (_, index) => ({
    iso_weekday: index + 1,
    workout_key: null,
  }));
  const serialized = JSON.stringify(multibytePlan);
  assert.ok(serialized.length < 262144);
  assert.ok(new TextEncoder().encode(serialized).byteLength > 262144);

  let oversizedCalls = 0;
  await assert.rejects(
    replaceUserWorkoutPlan({
      rpc: async () => {
        oversizedCalls += 1;
        return { data: null, error: null };
      },
    }, multibytePlan),
    WorkoutPersistenceInputError
  );
  assert.equal(oversizedCalls, 0);
});

test("replace plan aceita 262144 bytes e rejeita 262145 bytes", async () => {
  const atLimit = structuredClone(validPlan());
  const exercise = atLimit.workouts[0].exercises[0] as Record<string, unknown>;
  exercise._padding = "";
  const baseBytes = jsonbTextByteLengthForFixture(atLimit);
  exercise._padding = "a".repeat(262144 - baseBytes);
  assert.equal(jsonbTextByteLengthForFixture(atLimit), 262144);

  let acceptedCalls = 0;
  await replaceUserWorkoutPlan({
    rpc: async () => {
      acceptedCalls += 1;
      return {
        data: [{ workouts_created: 2, schedule_effective_from: logicalDate }],
        error: null,
      };
    },
  }, atLimit);
  assert.equal(acceptedCalls, 1);

  const aboveLimit = structuredClone(atLimit);
  const oversizedExercise = aboveLimit.workouts[0].exercises[0] as Record<string, unknown>;
  oversizedExercise._padding = `${oversizedExercise._padding as string}a`;
  assert.equal(jsonbTextByteLengthForFixture(aboveLimit), 262145);

  let rejectedCalls = 0;
  await assert.rejects(
    replaceUserWorkoutPlan({
      rpc: async () => {
        rejectedCalls += 1;
        return { data: null, error: null };
      },
    }, aboveLimit),
    WorkoutPersistenceInputError
  );
  assert.equal(rejectedCalls, 0);
});

test("replace plan aceita rest e tip opcionais como o parser SQL", async () => {
  const variants: Array<Record<string, unknown>> = [
    { name: "Supino", sets: "4", reps: "10" },
    { name: "Supino", sets: "4", reps: "10", rest: null, tip: null },
    { name: "Supino", sets: "4", reps: "10", rest: "", tip: "" },
    { name: "Supino", sets: "4", reps: "10", rest: "60s", tip: "Controle" },
  ];
  for (const exercise of variants) {
    const plan = structuredClone(validPlan());
    plan.workouts[0].exercises = [exercise as WorkoutPlanPayload["workouts"][number]["exercises"][number]];
    let rpcCalls = 0;
    await replaceUserWorkoutPlan({
      rpc: async () => {
        rpcCalls += 1;
        return {
          data: [{ workouts_created: 2, schedule_effective_from: logicalDate }],
          error: null,
        };
      },
    }, plan);
    assert.equal(rpcCalls, 1);
  }
});

test("replace plan rejeita tipo e bounds inválidos de rest e tip", async (t) => {
  const cases: Array<{ name: string; field: "rest" | "tip"; value: unknown }> = [
    { name: "rest com tipo inválido", field: "rest", value: 60 },
    { name: "tip com tipo inválido", field: "tip", value: false },
    { name: "rest acima do limite", field: "rest", value: "a".repeat(81) },
    { name: "tip acima do limite", field: "tip", value: "a".repeat(501) },
  ];
  for (const item of cases) {
    await t.test(item.name, async () => {
      const plan = structuredClone(validPlan());
      const exercise = plan.workouts[0].exercises[0] as Record<string, unknown>;
      exercise[item.field] = item.value;
      let rpcCalls = 0;
      await assert.rejects(
        replaceUserWorkoutPlan({
          rpc: async () => {
            rpcCalls += 1;
            return { data: null, error: null };
          },
        }, plan),
        WorkoutPersistenceInputError
      );
      assert.equal(rpcCalls, 0);
    });
  }
});

test("weekly schedule rejeita contagem, duplicidade, weekday e UUID inválidos", async (t) => {
  const invalidAssignments: Array<{
    name: string;
    mutate: (assignments: WorkoutScheduleAssignment[]) => void;
  }> = [
    { name: "menos de sete", mutate: (assignments) => { assignments.pop(); } },
    { name: "weekday duplicado", mutate: (assignments) => { assignments[1].iso_weekday = 1; } },
    { name: "weekday inválido", mutate: (assignments) => { assignments[0].iso_weekday = 0; } },
    { name: "UUID inválido", mutate: (assignments) => { assignments[0].workout_id = "invalid"; } },
  ];
  for (const item of invalidAssignments) {
    await t.test(item.name, async () => {
      const assignments = structuredClone(validAssignments());
      item.mutate(assignments);
      let rpcCalls = 0;
      const client: WorkoutRpcClient = {
        rpc: async () => {
          rpcCalls += 1;
          return { data: null, error: null };
        },
      };
      await assert.rejects(updateWorkoutWeeklySchedule(client, assignments), WorkoutPersistenceInputError);
      assert.equal(rpcCalls, 0);
    });
  }
});

test("weekly schedule válido chama a RPC", async () => {
  let rpcCalls = 0;
  const client: WorkoutRpcClient = {
    rpc: async () => {
      rpcCalls += 1;
      return { data: [{ effective_from_date: logicalDate, updated_rows: 7 }], error: null };
    },
  };
  await updateWorkoutWeeklySchedule(client, validAssignments());
  assert.equal(rpcCalls, 1);
});

test("note aplica o bound após btrim SQL sem alterar o payload", async () => {
  let rpcCalls = 0;
  const sentNotes: string[] = [];
  const client: WorkoutRpcClient = {
    rpc: async (_name, args) => {
      rpcCalls += 1;
      const note = args?.p_note as string;
      sentNotes.push(note);
      return {
        data: [{ session_id: IDS.session, note: note.replace(/^ +| +$/g, "") || null, updated_at: timestamp }],
        error: null,
      };
    },
  };
  await updateWorkoutSessionNote(client, { sessionId: IDS.session, note: "" });
  await updateWorkoutSessionNote(client, { sessionId: IDS.session, note: "a".repeat(2000) });
  const padded = ` ${"a".repeat(2000)} `;
  await updateWorkoutSessionNote(client, { sessionId: IDS.session, note: padded });
  await assert.rejects(
    updateWorkoutSessionNote(client, { sessionId: IDS.session, note: "a".repeat(2001) }),
    WorkoutPersistenceInputError
  );
  await assert.rejects(
    updateWorkoutSessionNote(client, {
      sessionId: IDS.session,
      note: `\u00a0${"a".repeat(2000)}\u00a0`,
    }),
    WorkoutPersistenceInputError
  );
  assert.equal(rpcCalls, 3);
  assert.equal(sentNotes[2], padded);
});

test("complete session exige energy_awarded exatamente zero", async () => {
  const base = {
    session_id: IDS.session,
    status: "completed",
    completed_at: timestamp,
    completion_date: logicalDate,
    workout_log_id: "42",
    replayed: false,
  };
  assert.equal((await completeWorkoutSession(
    createClient({ complete_workout_session: [{ ...base, energy_awarded: 0 }] }),
    IDS.session
  )).energy_awarded, 0);
  for (const energyAwarded of [1, -1, 0.5, "0"]) {
    await assert.rejects(
      completeWorkoutSession(
        createClient({ complete_workout_session: [{ ...base, energy_awarded: energyAwarded }] }),
        IDS.session
      ),
      WorkoutPersistenceResponseError
    );
  }
  await assert.rejects(
    completeWorkoutSession(
      createClient({ complete_workout_session: [{ ...base, energy_awarded: null }] }),
      IDS.session
    ),
    WorkoutPersistenceResponseError
  );
  await assert.rejects(
    completeWorkoutSession(
      createClient({ complete_workout_session: [base] }),
      IDS.session
    ),
    WorkoutPersistenceResponseError
  );
});

test("skip reason aplica o bound SQL de 1 a 240 caracteres sem alterar o payload", async () => {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const client = createClient({
    skip_workout_schedule_occurrence: [{
      occurrence_id: IDS.occurrence,
      skipped_at: timestamp,
      skip_reason: "motivo",
    }],
  }, calls);

  await skipWorkoutScheduleOccurrence(client, {
    occurrenceId: IDS.occurrence,
    reason: " motivo ",
  });
  assert.equal(calls[0].args?.p_reason, " motivo ");

  for (const reason of ["   ", "a".repeat(241)]) {
    await assert.rejects(
      skipWorkoutScheduleOccurrence(client, { occurrenceId: IDS.occurrence, reason }),
      WorkoutPersistenceInputError
    );
  }
  assert.equal(calls.length, 1);
});

test("UUID inválido é rejeitado antes da RPC", async () => {
  let rpcCalls = 0;
  const client: WorkoutRpcClient = {
    rpc: async () => {
      rpcCalls += 1;
      return { data: null, error: null };
    },
  };
  await assert.rejects(completeWorkoutSession(client, ""), WorkoutPersistenceInputError);
  await assert.rejects(
    setWorkoutSessionExerciseCompletion(client, {
      sessionId: IDS.session,
      exerciseId: "not-a-uuid",
      completed: true,
    }),
    WorkoutPersistenceInputError
  );
  assert.equal(rpcCalls, 0);
});

test("gerador OFF preserva caminho legado e ON faz um único replace", async () => {
  let legacyCalls = 0;
  let rpcCalls = 0;
  const client: WorkoutRpcClient = {
    rpc: async (name) => {
      rpcCalls += 1;
      assert.equal(name, "replace_user_workout_plan");
      return {
        data: [{ workouts_created: 2, schedule_effective_from: logicalDate }],
        error: null,
      };
    },
  };

  assert.deepEqual(await persistGeneratedWorkoutPlan({
    persistenceV2Enabled: false,
    client,
    workouts,
    training: context.training,
    persistLegacy: async () => { legacyCalls += 1; },
  }), { mode: "legacy" });
  assert.equal(legacyCalls, 1);
  assert.equal(rpcCalls, 0);

  assert.deepEqual(await persistGeneratedWorkoutPlan({
    persistenceV2Enabled: true,
    client,
    workouts,
    training: context.training,
    persistLegacy: async () => { legacyCalls += 1; },
  }), {
    mode: "v2",
    result: { workouts_created: 2, schedule_effective_from: logicalDate },
  });
  assert.equal(legacyCalls, 1);
  assert.equal(rpcCalls, 1);
});
