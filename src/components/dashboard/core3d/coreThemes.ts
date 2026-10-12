import type { CoreRankId } from "@/lib/gamification/coreStages";

export type CoreTheme = {
  primary: string;
  secondary: string;
  fallback: string;
  orbitCount: 2 | 3;
  particleCount: number;
  power: number;
};

const BRONZE: CoreTheme = {
  primary: "#e87832",
  secondary: "#ffd0a0",
  fallback: "/cores/bronze.png",
  orbitCount: 2,
  particleCount: 34,
  power: 0.92,
};

const SILVER: CoreTheme = {
  primary: "#a9dcff",
  secondary: "#f4fbff",
  fallback: "/cores/prata.png",
  orbitCount: 2,
  particleCount: 38,
  power: 0.98,
};

const GOLD: CoreTheme = {
  primary: "#ffc13b",
  secondary: "#fff2ae",
  fallback: "/cores/ouro.png",
  orbitCount: 2,
  particleCount: 42,
  power: 1.04,
};

const DIAMOND: CoreTheme = {
  primary: "#35dfff",
  secondary: "#e7fdff",
  fallback: "/cores/diamante.png",
  orbitCount: 3,
  particleCount: 46,
  power: 1.1,
};

export const CORE_THEMES: Record<CoreRankId, CoreTheme> = {
  beginner: {
    primary: "#ff641f",
    secondary: "#ffd7ad",
    fallback: "/cores/iniciante.png",
    orbitCount: 2,
    particleCount: 30,
    power: 0.88,
  },
  bronze_3: BRONZE,
  bronze_2: { ...BRONZE, power: 0.96, particleCount: 36 },
  bronze_1: { ...BRONZE, power: 1, particleCount: 38 },
  silver_3: SILVER,
  silver_2: { ...SILVER, power: 1.02, particleCount: 40 },
  silver_1: { ...SILVER, power: 1.06, particleCount: 42 },
  gold_3: GOLD,
  gold_2: { ...GOLD, power: 1.08, particleCount: 44 },
  gold_1: { ...GOLD, power: 1.12, particleCount: 46 },
  diamond_3: DIAMOND,
  diamond_2: { ...DIAMOND, power: 1.14, particleCount: 49 },
  diamond_1: { ...DIAMOND, power: 1.18, particleCount: 52 },
  unstoppable: {
    primary: "#23e6b9",
    secondary: "#d5fff5",
    fallback: "/cores/elite.png",
    orbitCount: 3,
    particleCount: 54,
    power: 1.18,
  },
  unshakable: {
    primary: "#9d68ff",
    secondary: "#f3e9ff",
    fallback: "/cores/elite.png",
    orbitCount: 3,
    particleCount: 58,
    power: 1.24,
  },
  legend: {
    primary: "#ff304f",
    secondary: "#fff0dd",
    fallback: "/cores/lenda.png",
    orbitCount: 3,
    particleCount: 64,
    power: 1.3,
  },
};
