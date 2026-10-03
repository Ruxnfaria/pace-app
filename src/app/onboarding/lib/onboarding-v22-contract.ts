import {
  BIOLOGICAL_SEXES, DIETARY_PATTERNS, EQUIPMENT, PRIMARY_GOALS,
  RESTRICTION_CODES, RESTRICTION_TYPES, SUPPLEMENT_CODES,
} from './onboarding-v2-types.ts';

export const ONBOARDING_V22 = {
  rpc: 'complete_onboarding_v22', onboardingVersion: 2,
  payloadSchemaVersion: 3, canonicalizationVersion: 3,
} as const;
export const DURATION_RANGES = ['under_30', '30_45', '45_60', '60_90', 'over_90'] as const;
export const INITIAL_TRAINING_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const V22_TRAINING_LOCATIONS = ['full_gym', 'simple_gym', 'home', 'outdoor', 'other'] as const;
export const V22_ACTIVITY_CODES = ['running', 'football', 'cycling', 'swimming', 'combat_sports', 'walking', 'other'] as const;
export const ACTIVITY_INTENSITIES = ['low', 'moderate', 'high'] as const;
export const AEROBIC_PRACTICE_FREQUENCIES = ['never', 'sometimes', 'regularly'] as const;
export const MEAL_MOMENTS = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper'] as const;
export const FOOD_PREPARATION_AVAILABILITIES = ['limited', 'moderate', 'flexible'] as const;
export const CURRENT_EATING_ROUTINES = ['structured', 'variable', 'irregular'] as const;
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

type Code<T extends readonly unknown[]> = T[number];
export type DurationRange = Code<typeof DURATION_RANGES>;
export type OnboardingV22Activity = {
  activity_code: Code<typeof V22_ACTIVITY_CODES>;
  other_activity_label: string | null;
  weekdays: Code<typeof WEEKDAYS>[] | null;
  sessions_per_week: number | null;
  duration_range: DurationRange | null;
  intensity: Code<typeof ACTIVITY_INTENSITIES> | null;
};
export type CompleteOnboardingV22Payload = {
  payload_schema_version: 3;
  idempotency_key: string;
  identity: { name: string };
  health: {
    birth_date: string;
    biological_sex: Code<typeof BIOLOGICAL_SEXES>;
    height_cm: number;
    weight_kg: number;
    primary_goal: Code<typeof PRIMARY_GOALS>;
  };
  training: {
    initial_training_level: Code<typeof INITIAL_TRAINING_LEVELS>;
    training_days_per_week: 2 | 3 | 4 | 5 | 6;
    preferred_weekdays: Code<typeof WEEKDAYS>[];
    session_duration_range: DurationRange;
    training_location: Code<typeof V22_TRAINING_LOCATIONS>;
    other_location_label: string | null;
    available_equipment: Code<typeof EQUIPMENT>[];
    other_equipment_label: string | null;
    aerobic_practice_frequency: Code<typeof AEROBIC_PRACTICE_FREQUENCIES>;
    /** Consideration only, never medical clearance or a diagnosis. */
    aerobic_safety_limitation: boolean;
    activities: OnboardingV22Activity[];
  };
  nutrition: {
    available_meal_moments: Code<typeof MEAL_MOMENTS>[];
    food_preparation_availability: Code<typeof FOOD_PREPARATION_AVAILABILITIES>;
    current_eating_routine: Code<typeof CURRENT_EATING_ROUTINES>;
    dietary_pattern: Code<typeof DIETARY_PATTERNS>;
    dietary_pattern_other_label: string | null;
    restrictions: {
      restriction_type: Code<typeof RESTRICTION_TYPES>;
      restriction_code: Code<typeof RESTRICTION_CODES> | null;
      declared_label: string;
    }[];
    disliked_foods: { declared_label: string }[];
    preferred_foods: { declared_label: string }[];
    /** Already used supplements; this is not a prescription. */
    supplements: { supplement_code: Code<typeof SUPPLEMENT_CODES> | null; declared_label: string }[];
  };
};
export type CompleteOnboardingV22Result = {
  result: 'completed' | 'replay'; onboarding_version: 2; completed_at: string;
};

