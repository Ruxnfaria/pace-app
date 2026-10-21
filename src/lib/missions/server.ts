import "server-only";

import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";

import { getUserFitnessContext } from "../fitness-context/server";
import { syncDailyMissionChests, syncMonthlyMissionChest, syncWeeklyMissionChest } from "../rewards/server";
import { materializeMyWorkoutSchedule, type WorkoutRpcClient } from "../workouts/persistence";
import { resolveWorkoutPrescription } from "../workouts/prescription/engine";
import { WorkoutPrescriptionError, type SessionKind } from "../workouts/prescription/domain";
import { isWorkoutPersistenceV2Enabled } from "../workouts/runtime-policy";
import { resolveCurrentMissionCapabilities } from "./capabilities";
import { MISSION_ALGORITHM_VERSION, type MissionCategory, type MissionDailyContext } from "./domain";
import { runDailyMissionGeneration, type MaterializedMission, type MissionRuntimeResult } from "./runtime";

type MissionDatabaseRow = { id: string; mission_code: string; completed: boolean };

function createMissionServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Mission service credentials are not configured");
  return createServiceClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isoWeekday(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function assertMissionRows(value: unknown): MissionDatabaseRow[] {
  if (!Array.isArray(value)) throw new Error("Mission RPC returned a malformed response");
  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Mission RPC returned a malformed row");
    }
    const item = row as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.mission_code !== "string" || typeof item.completed !== "boolean") {
      throw new Error("Mission RPC returned an incomplete row");
    }
    return { id: item.id, mission_code: item.mission_code, completed: item.completed };
  });
}

async function buildDailyContext(
  authClient: SupabaseClient,
  userId: string,
  date: string,
): Promise<MissionDailyContext> {
  const fitnessContext = await getUserFitnessContext(authClient, userId);
  let prescription: ReturnType<typeof resolveWorkoutPrescription> | null = null;
  try {
    prescription = resolveWorkoutPrescription(fitnessContext);
  } catch (error) {
    if (!(error instanceof WorkoutPrescriptionError)) throw error;
  }

  if (isWorkoutPersistenceV2Enabled()) {
    await materializeMyWorkoutSchedule(authClient as unknown as WorkoutRpcClient);
  }

  const [occurrenceResult, completedSessionsResult, historyResult] = await Promise.all([
    authClient
      .from("workout_schedule_occurrences")
      .select("id, workout_title_snapshot, skipped_at")
      .eq("user_id", userId)
      .eq("scheduled_for_date", date)
      .maybeSingle(),
    authClient
      .from("workout_sessions")
      .select("id, schedule_occurrence_id, completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .not("schedule_occurrence_id", "is", null)
      .gte("completed_at", `${shiftDate(date, -6)}T00:00:00-03:00`)
      .lte("completed_at", `${date}T23:59:59.999-03:00`),
    authClient
      .from("daily_missions")
      .select("mission_code, category, for_date")
      .eq("user_id", userId)
      .not("mission_code", "is", null)
      .gte("for_date", shiftDate(date, -14))
      .lt("for_date", date),
  ]);
  if (occurrenceResult.error) throw occurrenceResult.error;
  if (completedSessionsResult.error) throw completedSessionsResult.error;
  if (historyResult.error) throw historyResult.error;

  const occurrence = occurrenceResult.data;
  const prescribedSession = prescription?.sessions.find((session) => session.isoWeekday === isoWeekday(date)) ?? null;
  const completedOccurrenceIds = new Set(
    (completedSessionsResult.data ?? [])
      .map((session) => session.schedule_occurrence_id)
      .filter((id): id is string => typeof id === "string"),
  );
  const scheduled = occurrence && !occurrence.skipped_at && prescribedSession
    ? {
        occurrenceId: occurrence.id as string,
        title: occurrence.workout_title_snapshot as string,
        sessionKind: prescribedSession.kind as SessionKind,
        completed: completedOccurrenceIds.has(occurrence.id as string),
      }
    : null;
  const isStandaloneCardio = scheduled?.sessionKind === "AEROBIC_BASE" || scheduled?.sessionKind === "INTERVAL";
  const history = (historyResult.data ?? []).flatMap((row) => {
    if (typeof row.mission_code !== "string" || typeof row.for_date !== "string") return [];
    const category = row.category as MissionCategory;
    if (!["TRAINING", "CARDIO", "CONSISTENCY", "NUTRITION", "ACTIVITY", "RECOVERY"].includes(category)) return [];
    return [{ code: row.mission_code, category, localDate: row.for_date }];
  });

  return {
    userId,
    date,
    goal: prescription?.goal ?? "conditioning",
    workoutPrescription: prescription,
    scheduledWorkout: scheduled,
    scheduledCardio: isStandaloneCardio ? scheduled : null,
    recentMissionHistory: history,
    supportedCapabilities: resolveCurrentMissionCapabilities(),
    completedScheduledWorkoutsTrailing7Days: completedOccurrenceIds.size,
  };
}

export async function generateUserDailyMissions(options: {
  authClient: SupabaseClient;
  userId: string;
  date: string;
}): Promise<MissionRuntimeResult> {
  const serviceClient = createMissionServiceClient();
  const result = await runDailyMissionGeneration({
    loadContext: () => buildDailyContext(options.authClient, options.userId, options.date),
    loadExisting: async (context) => {
      const response = await options.authClient
        .from("daily_missions")
        .select("id, mission_code, completed")
        .eq("user_id", context.userId)
        .eq("for_date", context.date)
        .eq("algorithm_version", MISSION_ALGORITHM_VERSION)
        .order("created_at", { ascending: true });
      if (response.error) throw response.error;
      return assertMissionRows(response.data).map((row): MaterializedMission => ({
        id: row.id,
        missionCode: row.mission_code,
        completed: row.completed,
      }));
    },
    materialize: async (context, missions) => {
      const response = await serviceClient.rpc("materialize_daily_missions_v1", {
        p_user_id: context.userId,
        p_for_date: context.date,
        p_algorithm_version: MISSION_ALGORITHM_VERSION,
        p_missions: missions.map((mission) => ({
          code: mission.code,
          category: mission.category,
          title: mission.title,
          description: mission.description,
          completion_rule: mission.completionRule,
          energy_reward: mission.energyReward,
          difficulty: mission.difficulty,
          target_value: mission.targetValue,
          current_value: mission.currentValue,
          source_workout_occurrence_id: mission.sourceOccurrenceId,
        })),
      });
      if (response.error) throw response.error;
      return assertMissionRows(response.data).map((row) => ({
        id: row.id,
        missionCode: row.mission_code,
        completed: row.completed,
      }));
    },
    syncProgress: async ({ context, mission, currentValue, completed }) => {
      const response = await serviceClient.rpc("sync_intelligent_mission_progress_v1", {
        p_user_id: context.userId,
        p_mission_id: mission.id,
        p_current_value: currentValue,
        p_verified_complete: completed,
      });
      if (response.error) throw response.error;
      const row = Array.isArray(response.data) ? response.data[0] as Record<string, unknown> | undefined : undefined;
      if (!row || typeof row.completed_now !== "boolean") {
        throw new Error("Mission progress RPC returned a malformed response");
      }
      return { completedNow: row.completed_now };
    },
  });
  if (result.completedNow > 0) {
    await syncDailyMissionChests(options.userId, options.date);
    await syncWeeklyMissionChest(options.userId, options.date);
    await syncMonthlyMissionChest(options.userId, options.date);
  }
  return result;
}
