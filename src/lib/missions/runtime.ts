import { MISSION_ALGORITHM_VERSION, type MissionDailyContext, type SelectedDailyMission } from "./domain.ts";
import { resolveMissionProgress, selectDailyMissions } from "./engine.ts";

export type MaterializedMission = {
  id: string;
  missionCode: string;
  completed: boolean;
};

export type MissionRuntimeDependencies = {
  loadContext: () => Promise<MissionDailyContext>;
  loadExisting: (context: MissionDailyContext) => Promise<readonly MaterializedMission[]>;
  materialize: (
    context: MissionDailyContext,
    missions: readonly SelectedDailyMission[],
  ) => Promise<readonly MaterializedMission[]>;
  syncProgress: (input: {
    context: MissionDailyContext;
    mission: MaterializedMission;
    currentValue: number;
    completed: boolean;
  }) => Promise<{ completedNow: boolean }>;
};

export type MissionRuntimeResult = {
  algorithmVersion: typeof MISSION_ALGORITHM_VERSION;
  created: number;
  selected: number;
  materialized: number;
  completedNow: number;
  returnedFewerReasonCodes: readonly string[];
};

export async function runDailyMissionGeneration(
  dependencies: MissionRuntimeDependencies,
): Promise<MissionRuntimeResult> {
  const context = await dependencies.loadContext();
  const selection = selectDailyMissions(context);
  const existing = await dependencies.loadExisting(context);
  const materialized = existing.length > 0
    ? existing
    : await dependencies.materialize(context, selection.missions);
  let completedNow = 0;
  for (const mission of materialized) {
    const progress = resolveMissionProgress(mission.missionCode, context);
    if (!progress) continue;
    const sync = await dependencies.syncProgress({
      context,
      mission,
      currentValue: progress.currentValue,
      completed: progress.completed,
    });
    if (sync.completedNow) completedNow += 1;
  }
  return {
    algorithmVersion: MISSION_ALGORITHM_VERSION,
    created: existing.length > 0 ? 0 : materialized.length,
    selected: selection.missions.length,
    materialized: materialized.length,
    completedNow,
    returnedFewerReasonCodes: selection.shortfallReasons,
  };
}