export class OnboardingV22ContractError extends Error {
  constructor() {
    // Do not include user data (in particular the safety flag) in errors/logs.
    super('Payload incompatível com o contrato do Onboarding V2.2.');
    this.name = 'OnboardingV22ContractError';
  }
}
function fail(): never { throw new OnboardingV22ContractError(); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) return fail();
  return record;
}
function code<T extends string | number>(value: unknown, allowed: readonly T[]): T {
  if (!allowed.some((item) => item === value)) return fail();
  return value as T;
}
function nullableCode<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return value === null ? null : code(value, allowed);
}
function label(value: unknown, max: number): string {
  if (typeof value !== 'string') return fail();
  // Match PostgreSQL btrim(text); preserve case and internal spaces.
  const result = value.replace(/^ +| +$/g, '');
  if (!result || [...result].length > max || /[\u0000-\u001f\u007f-\u009f]/.test(result)) return fail();
  return result;
}
function nullableLabel(value: unknown, max: number): string | null {
  return value === null ? null : label(value, max);
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : fail();
}
function set<T extends string | number>(value: unknown, allowed: readonly T[], min = 0): T[] {
  const values = array(value).map((item) => code(item, allowed));
  if (values.length < min || new Set(values).size !== values.length) return fail();
  return values.sort();
}
function number(value: unknown, minExclusive: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= minExclusive || value > max) return fail();
  return value;
}
function otherLabel(kind: string, value: unknown): string | null {
  const result = nullableLabel(value, 80);
  if ((kind === 'other') !== (result !== null)) return fail();
  return result;
}
function labelledSet<T extends { declared_label: string }>(values: T[]): T[] {
  if (new Set(values.map((x) => x.declared_label.toLowerCase())).size !== values.length) return fail();
  return values.sort((a, b) => a.declared_label < b.declared_label ? -1 : a.declared_label > b.declared_label ? 1 : 0);
}

/** Closed local preflight/builder. SQL remains authoritative for validation,
 * canonical UTF-8 bytes, the SHA-256 hash, identity and completion/replay.
 * today is an ISO calendar date supplied by tests or the caller's UTC clock.
 */
