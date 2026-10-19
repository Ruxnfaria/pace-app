import {
  MISSION_ALGORITHM_VERSION,
  TARGET_DAILY_MISSIONS,
  type MissionAvailability,
  type MissionDailyContext,
  type MissionDefinition,
  type MissionSelectionResult,
  type MissionUnavailableReason,
  type SelectedDailyMission,
} from "./domain.ts";
import { MISSION_DEFINITIONS, MISSION_GOAL_STRATEGIES } from "./registry.ts";

function scheduledActivityFor(definition: MissionDefinition, context: MissionDailyContext) {
  return definition.requiredCapability === "SCHEDULED_CARDIO_COMPLETION"
    ? context.scheduledCardio
    : context.scheduledWorkout;
}

function unavailableReason(
  definition: MissionDefinition,
  context: MissionDailyContext,
): MissionUnavailableReason | null {
  const capability = context.supportedCapabilities[definition.requiredCapability];
  if (!capability.supported || !capability.canVerifyServerSide) {
    return capability.reasonUnavailable ?? "UNSUPPORTED_CAPABILITY";
  }
  if (!definition.goalAffinity.includes(context.goal)) return "GOAL_NOT_APPLICABLE";
  if (definition.requiredCapability === "WORKOUT_COMPLETION") {
    if (!context.scheduledWorkout) return "NO_SCHEDULED_WORKOUT";
  }
  if (definition.requiredCapability === "SCHEDULED_CARDIO_COMPLETION") {
    if (!context.scheduledCardio) return "NO_SCHEDULED_CARDIO";
  }
  if (definition.requiredCapability === "WORKOUT_CONSISTENCY" && !context.workoutPrescription) {
    return "NO_WORKOUT_PLAN";
  }
  const activity = scheduledActivityFor(definition, context);
  if (definition.applicableSessionKinds && activity
      && !definition.applicableSessionKinds.includes(activity.sessionKind)) {
    return "SESSION_KIND_NOT_APPLICABLE";
  }
  return null;
}

function behaviorKey(definition: MissionDefinition, context: MissionDailyContext): string {
  if (definition.requiredCapability === "WORKOUT_COMPLETION") {
    return `workout:${context.scheduledWorkout?.occurrenceId ?? "missing"}`;
  }
  if (definition.requiredCapability === "SCHEDULED_CARDIO_COMPLETION") {
    return `cardio:${context.scheduledCardio?.occurrenceId ?? "missing"}`;
  }
  return `capability:${definition.requiredCapability}`;
}

export function resolveAvailableMissionDefinitions(
  context: MissionDailyContext,
): readonly MissionAvailability[] {
  return MISSION_DEFINITIONS.map((definition): MissionAvailability => {
    const reason = unavailableReason(definition, context);
    return reason
      ? { available: false, definition, reason }
      : { available: true, definition, behaviorKey: behaviorKey(definition, context) };
  });
}

function dateDistance(left: string, right: string): number {
  const leftTime = Date.parse(`${left}T00:00:00Z`);
  const rightTime = Date.parse(`${right}T00:00:00Z`);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return 999;
  return Math.abs(Math.round((leftTime - rightTime) / 86_400_000));
}

