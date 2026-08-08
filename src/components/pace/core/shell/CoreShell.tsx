"use client";

type CoreShellProps = {
  tier: 1 | 2 | 3;
  primary: string;
  secondary: string;
  glow: number;
};

export default function CoreShell({
  tier,
  primary,
  secondary,
  glow,
}: CoreShellProps) {
  const outerScale =
    tier === 1 ? 1.08 :
    tier === 2 ? 1.03 :
    0.98;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[16] flex items-center justify-center"
      aria-hidden="true"
    >
      {/* Estrutura principal */}
      <div
        className="absolute h-[220px] w-[185px]"
        style={{
          transform: `scale(${outerScale})`,
          clipPath:
            "polygon(50% 0%, 83% 15%, 100% 48%, 88% 82%, 50% 100%, 12% 82%, 0% 48%, 17% 15%)",
          background: `
            linear-gradient(
              145deg,
              ${secondary}aa 0%,
              ${primary} 28%,
              ${primary}cc 62%,
              #2a1208 100%
            )
          `,
          filter: `
            drop-shadow(0 0 ${8 + glow * 2}px ${primary}88)
          `,
          opacity: 0.92,
        }}
      />

      {/* Recorte interno para virar moldura */}
      <div
        className="absolute h-[186px] w-[151px] bg-[#0b0914]"
        style={{
          clipPath:
            "polygon(50% 0%, 83% 15%, 100% 48%, 88% 82%, 50% 100%, 12% 82%, 0% 48%, 17% 15%)",
        }}
      />

      {/* Tier II — reforços laterais */}
      {tier <= 2 && (
        <>
          <div
            className="absolute left-[22%] top-[31%] h-[70px] w-[14px] -rotate-[20deg]"
            style={{
              background: `linear-gradient(${secondary}, ${primary})`,
              boxShadow: `0 0 ${8 + glow}px ${primary}`,
              clipPath: "polygon(0 0, 100% 12%, 82% 100%, 18% 88%)",
            }}
          />

          <div
            className="absolute right-[22%] top-[31%] h-[70px] w-[14px] rotate-[20deg]"
            style={{
              background: `linear-gradient(${secondary}, ${primary})`,
              boxShadow: `0 0 ${8 + glow}px ${primary}`,
              clipPath: "polygon(0 12%, 100% 0, 82% 88%, 18% 100%)",
            }}
          />
        </>
      )}

      {/* Tier I — ápice Bronze */}
      {tier === 1 && (
        <>
          <div
            className="absolute top-[18%] h-[16px] w-[74px]"
            style={{
              background: `linear-gradient(90deg, ${primary}, ${secondary}, ${primary})`,
              clipPath: "polygon(12% 0, 88% 0, 100% 100%, 0 100%)",
              boxShadow: `0 0 ${10 + glow}px ${primary}`,
            }}
          />

          <div
            className="absolute bottom-[18%] h-[15px] w-[68px]"
            style={{
              background: `linear-gradient(90deg, ${primary}, ${secondary}, ${primary})`,
              clipPath: "polygon(0 0, 100% 0, 84% 100%, 16% 100%)",
              boxShadow: `0 0 ${10 + glow}px ${primary}`,
            }}
          />
        </>
      )}
    </div>
  );
}