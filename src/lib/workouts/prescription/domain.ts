import type { UserFitnessContext } from "../../fitness-context/model.ts";

export const GOAL_STRATEGY_VERSION = "praxe-goal-prescription-v1" as const;
export const INDIRECT_SET_HEURISTIC_VERSION = "v1" as const;
export const INDIRECT_SET_HEURISTIC_INTERPRETATION = "NOT_PHYSIOLOGICAL_EQUIVALENCE" as const;

export const WORKOUT_GOALS = ["fat_loss", "hypertrophy", "conditioning"] as const;
export type WorkoutGoal = (typeof WORKOUT_GOALS)[number];
export type TrainingLevel = "beginner" | "intermediate" | "advanced";
export type SessionDurationBudget = 30 | 45 | 60 | 90;

export const MUSCLE_TAXONOMY = [
  "chest",
  "back",
  "quadriceps",
  "hamstrings",
  "glutes",
  "shoulders",
  "biceps",
  "triceps",
  "calves",
  "core",
] as const;
export type MuscleGroup = (typeof MUSCLE_TAXONOMY)[number];

export type SessionKind =
  | "RESISTANCE"
  | "AEROBIC_BASE"
  | "INTERVAL"
  | "STRENGTH_SUPPORT";

export type SessionFocus =
  | "FULL_BODY"
  | "UPPER"
  | "LOWER"
  | "PUSH"
  | "PULL"
  | "LEGS"
  | "AEROBIC_BASE"
  | "INTERVAL"
  | "STRENGTH_SUPPORT_FULL_BODY";

export type ExerciseSlotRole = "primary" | "secondary" | "accessory" | "core" | "cardio";

export type MovementPattern =
  | "horizontal_press"
  | "vertical_press"
  | "horizontal_pull"
  | "vertical_pull"
  | "knee_dominant"
  | "hip_hinge"
  | "unilateral_lower"
  | "chest_accessory"
  | "back_accessory"
  | "hamstring_accessory"
  | "glute_accessory"
  | "lateral_delt_accessory"
  | "biceps_accessory"
  | "triceps_accessory"
  | "calf_accessory"
  | "core_stability"
  | "aerobic_modality";

export type RepRange = { min: number; max: number };

export type ExerciseSlot = {
  id: string;
  movementPattern: MovementPattern;
  role: ExerciseSlotRole;
  primaryMuscles: readonly MuscleGroup[];
  secondaryMuscles: readonly MuscleGroup[];
  sets: number;
  repRange: RepRange;
  restSeconds: number;
  selectionConstraints: {
    equipment: readonly string[];
    trainingLocation: string | null;
    affectedBodyAreas: readonly string[];
    conservativeSelectionRequired: boolean;
  };
};

export type CardioPrescription = {
  id: string;
  sessionId: string;
  kind: "AEROBIC_BASE" | "INTERVAL";
  embedded: boolean;
  durationMinutes: number;
  effortMethod: "talk_test" | "rpe";
  targetRpeRange: readonly [number, number];
  talkTest: "comfortable_conversation" | "short_phrases";
  intervalWorkSeconds: number | null;
  intervalRecoverySeconds: number | null;
  rounds: number | null;
};

export type WeeklySessionPrescription = {
  id: string;
  isoWeekday: number;
  kind: SessionKind;
  focus: SessionFocus;
  displayFocus: string;
  durationBudgetMinutes: SessionDurationBudget;
  resistanceBudgetMinutes: number;
  estimatedResistanceMinutes: number;
  transitionBufferMinutes: number;
  sessionBudgetOverflowMinutes: number;
  requiredSlots: readonly ExerciseSlot[];
  cardio: CardioPrescription | null;
};

export type MuscleVolumePrescription = {
  muscle: MuscleGroup;
  minWeeklySets: number;
  targetDirectSets: number;
  maxWeeklySets: number;
  plannedDirectSets: number;
  plannedIndirectContribution: number;
  effectiveSetEstimate: number;
  weeklyFrequency: number;
  coverageRequirement: MuscleCoverageRequirement;
  coverageSatisfied: boolean;
  directHardLimitExceeded: boolean;
  heuristicVersion: typeof INDIRECT_SET_HEURISTIC_VERSION;
  heuristicInterpretation: typeof INDIRECT_SET_HEURISTIC_INTERPRETATION;
};

