import assert from 'node:assert/strict';
import test from 'node:test';
import { createSingleFlight, getOnboardingV22AttemptKey, isOnboardingV22Attempt } from './onboarding-v22-attempt.ts';
import { getOnboardingV22DraftKey, parseOnboardingV22Draft, serializeOnboardingV22Draft } from './onboarding-v22-draft.ts';
import { createInitialOnboardingV22State } from './onboarding-v22-state.ts';
import { V22_GOAL_LABELS, V22_LOCATION_LABELS } from './onboarding-v22-copy.ts';

test('draft V2.2 round-trip preserva estado e escopo', () => {
  const state = createInitialOnboardingV22State('Ana'); state.currentStepId = 'goal';
  assert.deepEqual(parseOnboardingV22Draft(serializeOnboardingV22Draft('user-a', state), 'user-a'), state);
});
test('draft de outro usuário, V2.1 ou corrompido não hidrata', () => {
  const state = createInitialOnboardingV22State();
  assert.equal(parseOnboardingV22Draft(serializeOnboardingV22Draft('user-a', state), 'user-b'), null);
  assert.equal(parseOnboardingV22Draft(JSON.stringify({ version: 2, state }), 'user-a'), null);
  assert.equal(parseOnboardingV22Draft('{broken', 'user-a'), null);
  const corrupted = JSON.parse(serializeOnboardingV22Draft('user-a', state));
  corrupted.state.form.training.trainingLocation = 'invented';
  assert.equal(parseOnboardingV22Draft(JSON.stringify(corrupted), 'user-a'), null);
});
test('chaves de draft e tentativa são próprias, versionadas e por usuário', () => {
  assert.match(getOnboardingV22DraftKey('a'), /onboarding-v22:draft:v3/);
  assert.match(getOnboardingV22AttemptKey('a'), /onboarding-v22:attempt:v1/);
  assert.notEqual(getOnboardingV22DraftKey('a'), getOnboardingV22DraftKey('b'));
});
test('tentativa aceita UUID estável e rejeita lixo', () => {
  assert.equal(isOnboardingV22Attempt('10000000-0000-4000-8000-000000000001'), true);
  assert.equal(isOnboardingV22Attempt('old-v21-key'), false);
});
test('single-flight bloqueia submit duplicado e libera após conclusão', async () => {
  let calls = 0; let release!: () => void;
  const operation = createSingleFlight(async () => { calls += 1; await new Promise<void>((resolve) => { release = resolve; }); return calls; });
  const first = operation(); const second = operation();
  assert.equal(first, second); assert.equal(calls, 1); release(); assert.equal(await first, 1);
  const third = operation(); assert.equal(calls, 2); release(); assert.equal(await third, 2);
});
test('revisão dispõe de labels amigáveis em vez dos enums', () => {
  assert.equal(V22_GOAL_LABELS.hypertrophy, 'Ganhar massa muscular');
  assert.equal(V22_LOCATION_LABELS.simple_gym, 'Academia simples / condomínio');
});
