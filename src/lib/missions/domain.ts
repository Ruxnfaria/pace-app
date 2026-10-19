import type {
  ResolvedWorkoutPrescription,
  SessionKind,
  WorkoutGoal,
} from "../workouts/prescription/domain.ts";

export const MISSION_ALGORITHM_VERSION = "praxe-missions-v1" as const;
export const TARGET_DAILY_MISSIONS = 3 as const;

export const MISSION_CAPABILITY_CODES = [
  "WORKOUT_COMPLETION",
  "SCHEDULED_CARDIO_COMPLETION",
  "WORKOUT_CONSISTENCY",
  "TRAINING_STREAK",
  "WATER_TRACKING",
  "MEAL_LOGGING",
  "PROTEIN_TARGET",
  "CALORIE_TARGET",
  "STEP_TARGET",
  "RECOVERY_TRACKING",
  "PROGRESSIVE_OVERLOAD",
] as const;

export type MissionCapabilityCode = (typeof MISSION_CAPABILITY_CODES)[number];
export type MissionCategory =
  | "TRAINING"
  | "CARDIO"
  | "CONSISTENCY"
  | "NUTRITION"
  | "ACTIVITY"
  | "RECOVERY";
export type MissionDifficulty = "EASY" | "MODERATE" | "HARD";
export type MissionCompletionRule =
  | "MATCHING_WORKOUT_SESSION_COMPLETED"
  | "MATCHING_CARDIO_SESSION_COMPLETED"
  | "TWO_SCHEDULED_WORKOUTS_COMPLETED_IN_TRAILING_7_DAYS"
  | "TRAINING_STREAK_REACHED"
  | "WATER_TARGET_REACHED"
  | "MEALS_LOGGED"
  | "PROTEIN_CONSUMPTION_TARGET_REACHED"
  | "CALORIE_CONSUMPTION_TARGET_REACHED"
  | "STEP_TARGET_REACHED"
  | "RECOVERY_CHECK_IN_RECORDED"
  | "SET_LOG_PROGRESSION_VERIFIED";

export type MissionUnavailableReason =
  | "UNSUPPORTED_CAPABILITY"
  | "NO_SCHEDULED_WORKOUT"
  | "NO_SCHEDULED_CARDIO"
  | "NO_WORKOUT_PLAN"
  | "NO_CONSUMPTION_CONTRACT"
  | "NO_ACTIVITY_SOURCE"
  | "NO_RECOVERY_SOURCE"
  | "NO_SET_LOGS"
  | "GOAL_NOT_APPLICABLE"
  | "SESSION_KIND_NOT_APPLICABLE"
  | "DUPLICATE_BEHAVIOR";

export type MissionCapability = {
  code: MissionCapabilityCode;
  supported: boolean;
  measurementSource: string | null;
  completionRule: MissionCompletionRule;
  canVerifyServerSide: boolean;
  reasonUnavailable?: MissionUnavailableReason;
};

export type ScheduledMissionActivity = {
  occurrenceId: string;
  title: string;
  sessionKind: SessionKind;
  completed: boolean;
};

export type MissionHistoryEntry = {
  code: string;
  category: MissionCategory;
  localDate: string;
};

export type MissionDailyContext = {
  userId: string;
  date: string;
  goal: WorkoutGoal;
  workoutPrescription: ResolvedWorkoutPrescription | null;
  scheduledWorkout: ScheduledMissionActivity | null;
  scheduledCardio: ScheduledMissionActivity | null;
  recentMissionHistory: readonly MissionHistoryEntry[];
  supportedCapabilities: Readonly<Record<MissionCapabilityCode, MissionCapability>>;
  completedScheduledWorkoutsTrailing7Days: number;
};

export type MissionDefinition = {
  code: string;
  category: MissionCategory;
  goalAffinity: readonly WorkoutGoal[];
  requiredCapability: MissionCapabilityCode;
  completionRule: MissionCompletionRule;
  energyReward: number;
  difficulty: MissionDifficulty;
  applicableSessionKinds?: readonly SessionKind[];
  title: (context: MissionDailyContext) => string;
  description: (context: MissionDailyContext) => string;
};

export type MissionAvailability =
  | { available: true; definition: MissionDefinition; behaviorKey: string }
  | {
      available: false;
      definition: MissionDefinition;
      reason: MissionUnavailableReason;
    };

export type SelectedDailyMission = {
  code: string;
  category: MissionCategory;
  title: string;
  description: string;
  completionRule: MissionCompletionRule;
  energyReward: number;
  difficulty: MissionDifficulty;
  targetValue: number;
  currentValue: number;
  completed: boolean;
  sourceOccurrenceId: string | null;
  score: number;
  scoreRationale: readonly string[];
};

export type MissionSelectionResult = {
  algorithmVersion: typeof MISSION_ALGORITHM_VERSION;
  targetCount: typeof TARGET_DAILY_MISSIONS;
  missions: readonly SelectedDailyMission[];
  unavailable: readonly {
    code: string;
    reason: MissionUnavailableReason;
  }[];
  shortfallReasons: readonly MissionUnavailableReason[];
};
