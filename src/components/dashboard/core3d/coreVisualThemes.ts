import type { CoreRankId } from "@/lib/gamification/coreStages";

export type CoreVisualTheme = { primary: string; secondary: string; rock: string; orbitCount: 2 | 3; particleCount: number; surfaceComplexity: number };

const BRONZE = { primary: "#d97836", secondary: "#ffc08a", rock: "#18100b", orbitCount: 2, particleCount: 34, surfaceComplexity: 1.05 } as const;
const SILVER = { primary: "#dcecf7", secondary: "#86c8f2", rock: "#11171c", orbitCount: 2, particleCount: 38, surfaceComplexity: 1.1 } as const;
const GOLD = { primary: "#ffc238", secondary: "#fff0a1", rock: "#1b1405", orbitCount: 2, particleCount: 42, surfaceComplexity: 1.14 } as const;
const DIAMOND = { primary: "#36dcff", secondary: "#e7fcff", rock: "#07171d", orbitCount: 3, particleCount: 46, surfaceComplexity: 1.2 } as const;

export const CORE_VISUAL_THEMES: Record<CoreRankId, CoreVisualTheme> = {
  beginner: { primary: "#ff641f", secondary: "#ffb16e", rock: "#120b07", orbitCount: 2, particleCount: 30, surfaceComplexity: 1 },
  bronze_3: BRONZE, bronze_2: BRONZE, bronze_1: { ...BRONZE, particleCount: 38, surfaceComplexity: 1.12 },
  silver_3: SILVER, silver_2: SILVER, silver_1: { ...SILVER, particleCount: 42, surfaceComplexity: 1.18 },
  gold_3: GOLD, gold_2: GOLD, gold_1: { ...GOLD, particleCount: 46, surfaceComplexity: 1.22 },
  diamond_3: DIAMOND, diamond_2: DIAMOND, diamond_1: { ...DIAMOND, particleCount: 52, surfaceComplexity: 1.28 },
  unstoppable: { primary: "#24e6bd", secondary: "#b7fff2", rock: "#061713", orbitCount: 3, particleCount: 54, surfaceComplexity: 1.3 },
  unshakable: { primary: "#ba55ff", secondary: "#ffd5ff", rock: "#16091d", orbitCount: 3, particleCount: 58, surfaceComplexity: 1.35 },
  legend: { primary: "#ff3150", secondary: "#fff0d8", rock: "#1b0509", orbitCount: 3, particleCount: 64, surfaceComplexity: 1.42 },
};
