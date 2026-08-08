"use client";

import Link from "next/link";
import { ArrowRight, Flame, Sparkles, Trophy } from "lucide-react";

type BottomSummaryProps = {
  streak: number;
  rankingPosition?: number | null;
  leagueName?: string;
  xpMissing: number;
};

export default function BottomSummary({
  streak,
  rankingPosition,
  leagueName = "Liga Prata",
  xpMissing,
}: BottomSummaryProps) {
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Sequência */}
        <div className="relative overflow-hidden rounded-[28px] border border-violet-500/25 bg-[#0d0d14] p-6">
          <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-violet-600/15 blur-3xl" />

          <div className="relative flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/10 shadow-[0_0_30px_rgba(124,58,237,0.18)]">
              <Flame className="h-8 w-8 fill-violet-500 text-violet-400" />
            </div>

            <div>
              <p className="text-3xl font-black text-white">
                {streak} {streak === 1 ? "dia" : "dias"}
              </p>

              <p className="mt-1 text-sm font-bold text-zinc-300">
                Sequência atual
              </p>

              <p className="mt-1 text-sm text-violet-400">
                {streak >= 7
                  ? "Sua consistência está incrível."
                  : "Volte amanhã para manter sua evolução."}
              </p>
            </div>
          </div>
        </div>

        {/* Liga */}
        <div className="relative overflow-hidden rounded-[28px] border border-amber-400/25 bg-[#0d0d14] p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />

          <div className="relative flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10">
              <Trophy className="h-8 w-8 text-amber-300" />
            </div>

            <div>
              <p className="text-2xl font-black text-white">
                {leagueName}
              </p>

              <p className="mt-1 text-sm text-zinc-300">
                {rankingPosition
                  ? `${rankingPosition}º lugar`
                  : "Posição ainda não definida"}
              </p>

              <Link
                href="/dashboard/ranking"
                className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-amber-300"
              >
                Ver ranking
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Insight */}
      <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0d0d14] p-6">
        <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_80%_50%,rgba(124,58,237,0.15),transparent_65%)]" />

        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10">
            <Sparkles className="h-6 w-6 text-violet-300" />
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-400">
              Insight do dia
            </p>

            <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">
              Você está a apenas {xpMissing} XP do próximo nível.
            </h3>

            <p className="mt-1 text-sm text-zinc-400">
              Continue avançando para desbloquear sua próxima evolução.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}