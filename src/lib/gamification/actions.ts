import { GamificationAction } from "./types";

function createActionId(): string {
  return crypto.randomUUID();
}

export const GamificationActions = {
  showXPToast(xpGained: number): GamificationAction {
    return {
      id: createActionId(),
      type: "SHOW_XP_TOAST",
      celebration: "toast",
      priority: 10,
      payload: {
        xpGained,
      },
    };
  },

  showMissionProgress(
    missionId: string,
    current: number,
    target: number
  ): GamificationAction {
    return {
      id: createActionId(),
      type: "SHOW_MISSION_PROGRESS",
      celebration: "toast",
      priority: 20,
      payload: {
        missionId,
        current,
        target,
      },
    };
  },

  showMissionCompleted(
    missionId: string,
    title: string,
    xpReward: number
  ): GamificationAction {
    return {
      id: createActionId(),
      type: "SHOW_MISSION_COMPLETED",
      celebration: "modal",
      priority: 40,
      payload: {
        missionId,
        title,
        xpReward,
      },
    };
  },

  showDailyPlanCompleted(
    xpReward: number
  ): GamificationAction {
    return {
      id: createActionId(),
      type: "SHOW_DAILY_PLAN_COMPLETED",
      celebration: "modal",
      priority: 50,
      payload: {
        xpReward,
      },
    };
  },

  showLevelUp(
    previousLevel: number,
    newLevel: number
  ): GamificationAction {
    return {
      id: createActionId(),
      type: "SHOW_LEVEL_UP",
      celebration: "fullscreen",
      priority: 100,
      payload: {
        previousLevel,
        newLevel,
      },
    };
  },

  showLeaguePromotion(
    previousLeague: string,
    newLeague: string
  ): GamificationAction {
    return {
      id: createActionId(),
      type: "SHOW_LEAGUE_PROMOTION",
      celebration: "fullscreen",
      priority: 110,
      payload: {
        previousLeague,
        newLeague,
      },
    };
  },

  showAchievementUnlocked(
    achievementId: string,
    title: string
  ): GamificationAction {
    return {
      id: createActionId(),
      type: "SHOW_ACHIEVEMENT_UNLOCKED",
      celebration: "fullscreen",
      priority: 90,
      payload: {
        achievementId,
        title,
      },
    };
  },

  triggerConfetti(): GamificationAction {
    return {
      id: createActionId(),
      type: "TRIGGER_CONFETTI",
      celebration: "fullscreen",
      priority: 120,
      payload: {},
    };
  },
};