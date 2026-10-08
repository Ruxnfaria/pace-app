import type { SupabaseClient } from "@supabase/supabase-js";

import {
  abandonWorkoutSession,
  completeWorkoutSession,
  getPendingWorkoutOccurrence,
  materializeMyWorkoutSchedule,
  restoreOriginalWorkoutSchedule,
  setWorkoutSessionExerciseCompletion,
  skipWorkoutScheduleOccurrence,
  startWorkoutSession,
  updateWorkoutSessionNote,
  updateWorkoutWeeklySchedule,
  type PersistedWorkoutSession,
  type WorkoutRpcClient,
} from "./persistence.ts";
import {
  getSessionDurationSeconds,
  normalizeWorkout,
  type DurableWorkoutHistoryItem,
  type LegacyWorkoutHistoryItem,
  type Weekday,
  type Workout,
  type WorkoutSession,
  type WorkoutSessionExercise,
  type WorkoutWeeklyScheduleRow,
} from "./model.ts";
import type { WorkoutLifecycleGateway, WorkoutLifecycleSnapshot } from "./lifecycle.ts";

type UnknownRow = Record<string, unknown>;

function queryFailure(label: string, error: unknown): never {
  throw new Error(`Não foi possível carregar ${label}.`, { cause: error });
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asRequiredString(value: unknown, label: string): string {
  const result = asString(value);
  if (!result) throw new Error(`Resposta inválida ao carregar ${label}.`);
  return result;
}

function asSession(row: UnknownRow): WorkoutSession {
  const status = row.status;
  if (status !== "in_progress" && status !== "completed" && status !== "abandoned") {
    throw new Error("Status de sessão inválido.");
  }
  return {
    id: asRequiredString(row.id, "sessão"),
    status,
    workoutId: asString(row.workout_id),
    scheduleOccurrenceId: asString(row.schedule_occurrence_id),
    scheduledForDate: asString(row.scheduled_for_date),
    workoutTitle: asRequiredString(row.workout_title, "título da sessão"),
    startedAt: asRequiredString(row.started_at, "início da sessão"),
    completedAt: asString(row.completed_at),
    note: asString(row.note),
  };
}

export function resolveActiveWorkoutSession(
  rows: Array<Record<string, unknown>>
): WorkoutSession | null {
  if (rows.length > 1) {
    throw new Error("Estado inválido: mais de uma sessão de treino está em andamento.");
  }
  return rows[0] ? asSession(rows[0]) : null;
}

function fromRpcSession(session: PersistedWorkoutSession): WorkoutSession {
  return {
    id: session.session_id,
    status: session.status,
    workoutId: session.workout_id,
    scheduleOccurrenceId: session.schedule_occurrence_id,
    scheduledForDate: session.scheduled_for_date,
    workoutTitle: session.workout_title,
    startedAt: session.started_at,
    completedAt: session.completed_at,
    note: session.note,
  };
}

function asExercise(row: UnknownRow): WorkoutSessionExercise {
  const position = row.exercise_position;
  if (!Number.isSafeInteger(position)) throw new Error("Posição de exercício inválida.");
  return {
    id: asRequiredString(row.id, "exercício da sessão"),
    sessionId: asRequiredString(row.session_id, "sessão do exercício"),
    exerciseKey: asString(row.exercise_key),
    name: asRequiredString(row.name, "nome do exercício"),
    position: position as number,
    sets: asRequiredString(row.sets, "séries"),
    reps: asRequiredString(row.reps, "repetições"),
    rest: asString(row.rest),
    tip: asString(row.tip_snapshot),
    completedAt: asString(row.completed_at),
  };
}

function asSchedule(row: UnknownRow): WorkoutWeeklyScheduleRow {
  const weekday = row.iso_weekday;
  if (!Number.isInteger(weekday) || (weekday as number) < 1 || (weekday as number) > 7) {
    throw new Error("Dia da agenda inválido.");
  }
  return {
    isoWeekday: weekday as Weekday,
    originalWorkoutId: asString(row.original_workout_id),
    workoutId: asString(row.workout_id),
    effectiveFromDate: asRequiredString(row.effective_from_date, "vigência da agenda"),
    materializedThroughDate: asRequiredString(row.materialized_through_date, "materialização da agenda"),
  };
}

export function buildWorkoutHistory(input: {
  completedSessions: WorkoutSession[];
  exercises: WorkoutSessionExercise[];
  bridges: Map<string, string>;
  logs: UnknownRow[];
  workouts: Workout[];
}): {
  durableHistory: DurableWorkoutHistoryItem[];
  legacyHistory: LegacyWorkoutHistoryItem[];
} {
  const durableHistory = input.completedSessions.flatMap((session): DurableWorkoutHistoryItem[] => {
    if (session.status !== "completed" || !session.completedAt) return [];
    const workoutLogId = input.bridges.get(session.id);
    if (!workoutLogId) return [];
    return [{
      kind: "durable",
      session: { ...session, status: "completed", completedAt: session.completedAt },
      exercises: input.exercises.filter((exercise) => exercise.sessionId === session.id),
      workoutLogId,
      durationSeconds: getSessionDurationSeconds(session.startedAt, session.completedAt),
    }];
  });
  const bridgedLogIds = new Set(input.bridges.values());
  const legacyHistory = input.logs.flatMap((row): LegacyWorkoutHistoryItem[] => {
    const id = row.id === null || row.id === undefined ? null : String(row.id);
    const date = asString(row.workout_date);
    if (!id || !date || bridgedLogIds.has(id)) return [];
    const workoutId = asString(row.workout_id);
    return [{
      kind: "legacy",
      id,
      workoutId,
      workoutDate: date,
      currentWorkoutTitle: input.workouts.find((workout) => workout.id === workoutId)?.title ?? null,
    }];
  });
  return { durableHistory, legacyHistory };
}

export async function loadPreviousWorkoutNote(
  client: SupabaseClient,
  userId: string,
  workoutId: string | null
): Promise<string | null> {
  if (!workoutId) return null;
  const result = await client.from("workout_sessions")
    .select("note, completed_at")
    .eq("user_id", userId)
    .eq("workout_id", workoutId)
    .eq("status", "completed")
    .not("note", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) queryFailure("a nota anterior", result.error);
  return asString((result.data as UnknownRow | null)?.note);
}

export function createBrowserWorkoutGateway(
  client: SupabaseClient
): WorkoutLifecycleGateway {
  const rpcClient = client as unknown as WorkoutRpcClient;

  async function loadSnapshot(): Promise<WorkoutLifecycleSnapshot> {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) queryFailure("a sessão autenticada", authError);
    if (!authData.user) throw new Error("Sessão não encontrada.");
    const userId = authData.user.id;
    const pending = await getPendingWorkoutOccurrence(rpcClient);
    const [workoutsResult, scheduleResult, activeResult, completedResult, logsResult] = await Promise.all([
      client.from("workouts").select("id, title, exercises, created_at")
        .eq("user_id", userId).order("created_at", { ascending: true }),
      client.from("workout_weekly_schedule")
        .select("iso_weekday, original_workout_id, workout_id, effective_from_date, materialized_through_date")
        .eq("user_id", userId).order("iso_weekday", { ascending: true }),
      client.from("workout_sessions")
        .select("id, status, workout_id, schedule_occurrence_id, scheduled_for_date, workout_title, started_at, completed_at, note")
        .eq("user_id", userId).eq("status", "in_progress")
        .order("started_at", { ascending: false }).limit(2),
      client.from("workout_sessions")
        .select("id, status, workout_id, schedule_occurrence_id, scheduled_for_date, workout_title, started_at, completed_at, note")
        .eq("user_id", userId).eq("status", "completed")
        .order("completed_at", { ascending: false }).limit(40),
      client.from("workout_logs").select("id, workout_id, workout_date")
        .eq("user_id", userId).order("workout_date", { ascending: false }).limit(80),
    ]);
    if (workoutsResult.error) queryFailure("os treinos", workoutsResult.error);
    if (scheduleResult.error) queryFailure("a agenda", scheduleResult.error);
    if (activeResult.error) queryFailure("a sessão ativa", activeResult.error);
    if (completedResult.error) queryFailure("o histórico persistente", completedResult.error);
    if (logsResult.error) queryFailure("o histórico legado", logsResult.error);

    const workouts = (workoutsResult.data ?? [])
      .map(normalizeWorkout).filter((item): item is NonNullable<typeof item> => item !== null);
    const activeSession = resolveActiveWorkoutSession(
      (activeResult.data ?? []) as UnknownRow[]
    );
    const completedSessions = (completedResult.data ?? []).map((row) => asSession(row as UnknownRow));
    const sessionIds = [activeSession?.id, ...completedSessions.map((session) => session.id)]
      .filter((id): id is string => Boolean(id));
    const logIds = (logsResult.data ?? []).flatMap((row) => {
      const id = (row as UnknownRow).id;
      return id === null || id === undefined ? [] : [String(id)];
    });

    const [exerciseResult, bridgeBySessionResult, bridgeByLogResult, previousNote] = await Promise.all([
      sessionIds.length ? client.from("workout_session_exercises")
        .select("id, session_id, exercise_key, name, exercise_position, sets, reps, rest, tip_snapshot, completed_at")
        .in("session_id", sessionIds).order("exercise_position", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      sessionIds.length ? client.from("workout_session_legacy_log")
        .select("session_id, workout_log_id").in("session_id", sessionIds)
        : Promise.resolve({ data: [], error: null }),
      logIds.length ? client.from("workout_session_legacy_log")
        .select("session_id, workout_log_id").in("workout_log_id", logIds)
        : Promise.resolve({ data: [], error: null }),
      loadPreviousWorkoutNote(client, userId, activeSession?.workoutId ?? null),
    ]);
    if (exerciseResult.error) queryFailure("os exercícios das sessões", exerciseResult.error);
    if (bridgeBySessionResult.error || bridgeByLogResult.error) {
      queryFailure("as pontes do histórico", bridgeBySessionResult.error ?? bridgeByLogResult.error);
    }

    const exercises = (exerciseResult.data ?? []).map((row) => asExercise(row as UnknownRow));
    const bridges = new Map(
      [...(bridgeBySessionResult.data ?? []), ...(bridgeByLogResult.data ?? [])]
        .map((row) => [String(row.session_id), String(row.workout_log_id)])
    );
    const { durableHistory, legacyHistory } = buildWorkoutHistory({
      completedSessions,
      exercises,
      bridges,
      logs: (logsResult.data ?? []) as UnknownRow[],
      workouts,
    });

    return {
      workouts,
      schedule: (scheduleResult.data ?? []).map((row) => asSchedule(row as UnknownRow)),
      pending: pending ? {
        id: pending.occurrence_id,
        scheduledForDate: pending.scheduled_for_date,
        sourceWorkoutId: pending.source_workout_id,
        workoutTitle: pending.workout_title,
      } : null,
      activeSession,
      activeExercises: activeSession
        ? exercises.filter((exercise) => exercise.sessionId === activeSession.id)
        : [],
      durableHistory,
      legacyHistory,
      previousNote,
    };
  }

  return {
    materialize: () => materializeMyWorkoutSchedule(rpcClient),
    loadSnapshot,
    start: async (input) => fromRpcSession(await startWorkoutSession(rpcClient, input)),
    setExercise: async (input) => {
      const result = await setWorkoutSessionExerciseCompletion(rpcClient, input);
      return { exerciseId: result.exercise_id, completedAt: result.completed_at };
    },
    saveNote: async (input) => {
      const result = await updateWorkoutSessionNote(rpcClient, input);
      return { note: result.note };
    },
    abandon: async (sessionId) => { await abandonWorkoutSession(rpcClient, sessionId); },
    skip: async (input) => { await skipWorkoutScheduleOccurrence(rpcClient, input); },
    updateSchedule: async (assignments) => {
      const result = await updateWorkoutWeeklySchedule(rpcClient, assignments);
      return { effectiveFromDate: result.effective_from_date };
    },
    restoreSchedule: async () => {
      const result = await restoreOriginalWorkoutSchedule(rpcClient);
      return { effectiveFromDate: result.effective_from_date };
    },
    complete: async (sessionId) => {
      const result = await completeWorkoutSession(rpcClient, sessionId);
      return { energyAwarded: 0, replayed: result.replayed };
    },
  };
}
