import assert from 'node:assert/strict';
import test from 'node:test';

import type { CompleteOnboardingV2Payload } from '../../app/onboarding/lib/onboarding-v2-types.ts';
import {
  buildAtomicNutritionOnboardingRpcArgs,
  buildOnboardingNutritionTarget,
} from './target-writer-contract.ts';

function payload(
  biologicalSex: CompleteOnboardingV2Payload['health']['biological_sex'] = 'male',
  pregnancyStatus?: CompleteOnboardingV2Payload['health']['pregnancy_status'],
  lactationStatus?: CompleteOnboardingV2Payload['health']['lactation_status'],
): CompleteOnboardingV2Payload {
  return {
    idempotency_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    payload_schema_version: 4,
    health: {
      birth_date: '1996-10-18', biological_sex: biologicalSex,
      pregnancy_status: pregnancyStatus,
      lactation_status: lactationStatus,
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

test('female with explicit no/no receives a calculated target', () => {
  const target = buildOnboardingNutritionTarget(payload('female', 'no', 'no'), '2026-10-18');
  assert.equal(target.status, 'active');
  assert.equal(target.reasons.length, 0);
  assert.ok((target.calories ?? 0) > 0);
});

test('routes pregnancy and lactation to review', () => {
  const pregnancy = buildOnboardingNutritionTarget(payload('female', 'yes', 'no'), '2026-10-18');
  const lactation = buildOnboardingNutritionTarget(payload('female', 'no', 'yes'), '2026-10-18');
  assert.equal(pregnancy.status, 'requires_review');
  assert.ok(pregnancy.reasons.includes('pregnancy'));
  assert.equal(lactation.status, 'requires_review');
  assert.ok(lactation.reasons.includes('lactation'));
});

test('routes unknown reproductive context to review', () => {
  const target = buildOnboardingNutritionTarget(
    payload('female', 'unknown', 'prefer_not_to_say'),
    '2026-10-18',
  );
  assert.equal(target.status, 'requires_review');
  assert.deepEqual(target.reasons, ['pregnancy_status_unknown', 'lactation_status_unknown']);
});

test('schema-5 routine context does not change calories or macros', () => {
  const schema4 = payload();
  const schema5 = payload();
  schema5.payload_schema_version = 5;
  schema5.routine = {
    wake_time: '06:30',
    sleep_time: '22:45',
    routine_predictability: 'variable',
    meal_break_availability: 'difficult',
    preferred_training_period: 'morning',
  };

  assert.deepEqual(
    buildOnboardingNutritionTarget(schema5, '2026-10-18'),
    buildOnboardingNutritionTarget(schema4, '2026-10-18'),
  );
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
