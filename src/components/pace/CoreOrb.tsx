"use client";

import { useId } from "react";
import { CORE_APPEARANCE } from "./coreAppearance";
import { CoreRankId } from "@/lib/gamification/coreStages";

type CoreState =
  | "dormant"
  | "stable"
  | "energized"
  | "vibrant"
  | "transcendent";

type CoreOrbProps = {
  energy?: number;
  level?: number;
  rank?: CoreRankId;
  state?: CoreState;
  size?: "sm" | "md" | "lg";
  showParticles?: boolean;
  showEnergyLabel?: boolean;
  className?: string;
};

const sizeClasses = {
  sm: "h-36 w-36",
  md: "h-56 w-56",
  lg: "h-72 w-72 sm:h-80 sm:w-80",
};

const stateConfig: Record<
  CoreState,
  {
    glowOpacity: number;
    particleOpacity: number;
    pulseDuration: string;
    orbitDuration: string;
    lightningOpacity: number;
    particleSpeed: string;
  }
> = {
  dormant: {
    glowOpacity: 0.16,
    particleOpacity: 0.1,
    pulseDuration: "6s",
    orbitDuration: "34s",
    lightningOpacity: 0.45,
    particleSpeed: "6s",
  },
  stable: {
    glowOpacity: 0.32,
    particleOpacity: 0.28,
    pulseDuration: "5s",
    orbitDuration: "28s",
    lightningOpacity: 0.65,
    particleSpeed: "5.2s",
  },
  energized: {
    glowOpacity: 0.55,
    particleOpacity: 0.5,
    pulseDuration: "4s",
    orbitDuration: "22s",
    lightningOpacity: 0.82,
    particleSpeed: "4.6s",
  },
  vibrant: {
    glowOpacity: 0.78,
    particleOpacity: 0.78,
    pulseDuration: "3.2s",
    orbitDuration: "16s",
    lightningOpacity: 1,
    particleSpeed: "3.8s",
  },
  transcendent: {
    glowOpacity: 1,
    particleOpacity: 1,
    pulseDuration: "2.5s",
    orbitDuration: "10s",
    lightningOpacity: 1,
    particleSpeed: "3s",
  },
};

function clampEnergy(value: number) {
  return Math.min(100, Math.max(0, value));
}

