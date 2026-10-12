"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { consumeCoreEnergy } from "@/lib/gamification/coreEnergyPulse";
import { getCoreRankProgress } from "@/lib/gamification/coreStages";

type CoreHeroProps = { totalXP: number };

const CoreScene = dynamic(() => import("@/components/dashboard/core3d/CoreScene"), {
  ssr: false,
  loading: () => (
    <Image
      src="/cores/iniciante.png"
      alt=""
      fill
      priority
      sizes="(max-width: 640px) 340px, 360px"
      className="object-contain"
    />
  ),
});

export default function CoreHero({ totalXP }: CoreHeroProps) {
  const [absorbing, setAbsorbing] = useState(false);
  const [pendingEnergy, setPendingEnergy] = useState(0);
  const [visualTestEnabled, setVisualTestEnabled] = useState(false);
  const reduceMotion = useReducedMotion();
  const progress = getCoreRankProgress(totalXP);
  const charge = Math.round(progress.progressPercentage);
  const intensity = charge / 100;

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
    const hostname = window.location.hostname;
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
    const isIsolatedPreview = hostname.includes("-git-codex-phase2-baseline-");
    const visualTestTimer = window.setTimeout(
      () =>
        setVisualTestEnabled(
          new URLSearchParams(window.location.search).get("coreVisualTest") === "1" &&
            (isLocal || isIsolatedPreview),
        ),
      0,
    );
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
      if (visualTestTimer) window.clearTimeout(visualTestTimer);
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
      <CoreScene
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
      {visualTestEnabled && (
        <button
          type="button"
          className="absolute bottom-2 right-2 z-30 rounded-full border border-orange-400/35 bg-black/80 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-orange-200 backdrop-blur"
          onClick={() => window.dispatchEvent(new Event("pace:core-energize"))}
        >
          Testar pulso
        </button>
      )}
    </motion.div>
  );
}
