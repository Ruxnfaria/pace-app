import { GamificationActions } from "./actions";
import { calculateLevelProgress } from "./levels";
import { calculateEventXP, addXP } from "./xp";

import {
  GamificationAction,
  GamificationEvent,
  GamificationResult,
} from "./types";

export interface ProcessGamificationOptions {
  currentXP: number;
  event: GamificationEvent;
}

export function processGamificationEvent({
  currentXP,
  event,
}: ProcessGamificationOptions): GamificationResult {
  const safeCurrentXP = Math.max(0, currentXP);

  const previousProgress =
    calculateLevelProgress(safeCurrentXP);

  const xpGained =
    calculateEventXP(event);

  const newTotalXP =
    addXP(safeCurrentXP, xpGained);

  const newProgress =
    calculateLevelProgress(newTotalXP);

  const leveledUp =
    newProgress.currentLevel >
    previousProgress.currentLevel;

  const actions: GamificationAction[] = [];

  if (xpGained > 0) {
    actions.push(
      GamificationActions.showXPToast(xpGained)
    );
  }

  if (leveledUp) {
    actions.push(
      GamificationActions.showLevelUp(
        previousProgress.currentLevel,
        newProgress.currentLevel
      )
    );

    actions.push(
      GamificationActions.triggerConfetti()
    );
  }

  actions.sort(
    (firstAction, secondAction) =>
      firstAction.priority - secondAction.priority
  );

  return {
    xpGained,

    previousTotalXP: safeCurrentXP,
    newTotalXP,

    previousLevel: previousProgress.currentLevel,
    newLevel: newProgress.currentLevel,

    leveledUp,

    completedMissions: [],
    updatedMissions: [],
    rewards: [],

    actions,
  };
}