export default function CoreOrb({
  
  energy = 82,
  level = 24,
  rank = "beginner",
  state = "energized",
  size = "lg",
  showParticles = true,
  showEnergyLabel = true,
  className = "",
  
}: CoreOrbProps) {
  const safeEnergy = clampEnergy(energy);
  const appearance = CORE_APPEARANCE[rank];

  const gradientId = useId().replace(/:/g, "");
  const crystalGradientId = `crystal-${gradientId}`;
  const lightningGradientId = `lightning-${gradientId}`;
  const glowFilterId = `glow-${gradientId}`;

  const circumference = 2 * Math.PI * 132;
  const progressOffset =
    circumference - (safeEnergy / 100) * circumference;

  const visualState = stateConfig[state];
  const hasSecondOrbit =
  state === "vibrant" ||
  state === "transcendent";

const hasFragments =
  state === "transcendent";

  return (
    <div
      className={`relative flex flex-col items-center justify-center ${className}`}
      aria-label={`Núcleo no nível ${level}, com ${safeEnergy}% de Energia`}
    >
      <div
        className={`core-orb relative flex items-center justify-center ${sizeClasses[size]}`}
        style={
            {
              "--core-glow-opacity": visualState.glowOpacity,
              "--core-particle-opacity": visualState.particleOpacity,
              "--core-pulse-duration": visualState.pulseDuration,
              "--core-orbit-duration": visualState.orbitDuration,
              "--core-lightning-opacity": visualState.lightningOpacity,
              "--core-particle-speed": visualState.particleSpeed,
            } as React.CSSProperties
          }
      >
        {/* Brilho ambiente */}
        <div className="core-orb__ambient absolute inset-[14%] rounded-full bg-violet-600/30 blur-3xl" />

        {/* Halo secundário */}
        <div className="core-orb__halo absolute inset-[23%] rounded-full border border-violet-300/10 bg-violet-500/5 blur-md" />

        {/* Partículas */}
        {showParticles && (
          <div
            className="core-orb__particles pointer-events-none absolute inset-0"
            aria-hidden="true"
          >
            <span className="core-particle core-particle--1" />
            <span className="core-particle core-particle--2" />
            <span className="core-particle core-particle--3" />
            <span className="core-particle core-particle--4" />
            <span className="core-particle core-particle--5" />
            <span className="core-particle core-particle--6" />
          </div>
        )}

        <svg
          viewBox="0 0 320 320"
          className="relative z-10 h-full w-full overflow-visible"
          role="img"
          aria-hidden="true"
        >
          <defs>
            <radialGradient
              id={crystalGradientId}
              cx="38%"
              cy="30%"
              r="78%"
            >
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
              <stop offset="24%" stopColor="#ddd6fe" stopOpacity="0.96" />
              <stop offset="58%" stopColor="#8b5cf6" stopOpacity="0.92" />
              <stop offset="100%" stopColor="#3b0764" stopOpacity="0.96" />
            </radialGradient>

            <linearGradient
              id={lightningGradientId}
              x1="35%"
              y1="10%"
              x2="65%"
              y2="90%"
            >
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="45%" stopColor="#f5f3ff" />
              <stop offset="100%" stopColor="#c4b5fd" />
            </linearGradient>

            <filter
              id={glowFilterId}
              x="-100%"
              y="-100%"
              width="300%"
              height="300%"
            >
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Órbita externa */}
          <g className="core-orb__orbit">
            <ellipse
              cx="160"
              cy="160"
              rx="143"
              ry="116"
              fill="none"
              stroke="rgba(196, 181, 253, 0.08)"
              strokeWidth="1.5"
              transform="rotate(-18 160 160)"
            />

            <ellipse
              cx="160"
              cy="160"
              rx="141"
              ry="112"
              fill="none"
              stroke="rgba(167, 139, 250, 0.22)"
              strokeWidth="1.8"
              strokeDasharray="8 20"
              transform="rotate(-18 160 160)"
            />
{hasSecondOrbit && (
  <ellipse
    cx="160"
    cy="160"
    rx="118"
    ry="145"
    fill="none"
    stroke="rgba(168, 85, 247, 0.18)"
    strokeWidth="1.6"
    strokeDasharray="6 14"
    transform="rotate(58 160 160)"
  />
)}
            <circle
              cx="287"
              cy="112"
              r="3.5"
              fill="#ddd6fe"
              filter={`url(#${glowFilterId})`}
            />
          </g>

          {/* Trilha da Energia */}
          <circle
            cx="160"
            cy="160"
            r="132"
            fill="none"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="3"
          />

          {/* Progresso da Energia */}
          <circle
            cx="160"
            cy="160"
            r="132"
            fill="none"
            stroke="rgba(196, 181, 253, 0.82)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={progressOffset}
            transform="rotate(-90 160 160)"
            className="core-orb__energy-ring"
            filter={`url(#${glowFilterId})`}
          />

          {/* Brilho atrás do cristal */}
          <circle
            cx="160"
            cy="160"
            r="82"
            fill="rgba(124, 58, 237, 0.18)"
            filter={`url(#${glowFilterId})`}
            className="core-orb__inner-glow"
          />

          {/* Cristal */}
          <g className="core-orb__crystal">
            <path
              d="
                M160 54
                L224 91
                L251 157
                L218 225
                L160 266
                L101 225
                L69 157
                L96 91
                Z
              "
              fill={`url(#${crystalGradientId})`}
              stroke="rgba(237, 233, 254, 0.7)"
              strokeWidth="2"
              filter={`url(#${glowFilterId})`}
            />

            {/* Facetas */}
            <path
              d="M160 54 L160 266 L101 225 L69 157 L96 91 Z"
              fill="rgba(255, 255, 255, 0.08)"
            />

            <path
              d="M160 54 L224 91 L251 157 L160 139 Z"
              fill="rgba(255, 255, 255, 0.14)"
            />

            <path
              d="M160 139 L251 157 L218 225 L160 266 Z"
              fill="rgba(55, 17, 96, 0.18)"
            />

            <path
              d="M96 91 L160 54 L160 139 L69 157 Z"
              fill="rgba(237, 233, 254, 0.13)"
            />

            <path
              d="M69 157 L160 139 L160 266 L101 225 Z"
              fill="rgba(76, 29, 149, 0.15)"
            />

            {/* Linhas internas */}
            <path
              d="M96 91 L160 139 L224 91"
              fill="none"
              stroke="rgba(255, 255, 255, 0.25)"
              strokeWidth="1"
            />

            <path
              d="M69 157 L160 139 L251 157"
              fill="none"
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth="1"
            />

            <path
              d="M101 225 L160 139 L218 225"
              fill="none"
              stroke="rgba(255, 255, 255, 0.17)"
              strokeWidth="1"
            />
          </g>
{hasFragments && (
  <g className="core-orb__fragments">
    <polygon
      points="96,82 104,90 96,98 88,90"
      fill="rgba(221,214,254,.9)"
    />

    <polygon
      points="232,108 240,116 232,124 224,116"
      fill="rgba(196,181,253,.85)"
    />

    <polygon
      points="224,228 232,236 224,244 216,236"
      fill="rgba(221,214,254,.85)"
    />

    <polygon
      points="88,214 96,222 88,230 80,222"
      fill="rgba(196,181,253,.85)"
    />
  </g>
)}
          {/* Raio central */}
          <g
            className="core-orb__lightning"
            filter={`url(#${glowFilterId})`}
          >
            <path
              d="
                M177 91
                L128 162
                L157 162
                L139 229
                L198 145
                L168 145
                Z
              "
              fill={`url(#${lightningGradientId})`}
              stroke="rgba(255, 255, 255, 0.9)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </g>

          {/* Reflexo superior */}
          <path
            d="M111 94 C132 69 174 60 205 82"
            fill="none"
            stroke="rgba(255, 255, 255, 0.52)"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
      </div>

      {showEnergyLabel && (
        <div className="-mt-3 flex flex-col items-center text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-violet-300/65">
            Energia
          </span>

          <strong className="mt-1 text-3xl font-black tracking-[-0.04em] text-white">
            {safeEnergy}%
          </strong>
        </div>
      )}
    </div>
  );
}