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
  const glowOpacity = Math.min(0.18 + rank.glowIntensity * 0.025 + charge * 0.0015, 0.58);
  const crackOpacity = Math.min(0.28 + charge * 0.006, 0.88);

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
    <div className="relative mx-auto flex h-[232px] w-full max-w-[330px] items-center justify-center" aria-label={`${rank.coreName}, ${charge}% carregado`}>
      <div className="absolute h-44 w-44 rounded-full bg-[#ff5a00] blur-[58px] motion-safe:animate-pulse" style={{ opacity: glowOpacity }} />
      <div className="absolute h-[178px] w-[276px] rounded-[50%] border border-[#ff7626]/35 [transform:rotate(-14deg)]" />
      {rank.ringCount > 1 && <div className="absolute h-[190px] w-[298px] rounded-[50%] border border-[#ff7626]/15 [transform:rotate(24deg)]" />}
      {rank.ringCount > 2 && <div className="absolute h-[154px] w-[286px] rounded-[50%] border border-[#ff9a55]/10 [transform:rotate(62deg)]" />}
      {pendingEnergy > 0 && <span className="absolute top-0 z-30 rounded-full border border-[#ff7a00]/30 bg-black/80 px-3 py-1 text-[10px] font-bold text-[#ff8a1f]">+{pendingEnergy} Energia</span>}
      <div data-pace-core-target className={`relative z-20 h-[156px] w-[156px] rounded-full border border-[#ff7a22]/50 bg-[radial-gradient(circle_at_38%_30%,#34302d_0%,#141210_28%,#070707_66%,#020202_100%)] shadow-[inset_-18px_-24px_34px_rgba(0,0,0,0.9),inset_9px_7px_24px_rgba(255,122,34,0.08),0_0_24px_rgba(255,90,0,0.42),0_0_58px_rgba(255,90,0,0.2)] ${absorbing ? "scale-105" : "scale-100"} transition-transform duration-700 motion-reduce:transition-none`}>
        <span className="absolute left-[28%] top-[18%] h-[54%] w-[2px] origin-bottom rotate-[28deg] rounded-full bg-[#ff6a00] shadow-[0_0_8px_#ff5a00]" style={{ opacity: crackOpacity }} />
        <span className="absolute left-[41%] top-[42%] h-[38%] w-[2px] origin-top -rotate-[38deg] rounded-full bg-[#ff7a22] shadow-[0_0_7px_#ff5a00]" style={{ opacity: crackOpacity * 0.8 }} />
        <span className="absolute right-[29%] top-[25%] h-[30%] w-[1px] origin-bottom -rotate-[24deg] rounded-full bg-[#ff9a55] shadow-[0_0_6px_#ff6a00]" style={{ opacity: crackOpacity * 0.65 }} />
        <span className="absolute inset-[12px] rounded-full border border-white/[0.025]" />
      </div>
    </div>
  );
}
