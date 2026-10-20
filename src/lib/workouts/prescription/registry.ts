import {
  GOAL_STRATEGY_VERSION,
  type GoalPrescriptionStrategy,
  type MuscleCoverageRequirement,
  type MuscleGroup,
  type SplitCandidate,
  type SplitSessionBlueprint,
  type TrainingLevel,
  type VolumePolicy,
  type WorkoutGoal,
} from "./domain.ts";

function coverageRequirements(
  overrides: Partial<Record<MuscleGroup, MuscleCoverageRequirement>>,
): Readonly<Record<MuscleGroup, MuscleCoverageRequirement>> {
  return {
    chest: "DIRECT_TARGET_REQUIRED",
    back: "DIRECT_TARGET_REQUIRED",
    quadriceps: "DIRECT_TARGET_REQUIRED",
    hamstrings: "DIRECT_TARGET_REQUIRED",
    glutes: "DIRECT_TARGET_REQUIRED",
    shoulders: "INDIRECT_COVERAGE_ALLOWED",
    biceps: "INDIRECT_COVERAGE_ALLOWED",
    triceps: "INDIRECT_COVERAGE_ALLOWED",
    calves: "DIRECT_TARGET_REQUIRED",
    core: "DIRECT_TARGET_REQUIRED",
    ...overrides,
  };
}

const resistance = (focus: SplitSessionBlueprint["focus"]): SplitSessionBlueprint => ({
  kind: "RESISTANCE",
  focus,
});
const strengthSupport = (): SplitSessionBlueprint => ({
  kind: "STRENGTH_SUPPORT",
  focus: "STRENGTH_SUPPORT_FULL_BODY",
});
const aerobicBase = (): SplitSessionBlueprint => ({ kind: "AEROBIC_BASE", focus: "AEROBIC_BASE" });
const interval = (): SplitSessionBlueprint => ({ kind: "INTERVAL", focus: "INTERVAL" });

function split(
  id: string,
  label: string,
  sessions: readonly SplitSessionBlueprint[],
  goalAlignment = 10,
): SplitCandidate {
  return { id, label, sessions, goalAlignment };
}

const frequencyPolicies: Record<WorkoutGoal, Record<TrainingLevel, { preferredSessions: number; maximumSessions: number }>> = {
  hypertrophy: {
    beginner: { preferredSessions: 4, maximumSessions: 4 },
    intermediate: { preferredSessions: 6, maximumSessions: 6 },
    advanced: { preferredSessions: 6, maximumSessions: 6 },
  },
  fat_loss: {
    beginner: { preferredSessions: 3, maximumSessions: 4 },
    intermediate: { preferredSessions: 5, maximumSessions: 5 },
    advanced: { preferredSessions: 5, maximumSessions: 6 },
  },
  conditioning: {
    beginner: { preferredSessions: 4, maximumSessions: 4 },
    intermediate: { preferredSessions: 5, maximumSessions: 5 },
    advanced: { preferredSessions: 6, maximumSessions: 6 },
  },
};

const hypertrophyVolume: VolumePolicy = {
  beginner: {
    major: { min: 6, target: 8, max: 10 },
    small: { min: 4, target: 6, max: 8 },
    core: { min: 2, target: 4, max: 8 },
  },
  intermediate: {
    major: { min: 8, target: 11, max: 14 },
    small: { min: 6, target: 8, max: 12 },
    core: { min: 4, target: 6, max: 10 },
  },
  advanced: {
    major: { min: 10, target: 13, max: 16 },
    small: { min: 8, target: 10, max: 14 },
    core: { min: 4, target: 8, max: 12 },
  },
};

const fatLossVolume: VolumePolicy = {
  beginner: {
    major: { min: 4, target: 6, max: 8 },
    small: { min: 2, target: 4, max: 6 },
    core: { min: 2, target: 4, max: 6 },
  },
  intermediate: {
    major: { min: 6, target: 8, max: 10 },
    small: { min: 4, target: 6, max: 8 },
    core: { min: 2, target: 4, max: 8 },
  },
  advanced: {
    major: { min: 6, target: 9, max: 12 },
    small: { min: 4, target: 6, max: 10 },
    core: { min: 2, target: 6, max: 8 },
  },
};

const conditioningVolume: VolumePolicy = {
  beginner: {
    major: { min: 2, target: 4, max: 6 },
    small: { min: 2, target: 3, max: 5 },
    core: { min: 2, target: 4, max: 6 },
  },
  intermediate: {
    major: { min: 4, target: 6, max: 8 },
    small: { min: 2, target: 4, max: 6 },
    core: { min: 2, target: 4, max: 8 },
  },
  advanced: {
    major: { min: 4, target: 7, max: 10 },
    small: { min: 3, target: 5, max: 8 },
    core: { min: 2, target: 6, max: 8 },
  },
};

