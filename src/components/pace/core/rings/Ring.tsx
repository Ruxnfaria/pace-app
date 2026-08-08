"use client";

type RingProps = {
  primary: string;
  secondary: string;
  index: number;
  glow: number;
};

export default function Ring({
  primary,
  secondary,
  index,
  glow,
}: RingProps) {
  const inset = 14 + index * 5;
  const reverse = index % 2 !== 0;

  return (
    <div
      className={`core-ring pointer-events-none absolute rounded-full border ${
        reverse ? "core-ring--reverse" : ""
      }`}
      style={{
        inset: `${inset}%`,
        borderColor:
          index % 2 === 0
            ? `${primary}88`
            : `${secondary}66`,
        opacity: Math.max(0.35, 0.9 - index * 0.08),
        boxShadow: `
          0 0 ${10 + glow * 2}px ${primary}33,
          inset 0 0 ${8 + glow}px ${secondary}18
        `,
        animationDuration: `${22 + index * 5}s`,
      }}
      aria-hidden="true"
    >
      <span
        className="core-ring__point absolute left-1/2 top-[-4px] h-2 w-2 -translate-x-1/2 rounded-full"
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