import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialOnboardingV22State, onboardingV22Reducer } from './onboarding-v22-state.ts';
import { getOnboardingV22Progress, ONBOARDING_V22_STEPS } from './onboarding-v22-steps.ts';

test('V2.2 mantém a ordem aprovada com boas-vindas e revisão explícitas', () => {
  assert.deepEqual(ONBOARDING_V22_STEPS.map(({ id }) => id), [
    'welcome', 'personal', 'goal', 'experience', 'location', 'frequency', 'preferred-days', 'duration',
    'activities', 'cardio', 'eating-routine', 'meal-moments', 'food-preparation', 'restrictions',
    'disliked-foods', 'preferred-foods', 'supplements', 'review',
  ]);
  assert.equal(ONBOARDING_V22_STEPS.some(({ id }) => id.includes('priority')), false);
});

test('state V2.2 é semanticamente separado e começa sem respostas derivadas', () => {
  const state = createInitialOnboardingV22State('Nome do perfil');
  assert.equal(state.form.identity.name, 'Nome do perfil');
  assert.deepEqual(state.form.training.activities, []);
  assert.deepEqual(state.form.training.preferredWeekdays, []);
  assert.equal('priorityMuscles' in state.form.training, false);
});

test('normalização limpa equipamentos de full_gym e labels condicionais', () => {
  let state = createInitialOnboardingV22State();
  state = onboardingV22Reducer(state, { type: 'patch-form', section: 'training', changes: { trainingLocation: 'home', availableEquipment: ['other'], otherEquipmentLabel: 'Corda' } });
  state = onboardingV22Reducer(state, { type: 'patch-form', section: 'training', changes: { trainingLocation: 'full_gym' } });
  assert.deepEqual(state.form.training.availableEquipment, []);
  assert.equal(state.form.training.otherEquipmentLabel, null);
});

test('dias preferidos não são truncados ou ligados à frequência', () => {
  let state = createInitialOnboardingV22State();
  state = onboardingV22Reducer(state, { type: 'patch-form', section: 'training', changes: { trainingDaysPerWeek: 6, preferredWeekdays: [2] } });
  assert.deepEqual(state.form.training.preferredWeekdays, [2]);
});

test('progresso inclui todos os passos e alcança revisão sem auto concluir', () => {
  const state = createInitialOnboardingV22State();
  const progress = getOnboardingV22Progress(state.form, 'review');
  assert.deepEqual(progress, { current: 18, total: 18, ratio: 1 });
});