const hypertrophySplits: Record<number, readonly SplitCandidate[]> = {
  2: [split("hypertrophy-full-body-2", "Full Body A/B", [resistance("FULL_BODY"), resistance("FULL_BODY")])],
  3: [
    split("hypertrophy-full-body-3", "Full Body A/B/C", [resistance("FULL_BODY"), resistance("FULL_BODY"), resistance("FULL_BODY")], 9),
    split("hypertrophy-upper-lower-full-3", "Upper / Lower / Full", [resistance("UPPER"), resistance("LOWER"), resistance("FULL_BODY")], 10),
  ],
  4: [split("hypertrophy-upper-lower-4", "Upper / Lower ×2", [resistance("UPPER"), resistance("LOWER"), resistance("UPPER"), resistance("LOWER")])],
  5: [split("hypertrophy-ul-ppl-5", "Upper / Lower + Push / Pull / Legs", [resistance("UPPER"), resistance("LOWER"), resistance("PUSH"), resistance("PULL"), resistance("LEGS")])],
  6: [split("hypertrophy-ppl-6", "Push / Pull / Legs ×2", [resistance("PUSH"), resistance("PULL"), resistance("LEGS"), resistance("PUSH"), resistance("PULL"), resistance("LEGS")])],
};

const fatLossSplits: Record<number, readonly SplitCandidate[]> = {
  2: [split("fat-loss-full-body-2", "Full Body ×2", [resistance("FULL_BODY"), resistance("FULL_BODY")])],
  3: [
    split("fat-loss-full-body-3", "Full Body ×3", [resistance("FULL_BODY"), resistance("FULL_BODY"), resistance("FULL_BODY")], 10),
    split("fat-loss-upper-lower-full-3", "Upper / Lower / Full", [resistance("UPPER"), resistance("LOWER"), resistance("FULL_BODY")], 9),
  ],
  4: [split("fat-loss-upper-lower-4", "Upper / Lower ×2", [resistance("UPPER"), resistance("LOWER"), resistance("UPPER"), resistance("LOWER")])],
  5: [split("fat-loss-strength-cardio-5", "Full Body ×3 + Aerobic Base ×2", [resistance("FULL_BODY"), aerobicBase(), resistance("FULL_BODY"), aerobicBase(), resistance("FULL_BODY")])],
  6: [split("fat-loss-strength-cardio-6", "Upper / Lower ×2 + Aerobic Base ×2", [resistance("UPPER"), aerobicBase(), resistance("LOWER"), resistance("UPPER"), aerobicBase(), resistance("LOWER")])],
};

const conditioningSplits: Record<number, readonly SplitCandidate[]> = {
  2: [split("conditioning-base-strength-2", "Aerobic Base + Strength Support", [aerobicBase(), strengthSupport()])],
  3: [split("conditioning-base-strength-3", "Aerobic Base + Strength Support ×2", [aerobicBase(), strengthSupport(), strengthSupport()])],
  4: [split("conditioning-base-strength-4", "Aerobic Base ×2 + Strength Support ×2", [aerobicBase(), strengthSupport(), aerobicBase(), strengthSupport()])],
  5: [split("conditioning-balanced-5", "Base ×2 + Interval + Strength Support ×2", [aerobicBase(), strengthSupport(), interval(), strengthSupport(), aerobicBase()])],
  6: [split("conditioning-balanced-6", "Base ×2 + Interval ×2 + Strength Support ×2", [aerobicBase(), strengthSupport(), interval(), strengthSupport(), aerobicBase(), interval()])],
};

const commonRepPolicy = {
  primary: { min: 5, max: 12 },
  secondary: { min: 8, max: 15 },
  accessory: { min: 10, max: 20 },
  core: { min: 8, max: 20 },
  targetRir: [1, 3] as const,
  absoluteFailureDefault: false as const,
};

