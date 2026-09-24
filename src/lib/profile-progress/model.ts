export type FitnessDataSource = "v1" | "v2";

export type LegacyFitnessProfile = {
  onboarding_version: number | null;
  peso: number | null;
  altura: number | null;
  objetivo: string | null;
};

export type HealthProfile = {
  weight_kg: number;
  height_cm: number;
  target_weight_kg?: number | null;
  primary_goal: string;
};

export type ProfileFitnessFields = {
  source: FitnessDataSource;
  weight: number | null;
  height: number | null;
  targetWeight: number | null;
  goal: string | null;
  goalEditable: boolean;
};

export type MeasurementRecord = {
  id: string;
  weight: number;
  waist: number;
  hip: number;
  chest: number;
  measuredAt: string;
};

export type ProgressSummary = {
  source: FitnessDataSource;
  history: MeasurementRecord[];
  currentWeight: number | null;
  baselineWeight: number | null;
  weightChange: number;
};

export class ProfileProgressError extends Error {
  readonly code: "V2_INCOMPLETE";

  constructor(message: string) {
    super(message);
    this.name = "ProfileProgressError";
    this.code = "V2_INCOMPLETE";
  }
}

function finiteNumber(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireHealthNumber(value: unknown, field: string): number {
  const parsed = finiteNumber(value);
  if (parsed === null) {
    throw new ProfileProgressError(
      `Seu perfil de saúde está incompleto (${field}).`
    );
  }
  return parsed;
}

export function resolveProfileFitnessFields(
  profile: LegacyFitnessProfile,
  health: HealthProfile | null
): ProfileFitnessFields {
  if (profile.onboarding_version !== 2) {
    return {
      source: "v1",
      weight: finiteNumber(profile.peso),
      height: finiteNumber(profile.altura),
      targetWeight: null,
      goal: profile.objetivo,
      goalEditable: true,
    };
  }

  if (!health || !health.primary_goal) {
    throw new ProfileProgressError(
      "Não foi possível encontrar os dados obrigatórios do seu perfil de saúde."
    );
  }

  return {
    source: "v2",
    weight: requireHealthNumber(health.weight_kg, "peso"),
    height: requireHealthNumber(health.height_cm, "altura"),
    targetWeight:
      health.target_weight_kg === null ||
      health.target_weight_kg === undefined
        ? null
        : requireHealthNumber(health.target_weight_kg, "meta de peso"),
    goal: health.primary_goal,
    goalEditable: false,
  };
}

export function buildProfileFitnessUpdate(
  source: FitnessDataSource,
  values: { weight: number | null; height: number | null; goal: string }
): {
  table: "profiles" | "user_health_profiles";
  values: Record<string, number | string | null>;
} {
  if (source === "v1") {
    return {
      table: "profiles",
      values: {
        peso: values.weight,
        altura: values.height,
        objetivo: values.goal,
      },
    };
  }

  if (values.weight === null || values.height === null) {
    throw new ProfileProgressError(
      "Peso e altura são obrigatórios no perfil de saúde."
    );
  }

  return {
    table: "user_health_profiles",
    values: {
      weight_kg: values.weight,
      height_cm: values.height,
    },
  };
}

export function buildProgressSummary(
  profile: LegacyFitnessProfile,
  health: HealthProfile | null,
  measurements: MeasurementRecord[]
): ProgressSummary {
  const fields = resolveProfileFitnessFields(profile, health);
  const firstMeasurement = measurements[0] ?? null;

  if (fields.source === "v1") {
    const history =
      measurements.length > 0
        ? measurements
        : fields.weight === null
          ? []
          : [createBaselineMeasurement(fields.weight)];
    const first = history[0] ?? null;
    const last = history[history.length - 1] ?? null;

    return {
      source: "v1",
      history,
      currentWeight: last?.weight ?? null,
      baselineWeight: first?.weight ?? null,
      weightChange: first && last ? last.weight - first.weight : 0,
    };
  }

  const currentWeight = fields.weight;
  const baselineWeight = firstMeasurement?.weight ?? currentWeight;

  return {
    source: "v2",
    history:
      measurements.length > 0
        ? measurements
        : currentWeight === null
          ? []
          : [createBaselineMeasurement(currentWeight)],
    currentWeight,
    baselineWeight,
    weightChange:
      currentWeight !== null && baselineWeight !== null
        ? currentWeight - baselineWeight
        : 0,
  };
}

export function currentWeightUpdateTarget(source: FitnessDataSource): {
  table: "profiles" | "user_health_profiles";
  column: "peso" | "weight_kg";
} {
  return source === "v1"
    ? { table: "profiles", column: "peso" }
    : { table: "user_health_profiles", column: "weight_kg" };
}

function createBaselineMeasurement(weight: number): MeasurementRecord {
  return {
    id: "onboarding-initial-weight",
    weight,
    waist: 0,
    hip: 0,
    chest: 0,
    measuredAt: "Inicial",
  };
}
