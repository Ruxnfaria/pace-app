import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertOnboardingV2SubmissionPreflight,
  isCompleteOnboardingV2Result,
} from './onboarding-v2-contract.ts';
import type { CompleteOnboardingV2Payload } from './onboarding-v2-types.ts';

function validPayload(): CompleteOnboardingV2Payload {
  return {
    idempotency_key: 'stable-attempt-key',
    payload_schema_version: 4,
    health: {
      birth_date: '2000-01-01',
      biological_sex: 'not_specified',
      height_cm: 175,
      weight_kg: 70,
      target_weight_kg: null,
      primary_goal: 'hypertrophy',
      activity_level: 'moderate',
    },
    training: {
      primary_goal: 'hypertrophy',
      priority_muscles: [],
      training_experience: 'under_6_months',
      exercise_confidence: 'needs_guidance',
      recent_training_break: 'under_1_month',
      training_days_per_week: 3,
      available_weekdays: [1, 3, 5],
      session_duration_min: 60,
      session_duration_is_plus: false,
      training_location: 'full_gym',
      other_location_label: null,
      available_equipment: [],
      other_equipment_label: null,
      pain_or_limitation: false,
      affected_body_areas: [],
      activities: [],
    },
    nutrition: {
      meal_schedule_flexibility: 'moderate',
      preferred_meals_per_day: null,
      food_preparation_style: 'cook_some',
      food_budget_style: 'balanced',
      dietary_pattern: 'omnivore',
      dietary_pattern_other_label: null,
      has_food_restrictions: false,
      uses_supplements: false,
      restrictions: [],
      disliked_foods: [],
      preferred_foods: [],
      supplements: [],
    },
  };
}

test('aceita o contrato schema 4 com a foundation de Nutrição V1', () => {
  const payload = validPayload();
  assert.doesNotThrow(() => assertOnboardingV2SubmissionPreflight(payload));
  assert.equal('user_id' in payload, false);
  assert.deepEqual(payload.training.activities, []);
  assert.deepEqual(payload.training.available_equipment, []);
  assert.equal(payload.training.other_equipment_label, null);
  assert.equal(payload.health.activity_level, 'moderate');
  assert.equal(payload.nutrition.preferred_meals_per_day, null);
});

test('rejeita activity level e preferência de refeições fora do contrato', () => {
  const payload = validPayload();
  payload.health.activity_level = 'desk_job' as typeof payload.health.activity_level;
  payload.nutrition.preferred_meals_per_day = 7 as typeof payload.nutrition.preferred_meals_per_day;
  assert.throws(
    () => assertOnboardingV2SubmissionPreflight(payload),
    (error: unknown) => error instanceof Error && /Nutrição V1/.test(error.message),
  );
});

test('aceita preferred_meals_per_day ausente no preflight forward-compatible', () => {
  const payload = validPayload();
  delete (payload.nutrition as Partial<typeof payload.nutrition>).preferred_meals_per_day;
  assert.doesNotThrow(() => assertOnboardingV2SubmissionPreflight(payload));
});

test('aceita schema 5 com contexto de rotina local completo', () => {
  const payload = validPayload();
  payload.payload_schema_version = 5;
  payload.routine = {
    wake_time: '07:00',
    sleep_time: '23:00',
    routine_predictability: 'predictable',
    meal_break_availability: 'limited',
    preferred_training_period: 'evening',
  };
  payload.health.pregnancy_status = 'not_applicable';
  payload.health.lactation_status = 'not_applicable';

  assert.doesNotThrow(() => assertOnboardingV2SubmissionPreflight(payload));
});

test('schema 5 rejeita horários iguais e enums de contexto inválidos', () => {
  const payload = validPayload();
  payload.payload_schema_version = 5;
  payload.routine = {
    wake_time: '23:00',
    sleep_time: '23:00',
    routine_predictability: 'predictable',
    meal_break_availability: 'limited',
    preferred_training_period: 'evening',
  };
  payload.health.pregnancy_status = 'not_applicable';
  payload.health.lactation_status = 'not_applicable';

  assert.throws(() => assertOnboardingV2SubmissionPreflight(payload), /Nutrição V1/);
});

test('schema 5 exige contexto reprodutivo seguro e coerente', () => {
  const payload = validPayload();
  payload.payload_schema_version = 5;
  payload.health.biological_sex = 'female';
  payload.health.pregnancy_status = 'no';
  payload.health.lactation_status = 'no';
  payload.routine = {
    wake_time: '07:00',
    sleep_time: '23:00',
    routine_predictability: 'predictable',
    meal_break_availability: 'limited',
    preferred_training_period: 'evening',
  };
  assert.doesNotThrow(() => assertOnboardingV2SubmissionPreflight(payload));

  payload.health.pregnancy_status = 'not_applicable';
  assert.throws(() => assertOnboardingV2SubmissionPreflight(payload), /Nutrição V1/);
});

for (const result of ['completed', 'replay'] as const) {
  test(`reconhece ${result} como conclusão válida da RPC`, () => {
    assert.equal(
      isCompleteOnboardingV2Result({
        result,
        onboarding_version: 2,
        completed_at: '2026-09-22T12:00:00.000Z',
      }),
      true,
    );
  });
}

test('rejeita resposta da RPC com versão incompatível', () => {
  assert.equal(
    isCompleteOnboardingV2Result({
      result: 'completed',
      onboarding_version: 1,
      completed_at: '2026-09-22T12:00:00.000Z',
    }),
    false,
  );
});
