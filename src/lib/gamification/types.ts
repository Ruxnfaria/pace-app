export type GamificationEventType =
  | "WORKOUT_COMPLETED"
  | "EXTRA_WORKOUT_COMPLETED"
  | "CARDIO_COMPLETED"
  | "PROTEIN_GOAL_REACHED"
  | "CALORIES_GOAL_REACHED"
  | "WATER_GOAL_REACHED"
  | "WEIGHT_REGISTERED"
  | "DAILY_PLAN_COMPLETED"
  | "WEEKLY_MISSION_COMPLETED"
  | "STREAK_MILESTONE_REACHED"
  | "LEVEL_UP"
  | "LEAGUE_PROMOTION"
  | "LEAGUE_DEMOTION"
  | "ACHIEVEMENT_UNLOCKED";

export type MissionPeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "special";

export type MissionStatus =
  | "locked"
  | "active"
  | "completed"
  | "expired";

export type MissionMetric =
  | "workouts"
  | "cardio_sessions"
  | "protein_days"
  | "calorie_goal_days"
  | "water_goal_days"
  | "weight_registrations"
  | "active_days"
  | "xp_earned";

export type RewardType =
  | "xp"
  | "badge"
  | "title"
  | "profile_frame"
  | "chest"
  | "league"
  | "achievement";

export type CelebrationType =
  | "toast"
  | "modal"
  | "fullscreen";

  interface BaseGamificationAction {
    id: string;
    celebration: CelebrationType;
    priority: number;
  }
  
  export type GamificationAction =
    | (BaseGamificationAction & {
        type: "SHOW_XP_TOAST";
        payload: {
          xpGained: number;
        };
      })
    | (BaseGamificationAction & {
        type: "SHOW_MISSION_PROGRESS";
        payload: {
          missionId: string;
          current: number;
          target: number;
        };
      })
    | (BaseGamificationAction & {
        type: "SHOW_MISSION_COMPLETED";
        payload: {
          missionId: string;
          title: string;
          xpReward: number;
        };
      })
    | (BaseGamificationAction & {
        type: "SHOW_DAILY_PLAN_COMPLETED";
        payload: {
          xpReward: number;
        };
      })
    | (BaseGamificationAction & {
        type: "SHOW_LEVEL_UP";
        payload: {
          previousLevel: number;
          newLevel: number;
        };
      })
    | (BaseGamificationAction & {
        type: "SHOW_LEAGUE_PROMOTION";
        payload: {
          previousLeague: string;
          newLeague: string;
        };
      })
    | (BaseGamificationAction & {
        type: "SHOW_LEAGUE_DEMOTION";
        payload: {
          previousLeague: string;
          newLeague: string;
        };
      })
    | (BaseGamificationAction & {
        type: "SHOW_ACHIEVEMENT_UNLOCKED";
        payload: {
          achievementId: string;
          title: string;
        };
      })
    | (BaseGamificationAction & {
        type: "SHOW_REWARD_UNLOCKED";
        payload: {
          rewardId: string;
          title: string;
        };
      })
    | (BaseGamificationAction & {
        type: "PLAY_CELEBRATION_SOUND";
        payload: {
          sound: string;
        };
      })
    | (BaseGamificationAction & {
        type: "TRIGGER_CONFETTI";
        payload: Record<string, never>;
      });

export interface GamificationEvent<TPayload = unknown> {
  id: string;
  type: GamificationEventType;
  userId: string;
  occurredAt: string;
  payload: TPayload;
}

export interface MissionDefinition {
  id: string;
  title: string;
  description: string;

  period: MissionPeriod;
  metric: MissionMetric;

  target: number;
  xpReward: number;

  isPrimary?: boolean;
}

export interface MissionProgress {
  missionId: string;
  userId: string;

  current: number;
  target: number;

  status: MissionStatus;
  completedAt?: string | null;
}

export interface GamificationReward {
  id: string;
  type: RewardType;

  title: string;
  description?: string;

  amount?: number;
  referenceId?: string;

  celebration: CelebrationType;
}

export interface LevelProgress {
  currentLevel: number;
  currentLevelXP: number;
  xpForNextLevel: number;
  totalXP: number;
  progressPercentage: number;
  reachedMaxLevel: boolean;
}

export interface GamificationResult {
  xpGained: number;

  previousTotalXP: number;
  newTotalXP: number;

  previousLevel: number;
  newLevel: number;

  leveledUp: boolean;

  completedMissions: MissionDefinition[];
  updatedMissions: MissionProgress[];
  rewards: GamificationReward[];

  actions: GamificationAction[];
}