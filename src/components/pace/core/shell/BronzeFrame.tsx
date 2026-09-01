"use client";

type BronzeFrameProps = {
  tier: 1 | 2 | 3;
  primary: string;
  secondary: string;
  glow: number;
  progress: number;
};

export default function BronzeFrame({
  tier,
  primary,
  secondary,
  glow,
  progress,
}: BronzeFrameProps) {
  const showSideArmor = tier <= 2;
  const showCrown = tier === 1;
  const safeProgress = Math.max(0, Math.min(progress, 100));

  const radius = 116;
  const circumference = 2 * Math.PI * radius;
  
  const progressOffset =
    circumference - (safeProgress / 100) * circumference;
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

      {tier === 3 && (
  <>
    {/* Corpo externo Bronze III */}
    <path
      d="
        M160 28
        L198 45
        L226 72
        L252 108
        L270 160
        L252 212
        L226 248
        L198 275
        L160 292
        L122 275
        L94 248
        L68 212
        L50 160
        L68 108
        L94 72
        L122 45
        Z
      "
      fill="rgba(71, 28, 8, 0.35)"
      stroke="url(#bronzeMetal)"
      strokeWidth="7"
      strokeLinejoin="round"
      filter="url(#bronzeGlow)"
    />

    {/* Segunda camada metálica */}
    <path
      d="
        M160 52
        L193 65
        L220 91
        L238 122
        L248 160
        L238 198
        L220 229
        L193 255
        L160 268
        L127 255
        L100 229
        L82 198
        L72 160
        L82 122
        L100 91
        L127 65
        Z
      "
      fill="rgba(11, 9, 20, 0.82)"
      stroke={primary}
      strokeWidth="3"
      opacity="0.95"
    />

    {/* Detalhes metálicos externos */}
    <path
      d="M160 25 L179 48 L160 67 L141 48 Z"
      fill="url(#bronzeMetal)"
      stroke={secondary}
      strokeWidth="1.2"
    />

    <path
      d="M160 295 L179 272 L160 253 L141 272 Z"
      fill="url(#bronzeMetal)"
      stroke={secondary}
      strokeWidth="1.2"
    />

    <path
      d="M46 160 L68 141 L87 160 L68 179 Z"
      fill="url(#bronzeMetal)"
      stroke={secondary}
      strokeWidth="1.2"
    />

    <path
      d="M274 160 L252 141 L233 160 L252 179 Z"
      fill="url(#bronzeMetal)"
      stroke={secondary}
      strokeWidth="1.2"
    />

    {/* Aro interno onde fica a Energia */}
    <circle
      cx="160"
      cy="160"
      r="88"
      fill="rgba(0,0,0,0.18)"
      stroke="url(#bronzeMetal)"
      strokeWidth="5"
    />

    <circle
      cx="160"
      cy="160"
      r="78"
      fill="none"
      stroke={secondary}
      strokeWidth="1.5"
      opacity="0.35"
    />
  </>
)}


{/* Aro externo usado apenas no Bronze II e Bronze I */}
{tier !== 3 && (
  <circle
    cx="160"
    cy="160"
    r="116"
    fill="none"
    stroke="url(#bronzeMetal)"
    strokeWidth={tier === 2 ? 10 : 12}
    opacity="0.25"
  />
)}

{tier !== 3 && (
  <circle
    cx="160"
    cy="160"
    r={radius}
    fill="none"
    stroke={primary}
    strokeWidth={tier === 2 ? 10 : 12}
    strokeLinecap="round"
    strokeDasharray={circumference}
    strokeDashoffset={progressOffset}
    transform="rotate(-90 160 160)"
    opacity="1"
    filter="url(#bronzeGlow)"
    style={{
      transition: "stroke-dashoffset 900ms ease",
    }}
  />
)}

{tier !== 3 && (
  <circle
    cx="160"
    cy="160"
    r="96"
    fill="none"
    stroke={primary}
    strokeWidth="3.5"
    opacity="0.55"
  />
)}

      {/* Detalhes cardeais */}
      {tier !== 3 &&
  [
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