export function buildOnboardingV22Payload(value: unknown, today = new Date().toISOString().slice(0, 10)): CompleteOnboardingV22Payload {
  const root = object(value, ['payload_schema_version', 'idempotency_key', 'identity', 'health', 'training', 'nutrition']);
  if (root.payload_schema_version !== 3 || typeof root.idempotency_key !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(root.idempotency_key)) return fail();
  const identity = object(root.identity, ['name']);
  const h = object(root.health, ['birth_date', 'biological_sex', 'height_cm', 'weight_kg', 'primary_goal']);
  if (typeof h.birth_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(h.birth_date)) return fail();
  const birth = new Date(`${h.birth_date}T00:00:00Z`);
  if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== h.birth_date || h.birth_date.slice(0, 4) === '0000') return fail();
  const age = Number(today.slice(0, 4)) - Number(h.birth_date.slice(0, 4)) - (today.slice(5) < h.birth_date.slice(5) ? 1 : 0);
  if (age < 18 || h.birth_date > today) return fail();
  const t = object(root.training, ['initial_training_level', 'training_days_per_week', 'preferred_weekdays',
    'session_duration_range', 'training_location', 'other_location_label', 'available_equipment',
    'other_equipment_label', 'aerobic_practice_frequency', 'aerobic_safety_limitation', 'activities']);
  const location = code(t.training_location, V22_TRAINING_LOCATIONS);
  const equipment = set(t.available_equipment, EQUIPMENT);
  const equipmentLabel = nullableLabel(t.other_equipment_label, 80);
  if ((equipment.includes('other')) !== (equipmentLabel !== null) ||
      (location === 'full_gym' ? equipment.length !== 0 : equipment.length === 0) ||
      typeof t.aerobic_safety_limitation !== 'boolean') return fail();
  const activities = array(t.activities).map((value): OnboardingV22Activity => {
    const a = object(value, ['activity_code', 'other_activity_label', 'weekdays', 'sessions_per_week', 'duration_range', 'intensity']);
    const activityCode = code(a.activity_code, V22_ACTIVITY_CODES);
    const sessions = a.sessions_per_week === null ? null : number(a.sessions_per_week, 0, 32767);
    if (sessions !== null && !Number.isInteger(sessions)) return fail();
    return {
      activity_code: activityCode, other_activity_label: otherLabel(activityCode, a.other_activity_label),
      weekdays: a.weekdays === null ? null : set(a.weekdays, WEEKDAYS, 1), sessions_per_week: sessions,
      duration_range: nullableCode(a.duration_range, DURATION_RANGES), intensity: nullableCode(a.intensity, ACTIVITY_INTENSITIES),
    };
  }).sort((a, b) => a.activity_code < b.activity_code ? -1 : a.activity_code > b.activity_code ? 1 : 0);
  if (new Set(activities.map((a) => a.activity_code)).size !== activities.length) return fail();
  const n = object(root.nutrition, ['available_meal_moments', 'food_preparation_availability', 'current_eating_routine',
    'dietary_pattern', 'dietary_pattern_other_label', 'restrictions', 'disliked_foods', 'preferred_foods', 'supplements']);
  const pattern = code(n.dietary_pattern, DIETARY_PATTERNS);
  const foods = (value: unknown) => labelledSet(array(value).map((item) => ({
    declared_label: label(object(item, ['declared_label']).declared_label, 160),
  })));
  return {
    payload_schema_version: 3, idempotency_key: root.idempotency_key.toLowerCase(),
    identity: { name: label(identity.name, 80) },
    health: { birth_date: h.birth_date, biological_sex: code(h.biological_sex, BIOLOGICAL_SEXES),
      height_cm: number(h.height_cm, 0, 300), weight_kg: number(h.weight_kg, 0, 500), primary_goal: code(h.primary_goal, PRIMARY_GOALS) },
    training: {
      initial_training_level: code(t.initial_training_level, INITIAL_TRAINING_LEVELS),
      training_days_per_week: code(t.training_days_per_week, [2, 3, 4, 5, 6] as const),
      preferred_weekdays: set(t.preferred_weekdays, WEEKDAYS), session_duration_range: code(t.session_duration_range, DURATION_RANGES),
      training_location: location, other_location_label: otherLabel(location, t.other_location_label),
      available_equipment: equipment, other_equipment_label: equipmentLabel,
      aerobic_practice_frequency: code(t.aerobic_practice_frequency, AEROBIC_PRACTICE_FREQUENCIES),
      aerobic_safety_limitation: t.aerobic_safety_limitation, activities,
    },
    nutrition: {
      available_meal_moments: set(n.available_meal_moments, MEAL_MOMENTS, 1),
      food_preparation_availability: code(n.food_preparation_availability, FOOD_PREPARATION_AVAILABILITIES),
      current_eating_routine: code(n.current_eating_routine, CURRENT_EATING_ROUTINES),
      dietary_pattern: pattern, dietary_pattern_other_label: otherLabel(pattern, n.dietary_pattern_other_label),
      restrictions: labelledSet(array(n.restrictions).map((value) => {
        const r = object(value, ['restriction_type', 'restriction_code', 'declared_label']);
        return { restriction_type: code(r.restriction_type, RESTRICTION_TYPES),
          restriction_code: nullableCode(r.restriction_code, RESTRICTION_CODES), declared_label: label(r.declared_label, 160) };
      })),
      disliked_foods: foods(n.disliked_foods), preferred_foods: foods(n.preferred_foods),
      supplements: labelledSet(array(n.supplements).map((value) => {
        const s = object(value, ['supplement_code', 'declared_label']);
        return { supplement_code: nullableCode(s.supplement_code, SUPPLEMENT_CODES), declared_label: label(s.declared_label, 160) };
      })),
    },
  };
}
