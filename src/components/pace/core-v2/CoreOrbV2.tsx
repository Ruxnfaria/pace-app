"use client";

import type { CSSProperties } from "react";

import { CORE_APPEARANCE } from "@/components/pace/coreAppearance";
import type { CoreRankId } from "@/lib/gamification/coreStages";

type CoreOrbV2Props = {
  rank: CoreRankId;
  energy?: number;
  size?: "sm" | "md" | "lg";
  showParticles?: boolean;
};

const SIZE_CLASSES = {
  sm: "h-[180px] w-[180px]",
  md: "h-[260px] w-[260px]",
  lg: "h-[340px] w-[340px]",
};

const PARTICLE_POSITIONS = [
  { top: "8%", left: "48%", delay: "-0.4s" },
  { top: "18%", left: "18%", delay: "-1.2s" },
  { top: "22%", right: "12%", delay: "-2s" },
  { top: "48%", left: "5%", delay: "-2.8s" },
  { top: "52%", right: "4%", delay: "-1.6s" },
  { bottom: "18%", left: "16%", delay: "-3.4s" },
  { bottom: "12%", right: "22%", delay: "-2.3s" },
  { bottom: "2%", left: "48%", delay: "-0.9s" },
];

export default function CoreOrbV2({
  rank,
  energy = 0,
  size = "lg",
  showParticles = true,
}: CoreOrbV2Props) {
  const appearance = CORE_APPEARANCE[rank];
  const energyProgress = Math.min(Math.max(energy / 100, 0), 1);

const dynamicGlow =
  appearance.glow + energyProgress * 2;

const dynamicScale =
  appearance.crystalScale + energyProgress * 0.08;

const dynamicParticles =
  appearance.particles + Math.floor(energyProgress * 6);

const dynamicRotation =
  appearance.rotationSpeed + energyProgress * 0.3;

  const safeEnergy = Math.min(Math.max(energy, 0), 100);

  const styles = {
    "--core-primary": appearance.primary,
    "--core-secondary": appearance.secondary,
    "--core-glow":  dynamicGlow,
    "--core-scale": dynamicScale,
    "--core-speed": `${24 / dynamicRotation}s`,
  } as CSSProperties;

  return (
    <div
      className={`core-v2 relative isolate flex items-center justify-center ${SIZE_CLASSES[size]}`}
      style={styles}
      data-core-rank={rank}
    >
      {/* Aura externa */}
      <div
        className="core-v2__aura absolute inset-[8%] rounded-full"
        style={{
          background: `radial-gradient(
            circle,
            ${appearance.primary}38 0%,
            ${appearance.primary}18 42%,
            transparent 72%
          )`,
          filter: `blur(${28 + appearance.glow * 2}px)`,
          opacity: Math.min(0.25 + appearance.glow * 0.06, 0.9),
        }}
      />

      {/* Halo de energia */}
      <div
        className="core-v2__halo absolute inset-[13%] rounded-full border"
        style={{
          borderColor: `${appearance.primary}55`,
          boxShadow: `
            0 0 ${18 + appearance.glow * 5}px ${appearance.primary}55,
            inset 0 0 ${16 + appearance.glow * 3}px ${appearance.primary}25
          `,
        }}
      />

      {/* Anéis liberados pelo ranking */}
      {Array.from({ length: appearance.rings }).map((_, index) => {
        const inset = 15 + index * 5;

        return (
          <div
            key={index}
            className="core-v2__ring absolute rounded-full border"
            style={{
              inset: `${inset}%`,
              borderColor:
                index % 2 === 0
                  ? `${appearance.primary}80`
                  : `${appearance.secondary}60`,
              transform: `rotate(${index * 28}deg)`,
              animationDuration: `${24 + index * 6}s`,
              opacity: Math.max(0.35, 0.85 - index * 0.09),
            }}
          >
            <span
              className="absolute left-1/2 top-[-4px] h-2 w-2 -translate-x-1/2 rounded-full"
              style={{
                backgroundColor: appearance.secondary,
                boxShadow: `0 0 14px ${appearance.primary}`,
              }}
            />
          </div>
        );
      })}

      {/* Cristal principal */}
      <div
        className="core-v2__crystal relative z-10 flex h-[48%] w-[40%] items-center justify-center"
        style={{
          transform: `scale(${appearance.crystalScale})`,
          filter: `
            drop-shadow(0 0 ${12 + appearance.glow * 3}px ${appearance.primary})
            brightness(${1 + appearance.glow * 0.045})
          `,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            clipPath:
              "polygon(50% 0%, 84% 18%, 100% 55%, 76% 88%, 50% 100%, 23% 88%, 0% 55%, 16% 18%)",
            background: `
              linear-gradient(
                145deg,
                ${appearance.secondary} 0%,
                ${appearance.primary} 38%,
                ${appearance.primary}cc 68%,
                #16072f 100%
              )
            `,
            border: `1px solid ${appearance.secondary}aa`,
            boxShadow: `
              inset 10px 8px 24px rgba(255,255,255,0.28),
              inset -12px -18px 28px rgba(17,5,40,0.58)
            `,
          }}
        />

        {/* Facetas internas */}
        <div
          className="absolute inset-[8%]"
          style={{
            clipPath:
              "polygon(50% 0%, 100% 52%, 72% 100%, 50% 75%, 28% 100%, 0% 52%)",
            background: `
              linear-gradient(
                110deg,
                rgba(255,255,255,0.32),
                transparent 42%,
                ${appearance.primary}66
              )
            `,
          }}
        />

        {/* Raio do PACE */}
        <div
          className="relative z-20 h-[58%] w-[34%]"
          style={{
            clipPath:
              "polygon(58% 0%, 14% 48%, 46% 48%, 28% 100%, 88% 39%, 57% 39%)",
            background: appearance.secondary,
            filter: `
              drop-shadow(0 0 8px ${appearance.secondary})
              drop-shadow(0 0 20px ${appearance.primary})
            `,
          }}
        />
      </div>

      {/* Energia preenchida */}
      <svg
        className="pointer-events-none absolute inset-[7%] -rotate-90"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1.4"
        />

        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={appearance.primary}
          strokeWidth="1.7"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - safeEnergy}
          style={{
            filter: `drop-shadow(0 0 5px ${appearance.primary})`,
            transition: "stroke-dashoffset 700ms ease",
          }}
        />
      </svg>

      {/* Partículas */}
      {showParticles &&
        PARTICLE_POSITIONS.slice(
          0,
          Math.min(
            PARTICLE_POSITIONS.length,
            Math.max(2, Math.ceil(appearance.particles / 6))
          )
        ).map((position, index) => (
          <span
            key={index}
            className="core-v2__particle absolute z-20 h-1 w-1 rounded-full"
            style={{
              ...position,
              backgroundColor:
                index % 2 === 0
                  ? appearance.primary
                  : appearance.secondary,
              boxShadow: `
                0 0 8px ${appearance.primary},
                0 0 16px ${appearance.primary}
              `,
              animationDelay: position.delay,
            }}
          />
        ))}
    </div>
  );
}