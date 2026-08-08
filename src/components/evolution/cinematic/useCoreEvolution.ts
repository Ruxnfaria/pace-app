"use client";

import { useCallback, useState } from "react";
import type { CoreRank } from "@/lib/gamification/coreStages";

export function useCoreEvolution() {
  const [isPlaying, setIsPlaying] = useState(false);

  const [previousRank, setPreviousRank] =
    useState<CoreRank | null>(null);

  const [nextRank, setNextRank] =
    useState<CoreRank | null>(null);

  const startEvolution = useCallback(
    (
      oldRank: CoreRank,
      newRank: CoreRank
    ) => {
      if (oldRank.id === newRank.id) return;

      setPreviousRank(oldRank);

      setNextRank(newRank);

      setIsPlaying(true);
    },
    []
  );

  const finishEvolution = useCallback(() => {
    setIsPlaying(false);

    setPreviousRank(null);

    setNextRank(null);
  }, []);

  return {
    isPlaying,

    previousRank,

    nextRank,

    startEvolution,

    finishEvolution,
  };
}