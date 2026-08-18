export type CoreRankId =
  | "beginner"
  | "bronze_3"
  | "bronze_2"
  | "bronze_1"
  | "silver_3"
  | "silver_2"
  | "silver_1"
  | "gold_3"
  | "gold_2"
  | "gold_1"
  | "diamond_3"
  | "diamond_2"
  | "diamond_1"
  | "unstoppable"
  | "unshakable"
  | "legend";

export type CoreVisualState =
  | "dormant"
  | "stable"
  | "energized"
  | "vibrant"
  | "transcendent";

export type CoreMaterial =
  | "raw-crystal"
  | "bronze"
  | "silver"
  | "gold"
  | "diamond"
  | "solid-energy"
  | "cosmic-energy"
  | "stellar-plasma";

export type CoreRank = {
  id: CoreRankId;
  name: string;
  coreName: string;
  description: string;

  minimumEnergy: number;
  maximumEnergy: number | null;

  material: CoreMaterial;
  visualState: CoreVisualState;

  ringCount: number;
  particleIntensity: number;
  glowIntensity: number;
  auraIntensity: number;
};

export const CORE_RANKS: CoreRank[] = [
  {
    id: "beginner",
    name: "Iniciante",
    coreName: "Núcleo Desperto",
    description: "O potencial começou a despertar.",
    minimumEnergy: 0,
    maximumEnergy: 499,
    material: "raw-crystal",
    visualState: "dormant",
    ringCount: 0,
    particleIntensity: 1,
    glowIntensity: 1,
    auraIntensity: 0,
  },

  {
    id: "bronze_3",
    name: "Bronze III",
    coreName: "Núcleo Forjado",
    description: "A disciplina começa a criar forma.",
    minimumEnergy: 500,
    maximumEnergy: 999,
    material: "bronze",
    visualState: "stable",
    ringCount: 1,
    particleIntensity: 1,
    glowIntensity: 2,
    auraIntensity: 1,
  },
  {
    id: "bronze_2",
    name: "Bronze II",
    coreName: "Núcleo Forjado",
    description: "A energia começa a ganhar consistência.",
    minimumEnergy: 1000,
    maximumEnergy: 1499,
    material: "bronze",
    visualState: "stable",
    ringCount: 1,
    particleIntensity: 2,
    glowIntensity: 2,
    auraIntensity: 1,
  },
  {
    id: "bronze_1",
    name: "Bronze I",
    coreName: "Núcleo Forjado",
    description: "A base da evolução está consolidada.",
    minimumEnergy: 1500,
    maximumEnergy: 2199,
    material: "bronze",
    visualState: "energized",
    ringCount: 1,
    particleIntensity: 3,
    glowIntensity: 3,
    auraIntensity: 2,
  },

  {
    id: "silver_3",
    name: "Prata III",
    coreName: "Núcleo Refinado",
    description: "A consistência transforma esforço em poder.",
    minimumEnergy: 2200,
    maximumEnergy: 2999,
    material: "silver",
    visualState: "energized",
    ringCount: 1,
    particleIntensity: 3,
    glowIntensity: 3,
    auraIntensity: 2,
  },
  {
    id: "silver_2",
    name: "Prata II",
    coreName: "Núcleo Refinado",
    description: "Seu ritmo está cada vez mais estável.",
    minimumEnergy: 3000,
    maximumEnergy: 3899,
    material: "silver",
    visualState: "energized",
    ringCount: 2,
    particleIntensity: 4,
    glowIntensity: 4,
    auraIntensity: 2,
  },
  {
    id: "silver_1",
    name: "Prata I",
    coreName: "Núcleo Refinado",
    description: "A evolução já faz parte da sua rotina.",
    minimumEnergy: 3900,
    maximumEnergy: 4999,
    material: "silver",
    visualState: "vibrant",
    ringCount: 2,
    particleIntensity: 5,
    glowIntensity: 4,
    auraIntensity: 3,
  },

  {
    id: "gold_3",
    name: "Ouro III",
    coreName: "Núcleo Radiante",
    description: "O poder nasce da dedicação diária.",
    minimumEnergy: 5000,
    maximumEnergy: 6299,
    material: "gold",
    visualState: "vibrant",
    ringCount: 2,
    particleIntensity: 5,
    glowIntensity: 5,
    auraIntensity: 3,
  },
  {
    id: "gold_2",
    name: "Ouro II",
    coreName: "Núcleo Radiante",
    description: "Sua disciplina já produz resultados visíveis.",
    minimumEnergy: 6300,
    maximumEnergy: 7799,
    material: "gold",
    visualState: "vibrant",
    ringCount: 2,
    particleIntensity: 6,
    glowIntensity: 5,
    auraIntensity: 4,
  },
  {
    id: "gold_1",
    name: "Ouro I",
    coreName: "Núcleo Radiante",
    description: "Você domina o ritmo da própria evolução.",
    minimumEnergy: 7800,
    maximumEnergy: 9499,
    material: "gold",
    visualState: "transcendent",
    ringCount: 3,
    particleIntensity: 7,
    glowIntensity: 6,
    auraIntensity: 4,
  },

  {
    id: "diamond_3",
    name: "Diamante III",
    coreName: "Núcleo Cristalino",
    description: "A disciplina começa a assumir uma forma extraordinária.",
    minimumEnergy: 9500,
    maximumEnergy: 10499,
    material: "diamond",
    visualState: "transcendent",
    ringCount: 3,
    particleIntensity: 8,
    glowIntensity: 7,
    auraIntensity: 5,
  },
  {
    id: "diamond_2",
    name: "Diamante II",
    coreName: "Núcleo Cristalino",
    description: "Seu Núcleo alcança um nível raro de consistência.",
    minimumEnergy: 10500,
    maximumEnergy: 11499,
    material: "diamond",
    visualState: "transcendent",
    ringCount: 3,
    particleIntensity: 9,
    glowIntensity: 8,
    auraIntensity: 6,
  },
  {
    id: "diamond_1",
    name: "Diamante I",
    coreName: "Núcleo Cristalino",
    description: "A excelência está completamente cristalizada.",
    minimumEnergy: 11500,
    maximumEnergy: 12499,
    material: "diamond",
    visualState: "transcendent",
    ringCount: 4,
    particleIntensity: 10,
    glowIntensity: 9,
    auraIntensity: 7,
  },

  {
    id: "unstoppable",
    name: "Imparável",
    coreName: "Núcleo Ascendente",
    description: "A energia já não pode ser contida.",
    minimumEnergy: 12500,
    maximumEnergy: 16999,
    material: "solid-energy",
    visualState: "transcendent",
    ringCount: 3,
    particleIntensity: 9,
    glowIntensity: 8,
    auraIntensity: 7,
  },

  {
    id: "unshakable",
    name: "Inabalável",
    coreName: "Núcleo Absoluto",
    description: "Nada mais consegue quebrar seu ritmo.",
    minimumEnergy: 17000,
    maximumEnergy: 22999,
    material: "cosmic-energy",
    visualState: "transcendent",
    ringCount: 4,
    particleIntensity: 10,
    glowIntensity: 9,
    auraIntensity: 9,
  },

  {
    id: "legend",
    name: "Lenda",
    coreName: "Núcleo Supremo",
    description: "A lenda não se torna. Ela se revela.",
    minimumEnergy: 23000,
    maximumEnergy: null,
    material: "stellar-plasma",
    visualState: "transcendent",
    ringCount: 4,
    particleIntensity: 12,
    glowIntensity: 10,
    auraIntensity: 10,
  },
];

