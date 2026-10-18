import assert from 'node:assert/strict';
import test from 'node:test';

import type { CompleteOnboardingV2Payload } from '../../app/onboarding/lib/onboarding-v2-types.ts';
import {
  buildAtomicNutritionOnboardingRpcArgs,
  buildOnboardingNutritionTarget,
} from './target-writer-contract.ts';

function payload(
  biologicalSex: CompleteOnboardingV2Payload['health']['biological_sex'] = 'male',
): CompleteOnboardingV2Payload {
  return {
    idempotency_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    payload_schema_version: 4,
    health: {
      birth_date: '1996-10-18', biological_sex: biologicalSex,
      height_cm: 180, weight_kg: 80, target_weight_kg: null,
      primary_goal: 'fat_loss', activity_level: 'moderate',
    },
    training: {
      primary_goal: 'fat_loss', priority_muscles: [], training_experience: 'none',
      exercise_confidence: 'needs_guidance', recent_training_break: null,
      training_days_per_week: 3, available_weekdays: [1, 3, 5],
      session_duration_min: 60, session_duration_is_plus: false,
      training_location: 'full_gym', other_location_label: null,
      available_equipment: [], other_equipment_label: null,
      pain_or_limitation: false, affected_body_areas: [], activities: [],
    },
    nutrition: {
      meal_schedule_flexibility: 'moderate', preferred_meals_per_day: null,
      food_preparation_style: 'cook_some', food_budget_style: 'balanced',
      dietary_pattern: 'omnivore', dietary_pattern_other_label: null,
      has_food_restrictions: false, uses_supplements: false,
      restrictions: [], disliked_foods: [], preferred_foods: [], supplements: [],
    },
  };
}

test('builds the service-only writer arguments from the authenticated identity', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const args = buildAtomicNutritionOnboardingRpcArgs(userId, payload(), '2026-10-18');

  assert.equal(args.p_user_id, userId);
  assert.equal('user_id' in args.p_payload, false);
  assert.equal(args.p_target.algorithmVersion, 'praxe-nutrition-target-msj-v1');
  assert.equal(args.p_target.status, 'active');
  assert.equal(args.p_target.calories, 2350);
  assert.equal(args.p_target.proteinG, 144);
  assert.equal(args.p_target.carbsG, 297.25);
  assert.equal(args.p_target.fatG, 65);
});

test('routes an unspecified metabolic basis to an auditable review snapshot', () => {
  const target = buildOnboardingNutritionTarget(payload('not_specified'), '2026-10-18');
  assert.equal(target.status, 'requires_review');
  assert.deepEqual(target.reasons, ['undefined_metabolic_sex']);
  assert.equal(target.calories, null);
});

test('routes a female basis to review until pregnancy and lactation are known', () => {
  const target = buildOnboardingNutritionTarget(payload('female'), '2026-10-18');
  assert.equal(target.status, 'requires_review');
  assert.deepEqual(target.reasons, ['pregnancy_status_unknown', 'lactation_status_unknown']);
});

test('rejects identities and event keys that are not UUIDs', () => {
  assert.throws(
    () => buildAtomicNutritionOnboardingRpcArgs('client-value', payload(), '2026-10-18'),
    /Authenticated user id/,
  );
  const invalid = payload();
  invalid.idempotency_key = 'retry-key';
  assert.throws(
    () => buildAtomicNutritionOnboardingRpcArgs(
      '11111111-1111-4111-8111-111111111111', invalid, '2026-10-18',
    ),
    /idempotency key/,
  );
});
