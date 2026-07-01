"use client";

import { Scale } from "lucide-react";

interface WeightCardProps {
  weight?: number | string | null;
  goal?: string | null;
}

export function WeightCard({ weight, goal }: WeightCardProps) {
  return (
    <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between h-32 relative overflow-hidden">
      <div className="flex justify-between items-start">
        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Peso Atual</span>
        <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Scale className="w-4 h-4" />
        </div>
      </div>

      <div>
        <h3 className="text-2xl font-black">
          {weight || "66"} <span className="text-xs font-bold text-zinc-500">kg</span>
        </h3>
        <p className="text-[10px] text-zinc-500 mt-1 truncate">
          Foco: {goal || "Hipertrofia"}
        </p>
      </div>
    </div>
  );
}