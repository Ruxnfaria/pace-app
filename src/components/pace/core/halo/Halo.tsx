"use client";

type HaloProps = {
  primary: string;
  secondary: string;
  glow: number;
  intensity?: number;
};

export default function Halo({
  primary,
  secondary,
  glow,
  intensity = 1,
}: HaloProps) {
  const safeIntensity = Math.max(0, intensity);

  if (safeIntensity <= 0) {
    return null;
  }

  return (
    <div
      className="core-halo pointer-events-none absolute inset-[12%] rounded-full border"
      style={{
        borderColor: `${primary}66`,
        boxShadow: `
          0 0 ${14 + glow * 4}px ${primary}55,
          0 0 ${24 + safeIntensity * 4}px ${secondary}22,
          inset 0 0 ${10 + glow * 2}px ${primary}22
        `,
        opacity: Math.min(
          0.35 + safeIntensity * 0.08,
          0.95
        ),
      }}
      aria-hidden="true"
    >
      <span
        className="core-halo__point absolute left-1/2 top-[-4px] h-2 w-2 -translate-x-1/2 rounded-full"
        style={{
          backgroundColor: secondary,
          boxShadow: `
            0 0 8px ${secondary},
            0 0 16px ${primary}
          `,
        }}
      />
    </div>
  );
}