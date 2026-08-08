import { GAMIFICATION_CONFIG } from "./config";
import { LevelProgress } from "./types";

function getXPPerLevel(level: number): number {
  const tier = GAMIFICATION_CONFIG.levels.tiers.find(
    (tier) =>
      level >= tier.minLevel &&
      level <= tier.maxLevel
  );

  return tier?.xpPerLevel ?? 2000;
}

export function calculateLevelProgress(
  totalXP: number
): LevelProgress {
  let currentLevel = 1;
  let accumulatedXP = 0;

  while (true) {
    const xpNeeded = getXPPerLevel(currentLevel);

    if (totalXP < accumulatedXP + xpNeeded) {
      const currentLevelXP = totalXP - accumulatedXP;

      return {
        currentLevel,
        currentLevelXP,
        xpForNextLevel: xpNeeded,
        totalXP,
        progressPercentage: Math.round(
          (currentLevelXP / xpNeeded) * 100
        ),
        reachedMaxLevel:
          currentLevel >=
          GAMIFICATION_CONFIG.levels.maxLevel,
      };
    }

    accumulatedXP += xpNeeded;
    currentLevel++;

    if (
      currentLevel >
      GAMIFICATION_CONFIG.levels.maxLevel
    ) {
      return {
        currentLevel:
          GAMIFICATION_CONFIG.levels.maxLevel,
        currentLevelXP: getXPPerLevel(
          GAMIFICATION_CONFIG.levels.maxLevel
        ),
        xpForNextLevel: getXPPerLevel(
          GAMIFICATION_CONFIG.levels.maxLevel
        ),
        totalXP,
        progressPercentage: 100,
        reachedMaxLevel: true,
      };
    }
  }
}

export function getCurrentLevel(totalXP: number) {
  return calculateLevelProgress(totalXP).currentLevel;
}

export function hasLevelUp(
  previousXP: number,
  newXP: number
) {
  return (
    getCurrentLevel(newXP) >
    getCurrentLevel(previousXP)
  );
}

export function getXPRemaining(
  totalXP: number
) {
  const progress =
    calculateLevelProgress(totalXP);

  return (
    progress.xpForNextLevel -
    progress.currentLevelXP
  );
}