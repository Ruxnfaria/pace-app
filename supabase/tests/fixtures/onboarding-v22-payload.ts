import type { CompleteOnboardingV22Payload } from '../../../src/app/onboarding/lib/onboarding-v22-contract.ts';

/** Synthetic inputs only. No production data or credentials. */
export function v22Payload(): CompleteOnboardingV22Payload {
  return {
    payload_schema_version: 3,
    idempotency_key: '00000000-0000-4000-8000-000000000001',
    identity: { name: 'Pessoa Teste' },
    health: { birth_date: '2000-01-01', biological_sex: 'not_specified', height_cm: 175,
      weight_kg: 70, primary_goal: 'hypertrophy' },
    training: {
      initial_training_level: 'advanced', training_days_per_week: 6, preferred_weekdays: [3, 1],
      session_duration_range: '45_60', training_location: 'simple_gym', other_location_label: null,
      available_equipment: ['dumbbells', 'bodyweight'], other_equipment_label: null,
      aerobic_practice_frequency: 'sometimes', aerobic_safety_limitation: true,
      activities: [
        { activity_code: 'walking', other_activity_label: null, weekdays: [5, 2],
          sessions_per_week: 3, duration_range: 'under_30', intensity: 'low' },
        { activity_code: 'other', other_activity_label: 'Tênis', weekdays: null,
          sessions_per_week: 1, duration_range: '60_90', intensity: 'moderate' },
      ],
    },
    nutrition: {
      available_meal_moments: ['lunch', 'breakfast', 'dinner'],
      food_preparation_availability: 'moderate', current_eating_routine: 'variable',
      dietary_pattern: 'omnivore', dietary_pattern_other_label: null,
      restrictions: [
        { restriction_type: 'allergy', restriction_code: 'peanut', declared_label: 'Amendoim' },
        { restriction_type: 'intolerance', restriction_code: 'lactose', declared_label: 'Lactose' },
      ],
      disliked_foods: [{ declared_label: 'Quiabo' }, { declared_label: 'Jiló' }],
      preferred_foods: [{ declared_label: 'Arroz' }, { declared_label: 'Feijão' }],
      supplements: [
        { supplement_code: 'creatine', declared_label: 'Creatina' },
        { supplement_code: 'whey_protein', declared_label: 'Whey' },
      ],
    },
  };
}

export function v21Payload() {
  return {
    idempotency_key: '00000000-0000-4000-8000-000000000002', payload_schema_version: 2,
    health: { birth_date: '2000-01-01', biological_sex: 'not_specified', height_cm: 175,
      weight_kg: 70, target_weight_kg: null, primary_goal: 'hypertrophy' },
    training: {
      primary_goal: 'hypertrophy', priority_muscles: ['back'], training_experience: 'over_2_years',
      exercise_confidence: 'confident_independent', recent_training_break: 'under_1_month',
      training_days_per_week: 3, available_weekdays: [1, 3, 5], session_duration_min: 60,
      session_duration_is_plus: false, training_location: 'full_gym', other_location_label: null,
      available_equipment: [], other_equipment_label: null, pain_or_limitation: false, affected_body_areas: [],
      activities: [{ activity_code: 'running', other_activity_label: null, schedule_type: 'fixed_weekdays',
        available_weekdays: [2, 4], sessions_per_week: null }],
    },
    nutrition: { meal_schedule_flexibility: 'moderate', food_preparation_style: 'cook_some',
      food_budget_style: 'balanced', dietary_pattern: 'omnivore', dietary_pattern_other_label: null,
      has_food_restrictions: false, uses_supplements: false,
      restrictions: [], disliked_foods: [], preferred_foods: [], supplements: [] },
  };
}

