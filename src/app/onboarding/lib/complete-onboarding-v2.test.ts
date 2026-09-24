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
    payload_schema_version: 2,
    health: {
      birth_date: '2000-01-01',
      biological_sex: 'not_specified',
      height_cm: 175,
      weight_kg: 70,
      target_weight_kg: null,
      primary_goal: 'hypertrophy',
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

test('aceita o contrato V2.1 aprovado sem user_id ou campos removidos', () => {
  const payload = validPayload();
  assert.doesNotThrow(() => assertOnboardingV2SubmissionPreflight(payload));
  assert.equal('user_id' in payload, false);
  assert.deepEqual(payload.training.activities, []);
  assert.deepEqual(payload.training.available_equipment, []);
  assert.equal(payload.training.other_equipment_label, null);
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
