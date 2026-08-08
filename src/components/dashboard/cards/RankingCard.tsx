"use client";

import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";

interface RankingCardProps {
  rankingPosition: number | null;
  xpMissing: number;
}

export function RankingCard({
  rankingPosition,
  xpMissing,
}: RankingCardProps) {
  return (
    <Link
      href="/dashboard/ranking"
      className="group relative overflow-hidden rounded-2xl border border-[#1f1f1f] bg-[#111111] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#7c3aed]/50 hover:shadow-[0_14px_40px_rgba(124,58,237,0.10)]"
    >
      {/* Brilho decorativo */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-[#7c3aed]/10 blur-3xl" />

      <div className="relative">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Ranking PACE
          </span>

          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-yellow-400/20 bg-yellow-400/10">
            <Trophy className="h-4 w-4 text-yellow-400" />
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
              Sua posição
            </p>

            <h3 className="mt-1 text-3xl font-black text-white">
              #{rankingPosition || "-"}
            </h3>
          </div>

          <span className="inline-flex items-center rounded-full border border-slate-300/30 bg-slate-300/10 px-2.5 py-1 text-[10px] font-black tracking-wide text-slate-200">
            LIGA PRATA
          </span>
        </div>

        <div className="mt-5 rounded-xl border border-[#242424] bg-[#0a0a0a] p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Próxima promoção
          </p>

          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-sm font-black text-yellow-400">
              Liga Ouro
            </p>

            <p className="text-xs font-black text-[#a855f7]">
              Faltam {xpMissing} XP
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1 text-xs font-bold text-[#7c3aed] transition-transform group-hover:translate-x-1">
          Ver ranking completo
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </Link>
  );
}