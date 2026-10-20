import type { MovementPattern, MuscleGroup } from "../prescription/domain.ts";

export type ExerciseType = "compound" | "accessory" | "core" | "cardio";
export type ExerciseComplexity = "low" | "moderate" | "high";

export type ExerciseMetadata = {
  canonicalName: string;
  aliases: readonly string[];
  movementPattern: MovementPattern;
  primaryMuscles: readonly MuscleGroup[];
  secondaryMuscles: readonly MuscleGroup[];
  equipment: readonly string[];
  exerciseType: ExerciseType;
  complexity: ExerciseComplexity;
  incompatibleAffectedBodyAreas: readonly string[];
};

const catalog = (items: readonly ExerciseMetadata[]) => items;

export const EXERCISE_METADATA_CATALOG = catalog([
  { canonicalName: "Supino reto com halteres", aliases: ["supino com halteres"], movementPattern: "horizontal_press", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"], equipment: ["dumbbells", "bench"], exerciseType: "compound", complexity: "moderate", incompatibleAffectedBodyAreas: [] },
  { canonicalName: "Flexão de braços", aliases: ["flexao de bracos", "flexão"], movementPattern: "horizontal_press", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"], equipment: ["bodyweight"], exerciseType: "compound", complexity: "low", incompatibleAffectedBodyAreas: ["wrist"] },
  { canonicalName: "Desenvolvimento com halteres", aliases: ["desenvolvimento de ombros"], movementPattern: "vertical_press", primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps"], equipment: ["dumbbells"], exerciseType: "compound", complexity: "moderate", incompatibleAffectedBodyAreas: ["shoulder"] },
  { canonicalName: "Remada baixa no cabo", aliases: ["remada baixa"], movementPattern: "horizontal_pull", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], equipment: ["cable"], exerciseType: "compound", complexity: "low", incompatibleAffectedBodyAreas: [] },
  { canonicalName: "Remada com elástico", aliases: ["remada elastico"], movementPattern: "horizontal_pull", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], equipment: ["resistance_bands"], exerciseType: "compound", complexity: "low", incompatibleAffectedBodyAreas: [] },
  { canonicalName: "Puxada na frente", aliases: ["puxada frontal"], movementPattern: "vertical_pull", primaryMuscles: ["back"], secondaryMuscles: ["biceps"], equipment: ["cable"], exerciseType: "compound", complexity: "low", incompatibleAffectedBodyAreas: ["shoulder"] },
  { canonicalName: "Agachamento livre com barra", aliases: ["agachamento livre"], movementPattern: "knee_dominant", primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes"], equipment: ["barbell", "rack"], exerciseType: "compound", complexity: "high", incompatibleAffectedBodyAreas: ["knee", "lower_back"] },
  { canonicalName: "Agachamento no banco", aliases: ["agachamento no banco com peso corporal"], movementPattern: "knee_dominant", primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes"], equipment: ["bodyweight"], exerciseType: "compound", complexity: "low", incompatibleAffectedBodyAreas: [] },
  { canonicalName: "Levantamento terra romeno", aliases: ["terra romeno", "stiff"], movementPattern: "hip_hinge", primaryMuscles: ["hamstrings", "glutes"], secondaryMuscles: ["back"], equipment: ["barbell"], exerciseType: "compound", complexity: "high", incompatibleAffectedBodyAreas: ["lower_back"] },
  { canonicalName: "Ponte de glúteos", aliases: ["ponte de gluteos"], movementPattern: "hip_hinge", primaryMuscles: ["hamstrings", "glutes"], secondaryMuscles: ["back"], equipment: ["bodyweight"], exerciseType: "compound", complexity: "low", incompatibleAffectedBodyAreas: [] },
  { canonicalName: "Afundo com halteres", aliases: ["afundo"], movementPattern: "unilateral_lower", primaryMuscles: ["quadriceps", "glutes"], secondaryMuscles: ["hamstrings"], equipment: ["dumbbells"], exerciseType: "compound", complexity: "moderate", incompatibleAffectedBodyAreas: ["knee"] },
  { canonicalName: "Crucifixo na máquina", aliases: ["crucifixo maquina"], movementPattern: "chest_accessory", primaryMuscles: ["chest"], secondaryMuscles: [], equipment: ["machine"], exerciseType: "accessory", complexity: "low", incompatibleAffectedBodyAreas: [] },
  { canonicalName: "Remada alta no cabo", aliases: ["remada alta"], movementPattern: "back_accessory", primaryMuscles: ["back"], secondaryMuscles: [], equipment: ["cable"], exerciseType: "accessory", complexity: "low", incompatibleAffectedBodyAreas: ["shoulder"] },
  { canonicalName: "Mesa flexora", aliases: ["flexora deitada"], movementPattern: "hamstring_accessory", primaryMuscles: ["hamstrings"], secondaryMuscles: [], equipment: ["machine"], exerciseType: "accessory", complexity: "low", incompatibleAffectedBodyAreas: [] },
  { canonicalName: "Elevação pélvica", aliases: ["elevacao pelvica"], movementPattern: "glute_accessory", primaryMuscles: ["glutes"], secondaryMuscles: [], equipment: ["bench"], exerciseType: "accessory", complexity: "low", incompatibleAffectedBodyAreas: [] },
  { canonicalName: "Elevação lateral com halteres", aliases: ["elevacao lateral"], movementPattern: "lateral_delt_accessory", primaryMuscles: ["shoulders"], secondaryMuscles: [], equipment: ["dumbbells"], exerciseType: "accessory", complexity: "low", incompatibleAffectedBodyAreas: ["shoulder"] },
  { canonicalName: "Rosca direta com halteres", aliases: ["rosca direta"], movementPattern: "biceps_accessory", primaryMuscles: ["biceps"], secondaryMuscles: [], equipment: ["dumbbells"], exerciseType: "accessory", complexity: "low", incompatibleAffectedBodyAreas: ["elbow"] },
  { canonicalName: "Tríceps na polia", aliases: ["triceps na polia"], movementPattern: "triceps_accessory", primaryMuscles: ["triceps"], secondaryMuscles: [], equipment: ["cable"], exerciseType: "accessory", complexity: "low", incompatibleAffectedBodyAreas: ["elbow"] },
  { canonicalName: "Elevação de panturrilhas em pé", aliases: ["panturrilha em pe"], movementPattern: "calf_accessory", primaryMuscles: ["calves"], secondaryMuscles: [], equipment: ["bodyweight"], exerciseType: "accessory", complexity: "low", incompatibleAffectedBodyAreas: [] },
  { canonicalName: "Prancha frontal", aliases: ["prancha"], movementPattern: "core_stability", primaryMuscles: ["core"], secondaryMuscles: [], equipment: ["bodyweight"], exerciseType: "core", complexity: "low", incompatibleAffectedBodyAreas: ["shoulder"] },
  { canonicalName: "Bicicleta ergométrica", aliases: ["bicicleta", "bike"], movementPattern: "aerobic_modality", primaryMuscles: [], secondaryMuscles: [], equipment: ["stationary_bike"], exerciseType: "cardio", complexity: "low", incompatibleAffectedBodyAreas: [] },
  { canonicalName: "Caminhada na esteira", aliases: ["esteira", "caminhada"], movementPattern: "aerobic_modality", primaryMuscles: [], secondaryMuscles: [], equipment: ["treadmill"], exerciseType: "cardio", complexity: "low", incompatibleAffectedBodyAreas: [] },
] as const);

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

const metadataByName = new Map<string, ExerciseMetadata>();
for (const item of EXERCISE_METADATA_CATALOG) {
  metadataByName.set(normalized(item.canonicalName), item);
  for (const alias of item.aliases) metadataByName.set(normalized(alias), item);
}

export function resolveExerciseMetadata(name: string): ExerciseMetadata | null {
  return metadataByName.get(normalized(name)) ?? null;
}

export function isExerciseEquipmentCompatible(
  metadata: ExerciseMetadata,
  availableEquipment: readonly string[],
): boolean {
  // Legacy contexts may not carry equipment data; absence is unknown, not a proven conflict.
  if (availableEquipment.length === 0) return true;
  if (availableEquipment.includes("full_gym")) return true;
  return metadata.equipment.every((item) => item === "bodyweight" || availableEquipment.includes(item));
}

export function compatibleExercisesForPattern(
  movementPattern: MovementPattern,
  availableEquipment: readonly string[],
  affectedBodyAreas: readonly string[],
): readonly ExerciseMetadata[] {
  return EXERCISE_METADATA_CATALOG.filter((item) =>
    item.movementPattern === movementPattern
    && isExerciseEquipmentCompatible(item, availableEquipment)
    && !item.incompatibleAffectedBodyAreas.some((area) => affectedBodyAreas.includes(area))
  );
}

export function buildExerciseCatalogPrompt(): string {
  return EXERCISE_METADATA_CATALOG.map((item) =>
    `${item.canonicalName} | pattern=${item.movementPattern} | equipment=${item.equipment.join("+")}`
  ).join("\n");
}
