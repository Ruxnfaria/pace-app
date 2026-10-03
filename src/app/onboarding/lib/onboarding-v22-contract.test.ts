import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOnboardingV22Payload, OnboardingV22ContractError, DURATION_RANGES,
  AEROBIC_PRACTICE_FREQUENCIES, FOOD_PREPARATION_AVAILABILITIES, CURRENT_EATING_ROUTINES,
  INITIAL_TRAINING_LEVELS, ACTIVITY_INTENSITIES, V22_ACTIVITY_CODES } from './onboarding-v22-contract.ts';
import { v22Payload, invalidV22Cases, mutatePayload } from '../../../../supabase/tests/fixtures/onboarding-v22-payload.ts';

test('V2.2 closed builder accepts the complete contract without mutating input', () => {
  const input = v22Payload(); const before = structuredClone(input);
  const output = buildOnboardingV22Payload(input);
  assert.deepEqual(input, before);
  assert.equal(output.payload_schema_version, 3);
  assert.deepEqual(output.training.preferred_weekdays, [1, 3]);
  assert.equal(output.training.training_days_per_week, 6);
  assert.equal(output.training.activities.length, 2);
});
for (const [name, path, value] of invalidV22Cases) {
  test(`V2.2 local rejection: ${name}`, () => {
    assert.throws(() => buildOnboardingV22Payload(mutatePayload(path, value)), OnboardingV22ContractError);
  });
}
for (const [field, values] of [
  ['session_duration_range', DURATION_RANGES], ['initial_training_level', INITIAL_TRAINING_LEVELS],
  ['aerobic_practice_frequency', AEROBIC_PRACTICE_FREQUENCIES],
] as const) {
  for (const value of values) test(`V2.2 accepts training ${field}=${value}`, () => {
    assert.doesNotThrow(() => buildOnboardingV22Payload(mutatePayload(['training', field], value)));
  });
}
for (const [field, values] of [
  ['food_preparation_availability', FOOD_PREPARATION_AVAILABILITIES], ['current_eating_routine', CURRENT_EATING_ROUTINES],
] as const) {
  for (const value of values) test(`V2.2 accepts nutrition ${field}=${value}`, () => {
    assert.doesNotThrow(() => buildOnboardingV22Payload(mutatePayload(['nutrition', field], value)));
  });
}
test('V2.2 accepts every activity code, duration and intensity', () => {
  for (const activity_code of V22_ACTIVITY_CODES) for (const duration_range of DURATION_RANGES) for (const intensity of ACTIVITY_INTENSITIES) {
    const payload = v22Payload();
    payload.training.activities = [{ activity_code, other_activity_label: activity_code === 'other' ? 'Tênis' : null,
      weekdays: [2, 4], sessions_per_week: 3, duration_range, intensity }];
    assert.doesNotThrow(() => buildOnboardingV22Payload(payload));
  }
});
test('V2.2 allows no activities, no preferred days, full gym, and false safety flag', () => {
  const p = v22Payload(); Object.assign(p.training, { training_location: 'full_gym', available_equipment: [],
    activities: [], preferred_weekdays: [], aerobic_safety_limitation: false });
  assert.deepEqual(buildOnboardingV22Payload(p).training.activities, []);
});
test('V2.2 normalizes spaces and set order but preserves meaningful text', () => {
  const p = v22Payload(); const q = structuredClone(p);
  q.identity.name = `  ${p.identity.name}  `;
  q.training.activities.reverse(); q.training.preferred_weekdays.reverse(); q.training.available_equipment.reverse();
  for (const a of q.training.activities) a.weekdays?.reverse();
  q.nutrition.available_meal_moments.reverse(); q.nutrition.restrictions.reverse();
  q.nutrition.disliked_foods.reverse(); q.nutrition.preferred_foods.reverse(); q.nutrition.supplements.reverse();
  assert.deepEqual(buildOnboardingV22Payload(p), buildOnboardingV22Payload(q));
  q.identity.name = q.identity.name.toUpperCase();
  assert.notDeepEqual(buildOnboardingV22Payload(p), buildOnboardingV22Payload(q));
});
test('V2.2 rejects missing fields, null/array domains and duplicate children', () => {
  for (const domain of ['identity', 'health', 'training', 'nutrition'] as const) {
    for (const value of [null, [], 'invalid']) assert.throws(() => buildOnboardingV22Payload(mutatePayload([domain], value)));
    for (const key of Object.keys(v22Payload()[domain])) {
      const p = v22Payload(); delete (p[domain] as Record<string, unknown>)[key];
      assert.throws(() => buildOnboardingV22Payload(p));
    }
  }
  const p = v22Payload(); p.training.activities.push(p.training.activities[0]);
  assert.throws(() => buildOnboardingV22Payload(p));
  for (const kind of ['restrictions', 'disliked_foods', 'preferred_foods', 'supplements'] as const) {
    const p = v22Payload(); p.nutrition[kind][1].declared_label = ` ${p.nutrition[kind][0].declared_label.toUpperCase()} `;
    assert.throws(() => buildOnboardingV22Payload(p));
  }
});
test('age validation follows birthdays, including leap years', () => {
  const p = v22Payload(); p.health.birth_date = '2008-02-29';
  assert.throws(() => buildOnboardingV22Payload(p, '2026-02-28'));
  assert.doesNotThrow(() => buildOnboardingV22Payload(p, '2026-03-01'));
});
