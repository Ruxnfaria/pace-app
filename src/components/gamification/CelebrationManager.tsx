"use client";

import { useEffect } from "react";

import { XPToast } from "./XPToast";
import { MissionCompletedModal } from "./MissionCompletedModal";
import { useRewardQueue } from "./RewardQueueProvider";

const TOAST_DURATION = 2000;

export function CelebrationManager() {
  const {
    currentAction,
    completeCurrentAction,
  } = useRewardQueue();

  useEffect(() => {
    if (!currentAction) {
      return;
    }

    switch (currentAction.type) {
      case "SHOW_XP_TOAST": {
        const timer = window.setTimeout(() => {
          completeCurrentAction();
        }, TOAST_DURATION);

        return () => window.clearTimeout(timer);
      }
      case "SHOW_MISSION_COMPLETED":
        return;
      default: {
        const timer = window.setTimeout(() => {
          completeCurrentAction();
        }, 100);
      
        return () => window.clearTimeout(timer);
      }
    }
  }, [currentAction, completeCurrentAction]);

  if (!currentAction) {
    return null;
  }

  switch (currentAction.type) {
    case "SHOW_XP_TOAST":
      return (
        <XPToast
          xp={currentAction.payload.xpGained}
        />
        
      );
      case "SHOW_MISSION_COMPLETED":
        return (
          <MissionCompletedModal
            title={currentAction.payload.title}
            xpReward={currentAction.payload.xpReward}
            onContinue={completeCurrentAction}
          />
        );
    default:
      return null;
      
  }
}