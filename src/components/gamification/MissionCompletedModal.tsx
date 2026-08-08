"use client";

import { CheckCircle2, Zap } from "lucide-react";

interface MissionCompletedModalProps {
  title: string;
  xpReward: number;
  onContinue: () => void;
}

export function MissionCompletedModal({
  title,
  xpReward,
  onContinue,
}: MissionCompletedModalProps) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-[32px] border border-[#7c3aed]/35 bg-[#0d0d14] p-7 text-center shadow-2xl shadow-purple-950/40">
        <div className="pointer-events-none absolute left-1/2 top-0 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7c3aed]/25 blur-[90px]" />

        <div className="relative">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10">
            <CheckCircle2 className="h-10 w-10 text-emerald-300" />
          </div>

          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.26em] text-[#a855f7]">
            Missão concluída
          </p>

          <h2 className="mt-3 text-2xl font-black text-white">
            {title}
          </h2>

          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Essa ação fortaleceu seu Núcleo e avançou sua evolução.
          </p>

          <div className="mt-6 flex items-center justify-center gap-3 rounded-2xl border border-violet-400/15 bg-violet-400/[0.06] p-4">
            <Zap className="h-5 w-5 fill-[#a855f7] text-[#a855f7]" />

            <span className="text-lg font-black text-white">
              +{xpReward} XP
            </span>
          </div>

          <button
            type="button"
            onClick={(event) => {
                const buttonRect =
                  event.currentTarget.getBoundingClientRect();
              
                window.dispatchEvent(
                  new CustomEvent("pace:core-energize", {
                    detail: {
                      xp: xpReward,
                      originX: buttonRect.left + buttonRect.width / 2,
                      originY: buttonRect.top + buttonRect.height / 2,
                    },
                  })
                );
              
                onContinue();
              }}
            className="mt-6 min-h-14 w-full rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#9333ea] px-6 text-sm font-black text-white shadow-[0_12px_38px_rgba(124,58,237,0.28)] transition hover:-translate-y-0.5"
          >
            Absorver recompensa
          </button>
        </div>
      </div>
    </div>
  );
}