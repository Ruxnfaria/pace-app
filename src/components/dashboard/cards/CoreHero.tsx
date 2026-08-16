"use client";

import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getCoreRankProgress,
} from "@/lib/gamification/coreStages";


import Core from "@/components/pace/core/Core";
type CoreVisualState =
  | "dormant"
  | "stable"
  | "energized"
  | "vibrant"
  | "transcendent";
type CoreHeroProps = {
  level: number;
  levelName: string;
  totalXP: number;
  xpMissing: number;
  xpProgress: number;
  completedMissions: number;
  totalMissions: number;
  rankingPosition: number | null;
  href?: string;
};

export default function CoreHero({
  
  level,
  levelName,
  totalXP,
  xpMissing,
  xpProgress,
  completedMissions,
  totalMissions,
  rankingPosition,
  href = "/dashboard/workouts",
}: CoreHeroProps) {
  const [isAbsorbingEnergy, setIsAbsorbingEnergy] = useState(false);

useEffect(() => {
  function handleCoreEnergize() {
    setIsAbsorbingEnergy(false);

    window.requestAnimationFrame(() => {
      setIsAbsorbingEnergy(true);
    });

    const timer = window.setTimeout(() => {
      setIsAbsorbingEnergy(false);
    }, 1100);

    return () => window.clearTimeout(timer);
  }

  window.addEventListener(
    "pace:core-energize",
    handleCoreEnergize
  );

  return () => {
    window.removeEventListener(
      "pace:core-energize",
      handleCoreEnergize
    );
  };
}, []);

const core = getCoreRankProgress(totalXP);

const currentRank = core.currentRank;
const nextRank = core.nextRank;

// Percentual de carga dentro do rank atual.
// É isso que controla brilho, escala e intensidade visual do Núcleo.
const coreEnergy = Math.round(core.progressPercentage);

  const hasMissions = totalMissions > 0;
  const allMissionsCompleted =
    hasMissions && completedMissions === totalMissions;
  const hasStarted = completedMissions > 0;

  const statusTitle = allMissionsCompleted
    ? "Núcleo completo"
    : hasStarted
      ? "Núcleo energizando"
      : "Núcleo em repouso";

  const statusDescription = allMissionsCompleted
    ? "Você concluiu sua evolução de hoje."
    : hasStarted
      ? "Continue avançando para fortalecer sua energia."
      : "Complete sua primeira missão para despertar o Núcleo.";

  const buttonText = allMissionsCompleted
    ? "Evolução concluída"
    : hasStarted
      ? "Continuar evoluindo"
      : "Iniciar evolução";
      

  return (
    <section className="relative overflow-hidden rounded-[30px] border border-[#7c3aed]/35 bg-[#0b0914]">
      {/* Fundo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 -top-32 h-[500px] w-[500px] rounded-full bg-[#7c3aed]/20 blur-[130px]" />

        <div className="absolute -bottom-72 left-[35%] h-[520px] w-[520px] rounded-full bg-[#4c1d95]/15 blur-[150px]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_73%_45%,rgba(168,85,247,0.13),transparent_38%)]" />

        <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:44px_44px]" />
      </div>

      <div className="relative grid min-h-[460px] grid-cols-1 items-center gap-4 p-7 lg:grid-cols-[0.85fr_1.15fr] lg:px-10 lg:py-8">
        {/* Coluna esquerda */}
        <div className="relative z-10 flex flex-col">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#a855f7]">
  {currentRank.coreName}
</p>

          <div className="mt-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#7c3aed]/35 bg-[#7c3aed]/10 shadow-[0_0_24px_rgba(124,58,237,0.18)]">
              <Zap className="h-5 w-5 fill-[#a855f7] text-[#a855f7]" />
            </div>

            <div>
            <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
  {currentRank.name}
</h2>

<p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">
  {currentRank.description}
</p>
            </div>
          </div>

          {/* Progresso */}
          <div className="mt-7 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex items-end justify-between gap-4">
              <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
  Progresso do Núcleo
</p>

<p className="mt-1 text-xs text-zinc-400">
  {nextRank
    ? `Próxima evolução: ${nextRank.name}`
    : "Rank máximo alcançado"}
</p>
              </div>

              <p className="text-3xl font-black text-white">
  {coreEnergy}
  <span className="ml-1 text-sm text-[#a855f7]">%</span>
</p>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] via-[#9333ea] to-[#c084fc] shadow-[0_0_18px_rgba(168,85,247,0.55)] transition-all duration-700"
                style={{ width: `${coreEnergy}%` }}
              />
            </div>
          </div>

          {/* Estatísticas */}
          <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
  <p className="text-[10px] font-black uppercase tracking-[0.17em] text-zinc-500">
    Rank atual
  </p>

  <p className="mt-2 text-2xl font-black text-white">
    {currentRank.name}
  </p>

  <p className="mt-1 text-xs font-bold text-[#a855f7]">
    {currentRank.coreName}
  </p>

  <Link
    href="/dashboard/ranks"
    className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black text-[#a855f7] transition-colors hover:text-[#c084fc]"
  >
    Ver progressão
    <ArrowRight className="h-3.5 w-3.5" />
  </Link>
</div>

<div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
  <p className="text-[10px] font-black uppercase tracking-[0.17em] text-zinc-500">
    Posição atual
  </p>

  <p className="mt-2 text-2xl font-black text-white">
    {rankingPosition ? `#${rankingPosition}` : "--"}
  </p>

  <p className="mt-1 text-xs font-bold text-[#a855f7]">
    Ranking {currentRank.name}
  </p>
</div>
          </div>

          <Link
            href={href}
            aria-disabled={allMissionsCompleted}
            onClick={(event) => {
              if (allMissionsCompleted) {
                event.preventDefault();
              }
            }}
            className={`mt-5 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl px-6 text-sm font-black transition-all ${
              allMissionsCompleted
                ? "cursor-default border border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                : "bg-gradient-to-r from-[#7c3aed] to-[#9333ea] text-white shadow-[0_12px_38px_rgba(124,58,237,0.28)] hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(124,58,237,0.38)]"
            }`}
          >
            {buttonText}

            {!allMissionsCompleted && (
              <ArrowRight className="h-4 w-4" />
            )}
          </Link>
        </div>

        {/* Coluna do Núcleo */}
        <div className="relative flex min-h-[390px] items-center justify-center overflow-visible">
          <div className="absolute h-[350px] w-[350px] rounded-full bg-[#7c3aed]/10 blur-[75px]" />

          <div className="absolute h-[315px] w-[315px] rounded-full border border-[#7c3aed]/10" />

          <div className="absolute h-[270px] w-[270px] rounded-full border border-[#a855f7]/10" />

          <div className="relative z-10 flex flex-col items-center">
  <div
    data-pace-core-target
    className={`scale-[1.08] sm:scale-[1.18] lg:scale-[1.28] ${
      isAbsorbingEnergy ? "core-absorb-energy" : ""
    }`}
  >
    <Core
      rank={currentRank.id}
      energy={coreEnergy}
    />
  </div>

  <div className="mt-3 text-center">
    <p className="text-3xl font-black text-white">
      {coreEnergy}
      <span className="ml-1 text-base text-[#a855f7]">%</span>
    </p>

    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
      Progresso do Núcleo
    </p>
  </div>
</div>
        </div>
      </div>
    </section>
  );
}