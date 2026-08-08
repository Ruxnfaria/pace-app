import { GAMIFICATION_CONFIG } from "./config";
import {
  GamificationEvent,
  GamificationEventType,
} from "./types";

const XP_BY_EVENT: Partial<
  Record<GamificationEventType, number>
> = {
  WORKOUT_COMPLETED:
    GAMIFICATION_CONFIG.xp.workoutCompleted,

  EXTRA_WORKOUT_COMPLETED:
    GAMIFICATION_CONFIG.xp.extraWorkoutCompleted,

  CARDIO_COMPLETED:
    GAMIFICATION_CONFIG.xp.cardioCompleted,

  PROTEIN_GOAL_REACHED:
    GAMIFICATION_CONFIG.xp.proteinGoalReached,

  CALORIES_GOAL_REACHED:
    GAMIFICATION_CONFIG.xp.caloriesGoalReached,

  WATER_GOAL_REACHED:
    GAMIFICATION_CONFIG.xp.waterGoalReached,

  WEIGHT_REGISTERED:
    GAMIFICATION_CONFIG.xp.weightRegistered,

  DAILY_PLAN_COMPLETED:
    GAMIFICATION_CONFIG.xp.dailyPlanCompleted,

  WEEKLY_MISSION_COMPLETED:
    GAMIFICATION_CONFIG.xp.weeklyMissionCompleted,
};

export function getXPForEvent(
  eventType: GamificationEventType
): number {
  return XP_BY_EVENT[eventType] ?? 0;
}

export function calculateEventXP(
  event: GamificationEvent
): number {
  return getXPForEvent(event.type);
}

export function addXP(
  currentXP: number,
  xpToAdd: number
): number {
  const safeCurrentXP = Math.max(0, currentXP);
  const safeXPToAdd = Math.max(0, xpToAdd);

  return safeCurrentXP + safeXPToAdd;
}

export function calculateNewTotalXP(
  currentXP: number,
  event: GamificationEvent
): number {
  const xpGained = calculateEventXP(event);

  return addXP(currentXP, xpGained);
}

export function calculateMultipleEventsXP(
  events: GamificationEvent[]
): number {
  return events.reduce(
    (total, event) =>
      total + calculateEventXP(event),
    0
  );
}