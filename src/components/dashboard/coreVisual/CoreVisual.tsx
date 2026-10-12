"use client";

import Image from "next/image";
import {
  motion,
  useMotionValue,
  useSpring,
  type MotionValue,
} from "framer-motion";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { CoreRankId } from "@/lib/gamification/coreStages";

type CoreVisualProps = {
  rankId: CoreRankId;
  intensity: number;
  absorbing: boolean;
  reducedMotion: boolean;
};

type CoreVisualTheme = {
  asset: string;
  primary: string;
  secondary: string;
  rankIntensity: number;
};

const BEGINNER_THEME: CoreVisualTheme = {
  asset: "/cores/iniciante.png",
  primary: "#ff681f",
  secondary: "#ffd4a7",
  rankIntensity: 0.84,
};

const BRONZE_THEME: CoreVisualTheme = {
  asset: "/cores/bronze.png",
  primary: "#e47b31",
  secondary: "#ffd0a3",
  rankIntensity: 0.9,
};

const SILVER_THEME: CoreVisualTheme = {
  asset: "/cores/prata.png",
  primary: "#b9e5ff",
  secondary: "#f5fbff",
  rankIntensity: 0.94,
};

const GOLD_THEME: CoreVisualTheme = {
  asset: "/cores/ouro.png",
  primary: "#ffc43d",
  secondary: "#fff1a8",
  rankIntensity: 0.98,
};

const DIAMOND_THEME: CoreVisualTheme = {
  asset: "/cores/diamante.png",
  primary: "#35dcff",
  secondary: "#e8fdff",
  rankIntensity: 1.04,
};

const ELITE_THEME: CoreVisualTheme = {
  asset: "/cores/elite.png",
  primary: "#23e6bc",
  secondary: "#d8fff6",
  rankIntensity: 1.08,
};

const LEGEND_THEME: CoreVisualTheme = {
  asset: "/cores/lenda.png",
  primary: "#ff304f",
  secondary: "#fff0dd",
  rankIntensity: 1.14,
};

const CORE_VISUAL_THEMES: Record<CoreRankId, CoreVisualTheme> = {
  beginner: BEGINNER_THEME,
  bronze_3: BRONZE_THEME,
  bronze_2: { ...BRONZE_THEME, rankIntensity: 0.94 },
  bronze_1: { ...BRONZE_THEME, rankIntensity: 0.98 },
  silver_3: SILVER_THEME,
  silver_2: { ...SILVER_THEME, rankIntensity: 0.98 },
  silver_1: { ...SILVER_THEME, rankIntensity: 1.02 },
  gold_3: GOLD_THEME,
  gold_2: { ...GOLD_THEME, rankIntensity: 1.02 },
  gold_1: { ...GOLD_THEME, rankIntensity: 1.06 },
  diamond_3: DIAMOND_THEME,
  diamond_2: { ...DIAMOND_THEME, rankIntensity: 1.08 },
  diamond_1: { ...DIAMOND_THEME, rankIntensity: 1.12 },
  unstoppable: ELITE_THEME,
  unshakable: { ...ELITE_THEME, rankIntensity: 1.16 },
  legend: LEGEND_THEME,
};

const PARTICLES = [
  { left: 12, top: 26, size: 2, duration: 6.4, delay: 0.1 },
  { left: 19, top: 68, size: 3, duration: 7.2, delay: 1.1 },
  { left: 31, top: 14, size: 2, duration: 6.8, delay: 2.3 },
  { left: 43, top: 80, size: 2, duration: 8.1, delay: 0.7 },
  { left: 58, top: 10, size: 3, duration: 7.6, delay: 1.8 },
  { left: 72, top: 19, size: 2, duration: 6.1, delay: 0.4 },
  { left: 83, top: 39, size: 3, duration: 7.9, delay: 2.8 },
  { left: 77, top: 73, size: 2, duration: 6.9, delay: 1.4 },
  { left: 63, top: 87, size: 2, duration: 8.4, delay: 3.1 },
  { left: 27, top: 88, size: 2, duration: 7.3, delay: 2.1 },
  { left: 8, top: 49, size: 2, duration: 8.2, delay: 3.5 },
  { left: 91, top: 61, size: 2, duration: 6.6, delay: 0.9 },
] as const;

function resetParallax(values: MotionValue<number>[]) {
  values.forEach((value) => value.set(0));
}

