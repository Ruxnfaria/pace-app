"use client";

import { GamificationActions } from "@/lib/gamification/actions";
import { useRewardQueue } from "./RewardQueueProvider";

export function RewardQueueTest() {
  const { enqueueActions } = useRewardQueue();

  function handleTestRewardQueue() {
    const actions = [
      GamificationActions.showXPToast(100),
    
      GamificationActions.showMissionCompleted(
        "test",
        "Treinar musculação hoje",
        50
      ),
    ];

    enqueueActions(actions);
  }

  return (
    <button
      type="button"
      onClick={handleTestRewardQueue}
      className="fixed bottom-28 right-6 z-[90] rounded-xl border border-[#7c3aed]/30 bg-[#7c3aed] px-5 py-3 text-xs font-black text-white shadow-xl shadow-purple-950/30 transition hover:bg-[#8b5cf6]"
    >
      Testar recompensa
    </button>
  );
}