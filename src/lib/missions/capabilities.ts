import {
  MISSION_CAPABILITY_CODES,
  type MissionCapability,
  type MissionCapabilityCode,
} from "./domain.ts";

const CURRENT_CAPABILITIES: Readonly<Record<MissionCapabilityCode, MissionCapability>> = {
  WORKOUT_COMPLETION: {
    code: "WORKOUT_COMPLETION",
    supported: true,
    measurementSource: "workout_sessions.status + schedule_occurrence_id",
    completionRule: "MATCHING_WORKOUT_SESSION_COMPLETED",
    canVerifyServerSide: true,
  },
  SCHEDULED_CARDIO_COMPLETION: {
    code: "SCHEDULED_CARDIO_COMPLETION",
    supported: true,
    measurementSource: "workout prescription sessionKind + workout_sessions.status",
    completionRule: "MATCHING_CARDIO_SESSION_COMPLETED",
    canVerifyServerSide: true,
  },
  WORKOUT_CONSISTENCY: {
    code: "WORKOUT_CONSISTENCY",
    supported: true,
    measurementSource: "completed scheduled workout_sessions in trailing 7 days",
    completionRule: "TWO_SCHEDULED_WORKOUTS_COMPLETED_IN_TRAILING_7_DAYS",
    canVerifyServerSide: true,
  },
  TRAINING_STREAK: {
    code: "TRAINING_STREAK",
    supported: false,
    measurementSource: null,
    completionRule: "TRAINING_STREAK_REACHED",
    canVerifyServerSide: false,
    reasonUnavailable: "NO_ACTIVITY_SOURCE",
  },
  WATER_TRACKING: {
    code: "WATER_TRACKING",
    supported: false,
    measurementSource: null,
    completionRule: "WATER_TARGET_REACHED",
    canVerifyServerSide: false,
    reasonUnavailable: "NO_ACTIVITY_SOURCE",
  },
  MEAL_LOGGING: {
    code: "MEAL_LOGGING",
    supported: false,
    measurementSource: null,
    completionRule: "MEALS_LOGGED",
    canVerifyServerSide: false,
    reasonUnavailable: "NO_CONSUMPTION_CONTRACT",
  },
  PROTEIN_TARGET: {
    code: "PROTEIN_TARGET",
    supported: false,
    measurementSource: null,
    completionRule: "PROTEIN_CONSUMPTION_TARGET_REACHED",
    canVerifyServerSide: false,
    reasonUnavailable: "NO_CONSUMPTION_CONTRACT",
  },
  CALORIE_TARGET: {
    code: "CALORIE_TARGET",
    supported: false,
    measurementSource: null,
    completionRule: "CALORIE_CONSUMPTION_TARGET_REACHED",
    canVerifyServerSide: false,
    reasonUnavailable: "NO_CONSUMPTION_CONTRACT",
  },
  STEP_TARGET: {
    code: "STEP_TARGET",
    supported: false,
    measurementSource: null,
    completionRule: "STEP_TARGET_REACHED",
    canVerifyServerSide: false,
    reasonUnavailable: "NO_ACTIVITY_SOURCE",
  },
  RECOVERY_TRACKING: {
    code: "RECOVERY_TRACKING",
    supported: false,
    measurementSource: null,
    completionRule: "RECOVERY_CHECK_IN_RECORDED",
    canVerifyServerSide: false,
    reasonUnavailable: "NO_RECOVERY_SOURCE",
  },
  PROGRESSIVE_OVERLOAD: {
    code: "PROGRESSIVE_OVERLOAD",
    supported: false,
    measurementSource: null,
    completionRule: "SET_LOG_PROGRESSION_VERIFIED",
    canVerifyServerSide: false,
    reasonUnavailable: "NO_SET_LOGS",
  },
};

export function resolveCurrentMissionCapabilities(): Readonly<Record<MissionCapabilityCode, MissionCapability>> {
  return CURRENT_CAPABILITIES;
}

export function auditCurrentMissionCapabilities(): readonly MissionCapability[] {
  return MISSION_CAPABILITY_CODES.map((code) => CURRENT_CAPABILITIES[code]);
}
