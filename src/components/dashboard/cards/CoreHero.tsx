"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { consumeCoreEnergy } from "@/lib/gamification/coreEnergyPulse";
import { getCoreRankProgress, type CoreRankId } from "@/lib/gamification/coreStages";

type CoreHeroProps = { totalXP: number };

type CoreTheme = {
  asset: string;
  primary: string;
  secondary: string;
  glow: string;
};

const BEGINNER_THEME: CoreTheme = {
  asset: "/cores/iniciante.webp",
  primary: "#ff641f",
  secondary: "#ffb16e",
  glow: "rgba(255, 90, 24, 0.52)",
};

const CORE_THEMES: Record<CoreRankId, CoreTheme> = {
  beginner: BEGINNER_THEME,
  bronze_3: { asset: "/cores/bronze.webp", primary: "#d87537", secondary: "#ffc18a", glow: "rgba(190, 91, 35, 0.5)" },
  bronze_2: { asset: "/cores/bronze.webp", primary: "#d87537", secondary: "#ffc18a", glow: "rgba(190, 91, 35, 0.52)" },
  bronze_1: { asset: "/cores/bronze.webp", primary: "#d87537", secondary: "#ffc18a", glow: "rgba(190, 91, 35, 0.56)" },
  silver_3: { asset: "/cores/prata.webp", primary: "#dce8f2", secondary: "#8ec5ed", glow: "rgba(168, 211, 239, 0.46)" },
  silver_2: { asset: "/cores/prata.webp", primary: "#dce8f2", secondary: "#8ec5ed", glow: "rgba(168, 211, 239, 0.5)" },
  silver_1: { asset: "/cores/prata.webp", primary: "#dce8f2", secondary: "#8ec5ed", glow: "rgba(168, 211, 239, 0.55)" },
  gold_3: { asset: "/cores/ouro.webp", primary: "#ffbd35", secondary: "#fff0a1", glow: "rgba(255, 181, 42, 0.5)" },
  gold_2: { asset: "/cores/ouro.webp", primary: "#ffbd35", secondary: "#fff0a1", glow: "rgba(255, 181, 42, 0.56)" },
  gold_1: { asset: "/cores/ouro.webp", primary: "#ffbd35", secondary: "#fff0a1", glow: "rgba(255, 181, 42, 0.62)" },
  diamond_3: { asset: "/cores/diamante.webp", primary: "#35d9ff", secondary: "#e5fbff", glow: "rgba(48, 203, 255, 0.52)" },
  diamond_2: { asset: "/cores/diamante.webp", primary: "#35d9ff", secondary: "#e5fbff", glow: "rgba(48, 203, 255, 0.58)" },
  diamond_1: { asset: "/cores/diamante.webp", primary: "#35d9ff", secondary: "#e5fbff", glow: "rgba(48, 203, 255, 0.64)" },
  unstoppable: { asset: "/cores/elite.webp", primary: "#27e8c1", secondary: "#b8fff4", glow: "rgba(39, 232, 193, 0.58)" },
  unshakable: { asset: "/cores/elite.webp", primary: "#27e8c1", secondary: "#b8fff4", glow: "rgba(39, 232, 193, 0.68)" },
  legend: { asset: "/cores/lenda.webp", primary: "#ff314f", secondary: "#fff1dc", glow: "rgba(255, 42, 72, 0.72)" },
};

const PARTICLES = [
  { left: "13%", top: "28%", size: 3, duration: 6.2, delay: 0.2 },
  { left: "22%", top: "70%", size: 2, duration: 7.4, delay: 1.3 },
  { left: "38%", top: "12%", size: 2, duration: 6.8, delay: 2.5 },
  { left: "72%", top: "15%", size: 3, duration: 7, delay: 0.9 },
  { left: "83%", top: "42%", size: 2, duration: 5.9, delay: 1.9 },
  { left: "76%", top: "79%", size: 3, duration: 7.7, delay: 3.2 },
] as const;

function ProceduralFallback({ theme, intensity }: { theme: CoreTheme; intensity: number }) {
  return (
    <div
      className="relative h-[196px] w-[196px] overflow-hidden rounded-full border bg-[radial-gradient(circle_at_36%_27%,#4a4038_0%,#1c1611_24%,#080605_62%,#010101_100%)] shadow-[inset_-22px_-28px_42px_rgba(0,0,0,0.94)]"
      style={{ borderColor: `${theme.primary}aa`, boxShadow: `inset -22px -28px 42px rgba(0,0,0,.94), 0 0 40px ${theme.glow}` }}
      aria-hidden="true"
    >
      <span className="absolute left-[32%] top-[19%] h-[58%] w-[3px] origin-bottom rotate-[27deg] rounded-full" style={{ background: theme.primary, boxShadow: `0 0 12px ${theme.primary}`, opacity: intensity }} />
      <span className="absolute left-[46%] top-[48%] h-[35%] w-[2px] origin-top -rotate-[42deg] rounded-full" style={{ background: theme.secondary, boxShadow: `0 0 10px ${theme.primary}`, opacity: intensity * 0.78 }} />
      <span className="absolute inset-[12px] rounded-full border border-white/[0.035]" />
    </div>
  );
}

