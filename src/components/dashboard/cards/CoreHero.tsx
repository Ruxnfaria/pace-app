"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import CoreVisual from "@/components/dashboard/coreVisual/CoreVisual";
import { consumeCoreEnergy } from "@/lib/gamification/coreEnergyPulse";
import { getCoreRankProgress } from "@/lib/gamification/coreStages";

type CoreHeroProps = { totalXP: number };

export default function CoreHero({ totalXP }: CoreHeroProps) {
  const [absorbing, setAbsorbing] = useState(false);
  const [pendingEnergy, setPendingEnergy] = useState(0);
  const reduceMotion = useReducedMotion();
  const progress = getCoreRankProgress(totalXP);
  const charge = Math.round(progress.progressPercentage);
  const intensity = totalXP <= 0 ? 0.28 : 0.45 + (charge / 100) * 0.55;

  useEffect(() => {
    let absorbTimer: number | undefined;
    let pendingTimer: number | undefined;
    let energizeTimer: number | undefined;
    let clearTimer: number | undefined;

    function energize() {
      setAbsorbing(false);
      window.requestAnimationFrame(() => setAbsorbing(true));
      absorbTimer = window.setTimeout(() => setAbsorbing(false), 1100);
    }

    window.addEventListener("pace:core-energize", energize);
    const pending = consumeCoreEnergy();
    if (pending > 0) {
      pendingTimer = window.setTimeout(() => setPendingEnergy(pending), 0);
      energizeTimer = window.setTimeout(energize, 250);
      clearTimer = window.setTimeout(() => setPendingEnergy(0), 1800);
    }

    return () => {
      window.removeEventListener("pace:core-energize", energize);
      if (absorbTimer) window.clearTimeout(absorbTimer);
      if (pendingTimer) window.clearTimeout(pendingTimer);
      if (energizeTimer) window.clearTimeout(energizeTimer);
      if (clearTimer) window.clearTimeout(clearTimer);
    };
  }, []);

  return (
    <motion.div
      className="relative mx-auto h-[262px] w-full max-w-[360px] overflow-hidden"
      aria-label={`${progress.currentRank.coreName}, ${charge}% carregado`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
    >
      <CoreVisual
        rankId={progress.currentRank.id}
        intensity={intensity}
        absorbing={absorbing}
        reducedMotion={Boolean(reduceMotion)}
      />
      {pendingEnergy > 0 && (
        <motion.span
          className="pointer-events-none absolute left-1/2 top-1 z-20 -translate-x-1/2 rounded-full border border-orange-400/30 bg-black/80 px-3 py-1 text-[10px] font-bold text-orange-200"
          initial={{ opacity: 0, y: 7 }}
          animate={{ opacity: 1, y: 0 }}
        >
          +{pendingEnergy} Energia
        </motion.span>
      )}
    </motion.div>
  );
}
