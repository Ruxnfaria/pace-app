type MissionCompletionEffects = {
  awardEnergy: () => Promise<void>;
  recordStreak: () => Promise<void>;
  syncChests: () => Promise<void>;
};

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
