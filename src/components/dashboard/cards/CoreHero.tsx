"use client";

import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import { useEffect, useState } from "react";

import Core from "@/components/pace/core/Core";
import CoreRankUpOverlay from "@/lib/gamification/CoreRankUpOverlay";

import {
  consumeCoreEnergy,
} from "@/lib/gamification/coreEnergyPulse";

import {
  didCoreRankChange,
  getCoreRank,
  getCoreRankProgress,
  type CoreRank,
} from "@/lib/gamification/coreStages";

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
  const [pendingEnergy, setPendingEnergy] = useState(0);

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
useEffect(() => {
  const pending = consumeCoreEnergy();

  if (pending <= 0) return;

  setPendingEnergy(pending);

  const startTimer = window.setTimeout(() => {
    setIsAbsorbingEnergy(false);

    window.requestAnimationFrame(() => {
      setIsAbsorbingEnergy(true);
    });
  }, 350);

  const endTimer = window.setTimeout(() => {
    setIsAbsorbingEnergy(false);
    setPendingEnergy(0);
  }, 1800);

  return () => {
    window.clearTimeout(startTimer);
    window.clearTimeout(endTimer);
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
      
          <div className="relative grid grid-cols-1 gap-4 p-6 sm:p-7 lg:min-h-[460px] lg:grid-cols-[0.85fr_1.15fr] lg:grid-rows-[auto_1fr] lg:items-center lg:px-10 lg:py-8">
      
            {/* Título do Núcleo */}
            <div className="relative z-10 order-1 lg:col-start-1 lg:row-start-1">
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
            </div>
      
            {/* NÚCLEO — no mobile vem antes das informações */}
            <div className="relative order-2 flex min-h-[330px] items-center justify-center overflow-visible sm:min-h-[370px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:min-h-[430px]">
      
              <div className="absolute h-[310px] w-[310px] rounded-full bg-[#7c3aed]/10 blur-[75px] sm:h-[350px] sm:w-[350px]" />
      
              <div className="absolute h-[285px] w-[285px] rounded-full border border-[#7c3aed]/10 sm:h-[315px] sm:w-[315px]" />
      
              <div className="absolute h-[240px] w-[240px] rounded-full border border-[#a855f7]/10 sm:h-[270px] sm:w-[270px]" />
      
              <div className="relative z-10 flex flex-col items-center">
      
                {pendingEnergy > 0 && (
                  <div className="mb-3 rounded-full border border-[#a855f7]/30 bg-[#7c3aed]/15 px-4 py-2 text-center shadow-[0_0_25px_rgba(168,85,247,0.20)]">
                    <p className="text-sm font-black text-[#c084fc]">
                      +{pendingEnergy} Energia
                    </p>
      
                    <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">
                      Núcleo absorvendo
                    </p>
                  </div>
                )}
      
                <div
                  data-pace-core-target
                  className={`scale-[1.12] sm:scale-[1.2] lg:scale-[1.28] ${
                    isAbsorbingEnergy ? "core-absorb-energy" : ""
                  }`}
                >
                  <Core
                    rank={currentRank.id}
                    energy={coreEnergy}
                  />
                </div>
              </div>
            </div>
      
            {/* Informações — no mobile ficam DEPOIS do Núcleo */}
            <div className="relative z-10 order-3 flex flex-col lg:col-start-1 lg:row-start-2">
      
              {/* Progresso */}
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
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
      
              {/* Botão */}
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
      
          </div>
        </section>
      );
      }