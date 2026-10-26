import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertMealPlanTargetIsActive,
  MealPlanGenerationBlockedError,
} from './context-policy.ts';

test('review-required target blocks meal generation before provider setup', () => {
  assert.throws(
    () => assertMealPlanTargetIsActive({ status: 'requires_review' }),
    (error: unknown) =>
      error instanceof MealPlanGenerationBlockedError && error.code === 'TARGET_REQUIRES_REVIEW',
  );
});

test('only an active nutrition target can enter meal generation', () => {
  assert.doesNotThrow(() => assertMealPlanTargetIsActive({ status: 'active' }));
  assert.throws(() => assertMealPlanTargetIsActive(null), /MEAL_CONTEXT_INCOMPLETE/);
});