function stableTieBreak(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function baseScore(definition: MissionDefinition, context: MissionDailyContext) {
  const strategy = MISSION_GOAL_STRATEGIES[context.goal];
  const priorityIndex = strategy.indexOf(definition.code as never);
  const goalRelevance = priorityIndex < 0 ? 0 : Math.max(12, 34 - priorityIndex * 4);
  const todayRelevance = definition.requiredCapability === "WORKOUT_COMPLETION"
    || definition.requiredCapability === "SCHEDULED_CARDIO_COMPLETION" ? 40 : 20;
  const capabilityAvailability = 20;
  const mostRecent = context.recentMissionHistory
    .filter((mission) => mission.code === definition.code)
    .map((mission) => dateDistance(context.date, mission.localDate))
    .sort((left, right) => left - right)[0];
  const repetitionPenalty = mostRecent === undefined
    ? 0
    : mostRecent <= 1
      ? -30
      : mostRecent <= 3
        ? -18
        : mostRecent <= 7
          ? -7
          : 0;
  const deterministic = stableTieBreak(
    `${context.userId}:${context.date}:${MISSION_ALGORITHM_VERSION}:${definition.code}`,
  );
  return {
    score: goalRelevance + todayRelevance + capabilityAvailability + repetitionPenalty + deterministic,
    rationale: [
      `goal=${goalRelevance}`,
      `today=${todayRelevance}`,
      `capability=${capabilityAvailability}`,
      `recent=${repetitionPenalty}`,
      `deterministic=${deterministic.toFixed(6)}`,
    ],
  };
}

function progressFor(
  definition: MissionDefinition,
  context: MissionDailyContext,
): Pick<SelectedDailyMission, "targetValue" | "currentValue" | "completed" | "sourceOccurrenceId"> {
  if (definition.requiredCapability === "WORKOUT_COMPLETION") {
    const activity = context.scheduledWorkout!;
    return {
      targetValue: 1,
      currentValue: activity.completed ? 1 : 0,
      completed: activity.completed,
      sourceOccurrenceId: activity.occurrenceId,
    };
  }
  if (definition.requiredCapability === "SCHEDULED_CARDIO_COMPLETION") {
    const activity = context.scheduledCardio!;
    return {
      targetValue: 1,
      currentValue: activity.completed ? 1 : 0,
      completed: activity.completed,
      sourceOccurrenceId: activity.occurrenceId,
    };
  }
  if (definition.requiredCapability === "WORKOUT_CONSISTENCY") {
    const currentValue = Math.min(context.completedScheduledWorkoutsTrailing7Days, 2);
    return {
      targetValue: 2,
      currentValue,
      completed: currentValue >= 2,
      sourceOccurrenceId: null,
    };
  }
  return { targetValue: 1, currentValue: 0, completed: false, sourceOccurrenceId: null };
}

export function resolveMissionProgress(
  code: string,
  context: MissionDailyContext,
): Pick<SelectedDailyMission, "targetValue" | "currentValue" | "completed" | "sourceOccurrenceId"> | null {
  const definition = MISSION_DEFINITIONS.find((item) => item.code === code);
  if (!definition) return null;
  const availability = resolveAvailableMissionDefinitions(context)
    .find((item) => item.definition.code === code);
  if (!availability?.available) return null;
  return progressFor(definition, context);
}

export function selectDailyMissions(context: MissionDailyContext): MissionSelectionResult {
  const availability = resolveAvailableMissionDefinitions(context);
  const unavailable = availability
    .filter((item): item is Extract<MissionAvailability, { available: false }> => !item.available)
    .map((item) => ({ code: item.definition.code, reason: item.reason }));
  const available = availability
    .filter((item): item is Extract<MissionAvailability, { available: true }> => item.available);
  const selected: SelectedDailyMission[] = [];
  const selectedBehaviors = new Set<string>();
  const selectedCategories = new Set<string>();
  const selectedDifficulties = new Set<string>();

  while (selected.length < TARGET_DAILY_MISSIONS) {
    const candidates = available
      .filter((item) => !selected.some((mission) => mission.code === item.definition.code))
      .filter((item) => !selectedBehaviors.has(item.behaviorKey))
      .map((item) => {
        const base = baseScore(item.definition, context);
        const diversity = selectedCategories.has(item.definition.category) ? 0 : 12;
        const difficultyBalance = selectedDifficulties.has(item.definition.difficulty) ? 0 : 4;
        return {
          item,
          score: base.score + diversity + difficultyBalance,
          rationale: [...base.rationale, `categoryDiversity=${diversity}`, `difficultyBalance=${difficultyBalance}`],
        };
      })
      .sort((left, right) => right.score - left.score || left.item.definition.code.localeCompare(right.item.definition.code));
    const best = candidates[0];
    if (!best) break;
    const definition = best.item.definition;
    selected.push({
      code: definition.code,
      category: definition.category,
      title: definition.title(context),
      description: definition.description(context),
      completionRule: definition.completionRule,
      energyReward: definition.energyReward,
      difficulty: definition.difficulty,
      ...progressFor(definition, context),
      score: Number(best.score.toFixed(6)),
      scoreRationale: best.rationale,
    });
    selectedBehaviors.add(best.item.behaviorKey);
    selectedCategories.add(definition.category);
    selectedDifficulties.add(definition.difficulty);
  }

  const shortfallReasons = selected.length < TARGET_DAILY_MISSIONS
    ? [...new Set(unavailable.map((item) => item.reason))]
    : [];
  return {
    algorithmVersion: MISSION_ALGORITHM_VERSION,
    targetCount: TARGET_DAILY_MISSIONS,
    missions: selected,
    unavailable,
    shortfallReasons,
  };
}
