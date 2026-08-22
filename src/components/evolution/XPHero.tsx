import { Zap } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";

interface XPHeroProps {
  level: number;
  levelName: string;
  totalXP: number;
  xpMissing: number;
  xpProgress: number;
  xpForNextLevel: number;
}

export function XPHero({
  level,
  levelName,
  totalXP,
  xpMissing,
  xpProgress,
  xpForNextLevel,
}: XPHeroProps) {
  return (
    <Card
      variant="hero"
      padding="lg"
      className="min-h-[330px] lg:min-h-[370px]"
    >
      {/* Linhas de energia do PRAXE */}
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -right-28 -top-36 h-80 w-80 rounded-full border border-[#a855f7]/20" />
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full border border-[#7c3aed]/15" />
        <div className="absolute -bottom-40 left-1/3 h-72 w-72 rounded-full border border-[#a855f7]/10" />
      </div>

      {/* Glows */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#7c3aed]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-44 w-80 bg-[#a855f7]/10 blur-3xl" />

      <div className="relative z-10 flex min-h-[280px] flex-col justify-between gap-10 lg:min-h-[310px] lg:flex-row lg:items-center">
        <div className="flex-1">
          <div className="mb-7 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-[#7c3aed]/50 bg-[#7c3aed]/15 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#d8b4fe] shadow-[0_0_24px_rgba(124,58,237,0.16)]">
              Nível {level}
            </span>

            <span className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
              {levelName}
            </span>
          </div>

          <div className="flex items-end gap-3">
            <h2 className="text-6xl font-black tracking-[-0.05em] text-white sm:text-7xl lg:text-[88px] lg:leading-none">
              {totalXP}
            </h2>

            <span className="mb-2 text-xl font-black text-[#c084fc] lg:text-2xl">
              XP
            </span>
          </div>

          <p className="mt-5 text-sm font-medium text-zinc-400">
            Faltam{" "}
            <strong className="font-black text-white">{xpMissing} XP</strong>{" "}
            para alcançar o próximo nível.
          </p>

          <div className="mt-9 max-w-3xl">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="font-bold text-zinc-500">
                Progresso do nível
              </span>

              <span className="font-black text-[#d8b4fe]">
                {Math.round(xpProgress)}%
              </span>
            </div>

            <ProgressBar
  value={xpProgress}
  max={100}
  height="lg"
  color="purple"
/>

            <div className="mt-3 flex justify-between text-[11px] font-bold text-zinc-600">
            <span>{totalXP} de Energia acumulada</span>
              <span>{xpForNextLevel} XP</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-center lg:w-[280px]">
          <div className="relative flex h-52 w-52 items-center justify-center lg:h-60 lg:w-60">
            <div className="absolute inset-3 rounded-full bg-[#7c3aed]/30 blur-3xl" />
            <div className="absolute inset-8 rounded-full bg-[#c026d3]/20 blur-2xl" />

            <div className="relative flex h-36 w-36 rotate-45 items-center justify-center rounded-[36px] border-2 border-[#c084fc]/80 bg-gradient-to-br from-[#7c3aed] via-[#5b21b6] to-[#251044] shadow-[0_0_70px_rgba(139,92,246,0.55)] lg:h-40 lg:w-40">
              <div className="flex h-28 w-28 items-center justify-center rounded-[28px] border border-white/20 bg-[#10091f]/90 lg:h-32 lg:w-32">
                <Zap className="h-16 w-16 -rotate-45 fill-[#d8b4fe] text-[#d8b4fe] drop-shadow-[0_0_18px_rgba(216,180,254,0.85)]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}