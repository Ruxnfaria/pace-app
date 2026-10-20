import type {
  MuscleGroup,
  SessionKind,
  WorkoutGoal,
} from "../prescription/domain.ts";

export const WORKOUT_VALIDATOR_VERSION = "praxe-workout-validator-v1" as const;
export const MAX_WORKOUT_REPAIR_ATTEMPTS = 1 as const;
export const WORKOUT_SET_TOLERANCE = 1 as const;
export const WORKOUT_DURATION_TOLERANCE_MINUTES = 2 as const;

export type WorkoutValidationSeverity = "HARD_FAILURE" | "WARNING" | "INFO";

export type WorkoutValidationIssueCode =
  | "SESSION_COUNT_MISMATCH"
  | "SESSION_KIND_MISMATCH"
  | "SESSION_DAY_MISMATCH"
  | "REQUIRED_SLOT_MISSING"
  | "EXTRA_UNAUTHORIZED_SESSION"
  | "EXTRA_UNAUTHORIZED_EXERCISE"
  | "TIME_BUDGET_EXCEEDED"
  | "EQUIPMENT_CONFLICT"
  | "PAIN_LIMITATION_CONFLICT"
  | "CARDIO_PRESCRIPTION_VIOLATION"
  | "GOAL_MISALIGNMENT"
  | "STANDALONE_CORE_MISUSE"
  | "DUPLICATED_SESSION"
  | "REQUIRED_MOVEMENT_PATTERN_MISSING"
  | "MUSCLE_COVERAGE_OUTSIDE_HARD_POLICY"
  | "RECOVERY_STRUCTURE_VIOLATION"
  | "UNKNOWN_EXERCISE_METADATA"
  | "INVALID_SET_COUNT"
  | "REP_RANGE_MISMATCH"
  | "VOLUME_MISMATCH"
  | "ACCESSORY_SELECTION_REPETITIVE"
  | "INDIRECT_ESTIMATE_HIGH"
  | "SESSION_NEAR_TIME_LIMIT";

export type WorkoutValidationIssue = {
  code: WorkoutValidationIssueCode;
  severity: WorkoutValidationSeverity;
  sessionId?: string;
  sessionIndex?: number;
  exerciseIndex?: number;
  muscleGroup?: MuscleGroup;
  expected?: unknown;
  observed?: unknown;
  message: string;
};

export type WorkoutValidationReport = {
  valid: boolean;
  hardFailures: number;
  warnings: number;
  issues: readonly WorkoutValidationIssue[];
  strategyVersion: string;
  validatorVersion: typeof WORKOUT_VALIDATOR_VERSION;
};

export type GeneratedCardioSelection = {
  kind: "AEROBIC_BASE" | "INTERVAL";
  duration_minutes: number;
  effort_method: "talk_test" | "rpe";
  target_rpe_min: number;
  target_rpe_max: number;
  talk_test: "comfortable_conversation" | "short_phrases";
  interval_work_seconds: number | null;
  interval_recovery_seconds: number | null;
  rounds: number | null;
};

export type GeneratedExerciseSelection = {
  slot_id: string;
  name: string;
  sets: number;
  rep_min: number;
  rep_max: number;
  rest_seconds: number;
  tip: string;
};

export type GeneratedSessionSelection = {
  session_id: string;
  session_kind: SessionKind;
  iso_weekday: number;
  title: string;
  exercises: readonly GeneratedExerciseSelection[];
  cardio: GeneratedCardioSelection | null;
};

export type GeneratedWorkoutSelectionPlan = {
  sessions: readonly GeneratedSessionSelection[];
};

export type WorkoutValidationAudit = {
  strategyVersion: string;
  validatorVersion: typeof WORKOUT_VALIDATOR_VERSION;
  goal: WorkoutGoal;
  valid: boolean;
  hardFailures: number;
  warnings: number;
  issueCodes: readonly WorkoutValidationIssueCode[];
  repairAttempted: boolean;
  repairSucceeded: boolean;
};
