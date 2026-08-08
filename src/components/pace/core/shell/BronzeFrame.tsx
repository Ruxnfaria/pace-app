"use client";

type BronzeFrameProps = {
  tier: 1 | 2 | 3;
  primary: string;
  secondary: string;
  glow: number;
};

export default function BronzeFrame({
  tier,
  primary,
  secondary,
  glow,
}: BronzeFrameProps) {
  const showSideArmor = tier <= 2;
  const showCrown = tier === 1;

  return (
    <svg
      viewBox="0 0 320 320"
      className="pointer-events-none absolute inset-0 z-[16] h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bronzeMetal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={secondary} />
          <stop offset="35%" stopColor={primary} />
          <stop offset="70%" stopColor="#8a461b" />
          <stop offset="100%" stopColor="#3b1708" />
        </linearGradient>

        <filter id="bronzeGlow">
          <feGaussianBlur stdDeviation={2 + glow * 0.25} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Aro externo */}
      <circle
        cx="160"
        cy="160"
        r="116"
        fill="none"
        stroke="url(#bronzeMetal)"
        strokeWidth={tier === 3 ? 8 : tier === 2 ? 10 : 12}
        opacity="0.96"
        filter="url(#bronzeGlow)"
      />

      {/* Aro interno */}
      <circle
        cx="160"
        cy="160"
        r="96"
        fill="none"
        stroke={primary}
        strokeWidth={tier === 3 ? 2.5 : 3.5}
        opacity="0.55"
      />

      {/* Detalhes cardeais */}
      {[
        { x: 160, y: 38, rotate: 0 },
        { x: 282, y: 160, rotate: 90 },
        { x: 160, y: 282, rotate: 180 },
        { x: 38, y: 160, rotate: 270 },
      ].map((point, index) => (
        <g
          key={index}
          transform={`translate(${point.x} ${point.y}) rotate(${point.rotate})`}
        >
          <path
            d="M 0 -14 L 11 0 L 0 14 L -11 0 Z"
            fill="url(#bronzeMetal)"
            stroke={secondary}
            strokeWidth="1.3"
            filter="url(#bronzeGlow)"
          />
        </g>
      ))}

      {/* Bronze II */}
      {showSideArmor && (
        <>
          <path
            d="M 63 102 L 43 121 L 50 160 L 43 199 L 63 218 L 78 196 L 73 160 L 78 124 Z"
            fill="url(#bronzeMetal)"
            stroke={secondary}
            strokeWidth="1.2"
          />

          <path
            d="M 257 102 L 277 121 L 270 160 L 277 199 L 257 218 L 242 196 L 247 160 L 242 124 Z"
            fill="url(#bronzeMetal)"
            stroke={secondary}
            strokeWidth="1.2"
          />
        </>
      )}

      {/* Bronze I */}
      {showCrown && (
        <>
          <path
            d="M 160 20 L 181 48 L 160 69 L 139 48 Z"
            fill="url(#bronzeMetal)"
            stroke={secondary}
            strokeWidth="1.5"
            filter="url(#bronzeGlow)"
          />

          <path
            d="M 160 300 L 181 272 L 160 251 L 139 272 Z"
            fill="url(#bronzeMetal)"
            stroke={secondary}
            strokeWidth="1.5"
            filter="url(#bronzeGlow)"
          />

          <path
            d="M 78 83 L 54 101 L 43 131 L 65 120 L 88 99 Z"
            fill="url(#bronzeMetal)"
            stroke={secondary}
            strokeWidth="1.2"
          />

          <path
            d="M 242 83 L 266 101 L 277 131 L 255 120 L 232 99 Z"
            fill="url(#bronzeMetal)"
            stroke={secondary}
            strokeWidth="1.2"
          />
        </>
      )}
    </svg>
  );
}