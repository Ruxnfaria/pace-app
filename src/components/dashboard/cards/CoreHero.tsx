"use client";

import { useEffect, useState } from "react";
import { consumeCoreEnergy } from "@/lib/gamification/coreEnergyPulse";
import { getCoreRankProgress } from "@/lib/gamification/coreStages";

type CoreHeroProps = { totalXP: number };

export default function CoreHero({ totalXP }: CoreHeroProps) {
  const [absorbing, setAbsorbing] = useState(false);
  const [pendingEnergy, setPendingEnergy] = useState(0);
  const progress = getCoreRankProgress(totalXP);
  const rank = progress.currentRank;
  const charge = Math.round(progress.progressPercentage);
  const glowOpacity = Math.min(0.26 + rank.glowIntensity * 0.03 + charge * 0.0018, 0.72);
  const crackOpacity = Math.min(0.42 + charge * 0.006, 0.96);

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
    <div className="relative mx-auto flex h-[262px] w-full max-w-[360px] items-center justify-center" aria-label={`${rank.coreName}, ${charge}% carregado`}>
      <div className="absolute h-56 w-56 rounded-full bg-[#ff5a00] blur-[62px] motion-safe:animate-pulse" style={{ opacity: glowOpacity }} />
      <div className="absolute h-[212px] w-[326px] rounded-[50%] border border-[#ff7626]/55 shadow-[0_0_16px_rgba(255,106,0,0.18)] [transform:rotate(-14deg)]" />
      {rank.ringCount > 1 && <div className="absolute h-[226px] w-[350px] rounded-[50%] border border-[#ff7626]/30 shadow-[0_0_14px_rgba(255,106,0,0.12)] [transform:rotate(24deg)]" />}
      {rank.ringCount > 2 && <div className="absolute h-[184px] w-[338px] rounded-[50%] border border-[#ff9a55]/20 [transform:rotate(62deg)]" />}
      {pendingEnergy > 0 && <span className="absolute top-0 z-30 rounded-full border border-[#ff7a00]/30 bg-black/80 px-3 py-1 text-[10px] font-bold text-[#ff8a1f]">+{pendingEnergy} Energia</span>}
      <div data-pace-core-target className={`relative z-20 h-[196px] w-[196px] rounded-full border border-[#ff7a22]/70 bg-[radial-gradient(circle_at_38%_30%,#403a34_0%,#17130f_26%,#070605_64%,#010101_100%)] shadow-[inset_-22px_-28px_42px_rgba(0,0,0,0.92),inset_12px_9px_28px_rgba(255,122,34,0.12),0_0_32px_rgba(255,90,0,0.58),0_0_76px_rgba(255,90,0,0.3)] ${absorbing ? "scale-105" : "scale-100"} transition-transform duration-700 motion-reduce:transition-none`}>
        <span className="absolute left-[28%] top-[18%] h-[54%] w-[2.5px] origin-bottom rotate-[28deg] rounded-full bg-[#ff6a00] shadow-[0_0_11px_#ff5a00]" style={{ opacity: crackOpacity }} />
        <span className="absolute left-[41%] top-[42%] h-[38%] w-[2.5px] origin-top -rotate-[38deg] rounded-full bg-[#ff7a22] shadow-[0_0_10px_#ff5a00]" style={{ opacity: crackOpacity * 0.88 }} />
        <span className="absolute right-[29%] top-[25%] h-[30%] w-[2px] origin-bottom -rotate-[24deg] rounded-full bg-[#ff9a55] shadow-[0_0_9px_#ff6a00]" style={{ opacity: crackOpacity * 0.75 }} />
        <span className="absolute inset-[12px] rounded-full border border-white/[0.025]" />
      </div>
    </div>
  );
}
