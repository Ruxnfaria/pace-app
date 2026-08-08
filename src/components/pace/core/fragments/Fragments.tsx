"use client";

type FragmentsProps = {
  count: number;
  primary: string;
  secondary: string;
  glow: number;
};

export default function Fragments({
  count,
  primary,
  secondary,
  glow,
}: FragmentsProps) {
  if (count <= 0) return null;

  const plates = [
    {
      id: "top",
      showAt: 1,
      className: "left-1/2 top-[17%] h-[18px] w-[42px] -translate-x-1/2",
      clipPath: "polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)",
    },
    {
      id: "left-upper",
      showAt: 2,
      className: "left-[25%] top-[32%] h-[38px] w-[18px] -rotate-[24deg]",
      clipPath: "polygon(0 0, 100% 18%, 82% 100%, 15% 82%)",
    },
    {
      id: "right-upper",
      showAt: 3,
      className: "right-[25%] top-[32%] h-[38px] w-[18px] rotate-[24deg]",
      clipPath: "polygon(0 18%, 100% 0, 85% 82%, 18% 100%)",
    },
    {
      id: "left-lower",
      showAt: 4,
      className: "bottom-[27%] left-[27%] h-[32px] w-[17px] rotate-[25deg]",
      clipPath: "polygon(15% 0, 100% 18%, 82% 100%, 0 82%)",
    },
    {
      id: "right-lower",
      showAt: 5,
      className: "bottom-[27%] right-[27%] h-[32px] w-[17px] -rotate-[25deg]",
      clipPath: "polygon(0 18%, 85% 0, 100% 82%, 18% 100%)",
    },
    {
      id: "bottom",
      showAt: 6,
      className: "bottom-[17%] left-1/2 h-[16px] w-[38px] -translate-x-1/2",
      clipPath: "polygon(0 0, 100% 0, 78% 100%, 22% 100%)",
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-[15]">
      {plates
        .filter((plate) => count >= plate.showAt)
        .map((plate) => (
          <div
            key={plate.id}
            className={`absolute ${plate.className}`}
            style={{
              clipPath: plate.clipPath,

              background: `
                linear-gradient(
                  135deg,
                  ${secondary},
                  ${primary} 48%,
                  #5a2b0b
                )
              `,

              border: `1px solid ${secondary}99`,

              boxShadow: `
                0 0 ${5 + glow}px ${primary}aa,
                inset 0 0 ${4 + glow}px ${secondary}55
              `,
            }}
          />
        ))}
    </div>
  );
}