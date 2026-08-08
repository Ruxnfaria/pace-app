"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { GamificationAction } from "@/lib/gamification/types";

interface RewardQueueContextValue {
  currentAction: GamificationAction | null;
  queuedActions: GamificationAction[];
  queueSize: number;
  isShowingReward: boolean;

  enqueueAction: (action: GamificationAction) => void;
  enqueueActions: (actions: GamificationAction[]) => void;
  completeCurrentAction: () => void;
  clearQueue: () => void;
}

const RewardQueueContext =
  createContext<RewardQueueContextValue | null>(null);

interface RewardQueueProviderProps {
  children: ReactNode;
}

function sortActionsByPriority(
  actions: GamificationAction[]
): GamificationAction[] {
  return [...actions].sort(
    (firstAction, secondAction) =>
      firstAction.priority - secondAction.priority
  );
}

export function RewardQueueProvider({
  children,
}: RewardQueueProviderProps) {
  const [queue, setQueue] = useState<GamificationAction[]>([]);

  const currentAction = queue[0] ?? null;

  const enqueueAction = useCallback(
    (action: GamificationAction) => {
      setQueue((currentQueue) => {
        const actionAlreadyExists = currentQueue.some(
          (queuedAction) => queuedAction.id === action.id
        );

        if (actionAlreadyExists) {
          return currentQueue;
        }

        if (currentQueue.length === 0) {
          return [action];
        }
        
        const [activeAction, ...pendingActions] = currentQueue;
        
        return [
          activeAction,
          ...sortActionsByPriority([
            ...pendingActions,
            action,
          ]),
        ];
      });
    },
    []
  );

  const enqueueActions = useCallback(
    (actions: GamificationAction[]) => {
      if (actions.length === 0) {
        return;
      }

      setQueue((currentQueue) => {
        const existingIds = new Set(
          currentQueue.map((action) => action.id)
        );

        const newActions = actions.filter(
          (action) => !existingIds.has(action.id)
        );

        if (currentQueue.length === 0) {
          return sortActionsByPriority(newActions);
        }
        
        const [activeAction, ...pendingActions] = currentQueue;
        
        return [
          activeAction,
          ...sortActionsByPriority([
            ...pendingActions,
            ...newActions,
          ]),
        ];
      });
    },
    []
  );

  const completeCurrentAction = useCallback(() => {
    setQueue((currentQueue) =>
      currentQueue.slice(1)
    );
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const value = useMemo<RewardQueueContextValue>(
    () => ({
      currentAction,
      queuedActions: queue,
      queueSize: queue.length,
      isShowingReward: currentAction !== null,

      enqueueAction,
      enqueueActions,
      completeCurrentAction,
      clearQueue,
    }),
    [
      currentAction,
      queue,
      enqueueAction,
      enqueueActions,
      completeCurrentAction,
      clearQueue,
    ]
  );

  return (
    <RewardQueueContext.Provider value={value}>
      {children}
    </RewardQueueContext.Provider>
  );
}

export function useRewardQueue() {
  const context = useContext(RewardQueueContext);

  if (!context) {
    throw new Error(
      "useRewardQueue deve ser usado dentro de RewardQueueProvider."
    );
  }

  return context;
}