function CoreAssetLayer({ theme, intensity }: { theme: CoreTheme; intensity: number }) {
  const [assetAvailable, setAssetAvailable] = useState(true);

  if (!assetAvailable) return <ProceduralFallback theme={theme} intensity={intensity} />;

  return (
    <div className="relative h-[220px] w-[220px] sm:h-[228px] sm:w-[228px]">
      <Image
        src={theme.asset}
        alt=""
        fill
        sizes="228px"
        unoptimized
        className="object-contain drop-shadow-[0_0_24px_rgba(255,90,24,0.38)]"
        onError={() => setAssetAvailable(false)}
      />
      <div className="pointer-events-none absolute inset-[8%] rounded-full mix-blend-screen" style={{ boxShadow: `inset 0 0 26px ${theme.glow}, 0 0 28px ${theme.glow}`, opacity: intensity * 0.42 }} />
    </div>
  );
}

export default function CoreHero({ totalXP }: CoreHeroProps) {
  const [absorbing, setAbsorbing] = useState(false);
  const [pendingEnergy, setPendingEnergy] = useState(0);
  const reduceMotion = useReducedMotion();
  const progress = getCoreRankProgress(totalXP);
  const rank = progress.currentRank;
  const theme = CORE_THEMES[rank.id];
  const charge = Math.round(progress.progressPercentage);
  const chargeRatio = charge / 100;
  const intensity = totalXP <= 0 ? 0.38 : 0.58 + chargeRatio * 0.42;

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

  const orbitDuration = 23 - chargeRatio * 3;

  return (
    <motion.div
      className="group relative mx-auto flex h-[262px] w-full max-w-[360px] select-none items-center justify-center"
      aria-label={`${rank.coreName}, ${charge}% carregado`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduceMotion ? undefined : { scale: 1.025, rotateX: -1.5, rotateY: 2 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      style={{ perspective: 900 }}
    >
      <motion.div
        className="absolute h-56 w-56 rounded-full blur-[62px]"
        style={{ backgroundColor: theme.primary, opacity: intensity * 0.62 }}
        animate={reduceMotion ? undefined : { scale: [0.96, 1.08, 0.96], opacity: [intensity * 0.42, intensity * 0.7, intensity * 0.42] }}
        transition={{ duration: 4.3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Back orbit: rendered below the opaque core asset. */}
      <motion.div
        className="absolute z-10 h-[210px] w-[334px] rounded-[50%] border"
        style={{ borderColor: `${theme.primary}66`, boxShadow: `0 0 16px ${theme.glow}` }}
        animate={reduceMotion ? { rotate: -13 } : { rotate: [-13, 347] }}
        transition={{ duration: orbitDuration, repeat: Infinity, ease: "linear" }}
      >
        <span className="absolute left-[12%] top-[8%] h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.secondary, boxShadow: `0 0 12px ${theme.primary}` }} />
      </motion.div>

      <motion.div
        className="absolute z-[11] h-[228px] w-[354px] rounded-[50%] border"
        style={{ borderColor: `${theme.secondary}35` }}
        animate={reduceMotion ? { rotate: 25 } : { rotate: [25, -335] }}
        transition={{ duration: orbitDuration + 9, repeat: Infinity, ease: "linear" }}
      />

      <motion.div
        className="relative z-20 flex items-center justify-center"
        animate={reduceMotion ? undefined : { scale: absorbing ? [1, 1.07, 1.01] : [1, 1.015, 1] }}
        transition={absorbing ? { duration: 0.9 } : { duration: 4.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <CoreAssetLayer key={theme.asset} theme={theme} intensity={intensity} />
      </motion.div>

      {/* Front orbit: only the near half sits above the core, creating depth. */}
      <motion.div
        className="pointer-events-none absolute z-30 h-[210px] w-[334px] rounded-[50%] border [clip-path:inset(50%_-10%_-10%_-10%)]"
        style={{ borderColor: `${theme.primary}cc`, filter: `drop-shadow(0 0 5px ${theme.primary})` }}
        animate={reduceMotion ? { rotate: -13 } : { rotate: [-13, 347] }}
        transition={{ duration: orbitDuration, repeat: Infinity, ease: "linear" }}
      />

      <div className="pointer-events-none absolute inset-0 z-40">
        {PARTICLES.map((particle) => (
          <motion.span
            key={`${particle.left}-${particle.top}`}
            className="absolute rounded-full"
            style={{ left: particle.left, top: particle.top, width: particle.size, height: particle.size, backgroundColor: theme.secondary, boxShadow: `0 0 8px ${theme.primary}` }}
            animate={reduceMotion ? { opacity: intensity * 0.35 } : { y: [0, -10, 1, 0], x: [0, 3, -2, 0], opacity: [0.08, intensity * 0.72, 0.14, 0.08], scale: [0.7, 1.2, 0.8, 0.7] }}
            transition={{ duration: particle.duration, delay: particle.delay, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </div>

      {pendingEnergy > 0 && (
        <motion.span className="absolute top-0 z-50 rounded-full border bg-black/80 px-3 py-1 text-[10px] font-bold" style={{ borderColor: `${theme.primary}66`, color: theme.secondary }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          +{pendingEnergy} Energia
        </motion.span>
      )}
    </motion.div>
  );
}
