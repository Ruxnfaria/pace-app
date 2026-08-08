"use client";

type AuraProps = {
  primary: string;
  glow: number;
  intensity?: number;
};

export default function Aura({
  primary,
  glow,
  intensity = 1,
}: AuraProps) {
  const safeIntensity = Math.max(0, intensity);

  return (
    <div
      className="core-aura pointer-events-none absolute inset-[5%] rounded-full"
      style={{
        background: `
          radial-gradient(
            circle,
            ${primary}55 0%,
            ${primary}26 28%,
            ${primary}12 48%,
            transparent 72%
          )
        `,
        filter: `blur(${34 + glow * 3}px)`,
        opacity: Math.min(
          0.18 + safeIntensity * 0.08 + glow * 0.035,
          0.95
        ),
        transform: `scale(${0.92 + safeIntensity * 0.025})`,
      }}
      aria-hidden="true"
    />
  );
}