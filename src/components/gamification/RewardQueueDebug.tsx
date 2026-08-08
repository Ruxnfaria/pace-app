"use client";

import { useRewardQueue } from "./RewardQueueProvider";

export function RewardQueueDebug() {
  const {
    currentAction,
    queueSize,
    completeCurrentAction,
    clearQueue,
  } = useRewardQueue();

  if (!currentAction) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-full max-w-sm rounded-2xl border border-[#7c3aed]/30 bg-[#111111] p-5 shadow-2xl shadow-purple-950/30">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#a855f7]">
        Reward Queue
      </p>

      <h3 className="mt-2 text-base font-black text-white">
        {currentAction.type}
      </h3>

      <div className="mt-3 rounded-xl border border-white/5 bg-black/30 p-3">
        <pre className="overflow-auto whitespace-pre-wrap text-xs text-zinc-400">
          {JSON.stringify(
            currentAction.payload,
            null,
            2
          )}
        </pre>
      </div>

      <p className="mt-3 text-xs font-bold text-zinc-500">
        {queueSize}{" "}
        {queueSize === 1 ? "ação na fila" : "ações na fila"}
      </p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={completeCurrentAction}
          className="flex-1 rounded-xl bg-[#7c3aed] px-4 py-2.5 text-xs font-black text-white transition hover:bg-[#8b5cf6]"
        >
          Próxima ação
        </button>

        <button
          type="button"
          onClick={clearQueue}
          className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black text-zinc-400 transition hover:border-white/20 hover:text-white"
        >
          Limpar
        </button>
      </div>
    </div>
  );
}