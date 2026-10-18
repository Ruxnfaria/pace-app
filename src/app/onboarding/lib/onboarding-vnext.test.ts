import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOnboardingV2Payload } from './build-onboarding-v2-payload.ts';
import { parseOnboardingV2Draft } from './onboarding-v2-draft.ts';
import {
  formatBirthDateForReview,
  formatWeekdaysForReview,
} from './onboarding-v2-review-format.ts';
import {
  getNextOnboardingV2Step,
  getPreviousOnboardingV2Step,
  ONBOARDING_V2_STEPS,
} from './onboarding-v2-steps.ts';
import {
  createInitialOnboardingV2Form,
  createInitialOnboardingV2State,
  onboardingV2Reducer,
} from './onboarding-v2-state.ts';
import type { OnboardingV2FormState } from './onboarding-v2-types.ts';
import { validateOnboardingV2Step } from './onboarding-v2-validation.ts';

function completeForm(): OnboardingV2FormState {
  return {
    health: {
      primaryGoal: 'hypertrophy',
      birthDate: '2000-01-01',
      biologicalSex: 'not_specified',
      heightCm: 175,
      weightKg: 75,
      targetWeightKg: null,
      activityLevel: 'moderate',
    },
    training: {
      trainingExperience: 'under_6_months',
      recentTrainingBreak: 'under_1_month',
      exerciseConfidence: 'needs_guidance',
      priorityMuscles: [],
      trainingDaysPerWeek: 3,
      availableWeekdays: [1, 3, 5],
      sessionDurationMin: 60,
      trainingLocation: 'full_gym',
      otherLocationLabel: null,
      availableEquipment: [],
      otherEquipmentLabel: null,
      hasPainOrLimitation: false,
      painAreas: [],
    },
    nutrition: {
      mealScheduleFlexibility: 'moderate',
      preferredMealsPerDay: undefined,
      preparationStyle: 'cook_some',
      budgetStyle: 'balanced',
      dietaryPattern: 'omnivore',
      dietaryPatternOtherLabel: null,
      hasDietaryRestrictions: false,
      restrictions: [],
      dislikedFoods: [],
      preferredFoods: [],
      usesSupplements: false,
      supplements: [],
    },
    routine: {
      wakeTime: '07:00',
      sleepTime: '23:00',
      routinePredictability: 'predictable',
      mealBreakAvailability: 'limited',
      preferredTrainingPeriod: 'evening',
    },
  };
}

test('mantém 16 etapas sem a rotina redundante e preserva a navegação agrupada', () => {
  const form = completeForm();
  const ids = ONBOARDING_V2_STEPS.map(({ id }) => id);

  assert.equal(ids.length, 16);
  assert.equal(ids.includes('preferred-meals-per-day' as never), false);
  assert.equal(ids.includes('meal-training-routine' as never), false);
  assert.equal(getNextOnboardingV2Step(form, 'training-experience')?.id, 'training-frequency');
  assert.equal(getNextOnboardingV2Step(form, 'pain')?.id, 'meal-schedule-flexibility');
  assert.equal(getPreviousOnboardingV2Step(form, 'meal-schedule-flexibility')?.id, 'pain');
  assert.equal(getPreviousOnboardingV2Step(form, 'dietary-pattern')?.id, 'meal-schedule-flexibility');
});

test('mantém activity_level obrigatório', () => {
  const form = completeForm();
  form.health.activityLevel = undefined;

  const result = validateOnboardingV2Step('activity-level', form);
  assert.equal(result.valid, false);
  assert.equal(result.issues[0]?.field, 'health.activityLevel');
});

test('normaliza preferred_meals_per_day ausente para null no schema 5', () => {
  const payload = buildOnboardingV2Payload(
    completeForm(),
    '00000000-0000-4000-8000-000000000001',
    { referenceDate: new Date('2026-10-18T12:00:00Z') },
  );

  assert.equal(payload.payload_schema_version, 5);
  assert.equal(payload.nutrition.preferred_meals_per_day, null);
  assert.equal(payload.health.activity_level, 'moderate');
  assert.deepEqual(payload.routine, {
    wake_time: '07:00',
    sleep_time: '23:00',
    routine_predictability: 'predictable',
    meal_break_availability: 'limited',
    preferred_training_period: 'evening',
  });
});

test('formata a data de nascimento somente para a revisão', () => {
  const form = completeForm();
  form.health.birthDate = '2005-01-31';

  assert.equal(formatBirthDateForReview(form.health.birthDate), '31/01/2005');
  assert.equal(form.health.birthDate, '2005-01-31');

  const payload = buildOnboardingV2Payload(
    form,
    '00000000-0000-4000-8000-000000000001',
    { referenceDate: new Date('2026-10-18T12:00:00Z') },
  );
  assert.equal(payload.health.birth_date, '2005-01-31');
});

