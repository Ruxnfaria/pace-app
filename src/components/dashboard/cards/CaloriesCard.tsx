"use client";

import { Apple } from "lucide-react";

interface CaloriesCardProps {
  calories?: number | null;
  proteins?: number | null;
  carbs?: number | null;
  fats?: number | null;
}

export function CaloriesCard({ calories, proteins, carbs, fats }: CaloriesCardProps) {
  return (
    <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between h-32 relative overflow-hidden">
      <div className="flex justify-between items-start">
        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Calorias Meta</span>
        <div className="p-2 rounded-xl bg-green-500/10 text-[#22c55e] border border-green-500/20">
          <Apple className="w-4 h-4" />
        </div>
      </div>

      <div>
        <h3 className="text-xl font-black md:text-2xl">
          {calories || 0} <span className="text-xs font-bold text-zinc-500">kcal</span>
        </h3>
        <p className="text-[10px] text-zinc-500 mt-1 truncate">
          {calories ? `P:${proteins}g | C:${carbs}g | G:${fats}g` : "Aguardando plano nutricional"}
        </p>
      </div>
    </div>
  );
}