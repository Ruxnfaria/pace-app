"use client";

import { Zap } from "lucide-react";

interface XPCardProps {
  currentXP: number;
  completedMissions: number;
  totalMissions: number;
}

export function XPCard({
  currentXP,
  completedMissions,
  totalMissions,
}: XPCardProps) {
  return (
    <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between h-32 relative overflow-hidden">
      <div className="flex justify-between items-start">
        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
          XP Hoje
        </span>

        <div className="p-2 rounded-xl bg-purple-500/10 text-[#7c3aed] border border-purple-500/20">
          <Zap className="w-4 h-4 fill-[#7c3aed]" />
        </div>
      </div>

      <div>
        <h3 className="text-2xl font-black">
          {currentXP} <span className="text-xs font-bold text-zinc-500">XP</span>
        </h3>

        <p className="text-[10px] text-zinc-500 mt-1">
          {completedMissions} de {totalMissions} metas batidas
        </p>
      </div>
    </div>
  );
}