export type MuscleCoverageRequirement =
  | "DIRECT_TARGET_REQUIRED"
  | "INDIRECT_COVERAGE_ALLOWED"
  | "OPTIONAL";

export type FrequencyPolicy = Record<TrainingLevel, {
  preferredSessions: number;
  maximumSessions: number;
}>;

export type VolumeRange = { min: number; target: number; max: number };
export type VolumePolicy = Record<TrainingLevel, {
  major: VolumeRange;
  small: VolumeRange;
  core: VolumeRange;
}>;

export type RepPolicy = {
  primary: RepRange;
  secondary: RepRange;
  accessory: RepRange;
  core: RepRange;
  targetRir: readonly [number, number];
  absoluteFailureDefault: false;
};

export type CorePolicy = {
  standaloneSessionAllowedByDefault: false;
  minimumWeeklyExposures: number;
  maximumWeeklyExposures: number;
};

export type CardioLevelPolicy = {
  targetWeeklyExposures: number;
  maximumIntervalSessions: number;
  baseDurationMinutes: number;
  embeddedDurationMinutes: number;
};

export type CardioPolicy = Record<TrainingLevel, CardioLevelPolicy> & {
  priority: "complementary" | "moderate_high" | "central";
  heartRateZonesRequireReliableData: true;
};

export type RecoveryPolicy = {
  preferredHoursBetweenSameMuscleExposures: number;
  avoidConsecutiveHighIntensityDays: boolean;
};

export type SplitSessionBlueprint = {
  kind: SessionKind;
  focus: SessionFocus;
};

export type SplitCandidate = {
  id: string;
  label: string;
  goalAlignment: number;
  sessions: readonly SplitSessionBlueprint[];
};

export type GoalPrescriptionStrategy = {
  goal: WorkoutGoal;
  strategyVersion: typeof GOAL_STRATEGY_VERSION;
  primaryAdaptation: string;
  resistancePriority: "high" | "dominant" | "support";
  cardioPriority: "complementary" | "moderate_high" | "central";
  effectiveFrequencyPolicy: FrequencyPolicy;
  candidateSplits: Readonly<Record<number, readonly SplitCandidate[]>>;
  volumePolicy: VolumePolicy;
  repPolicy: RepPolicy;
  corePolicy: CorePolicy;
  cardioPolicy: CardioPolicy;
  recoveryPolicy: RecoveryPolicy;
  muscleCoverageRequirements: Readonly<Record<MuscleGroup, MuscleCoverageRequirement>>;
};

export type SplitScore = {
  goalAlignment: number;
  muscleCoverage: number;
  weeklyFrequency: number;
  recoverySpacing: number;
  preferredWeekdays: number;
  sessionDuration: number;
  existingActivityConflicts: number;
  trainingPeriod: number;
  total: number;
};

export type ResolvedWorkoutPrescription = {
  strategyVersion: typeof GOAL_STRATEGY_VERSION;
  goal: WorkoutGoal;
  level: TrainingLevel;
  availabilityCap: number;
  effectiveFrequency: number;
  frequencyRationale: readonly string[];
  durationBudgetMinutes: SessionDurationBudget;
  selectedSplitId: string;
  selectedSplitLabel: string;
  splitScore: SplitScore;
  scheduleRationale: readonly string[];
  recoveryViolations: readonly string[];
  sessions: readonly WeeklySessionPrescription[];
  muscleVolumes: readonly MuscleVolumePrescription[];
  cardioPrescriptions: readonly CardioPrescription[];
  cardioWeeklyMinutes: number;
  cardioWeeklyTargetMinutes: number;
  constraints: {
    equipment: readonly string[];
    trainingLocation: string | null;
    affectedBodyAreas: readonly string[];
    painOrLimitation: boolean;
    preferredTrainingPeriod: string | null;
  };
};

export class WorkoutPrescriptionError extends Error {
  readonly code: "UNSUPPORTED_GOAL" | "INVALID_CONTEXT" | "NO_SPLIT_AVAILABLE";

  constructor(
    code: "UNSUPPORTED_GOAL" | "INVALID_CONTEXT" | "NO_SPLIT_AVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "WorkoutPrescriptionError";
    this.code = code;
  }
}

export type WorkoutPrescriptionContext = UserFitnessContext;