export default function CoreVisual({
  rankId,
  intensity,
  absorbing,
  reducedMotion,
}: CoreVisualProps) {
  const theme = CORE_VISUAL_THEMES[rankId];
  const x = useSpring(useMotionValue(0), { stiffness: 110, damping: 18, mass: 0.7 });
  const y = useSpring(useMotionValue(0), { stiffness: 110, damping: 18, mass: 0.7 });
  const rotateX = useSpring(useMotionValue(0), { stiffness: 95, damping: 20 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 95, damping: 20 });
  const visualIntensity = Math.min(intensity * theme.rankIntensity, 1.24);
  const particleCount = Math.min(12, Math.max(4, Math.round(4 + visualIntensity * 6)));
  const visibleParticles = PARTICLES.slice(0, particleCount);

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (reducedMotion || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
    x.set(horizontal * 7);
    y.set(vertical * 5);
    rotateX.set(vertical * -2.2);
    rotateY.set(horizontal * 2.8);
  }

  function handlePointerLeave() {
    resetParallax([x, y, rotateX, rotateY]);
  }

  return (
    <div
      className="relative h-full w-full select-none overflow-hidden"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      aria-hidden="true"
    >
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[58%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[48px]"
        style={{ backgroundColor: theme.primary }}
        animate={{
          opacity: absorbing
            ? [visualIntensity * 0.28, visualIntensity * 0.68, visualIntensity * 0.3]
            : reducedMotion
              ? visualIntensity * 0.3
              : [visualIntensity * 0.24, visualIntensity * 0.38, visualIntensity * 0.24],
          scale: absorbing ? [0.95, 1.18, 1] : reducedMotion ? 1 : [0.98, 1.06, 0.98],
        }}
        transition={{
          duration: absorbing ? 0.85 : 4.6,
          repeat: absorbing || reducedMotion ? 0 : Infinity,
          ease: "easeInOut",
        }}
      />

      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-[56%] w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border"
        style={{
          borderColor: `${theme.primary}70`,
          boxShadow: `0 0 14px ${theme.primary}45`,
        }}
        animate={reducedMotion ? { rotate: -12 } : { rotate: [-12, 348] }}
        transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
      />

      <div className="pointer-events-none absolute inset-0 z-10">
        {visibleParticles.slice(0, Math.ceil(visibleParticles.length / 2)).map((particle) => (
          <motion.span
            key={`back-${particle.left}-${particle.top}`}
            className="absolute rounded-full"
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              width: particle.size,
              height: particle.size,
              backgroundColor: theme.secondary,
              boxShadow: `0 0 8px ${theme.primary}`,
            }}
            animate={
              reducedMotion
                ? { opacity: visualIntensity * 0.24 }
                : {
                    x: [0, 3, -2, 0],
                    y: [0, -9, 2, 0],
                    opacity: [0.08, visualIntensity * 0.55, 0.12, 0.08],
                  }
            }
            transition={{
              duration: particle.duration,
              delay: particle.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <motion.div
        className="absolute inset-[1%] z-20"
        style={{ x, y, rotateX, rotateY, transformPerspective: 900 }}
        animate={
          absorbing
            ? { scale: [1, 1.03, 1], translateY: [0, -2, 0] }
            : reducedMotion
              ? { scale: 1, translateY: 0 }
              : { scale: [1, 1.015, 1], translateY: [0, -1.5, 0] }
        }
        transition={{
          duration: absorbing ? 0.85 : 4.8,
          repeat: absorbing || reducedMotion ? 0 : Infinity,
          ease: "easeInOut",
        }}
        whileTap={reducedMotion ? undefined : { scale: 0.985 }}
      >
        <Image
          key={theme.asset}
          src={theme.asset}
          alt=""
          fill
          priority
          sizes="(max-width: 640px) 340px, 360px"
          className="pointer-events-none object-contain"
          style={{
            filter: `drop-shadow(0 0 ${12 + visualIntensity * 12}px ${theme.primary}75)`,
          }}
          draggable={false}
        />
      </motion.div>

      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 z-30 h-[56%] w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border [clip-path:inset(50%_-8%_-8%_-8%)]"
        style={{
          borderColor: `${theme.secondary}8c`,
          filter: `drop-shadow(0 0 4px ${theme.primary})`,
        }}
        animate={reducedMotion ? { rotate: 16 } : { rotate: [16, -344] }}
        transition={{ duration: 34, repeat: Infinity, ease: "linear" }}
      />

      <div className="pointer-events-none absolute inset-0 z-40">
        {visibleParticles.slice(Math.ceil(visibleParticles.length / 2)).map((particle) => (
          <motion.span
            key={`front-${particle.left}-${particle.top}`}
            className="absolute rounded-full"
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              width: particle.size,
              height: particle.size,
              backgroundColor: theme.secondary,
              boxShadow: `0 0 9px ${theme.primary}`,
            }}
            animate={
              reducedMotion
                ? { opacity: visualIntensity * 0.3 }
                : {
                    x: [0, -3, 2, 0],
                    y: [0, -12, -2, 0],
                    opacity: absorbing
                      ? [0.14, 1, 0.18]
                      : [0.1, visualIntensity * 0.7, 0.14, 0.1],
                    scale: absorbing ? [0.8, 1.8, 0.9] : [0.75, 1.2, 0.8, 0.75],
                  }
            }
            transition={{
              duration: absorbing ? 0.85 : particle.duration,
              delay: absorbing ? 0 : particle.delay,
              repeat: absorbing ? 0 : Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <motion.div
        className="pointer-events-none absolute inset-[17%] z-30 rounded-full mix-blend-screen"
        style={{ boxShadow: `inset 0 0 24px ${theme.primary}75` }}
        animate={{ opacity: absorbing ? [0.2, 0.72, 0.28] : visualIntensity * 0.28 }}
        transition={{ duration: absorbing ? 0.85 : 0.4 }}
      />
    </div>
  );
}
