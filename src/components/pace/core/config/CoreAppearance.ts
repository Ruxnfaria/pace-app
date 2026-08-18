import type { CoreRankId } from "@/lib/gamification/coreStages";

export type CoreAppearanceConfig = {
  primary: string;
  secondary: string;

  glow: number;
  aura: number;
  rings: number;
  particles: number;

  crystalScale: number;
  lightningScale: number;

  rotationSpeed: number;
};

export const CORE_APPEARANCE: Record<
  CoreRankId,
  CoreAppearanceConfig
> = {
  beginner: {
    primary: "#8b5cf6",
    secondary: "#ffffff",

    glow: 1.2,
    aura: 0.5,
    rings: 0,
    particles: 3,

    crystalScale: 0.92,
    lightningScale: 0.82,

    rotationSpeed: 0.8,
  },

  bronze_3: {
    primary: "#b96b2c",
    secondary: "#ffd39a",
  
    glow: 1.8,
    aura: 0.8,
    rings: 1,
    particles: 4,
  
    crystalScale: 0.96,
    lightningScale: 0.84,
  
    rotationSpeed: 0.9,
  },
  
  bronze_2: {
    primary: "#cf8035",
    secondary: "#ffe0a8",
  
    glow: 2.8,
    aura: 1.6,
    rings: 2,
    particles: 7,
  
    crystalScale: 1.04,
    lightningScale: 0.92,
  
    rotationSpeed: 1.05,
  },
  
  bronze_1: {
    primary: "#e09446",
    secondary: "#fff0c2",
  
    glow: 4,
    aura: 2.5,
    rings: 3,
    particles: 10,
  
    crystalScale: 1.12,
    lightningScale: 1.02,
  
    rotationSpeed: 1.2,
  },

  silver_3: {
    primary: "#cbd5e1",
    secondary: "#ffffff",

    glow: 3.8,
    aura: 2.2,
    rings: 2,
    particles: 10,

    crystalScale: 1.12,
    lightningScale: 1,

    rotationSpeed: 1.22,
  },

  silver_2: {
    primary: "#e2e8f0",
    secondary: "#ffffff",

    glow: 4.3,
    aura: 2.6,
    rings: 2,
    particles: 12,

    crystalScale: 1.15,
    lightningScale: 1.03,

    rotationSpeed: 1.28,
  },

  silver_1: {
    primary: "#f8fafc",
    secondary: "#dbeafe",

    glow: 4.8,
    aura: 3,
    rings: 3,
    particles: 14,

    crystalScale: 1.18,
    lightningScale: 1.06,

    rotationSpeed: 1.34,
  },

  gold_3: {
    primary: "#f5c542",
    secondary: "#fff3b0",

    glow: 5.2,
    aura: 3.4,
    rings: 3,
    particles: 16,

    crystalScale: 1.2,
    lightningScale: 1.08,

    rotationSpeed: 1.4,
  },

  gold_2: {
    primary: "#ffd34d",
    secondary: "#fff7c7",

    glow: 5.8,
    aura: 3.9,
    rings: 3,
    particles: 18,

    crystalScale: 1.23,
    lightningScale: 1.1,

    rotationSpeed: 1.48,
  },

  gold_1: {
    primary: "#ffe36e",
    secondary: "#ffffff",

    glow: 6.4,
    aura: 4.5,
    rings: 4,
    particles: 21,

    crystalScale: 1.27,
    lightningScale: 1.14,

    rotationSpeed: 1.56,
  },

  diamond_3: {
    primary: "#67e8f9",
    secondary: "#ffffff",
  
    glow: 7.0,
    aura: 5.0,
    rings: 4,
    particles: 24,
  
    crystalScale: 1.30,
    lightningScale: 1.16,
  
    rotationSpeed: 1.62,
  },
  
  diamond_2: {
    primary: "#5ee7f7",
    secondary: "#e0f2fe",
  
    glow: 7.7,
    aura: 5.8,
    rings: 4,
    particles: 28,
  
    crystalScale: 1.35,
    lightningScale: 1.21,
  
    rotationSpeed: 1.74,
  },
  
  diamond_1: {
    primary: "#a5f3fc",
    secondary: "#ffffff",
  
    glow: 8.4,
    aura: 6.7,
    rings: 5,
    particles: 32,
  
    crystalScale: 1.41,
    lightningScale: 1.27,
  
    rotationSpeed: 1.88,
  },

  unstoppable: {
    primary: "#8b5cf6",
    secondary: "#ffffff",

    glow: 8.2,
    aura: 6.5,
    rings: 5,
    particles: 28,

    crystalScale: 1.38,
    lightningScale: 1.22,

    rotationSpeed: 1.82,
  },

  unshakable: {
    primary: "#c084fc",
    secondary: "#ffffff",

    glow: 9.1,
    aura: 8,
    rings: 6,
    particles: 34,

    crystalScale: 1.46,
    lightningScale: 1.28,

    rotationSpeed: 2,
  },

  legend: {
    primary: "#ffffff",
    secondary: "#facc15",

    glow: 10,
    aura: 10,
    rings: 7,
    particles: 42,

    crystalScale: 1.58,
    lightningScale: 1.35,

    rotationSpeed: 2.25,
  },
};