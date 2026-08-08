import {
    GamificationEvent,
    GamificationEventType,
  } from "./types";
  
  interface CreateEventOptions<TPayload = unknown> {
    type: GamificationEventType;
    userId: string;
    payload?: TPayload;
  }
  
  export function createEvent<TPayload = unknown>({
    type,
    userId,
    payload,
  }: CreateEventOptions<TPayload>): GamificationEvent<TPayload> {
    return {
      id: crypto.randomUUID(),
      type,
      userId,
      occurredAt: new Date().toISOString(),
      payload: payload ?? ({} as TPayload),
    };
  }
  
  /* ---------- Eventos Prontos ---------- */
  
  export const GamificationEvents = {
    workoutCompleted(userId: string, workoutId: string) {
      return createEvent({
        type: "WORKOUT_COMPLETED",
        userId,
        payload: {
          workoutId,
        },
      });
    },
  
    extraWorkoutCompleted(userId: string, workoutId: string) {
      return createEvent({
        type: "EXTRA_WORKOUT_COMPLETED",
        userId,
        payload: {
          workoutId,
        },
      });
    },
  
    cardioCompleted(userId: string, duration: number) {
      return createEvent({
        type: "CARDIO_COMPLETED",
        userId,
        payload: {
          duration,
        },
      });
    },
  
    proteinGoalReached(userId: string) {
      return createEvent({
        type: "PROTEIN_GOAL_REACHED",
        userId,
      });
    },
  
    caloriesGoalReached(userId: string) {
      return createEvent({
        type: "CALORIES_GOAL_REACHED",
        userId,
      });
    },
  
    waterGoalReached(userId: string) {
      return createEvent({
        type: "WATER_GOAL_REACHED",
        userId,
      });
    },
  
    weightRegistered(userId: string, weight: number) {
      return createEvent({
        type: "WEIGHT_REGISTERED",
        userId,
        payload: {
          weight,
        },
      });
    },
  
    dailyPlanCompleted(userId: string) {
      return createEvent({
        type: "DAILY_PLAN_COMPLETED",
        userId,
      });
    },
  
    weeklyMissionCompleted(userId: string, missionId: string) {
      return createEvent({
        type: "WEEKLY_MISSION_COMPLETED",
        userId,
        payload: {
          missionId,
        },
      });
    },
  };