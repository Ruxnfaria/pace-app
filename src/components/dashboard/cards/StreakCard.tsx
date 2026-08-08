"use client";

import { Flame } from "lucide-react";

interface StreakCardProps {
  streak?: number;
}

export function StreakCard({ streak = 1 }: StreakCardProps) {
    return (
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] min-h-40 flex flex-col justify-between">
      
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
              🔥 Sequência Atual
            </span>
      
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20">
              <Flame className="w-4 h-4 fill-orange-500" />
            </div>
          </div>
      
          <div>
            <h3 className="text-5xl font-black text-white leading-none">
              {streak}
            </h3>
      
            <p className="text-sm font-bold text-zinc-400 mt-1 uppercase tracking-wide">
              {streak === 1 ? "Dia Consecutivo" : "Dias Consecutivos"}
            </p>
          </div>
      
          <div className="border-t border-[#1f1f1f] pt-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
            🏆 Melhor Marca
            </p>
      
            <p className="text-lg font-black text-[#7c3aed] mt-1">
            🔥 12 Dias
            </p>
          </div>
      
        </div>
      );
    }