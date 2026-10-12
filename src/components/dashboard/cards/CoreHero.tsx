"use client";

import { useEffect, useState } from "react";
import Core from "@/components/pace/core/Core";
import { consumeCoreEnergy } from "@/lib/gamification/coreEnergyPulse";
import { getCoreRankProgress } from "@/lib/gamification/coreStages";

type CoreHeroProps = { totalXP: number };

export default function CoreHero({ totalXP }: CoreHeroProps) {
  const [absorbing, setAbsorbing] = useState(false);
  const [pendingEnergy, setPendingEnergy] = useState(0);
  const progress = getCoreRankProgress(totalXP);

  useEffect(() => {
    function energize() {
      setAbsorbing(false);
      window.requestAnimationFrame(() => setAbsorbing(true));
      window.setTimeout(() => setAbsorbing(false), 1100);
    }
    window.addEventListener("pace:core-energize", energize);
    const pending = consumeCoreEnergy();
    let pendingTimer: number | undefined;
    let energizeTimer: number | undefined;
    let clearTimer: number | undefined;
    if (pending > 0) {
      pendingTimer = window.setTimeout(() => setPendingEnergy(pending), 0);
      energizeTimer = window.setTimeout(energize, 250);
      clearTimer = window.setTimeout(() => setPendingEnergy(0), 1800);
    }
    return () => {
      window.removeEventListener("pace:core-energize", energize);
      if (pendingTimer) window.clearTimeout(pendingTimer);
      if (energizeTimer) window.clearTimeout(energizeTimer);
      if (clearTimer) window.clearTimeout(clearTimer);
    };
  }, []);

  return (
    <div className="relative mx-auto flex h-[300px] w-full max-w-[360px] items-center justify-center sm:h-[330px]" aria-label={`${progress.currentRank.coreName}, ${Math.round(progress.progressPercentage)}% carregado`}>
      <div className="absolute h-56 w-56 rounded-full bg-[#ff5a00]/20 blur-[62px] motion-safe:animate-pulse" />
      <div className="absolute h-[245px] w-[245px] rounded-[50%] border border-[#ff7a00]/20 [transform:rotateX(68deg)_rotateZ(-10deg)]" />
      <div className="absolute h-[285px] w-[285px] rounded-[50%] border border-[#ff7a00]/10 [transform:rotateX(72deg)_rotateZ(28deg)]" />
      <div className="absolute h-[215px] w-[215px] rounded-full border border-white/[0.05]" />
      {pendingEnergy > 0 && <span className="absolute top-5 z-30 rounded-full border border-[#ff7a00]/30 bg-black/70 px-3 py-1 text-xs font-bold text-[#ff8a1f]">+{pendingEnergy} Energia</span>}
      <div data-pace-core-target className={`relative z-20 scale-[0.78] [filter:hue-rotate(115deg)_saturate(1.25)] sm:scale-[0.86] ${absorbing ? "core-absorb-energy" : ""}`}><Core rank={progress.currentRank.id} energy={Math.round(progress.progressPercentage)} /></div>
    </div>
  );
}
