"use client";

type LightningProps = {
  primary: string;
  secondary: string;
  glow: number;
  scale?: number;
};

export default function Lightning({
  primary,
  secondary,
  glow,
  scale = 1,
}: LightningProps) {
  return (
    <div
      className="relative z-30 h-[128px] w-[92px]"
      style={{
        transform: `scale(${scale})`,
        clipPath:
          "polygon(58% 0%, 14% 48%, 46% 48%, 28% 100%, 88% 39%, 57% 39%)",
        background: `
          linear-gradient(
            180deg,
            ${secondary} 0%,
            #ffffff 30%,
            ${primary} 100%
          )
        `,
        filter: `
          drop-shadow(0 0 ${6 + glow * 2}px ${secondary})
          drop-shadow(0 0 ${14 + glow * 3}px ${primary})
        `,
      }}
    />
  );
}