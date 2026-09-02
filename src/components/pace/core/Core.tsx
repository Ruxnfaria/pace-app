"use client";

import Image from "next/image";

import { CORE_APPEARANCE } from "./config/CoreAppearance";

import type { CoreRankId } from "@/lib/gamification/coreStages";

import Aura from "./aura/Aura";
import Halo from "./halo/Halo";
import Crystal from "./crystal/Crystal";
import Lightning from "./lightning/Lightning";
import BronzeFrame from "./shell/BronzeFrame";

type CoreProps = {
  rank: CoreRankId;
  energy?: number;
};

export default function Core({
  rank,
  energy = 0,
}: CoreProps) {
  const appearance = CORE_APPEARANCE[rank];

  const energyPrimary = "#8b5cf6";
  const energySecondary = "#f5d0fe";

  const progress = Math.max(
    0,
    Math.min(energy / 100, 1)
  );

  const glow =
    appearance.glow + progress * 2;

  const crystalScale =
    appearance.crystalScale +
    progress * 0.08;

  const auraIntensity =
    appearance.aura +
    progress * 0.5;

  const shellTier =
    rank === "bronze_1"
      ? 1
      : rank === "bronze_2"
        ? 2
        : 3;

  /*
   * NOVO SISTEMA VISUAL
   *
   * Bronze III será o primeiro Núcleo
   * usando uma arte 3D pronta.
   */
  if (rank === "bronze_3") {
    return (
      <div
        className="
          relative
          flex
          h-[310px]
          w-[310px]
          items-center
          justify-center
        "
      >
        {/* Aura viva atrás do emblema */}
        <div
          className="
            absolute
            left-1/2
            top-1/2
            h-[72%]
            w-[72%]
            -translate-x-1/2
            -translate-y-1/2
            rounded-full
            bg-violet-600/25
            blur-[45px]
          "
        />

        {/* Emblema 3D */}
        <div
          className="
            relative
            z-10
            h-full
            w-full
          "
        >
          <Image
            src="/cores/bronze-3.png"
            alt="Núcleo Bronze III"
            fill
            priority
            sizes="310px"
            className="
              object-contain
              drop-shadow-[0_0_30px_rgba(139,92,246,0.38)]
            "
          />
        </div>
      </div>
    );
  }

  /*
   * SISTEMA ANTIGO
   *
   * Continua funcionando enquanto
   * criamos os outros ranks.
   */
  return (
    <div className="relative h-[340px] w-[340px]">
      <Aura
        primary={energyPrimary}
        glow={glow}
        intensity={auraIntensity}
      />

      <Halo
        primary={energyPrimary}
        secondary={energySecondary}
        glow={glow}
        intensity={glow}
      />

      <BronzeFrame
        tier={shellTier}
        primary={appearance.primary}
        secondary={appearance.secondary}
        glow={glow}
        progress={energy}
      />

      <div className="absolute inset-0 z-20 flex items-center justify-center">
        <Crystal
          primary={energyPrimary}
          secondary={energySecondary}
          scale={crystalScale}
          glow={glow}
        />

        <div className="absolute inset-0 flex items-center justify-center">
          <Lightning
            primary={energyPrimary}
            secondary={energySecondary}
            glow={glow}
            scale={appearance.lightningScale}
          />
        </div>
      </div>
    </div>
  );
}