export function getCoreRank(totalEnergy: number): CoreRank {
  const safeEnergy = Math.max(0, totalEnergy);

  return (
    [...CORE_RANKS]
      .reverse()
      .find((rank) => safeEnergy >= rank.minimumEnergy) ??
    CORE_RANKS[0]
  );
}

export function getNextCoreRank(
  currentRank: CoreRank
): CoreRank | null {
  const currentIndex = CORE_RANKS.findIndex(
    (rank) => rank.id === currentRank.id
  );

  return CORE_RANKS[currentIndex + 1] ?? null;
}

export function getCoreRankProgress(totalEnergy: number) {
  const currentRank = getCoreRank(totalEnergy);
  const nextRank = getNextCoreRank(currentRank);

  if (!nextRank || currentRank.maximumEnergy === null) {
    return {
      currentRank,
      nextRank: null,
      energyInsideRank: totalEnergy - currentRank.minimumEnergy,
      energyNeeded: 0,
      energyMissing: 0,
      progressPercentage: 100,
      reachedMaximumRank: true,
    };
  }

  const energyInsideRank =
    totalEnergy - currentRank.minimumEnergy;

  const energyNeeded =
    nextRank.minimumEnergy - currentRank.minimumEnergy;

  const energyMissing = Math.max(
    nextRank.minimumEnergy - totalEnergy,
    0
  );

  const progressPercentage = Math.min(
    Math.max((energyInsideRank / energyNeeded) * 100, 0),
    100
  );

  return {
    currentRank,
    nextRank,
    energyInsideRank,
    energyNeeded,
    energyMissing,
    progressPercentage,
    reachedMaximumRank: false,
  };
}

export function didCoreRankChange(
  previousEnergy: number,
  newEnergy: number
) {
  return (
    getCoreRank(previousEnergy).id !==
    getCoreRank(newEnergy).id
  );
}

// Compatibilidade temporária com o código antigo.
// Depois substituiremos todas as chamadas por didCoreRankChange.
export const didCoreStageChange = didCoreRankChange;

// Compatibilidade temporária com o overlay antigo.
export const getCoreStage = getCoreRank;
export type CoreStageInfo = CoreRank;