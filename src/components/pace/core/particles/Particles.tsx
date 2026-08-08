"use client";

type ParticlesProps = {
  count: number;
  primary: string;
  secondary: string;
  glow: number;
};

export default function Particles({
  count,
  primary,
  secondary,
  glow,
}: ParticlesProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => {
        const angle = (360 / count) * index;
        const radius = 52 + (index % 3) * 9;

        return (
          <span
            key={index}
            className="core-particle"
            style={{
              left: "50%",
              top: "50%",

              rotate: `${angle}deg`,

              translate: `0 -${radius}%`,

              background:
                index % 2 === 0
                  ? primary
                  : secondary,

              boxShadow: `
                0 0 ${6 + glow}px ${primary},
                0 0 ${12 + glow * 2}px ${primary}
              `,

              animationDelay: `${index * 0.12}s`,
            }}
          />
        );
      })}
    </>
  );
}