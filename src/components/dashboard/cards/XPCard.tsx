"use client";

import { Zap } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";

interface XPCardProps {
  currentXP: number;
  completedMissions: number;
  totalMissions: number;
  totalXP?: number;
  level?: number;
}

export function XPCard({
  currentXP,
  completedMissions,
  totalMissions,
  totalXP = 0,
  level = 1,
}: XPCardProps) {
  const xpPerLevel = 500;
  const currentLevelStartXP = (level - 1) * xpPerLevel;
  const nextLevelXP = level * xpPerLevel;

  const xpInsideCurrentLevel = Math.max(
    totalXP - currentLevelStartXP,
    0
  );

  const xpNeededForNextLevel = Math.max(
    nextLevelXP - totalXP,
    0
  );

  const progress = Math.min(
    Math.max(
      Math.round((xpInsideCurrentLevel / xpPerLevel) * 100),
      0
    ),
    100
  );

  const levelTitles: Record<number, string> = {
    1: "Iniciante",
    2: "Disciplinado",
    3: "Atleta",
    4: "Competidor",
    5: "Elite",
    6: "Lenda",
    7: "Imparável",
    8: "Mestre Pace",
    9: "Titã",
    10: "GOAT",
  };

  const levelTitle = levelTitles[level] || "Lenda";

  return (
    <Card
      padding="md"
      className="group min-h-40 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-[#7c3aed]/45 hover:shadow-[0_16px_45px_rgba(124,58,237,0.12)]"
    >
      {/* Glow decorativo */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-[#7c3aed]/10 blur-3xl transition-all duration-300 group-hover:bg-[#7c3aed]/20" />

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
              Evolução
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="xp">
                Nível {level}
              </Badge>

              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                {levelTitle}
              </span>
            </div>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#7c3aed]/25 bg-[#7c3aed]/10 text-[#a855f7] shadow-[0_0_20px_rgba(124,58,237,0.08)] transition-all duration-300 group-hover:border-[#7c3aed]/50 group-hover:shadow-[0_0_25px_rgba(124,58,237,0.22)]">
            <Zap className="h-4 w-4 fill-[#a855f7]" />
          </div>
        </div>

        <div className="mt-5 flex items-end gap-1.5">
          <h3 className="text-4xl font-black leading-none tracking-[-0.04em] text-white">
            {totalXP}
          </h3>

          <span className="mb-1 text-xs font-black text-[#a855f7]">
            XP
          </span>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Progresso do nível
            </span>

            <span className="text-[10px] font-black text-[#c084fc]">
              {xpNeededForNextLevel} XP restantes
            </span>
          </div>

          <ProgressBar
            value={progress}
            max={100}
            height="lg"
            color="purple"
          />

          <div className="mt-2 flex justify-between text-[10px] font-bold text-zinc-600">
            <span>Nível {level}</span>
            <span>{progress}%</span>
            <span>Nível {level + 1}</span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">
              XP conquistado hoje
            </p>

            <p className="mt-1 text-sm font-black text-[#a855f7]">
              +{currentXP} XP
            </p>
          </div>

          <div className="text-right">
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">
              Missões
            </p>

            <p className="mt-1 text-sm font-black text-white">
              {completedMissions}/{totalMissions}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}