"use client";

import { CORE_APPEARANCE } from "./config/CoreAppearance";
import type { CoreRankId } from "@/lib/gamification/coreStages";

import Aura from "./aura/Aura";
import Halo from "./halo/Halo";
import Rings from "./rings/Rings";
import Crystal from "./crystal/Crystal";
import Lightning from "./lightning/Lightning";
import BronzeFrame from "./shell/BronzeFrame";
{/*import Fragments from "./fragments/Fragments";*/}
{/*import Particles from "./particles/Particles";*/}

type CoreProps = {
  rank: CoreRankId;
  energy?: number;
};

export default function Core({
  rank,
  energy = 0,
}: CoreProps) {
  const appearance = CORE_APPEARANCE[rank];

  const progress = Math.max(0, Math.min(energy / 100, 1));

  const glow =
    appearance.glow + progress * 2;

  const crystalScale =
    appearance.crystalScale + progress * 0.08;

 

    const auraIntensity =
  appearance.aura + progress * 0.5;

  const shellTier =
  rank === "bronze_1"
    ? 1
    : rank === "bronze_2"
      ? 2
      : 3;

      return (
        <div className="relative h-[340px] w-[340px]">
      
          <Aura
            primary={appearance.primary}
            glow={glow}
            intensity={auraIntensity}
          />
      
          <Halo
            primary={appearance.primary}
            secondary={appearance.secondary}
            glow={glow}
            intensity={glow}
          />
      
          <BronzeFrame
            tier={shellTier}
            primary={appearance.primary}
            secondary={appearance.secondary}
            glow={glow}
          />
      
         {/*
<Rings
  count={rings}
  primary={appearance.primary}
  secondary={appearance.secondary}
  glow={glow}
/>
*/}
      
          {/* Corpo central do Núcleo */}
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <Crystal
              primary={appearance.primary}
              secondary={appearance.secondary}
              scale={crystalScale}
              glow={glow}
            />
      
            <div className="absolute inset-0 flex items-center justify-center">
              <Lightning
                primary={appearance.primary}
                secondary={appearance.secondary}
                glow={glow}
                scale={appearance.lightningScale}
              />
            </div>
          </div>
      
        </div>
      );
}