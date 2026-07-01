"use client";

import { Flame } from "lucide-react";

interface StreakCardProps {
  streak?: number;
}

export function StreakCard({ streak = 1 }: StreakCardProps) {
  return (
    <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between h-32 relative overflow-hidden">
      <div className="flex justify-between items-start">
        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Sequência</span>
        <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20">
          <Flame className="w-4 h-4 fill-orange-500" />
        </div>
      </div>

      <div>
        <h3 className="text-2xl font-black">
          {streak} <span className="text-xs font-bold text-zinc-500">Dia{streak > 1 ? "s" : ""}</span>
        </h3>
        <p className="text-[10px] text-zinc-500 mt-1">Constância ativa</p>
      </div>
    </div>
  );
}