/** Each mutation must fail both the local builder and the server validator. */
export const invalidV22Cases: [string, string[], unknown][] = [
  ['schema V2.1', ['payload_schema_version'], 2],
  ['invalid UUID', ['idempotency_key'], 'not-a-uuid'],
  ['identity spoofing', ['user_id'], '00000000-0000-4000-8000-000000000099'],
  ['client hash', ['payload_hash'], 'fake'],
  ['unknown top field', ['unexpected'], true],
  ['unknown identity field', ['identity', 'user_id'], 'someone-else'],
  ['blank name', ['identity', 'name'], '   '],
  ['name too long', ['identity', 'name'], 'x'.repeat(81)],
  ['invalid goal', ['health', 'primary_goal'], 'strength'],
  ['invalid biological sex', ['health', 'biological_sex'], 'invalid'],
  ['invalid calendar date', ['health', 'birth_date'], '2000-02-30'],
  ['minor', ['health', 'birth_date'], '2020-01-01'],
  ['future date', ['health', 'birth_date'], '2099-01-01'],
  ['string height', ['health', 'height_cm'], '175'],
  ['zero height', ['health', 'height_cm'], 0],
  ['excess height', ['health', 'height_cm'], 301],
  ['excess weight', ['health', 'weight_kg'], 501],
  ['invalid experience', ['training', 'initial_training_level'], 'expert'],
  ['old experience field', ['training', 'training_experience'], 'none'],
  ['old priorities field', ['training', 'priority_muscles'], []],
  ['old weekdays field', ['training', 'available_weekdays'], []],
  ['old exact minutes', ['training', 'session_duration_min'], 60],
  ['frequency too low', ['training', 'training_days_per_week'], 1],
  ['frequency too high', ['training', 'training_days_per_week'], 7],
  ['fractional frequency', ['training', 'training_days_per_week'], 3.5],
  ['invalid weekday', ['training', 'preferred_weekdays'], [0]],
  ['duplicate weekdays', ['training', 'preferred_weekdays'], [1, 1]],
  ['string weekday', ['training', 'preferred_weekdays'], ['1']],
  ['null weekdays', ['training', 'preferred_weekdays'], null],
  ['invalid duration', ['training', 'session_duration_range'], '30_60'],
  ['invalid location', ['training', 'training_location'], 'gym'],
  ['other location without label', ['training', 'training_location'], 'other'],
  ['unneeded location label', ['training', 'other_location_label'], 'Local'],
  ['full gym with equipment', ['training', 'training_location'], 'full_gym'],
  ['limited location without equipment', ['training', 'available_equipment'], []],
  ['invalid equipment', ['training', 'available_equipment'], ['treadmill']],
  ['duplicate equipment', ['training', 'available_equipment'], ['bodyweight', 'bodyweight']],
  ['other equipment without label', ['training', 'available_equipment'], ['other']],
  ['invalid cardio frequency', ['training', 'aerobic_practice_frequency'], 'daily'],
  ['string safety flag', ['training', 'aerobic_safety_limitation'], 'false'],
  ['null safety flag', ['training', 'aerobic_safety_limitation'], null],
  ['clinical text', ['training', 'clinical_notes'], 'synthetic-forbidden-field'],
  ['diagnosis field', ['training', 'diagnosis'], 'synthetic-forbidden-field'],
  ['medication field', ['training', 'medications'], []],
  ['fake none activity', ['training', 'activities', '0', 'activity_code'], 'none'],
  ['extra activity field', ['training', 'activities', '0', 'note'], 'synthetic-forbidden-field'],
  ['duplicate activity days', ['training', 'activities', '0', 'weekdays'], [2, 2]],
  ['invalid activity days', ['training', 'activities', '0', 'weekdays'], [8]],
  ['empty activity days', ['training', 'activities', '0', 'weekdays'], []],
  ['zero activity frequency', ['training', 'activities', '0', 'sessions_per_week'], 0],
  ['fractional activity frequency', ['training', 'activities', '0', 'sessions_per_week'], 1.5],
  ['overflow activity frequency', ['training', 'activities', '0', 'sessions_per_week'], 32768],
  ['invalid activity duration', ['training', 'activities', '0', 'duration_range'], '90'],
  ['invalid intensity', ['training', 'activities', '0', 'intensity'], 'intense'],
  ['missing other activity label', ['training', 'activities', '1', 'other_activity_label'], null],
  ['empty meal moments', ['nutrition', 'available_meal_moments'], []],
  ['invalid meal moments', ['nutrition', 'available_meal_moments'], ['brunch']],
  ['duplicate meal moments', ['nutrition', 'available_meal_moments'], ['lunch', 'lunch']],
  ['invalid preparation availability', ['nutrition', 'food_preparation_availability'], 'cook_some'],
  ['invalid routine', ['nutrition', 'current_eating_routine'], 'healthy'],
  ['deprecated meal count', ['nutrition', 'meals_per_day'], 3],
  ['deprecated eggs', ['nutrition', 'accepts_eggs'], true],
  ['deprecated dairy', ['nutrition', 'accepts_dairy'], true],
  ['old schedule flexibility', ['nutrition', 'meal_schedule_flexibility'], 'flexible'],
  ['old preparation style', ['nutrition', 'food_preparation_style'], 'cook_some'],
  ['old budget style', ['nutrition', 'food_budget_style'], 'balanced'],
  ['invalid dietary pattern', ['nutrition', 'dietary_pattern'], 'invalid'],
  ['missing other dietary label', ['nutrition', 'dietary_pattern'], 'other'],
  ['invalid restriction code', ['nutrition', 'restrictions', '0', 'restriction_code'], 'invalid'],
  ['invalid restriction type', ['nutrition', 'restrictions', '0', 'restriction_type'], 'invalid'],
  ['blank food label', ['nutrition', 'preferred_foods', '0', 'declared_label'], ' '],
  ['food label too long', ['nutrition', 'preferred_foods', '0', 'declared_label'], 'x'.repeat(161)],
  ['control characters', ['nutrition', 'preferred_foods', '0', 'declared_label'], 'a\nb'],
  ['untrusted food code', ['nutrition', 'preferred_foods', '0', 'food_code'], 'untrusted'],
  ['invalid supplement code', ['nutrition', 'supplements', '0', 'supplement_code'], 'invalid'],
  ['supplement prescription', ['nutrition', 'supplements', '0', 'dose'], 'synthetic-forbidden-field'],
];

export function mutatePayload(path: string[], value: unknown): unknown {
  const payload = v22Payload();
  let target: unknown = payload;
  for (const key of path.slice(0, -1)) target = (target as Record<string, unknown>)[key];
  (target as Record<string, unknown>)[path.at(-1)!] = value;
  return payload;
}
