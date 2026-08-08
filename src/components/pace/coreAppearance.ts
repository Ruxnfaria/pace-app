import { CoreRankId } from "@/lib/gamification/coreStages";

export type CoreAppearance = {
  primary: string;
  secondary: string;

  glow: number;
  rings: number;
  particles: number;

  crystalScale: number;

  rotationSpeed: number;
};

export const CORE_APPEARANCE: Record<
  CoreRankId,
  CoreAppearance
> = {
  beginner: {
    primary: "#a855f7",
    secondary: "#ffffff",

    glow: 1,

    rings: 0,

    particles: 6,

    crystalScale: 1,

    rotationSpeed: 1,
  },

  bronze_3: {
    primary: "#c67a36",
    secondary: "#f7d38d",

    glow: 2,

    rings: 1,

    particles: 8,

    crystalScale: 1.02,

    rotationSpeed: 1,
  },

  bronze_2: {
    primary: "#cf8438",
    secondary: "#ffd68d",

    glow: 2.2,

    rings: 1,

    particles: 10,

    crystalScale: 1.05,

    rotationSpeed: 1.05,
  },

  bronze_1: {
    primary: "#db9348",
    secondary: "#ffe39e",

    glow: 2.6,

    rings: 2,

    particles: 12,

    crystalScale: 1.08,

    rotationSpeed: 1.1,
  },

  silver_3: {
    primary: "#d7d9e3",
    secondary: "#ffffff",

    glow: 3,

    rings: 2,

    particles: 14,

    crystalScale: 1.1,

    rotationSpeed: 1.15,
  },

  silver_2: {
    primary: "#eceef8",
    secondary: "#ffffff",

    glow: 3.4,

    rings: 2,

    particles: 16,

    crystalScale: 1.12,

    rotationSpeed: 1.2,
  },

  silver_1: {
    primary: "#ffffff",
    secondary: "#d8f2ff",

    glow: 4,

    rings: 3,

    particles: 18,

    crystalScale: 1.15,

    rotationSpeed: 1.25,
  },

  gold_3: {
    primary: "#f5c64e",
    secondary: "#fff2b0",

    glow: 4.5,

    rings: 3,

    particles: 20,

    crystalScale: 1.18,

    rotationSpeed: 1.3,
  },

  gold_2: {
    primary: "#ffd54f",
    secondary: "#fff6c7",

    glow: 5,

    rings: 3,

    particles: 22,

    crystalScale: 1.2,

    rotationSpeed: 1.35,
  },

  gold_1: {
    primary: "#ffe16d",
    secondary: "#ffffff",

    glow: 5.5,

    rings: 4,

    particles: 24,

    crystalScale: 1.24,

    rotationSpeed: 1.4,
  },

  diamond: {
    primary: "#6fe6ff",
    secondary: "#ffffff",

    glow: 6.5,

    rings: 4,

    particles: 28,

    crystalScale: 1.28,

    rotationSpeed: 1.5,
  },

  unstoppable: {
    primary: "#8c5dff",
    secondary: "#ffffff",

    glow: 7.5,

    rings: 5,

    particles: 32,

    crystalScale: 1.34,

    rotationSpeed: 1.7,
  },

  unshakable: {
    primary: "#b48dff",
    secondary: "#ffffff",

    glow: 8.5,

    rings: 6,

    particles: 36,

    crystalScale: 1.42,

    rotationSpeed: 1.9,
  },

  legend: {
    primary: "#ffffff",
    secondary: "#b97cff",

    glow: 10,

    rings: 7,

    particles: 45,

    crystalScale: 1.55,

    rotationSpeed: 2.2,
  },
};