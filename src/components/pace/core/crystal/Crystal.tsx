"use client";

import { CSSProperties } from "react";

type CrystalProps = {
  primary: string;
  secondary: string;

  scale: number;

  glow: number;
};

export default function Crystal({
  primary,
  secondary,
  scale,
  glow,
}: CrystalProps) {
  return (
    <div
      className="absolute h-[190px] w-[155px]"
      style={{
        transform: `scale(${scale})`,
        filter: `
          drop-shadow(0 0 ${12 + glow * 3}px ${primary})
          brightness(${1 + glow * 0.045})
        `,
      }}
    >
      {/* Corpo */}

      <div
        className="absolute inset-0"
        style={{
          clipPath:
            "polygon(50% 0%,84% 18%,100% 55%,76% 88%,50% 100%,23% 88%,0% 55%,16% 18%)",

          background: `
            linear-gradient(
              145deg,
              ${secondary} 0%,
              ${primary} 40%,
              ${primary}dd 72%,
              #120622 100%
            )
          `,

          border: `1px solid ${secondary}99`,

          boxShadow: `
            inset 8px 8px 22px rgba(255,255,255,.25),
            inset -12px -18px 26px rgba(0,0,0,.45)
          `,
        }}
      />

      {/* Faceta */}

      <div
        className="absolute inset-[8%]"
        style={{
          clipPath:
            "polygon(50% 0%,100% 52%,72% 100%,50% 75%,28% 100%,0% 52%)",

          background: `
            linear-gradient(
              110deg,
              rgba(255,255,255,.28),
              transparent 42%,
              ${primary}66
            )
          `,
        }}
      />
    </div>
  );
}