test('resume dias contínuos como intervalo sem alterar os valores persistidos', () => {
  const form = completeForm();
  form.training.trainingDaysPerWeek = 6;
  form.training.availableWeekdays = [1, 2, 3, 4, 5, 6];

  assert.equal(formatWeekdaysForReview(form.training.availableWeekdays), 'Seg a Sáb');

  const payload = buildOnboardingV2Payload(
    form,
    '00000000-0000-4000-8000-000000000001',
    { referenceDate: new Date('2026-10-18T12:00:00Z') },
  );
  assert.deepEqual(payload.training.available_weekdays, [1, 2, 3, 4, 5, 6]);
});

test('mantém a lista abreviada quando os dias não são contínuos', () => {
  assert.equal(formatWeekdaysForReview([1, 3, 5]), 'Seg, Qua, Sex');
  assert.equal(formatWeekdaysForReview([2, 4, 6]), 'Ter, Qui, Sáb');
});

test('valida horários locais e permite rotina que atravessa meia-noite', () => {
  const overnight = completeForm();
  overnight.routine.wakeTime = '14:00';
  overnight.routine.sleepTime = '06:00';
  assert.equal(validateOnboardingV2Step('daily-routine', overnight).valid, true);

  overnight.routine.sleepTime = '14:00';
  assert.equal(validateOnboardingV2Step('daily-routine', overnight).valid, false);
  overnight.routine.sleepTime = '6am';
  assert.equal(validateOnboardingV2Step('daily-routine', overnight).valid, false);
});

test('valida período habitual de treino junto da frequência', () => {
  const form = completeForm();
  assert.equal(validateOnboardingV2Step('training-frequency', form).valid, true);
  form.routine.preferredTrainingPeriod = undefined;
  const result = validateOnboardingV2Step('training-frequency', form);
  assert.equal(result.valid, false);
  assert.equal(result.issues.at(-1)?.field, 'routine.preferredTrainingPeriod');
});

test('valida pausas para alimentação na etapa de rotina alimentar', () => {
  const form = completeForm();
  assert.equal(validateOnboardingV2Step('meal-schedule-flexibility', form).valid, true);
  form.routine.mealBreakAvailability = undefined;
  const result = validateOnboardingV2Step('meal-schedule-flexibility', form);
  assert.equal(result.valid, false);
  assert.equal(result.issues.at(-1)?.field, 'routine.mealBreakAvailability');
});

test('voltar e avançar preserva o contexto preenchido', () => {
  let state = createInitialOnboardingV2State();
  state = onboardingV2Reducer(state, {
    type: 'update-routine',
    changes: {
      wakeTime: '07:00',
      sleepTime: '23:00',
      routinePredictability: 'predictable',
    },
  });
  state = onboardingV2Reducer(state, { type: 'go-to-step', stepId: 'daily-routine' });
  state = onboardingV2Reducer(state, { type: 'next-step' });
  state = onboardingV2Reducer(state, { type: 'previous-step' });

  assert.equal(state.currentStepId, 'daily-routine');
  assert.equal(state.form.routine.wakeTime, '07:00');
  assert.equal(state.form.routine.sleepTime, '23:00');
});

test('restaura draft antigo de uma etapa consolidada sem perder respostas', () => {
  const form = completeForm();
  const legacyForm = { ...form };
  delete (legacyForm as Partial<OnboardingV2FormState>).routine;
  const restored = parseOnboardingV2Draft(JSON.stringify({
    version: 3,
    state: { currentStepId: 'preferred-meals-per-day', form: legacyForm },
  }));

  assert.equal(restored?.currentStepId, 'meal-schedule-flexibility');
  assert.equal(restored?.form.training.trainingDaysPerWeek, 3);
  assert.equal(restored?.form.nutrition.preferredMealsPerDay, null);
  assert.equal(restored?.form.routine.wakeTime, undefined);
});

test('draft schema 5 da etapa removida migra sem perder o contexto de rotina', () => {
  const form = completeForm();
  const restored = parseOnboardingV2Draft(JSON.stringify({
    version: 5,
    state: { currentStepId: 'meal-training-routine', form },
  }));

  assert.equal(restored?.currentStepId, 'meal-schedule-flexibility');
  assert.deepEqual(restored?.form.routine, form.routine);
});

test('novo draft começa sem preferência inventada de refeições', () => {
  assert.equal(createInitialOnboardingV2Form().nutrition.preferredMealsPerDay, null);
  assert.equal(createInitialOnboardingV2Form().routine.wakeTime, undefined);
});