export const GOAL_STRATEGY_REGISTRY: Readonly<Record<WorkoutGoal, GoalPrescriptionStrategy>> = {
  hypertrophy: {
    goal: "hypertrophy",
    strategyVersion: GOAL_STRATEGY_VERSION,
    primaryAdaptation: "muscle_hypertrophy",
    resistancePriority: "dominant",
    cardioPriority: "complementary",
    effectiveFrequencyPolicy: frequencyPolicies.hypertrophy,
    candidateSplits: hypertrophySplits,
    volumePolicy: hypertrophyVolume,
    repPolicy: commonRepPolicy,
    corePolicy: { standaloneSessionAllowedByDefault: false, minimumWeeklyExposures: 2, maximumWeeklyExposures: 4 },
    cardioPolicy: {
      priority: "complementary",
      heartRateZonesRequireReliableData: true,
      beginner: { targetWeeklyExposures: 1, maximumIntervalSessions: 0, baseDurationMinutes: 20, embeddedDurationMinutes: 10 },
      intermediate: { targetWeeklyExposures: 2, maximumIntervalSessions: 0, baseDurationMinutes: 25, embeddedDurationMinutes: 12 },
      advanced: { targetWeeklyExposures: 2, maximumIntervalSessions: 1, baseDurationMinutes: 30, embeddedDurationMinutes: 15 },
    },
    recoveryPolicy: { preferredHoursBetweenSameMuscleExposures: 48, avoidConsecutiveHighIntensityDays: true },
    muscleCoverageRequirements: coverageRequirements({
      shoulders: "DIRECT_TARGET_REQUIRED",
      biceps: "DIRECT_TARGET_REQUIRED",
      triceps: "DIRECT_TARGET_REQUIRED",
    }),
  },
  fat_loss: {
    goal: "fat_loss",
    strategyVersion: GOAL_STRATEGY_VERSION,
    primaryAdaptation: "fat_loss_with_lean_mass_retention",
    resistancePriority: "high",
    cardioPriority: "moderate_high",
    effectiveFrequencyPolicy: frequencyPolicies.fat_loss,
    candidateSplits: fatLossSplits,
    volumePolicy: fatLossVolume,
    repPolicy: { ...commonRepPolicy, targetRir: [2, 3] },
    corePolicy: { standaloneSessionAllowedByDefault: false, minimumWeeklyExposures: 2, maximumWeeklyExposures: 3 },
    cardioPolicy: {
      priority: "moderate_high",
      heartRateZonesRequireReliableData: true,
      beginner: { targetWeeklyExposures: 2, maximumIntervalSessions: 0, baseDurationMinutes: 25, embeddedDurationMinutes: 12 },
      intermediate: { targetWeeklyExposures: 3, maximumIntervalSessions: 1, baseDurationMinutes: 30, embeddedDurationMinutes: 15 },
      advanced: { targetWeeklyExposures: 4, maximumIntervalSessions: 2, baseDurationMinutes: 35, embeddedDurationMinutes: 15 },
    },
    recoveryPolicy: { preferredHoursBetweenSameMuscleExposures: 48, avoidConsecutiveHighIntensityDays: true },
    muscleCoverageRequirements: coverageRequirements({}),
  },
  conditioning: {
    goal: "conditioning",
    strategyVersion: GOAL_STRATEGY_VERSION,
    primaryAdaptation: "cardiorespiratory_capacity_and_work_tolerance",
    resistancePriority: "support",
    cardioPriority: "central",
    effectiveFrequencyPolicy: frequencyPolicies.conditioning,
    candidateSplits: conditioningSplits,
    volumePolicy: conditioningVolume,
    repPolicy: { ...commonRepPolicy, primary: { min: 6, max: 12 }, secondary: { min: 8, max: 15 }, targetRir: [2, 4] },
    corePolicy: { standaloneSessionAllowedByDefault: false, minimumWeeklyExposures: 2, maximumWeeklyExposures: 3 },
    cardioPolicy: {
      priority: "central",
      heartRateZonesRequireReliableData: true,
      beginner: { targetWeeklyExposures: 3, maximumIntervalSessions: 0, baseDurationMinutes: 30, embeddedDurationMinutes: 20 },
      intermediate: { targetWeeklyExposures: 3, maximumIntervalSessions: 1, baseDurationMinutes: 35, embeddedDurationMinutes: 15 },
      advanced: { targetWeeklyExposures: 4, maximumIntervalSessions: 2, baseDurationMinutes: 40, embeddedDurationMinutes: 15 },
    },
    recoveryPolicy: { preferredHoursBetweenSameMuscleExposures: 48, avoidConsecutiveHighIntensityDays: true },
    muscleCoverageRequirements: coverageRequirements({
      core: "OPTIONAL",
    }),
  },
};

export function getGoalPrescriptionStrategy(goal: WorkoutGoal): GoalPrescriptionStrategy {
  return GOAL_STRATEGY_REGISTRY[goal];
}
