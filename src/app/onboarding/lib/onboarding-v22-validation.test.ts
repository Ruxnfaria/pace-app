import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOnboardingV22PayloadFromState, OnboardingV22PayloadBuildError } from './build-onboarding-v22-payload.ts';
import { completeV22Form } from './onboarding-v22-test-fixture.ts';
import { validateOnboardingV22, validateOnboardingV22Step } from './onboarding-v22-validation.ts';

const key = '10000000-0000-4000-8000-000000000001';
test('form completo V2.2 passa toda validação', () => assert.equal(validateOnboardingV22(completeV22Form(), { today: '2026-09-28' }).valid, true));

for (const [step, mutate] of [
  ['goal', (f: ReturnType<typeof completeV22Form>) => { f.health.primaryGoal = undefined; }],
  ['experience', (f: ReturnType<typeof completeV22Form>) => { f.training.initialTrainingLevel = undefined; }],
  ['frequency', (f: ReturnType<typeof completeV22Form>) => { f.training.trainingDaysPerWeek = undefined; }],
  ['duration', (f: ReturnType<typeof completeV22Form>) => { f.training.sessionDurationRange = undefined; }],
  ['cardio', (f: ReturnType<typeof completeV22Form>) => { f.training.aerobicSafetyLimitation = undefined; }],
  ['eating-routine', (f: ReturnType<typeof completeV22Form>) => { f.nutrition.currentEatingRoutine = undefined; }],
  ['meal-moments', (f: ReturnType<typeof completeV22Form>) => { f.nutrition.availableMealMoments = []; }],
  ['food-preparation', (f: ReturnType<typeof completeV22Form>) => { f.nutrition.foodPreparationAvailability = undefined; }],
] as const) test(`validação por step rejeita ${step} incompleto`, () => { const form = completeV22Form(); mutate(form); assert.equal(validateOnboardingV22Step(step, form).valid, false); });

test('aceita todos os objetivos e níveis exatos', () => {
  for (const primaryGoal of ['hypertrophy', 'fat_loss', 'conditioning'] as const) for (const initialTrainingLevel of ['beginner', 'intermediate', 'advanced'] as const) {
    const form = completeV22Form(); form.health.primaryGoal = primaryGoal; form.training.initialTrainingLevel = initialTrainingLevel;
    assert.equal(validateOnboardingV22(form, { today: '2026-09-28' }).valid, true);
  }
});

test('full_gym exige equipamentos vazios e simple_gym exige equipamento', () => {
  const full = completeV22Form(); full.training.trainingLocation = 'full_gym'; full.training.availableEquipment = [];
  assert.equal(validateOnboardingV22Step('location', full).valid, true);
  full.training.availableEquipment = ['bodyweight']; assert.equal(validateOnboardingV22Step('location', full).valid, false);
  const simple = completeV22Form(); simple.training.trainingLocation = 'simple_gym'; simple.training.availableEquipment = [];
  assert.equal(validateOnboardingV22Step('location', simple).valid, false);
});

test('other location e other equipment exigem labels próprios', () => {
  const form = completeV22Form(); form.training.trainingLocation = 'other'; form.training.otherLocationLabel = null;
  assert.equal(validateOnboardingV22Step('location', form).valid, false);
  form.training.otherLocationLabel = 'Praça'; form.training.availableEquipment = ['other']; form.training.otherEquipmentLabel = 'Corda';
  assert.equal(validateOnboardingV22Step('location', form).valid, true);
});

test('dias preferidos podem ser zero ou menos que a frequência', () => {
  const form = completeV22Form(); form.training.trainingDaysPerWeek = 6; form.training.preferredWeekdays = [];
  assert.equal(validateOnboardingV22Step('preferred-days', form).valid, true);
  form.training.preferredWeekdays = [1]; assert.equal(validateOnboardingV22Step('preferred-days', form).valid, true);
});

test('nenhuma atividade é [] e walking é aceito', () => {
  const form = completeV22Form(); form.training.activities = [];
  assert.equal(buildOnboardingV22PayloadFromState(form, key, { today: '2026-09-28' }).training.activities.length, 0);
  form.training.activities = [{ activityCode: 'walking', otherActivityLabel: null, weekdays: null, sessionsPerWeek: null, durationRange: null, intensity: null }];
  assert.equal(validateOnboardingV22Step('activities', form).valid, true);
});

test('múltiplas atividades preservam detalhes e null não coletado', () => {
  const payload = buildOnboardingV22PayloadFromState(completeV22Form(), key, { today: '2026-09-28' });
  assert.equal(payload.training.activities.length, 2);
  assert.deepEqual(payload.training.activities[0], { activity_code: 'other', other_activity_label: 'Tênis', weekdays: null, sessions_per_week: null, duration_range: null, intensity: null });
  assert.deepEqual(payload.training.activities[1].weekdays, [2, 5]);
});

test('other activity exige label e detalhes inválidos são rejeitados', () => {
  const form = completeV22Form(); const other = form.training.activities[1]; other.otherActivityLabel = null; other.sessionsPerWeek = 0;
  assert.equal(validateOnboardingV22Step('activities', form).valid, false);
});

test('cardio frequency e safety flag mapeiam somente aos dois campos', () => {
  const payload = buildOnboardingV22PayloadFromState(completeV22Form(), key, { today: '2026-09-28' });
  assert.equal(payload.training.aerobic_practice_frequency, 'sometimes');
  assert.equal(payload.training.aerobic_safety_limitation, false);
  assert.equal('clinical_notes' in payload.training, false);
  assert.equal('diagnosis' in payload.training, false);
});

test('restrições, alimentos e suplementos são normalizados deterministicamente', () => {
  const form = completeV22Form();
  form.nutrition.restrictions.push({ restriction_type: 'allergy', restriction_code: 'egg', declared_label: 'Ovo' });
  form.nutrition.dislikedFoods.push('Jiló'); form.nutrition.preferredFoods.push('Feijão');
  form.nutrition.supplements.push({ supplement_code: null, declared_label: 'Cafeína' });
  const payload = buildOnboardingV22PayloadFromState(form, key, { today: '2026-09-28' });
  assert.deepEqual(payload.nutrition.disliked_foods.map(({ declared_label }) => declared_label), ['Jiló', 'Quiabo']);
  assert.deepEqual(payload.nutrition.preferred_foods.map(({ declared_label }) => declared_label), ['Arroz', 'Feijão']);
  assert.deepEqual(payload.nutrition.supplements.map(({ declared_label }) => declared_label), ['Cafeína', 'Creatina']);
});

test('builder produz schema 3, nunca user_id nem campos V2.1', () => {
  const payload = buildOnboardingV22PayloadFromState(completeV22Form(), key, { today: '2026-09-28' });
  assert.equal(payload.payload_schema_version, 3);
  assert.equal('user_id' in payload, false);
  assert.equal('priority_muscles' in payload.training, false);
  assert.equal('meal_schedule_flexibility' in payload.nutrition, false);
});

test('builder repete preflight e rejeita estado incompleto e UUID inválido', () => {
  const incomplete = completeV22Form(); incomplete.nutrition.availableMealMoments = [];
  assert.throws(() => buildOnboardingV22PayloadFromState(incomplete, key), OnboardingV22PayloadBuildError);
  assert.throws(() => buildOnboardingV22PayloadFromState(completeV22Form(), 'invalid'), OnboardingV22PayloadBuildError);
});
