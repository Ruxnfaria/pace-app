import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateNutritionTarget,
  mapMetabolicSexBasis,
  mapNutritionGoal,
  NUTRITION_ACTIVITY_MULTIPLIERS,
  NUTRITION_GOAL_ADJUSTMENTS,
  NUTRITION_PROTEIN_GRAMS_PER_KG,
  NUTRITION_TARGET_ALGORITHM_VERSION,
  type NutritionTargetInput,
} from './target-calculator.ts';

function eligibleInput(overrides: Partial<NutritionTargetInput> = {}): NutritionTargetInput {
  return {
    effectiveDate: '2026-10-18',
    birthDate: '1996-10-18',
    weightKg: 80,
    heightCm: 180,
    biologicalSex: 'male',
    activityLevel: 'moderate',
    goal: 'fat_loss',
    pregnant: false,
    lactating: false,
    requiresClinicalReview: false,
    ...overrides,
  };
}

test('implements the approved male Mifflin-St Jeor target and rounding policy', () => {
  const result = calculateNutritionTarget(eligibleInput());
  assert.equal(result.algorithmVersion, NUTRITION_TARGET_ALGORITHM_VERSION);
  assert.equal(result.status, 'active');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.ageYears, 30);
  assert.equal(result.bmr, 1780);
  assert.equal(result.tdee, 2759);
  assert.equal(result.calories, 2350);
  assert.equal(result.proteinG, 144);
  assert.equal(result.fatG, 65);
  assert.equal(result.carbsG, 297.25);
  assert.equal(result.fiberG, 33);
  assert.ok(Math.abs(result.macroCalorieDelta ?? Infinity) <= 0.5);
});

test('implements the approved female Mifflin-St Jeor offset', () => {
  const result = calculateNutritionTarget(eligibleInput({
    biologicalSex: 'female',
    pregnant: false,
    lactating: false,
  }));
  assert.equal(result.status, 'active');
  assert.equal(result.bmr, 1614);
  assert.equal(result.tdee, 2501.7);
  assert.equal(result.calories, 2130);
  assert.equal(result.proteinG, 144);
  assert.equal(result.fatG, 59);
  assert.equal(result.carbsG, 255.75);
  assert.equal(result.fiberG, 30);
});

for (const [activityLevel, multiplier] of Object.entries(NUTRITION_ACTIVITY_MULTIPLIERS)) {
  test(`uses the ${activityLevel} activity multiplier`, () => {
    const result = calculateNutritionTarget(eligibleInput({ activityLevel }));
    assert.equal(result.activityMultiplier, multiplier);
    assert.equal(result.tdee, Math.round((result.bmr ?? 0) * multiplier * 100) / 100);
  });
}

for (const goal of Object.keys(NUTRITION_GOAL_ADJUSTMENTS)) {
  test(`uses the approved ${goal} goal and protein factors`, () => {
    const result = calculateNutritionTarget(eligibleInput({ goal }));
    assert.equal(result.goalAdjustment, NUTRITION_GOAL_ADJUSTMENTS[goal as keyof typeof NUTRITION_GOAL_ADJUSTMENTS]);
    assert.equal(result.proteinG, Math.round(80 * NUTRITION_PROTEIN_GRAMS_PER_KG[goal as keyof typeof NUTRITION_PROTEIN_GRAMS_PER_KG]));
    assert.ok(Math.abs(result.macroCalorieDelta ?? Infinity) <= 0.5);
  });
}

test('treats the eighteenth birthday as adult eligibility', () => {
  const result = calculateNutritionTarget(eligibleInput({ birthDate: '2008-10-18' }));
  assert.equal(result.ageYears, 18);
  assert.equal(result.status, 'active');
});

test('does not calculate an automatic target for a minor', () => {
  const result = calculateNutritionTarget(eligibleInput({ birthDate: '2008-10-19' }));
  assert.equal(result.status, 'requires_review');
  assert.deepEqual(result.reasons, ['under_18']);
  assert.equal(result.calories, null);
});

test('requires review for missing activity and unsupported goals', () => {
  const missing = calculateNutritionTarget(eligibleInput({ activityLevel: null }));
  assert.deepEqual(missing.reasons, ['missing_activity_level']);
  const unsupported = calculateNutritionTarget(eligibleInput({ goal: 'weight_loss' }));
  assert.deepEqual(unsupported.reasons, ['unsupported_goal']);
});

test('does not infer a metabolic basis from not_specified', () => {
  const result = calculateNutritionTarget(eligibleInput({ biologicalSex: 'not_specified' }));
  assert.equal(result.status, 'requires_review');
  assert.deepEqual(result.reasons, ['undefined_metabolic_sex']);
  assert.equal(result.bmr, null);
  assert.equal(mapMetabolicSexBasis('not_specified'), null);
});

test('requires explicit pregnancy and lactation status for the female basis', () => {
  const result = calculateNutritionTarget(eligibleInput({
    biologicalSex: 'female',
    pregnant: undefined,
    lactating: null,
  }));
  assert.deepEqual(result.reasons, ['pregnancy_status_unknown', 'lactation_status_unknown']);
  assert.equal(result.calories, null);
});

test('routes pregnancy, lactation, and clinical flags to review without calculating', () => {
  const result = calculateNutritionTarget(eligibleInput({
    biologicalSex: 'female',
    pregnant: true,
    lactating: true,
    requiresClinicalReview: true,
  }));
  assert.deepEqual(result.reasons, ['pregnancy', 'lactation', 'clinical_review_required']);
  assert.equal(result.calories, null);
});

test('rejects invalid and out-of-domain anthropometrics', () => {
  assert.deepEqual(
    calculateNutritionTarget(eligibleInput({ weightKg: Number.NaN })).reasons,
    ['invalid_weight'],
  );
  assert.deepEqual(
    calculateNutritionTarget(eligibleInput({ heightCm: 90 })).reasons,
    ['height_outside_auto_domain'],
  );
  assert.deepEqual(
    calculateNutritionTarget(eligibleInput({ weightKg: 301 })).reasons,
    ['weight_outside_auto_domain'],
  );
});

test('flags extreme calorie results rather than clamping them', () => {
  const result = calculateNutritionTarget(eligibleInput({
    birthDate: '2006-10-18',
    weightKg: 30,
    heightCm: 120,
    activityLevel: 'sedentary',
    goal: 'fat_loss',
  }));
  assert.equal(result.status, 'requires_review');
  assert.ok(result.reasons.includes('target_calories_outside_auto_domain'));
  assert.ok((result.calories ?? 0) < 1200);
});

test('maps only exact current backend goal codes', () => {
  for (const goal of Object.keys(NUTRITION_GOAL_ADJUSTMENTS)) assert.equal(mapNutritionGoal(goal), goal);
  assert.equal(mapNutritionGoal('lose_weight'), null);
  assert.equal(mapNutritionGoal(null), null);
});

test('is deterministic for identical validated input', () => {
  const input = eligibleInput({ activityLevel: 'high', goal: 'hypertrophy' });
  assert.deepEqual(calculateNutritionTarget(input), calculateNutritionTarget(input));
});
