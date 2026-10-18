type MissionCompletionEffects = {
  awardEnergy: () => Promise<void>;
  recordStreak: () => Promise<void>;
  syncChests: () => Promise<void>;
};

type RelationReadError = {
  code?: string | null;
  message?: string | null;
};

const OPTIONAL_LEGACY_MISSION_RELATIONS = new Set([
  "nutrition_logs",
  "nutrition_plans",
]);

export async function resolveOptionalMissionRelation<T>(options: {
  relation: string;
  fallback: T;
  read: () => PromiseLike<{
    data: T | null;
    error: RelationReadError | null;
  }>;
}): Promise<T> {
  const { data, error } = await options.read();

  if (!error) return data ?? options.fallback;

  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  const relation = options.relation.toLowerCase();
  const relationIsMissing =
    OPTIONAL_LEGACY_MISSION_RELATIONS.has(relation) &&
    (code === "PGRST205" || code === "42P01") &&
    message.includes(relation);

  if (relationIsMissing) return options.fallback;

  throw error;
}

function isContainedWorkout(options: {
  persistenceV2Enabled: boolean;
  category: string;
}) {
  return options.persistenceV2Enabled && options.category === "workout";
}

export function assertNewWorkoutMissionV2Invariant(options: {
  persistenceV2Enabled: boolean;
  category: string;
  currentValue: number;
  completed: boolean;
  completedAt: string | null;
}) {
  if (!isContainedWorkout(options)) return;

  if (
    options.currentValue !== 0 ||
    options.completed !== false ||
    options.completedAt !== null
  ) {
    throw new Error(
      "Nova missão workout V2 deve iniciar com progresso neutro e incompleta"
    );
  }
}

export async function insertNewGeneratedMissionAfterInvariant<T>(options: {
  persistenceV2Enabled: boolean;
  category: string;
  currentValue: number;
  completed: boolean;
  completedAt: string | null;
  insert: () => PromiseLike<T>;
}): Promise<T> {
  assertNewWorkoutMissionV2Invariant(options);
  return await options.insert();
}

async function runCompletionEffects(effects: MissionCompletionEffects) {
  await effects.awardEnergy();
  await effects.syncChests();
  await effects.recordStreak();
}

export async function applyNewGeneratedMissionCompletion(options: {
  persistenceV2Enabled: boolean;
  category: string;
  completed: boolean;
  effects: MissionCompletionEffects;
}): Promise<{ awarded: boolean }> {
  if (!options.completed || isContainedWorkout(options)) {
    return { awarded: false };
  }

  await runCompletionEffects(options.effects);
  return { awarded: true };
}

export async function reconcileExistingGeneratedMission(options: {
  persistenceV2Enabled: boolean;
  category: string;
  existingCompleted: boolean;
  missionCompleted: boolean;
  updateCurrentValue: () => Promise<void>;
  completeMission: () => Promise<boolean>;
  effects: MissionCompletionEffects;
}): Promise<
  | { preserved: true; completedNow: false }
  | { preserved: false; completedNow: boolean }
> {
  if (isContainedWorkout(options)) {
    return { preserved: true, completedNow: false };
  }

  if (options.existingCompleted) {
    await options.updateCurrentValue();
    return { preserved: false, completedNow: false };
  }

  if (options.missionCompleted) {
    const completedNow = await options.completeMission();
    if (completedNow) {
      await runCompletionEffects(options.effects);
    }

    return { preserved: false, completedNow };
  }

  await options.updateCurrentValue();
  return { preserved: false, completedNow: false };
}
