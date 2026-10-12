"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { consumeCoreEnergy } from "@/lib/gamification/coreEnergyPulse";
import { getCoreRankProgress } from "@/lib/gamification/coreStages";

type CoreHeroProps = { totalXP: number };

const PARTICLES = [
  { left: "12%", top: "31%", size: 3, duration: 5.8, delay: 0.2 },
  { left: "21%", top: "67%", size: 2, duration: 7.1, delay: 1.1 },
  { left: "34%", top: "15%", size: 2, duration: 6.4, delay: 2.4 },
  { left: "69%", top: "13%", size: 3, duration: 6.8, delay: 0.8 },
  { left: "78%", top: "37%", size: 2, duration: 5.6, delay: 1.8 },
  { left: "84%", top: "70%", size: 3, duration: 7.4, delay: 3.1 },
  { left: "62%", top: "84%", size: 2, duration: 6.2, delay: 2.7 },
  { left: "42%", top: "88%", size: 2, duration: 5.9, delay: 1.4 },
] as const;

export default function CoreHero({ totalXP }: CoreHeroProps) {
  const [absorbing, setAbsorbing] = useState(false);
  const [pendingEnergy, setPendingEnergy] = useState(0);
  const reduceMotion = useReducedMotion();
  const progress = getCoreRankProgress(totalXP);
  const rank = progress.currentRank;
  const charge = Math.round(progress.progressPercentage);
  const chargeRatio = charge / 100;
  const isDormant = totalXP <= 0;
  const glowOpacity = isDormant
    ? 0.22
    : Math.min(0.34 + rank.glowIntensity * 0.028 + chargeRatio * 0.2, 0.78);
  const crackOpacity = isDormant ? 0.34 : Math.min(0.52 + chargeRatio * 0.4, 0.96);

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
      className="group relative mx-auto flex h-[262px] w-full max-w-[360px] select-none items-center justify-center"
      aria-label={`${rank.coreName}, ${charge}% carregado`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.9, filter: "blur(8px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduceMotion ? undefined : { scale: 1.025 }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
    >
      <motion.div
        className="absolute h-56 w-56 rounded-full bg-[#ff5a00] blur-[62px]"
        style={{ opacity: glowOpacity }}
        animate={reduceMotion ? undefined : {
          scale: [0.94, 1.08 + chargeRatio * 0.03, 0.94],
          opacity: [glowOpacity * 0.72, glowOpacity, glowOpacity * 0.72],
        }}
        transition={{ duration: isDormant ? 5.8 : 4.4, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute h-[212px] w-[326px] rounded-[50%] border border-[#ff7626]/60 shadow-[0_0_18px_rgba(255,106,0,0.2)]"
        animate={reduceMotion ? { rotate: -14 } : { rotate: [-14, 346] }}
        transition={{ duration: 20 - chargeRatio * 3, repeat: Infinity, ease: "linear" }}
      >
        <span className="absolute left-[13%] top-[8%] h-1.5 w-1.5 rounded-full bg-[#ffb070] shadow-[0_0_12px_#ff6a00]" />
      </motion.div>

      <motion.div
        className="absolute h-[226px] w-[350px] rounded-[50%] border border-[#ff7626]/30 shadow-[0_0_15px_rgba(255,106,0,0.14)]"
        animate={reduceMotion ? { rotate: 24 } : { rotate: [24, -336] }}
        transition={{ duration: 28 - chargeRatio * 4, repeat: Infinity, ease: "linear" }}
      >
        <span className="absolute bottom-[10%] right-[18%] h-1 w-1 rounded-full bg-[#ff8a3d] shadow-[0_0_10px_#ff6a00]" />
      </motion.div>

      {rank.ringCount > 2 && (
        <motion.div
          className="absolute h-[184px] w-[338px] rounded-[50%] border border-[#ff9a55]/20"
          animate={reduceMotion ? { rotate: 62 } : { rotate: [62, 422] }}
          transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
        />
      )}

      <div className="pointer-events-none absolute inset-0">
        {PARTICLES.map((particle) => (
          <motion.span
            key={`${particle.left}-${particle.top}`}
            className="absolute rounded-full bg-[#ff8a3d] shadow-[0_0_8px_#ff5a00]"
            style={{ left: particle.left, top: particle.top, width: particle.size, height: particle.size }}
            animate={reduceMotion ? { opacity: 0.36 } : {
              y: [0, -10, 2, 0],
              x: [0, 3, -2, 0],
              opacity: [0.12, 0.62 + chargeRatio * 0.2, 0.18, 0.12],
              scale: [0.7, 1.25, 0.8, 0.7],
            }}
            transition={{ duration: particle.duration, delay: particle.delay, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </div>

      {pendingEnergy > 0 && (
        <motion.span
          className="absolute top-0 z-30 rounded-full border border-[#ff7a00]/30 bg-black/80 px-3 py-1 text-[10px] font-bold text-[#ff9b4a]"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          +{pendingEnergy} Energia
        </motion.span>
      )}

      <motion.div
        data-pace-core-target
        className="relative z-20 h-[196px] w-[196px] overflow-hidden rounded-full border border-[#ff7a22]/70 bg-[radial-gradient(circle_at_36%_27%,#4a4038_0%,#1c1611_24%,#080605_62%,#010101_100%)] shadow-[inset_-22px_-28px_42px_rgba(0,0,0,0.94),inset_12px_9px_28px_rgba(255,122,34,0.15),0_0_32px_rgba(255,90,0,0.62),0_0_78px_rgba(255,90,0,0.32)] transition-shadow duration-500 group-hover:shadow-[inset_-22px_-28px_42px_rgba(0,0,0,0.94),inset_12px_9px_30px_rgba(255,122,34,0.22),0_0_42px_rgba(255,90,0,0.76),0_0_90px_rgba(255,90,0,0.4)]"
        animate={reduceMotion ? undefined : {
          scale: absorbing ? [1, 1.08, 1.02] : [1, 1.012 + chargeRatio * 0.01, 1],
          rotate: [0, 0.6, 0],
        }}
        transition={absorbing
          ? { duration: 0.9, ease: "easeOut" }
          : { duration: isDormant ? 6.2 : 4.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.div
          className="absolute -left-10 top-5 h-28 w-40 rounded-full bg-[#ff6a00]/10 blur-2xl"
          animate={reduceMotion ? undefined : { x: [-6, 22, -6], y: [2, -9, 2], opacity: [0.24, 0.5, 0.24] }}
          transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
        />

        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 196 196" aria-hidden="true">
          <defs>
            <filter id="core-crack-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="2.6" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <motion.path d="M76 30 L84 59 L73 79 L91 104 L82 142" fill="none" stroke="#ff6a00" strokeWidth="2.8" strokeLinecap="round" filter="url(#core-crack-glow)" animate={reduceMotion ? { opacity: crackOpacity } : { opacity: [crackOpacity * 0.55, crackOpacity, crackOpacity * 0.68, crackOpacity * 0.55] }} transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }} />
          <motion.path d="M91 104 L116 119 L129 151" fill="none" stroke="#ff7d2c" strokeWidth="2.4" strokeLinecap="round" filter="url(#core-crack-glow)" animate={reduceMotion ? { opacity: crackOpacity * 0.86 } : { opacity: [crackOpacity * 0.38, crackOpacity * 0.82, crackOpacity * 0.5, crackOpacity * 0.38] }} transition={{ duration: 4.1, delay: 0.7, repeat: Infinity, ease: "easeInOut" }} />
          <motion.path d="M126 45 L115 66 L124 87 L111 101" fill="none" stroke="#ffa162" strokeWidth="1.9" strokeLinecap="round" filter="url(#core-crack-glow)" animate={reduceMotion ? { opacity: crackOpacity * 0.7 } : { opacity: [crackOpacity * 0.3, crackOpacity * 0.7, crackOpacity * 0.42, crackOpacity * 0.3] }} transition={{ duration: 3.8, delay: 1.1, repeat: Infinity, ease: "easeInOut" }} />
          <motion.circle cx="93" cy="104" r="4" fill="#ff8a3d" filter="url(#core-crack-glow)" animate={reduceMotion ? { opacity: crackOpacity } : { opacity: [0.35, 0.95, 0.35], r: [3, 5, 3] }} transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }} />
        </svg>

        <div className="absolute inset-[12px] rounded-full border border-white/[0.035]" />
        <div className="absolute left-[24%] top-[16%] h-10 w-16 -rotate-[18deg] rounded-full bg-white/[0.035] blur-md" />
      </motion.div>
    </motion.div>
  );
}
