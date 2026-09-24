import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginOnboardingSubmission,
  createSingleNavigation,
  finishOnboardingSubmission,
  getOnboardingSubmissionView,
  replaceWithDashboard,
  type OnboardingSubmissionPhase,
} from './onboarding-completion-navigation.ts';

for (const rpcResult of ['completed', 'replay'] as const) {
  test(`RPC ${rpcResult} inicia exatamente uma navegação final`, () => {
    let phase: OnboardingSubmissionPhase = 'idle';
    phase = beginOnboardingSubmission(phase);
    phase = finishOnboardingSubmission(true);

    const destinations: string[] = [];
    const navigateOnce = createSingleNavigation(() => {
      replaceWithDashboard({ replace: (destination) => destinations.push(String(destination)) });
    });

    assert.equal(phase, 'finalizing');
    assert.equal(navigateOnce(), true);
    assert.equal(navigateOnce(), false);
    assert.deepEqual(destinations, ['/dashboard']);
  });
}

test('erro da RPC retorna ao formulário com uma nova tentativa disponível', () => {
  const phase = finishOnboardingSubmission(false);
  const view = getOnboardingSubmissionView(phase);

  assert.equal(phase, 'idle');
  assert.equal(view.formVisible, true);
  assert.equal(beginOnboardingSubmission(phase), 'submitting');
});

test('finalização sempre apresenta feedback visível enquanto a navegação ocorre', () => {
  const view = getOnboardingSubmissionView('finalizing');

  assert.deepEqual(view, {
    formVisible: false,
    statusVisible: true,
    statusMessage: 'Finalizando seu cadastro...',
  });
});

test('double-submit permanece bloqueado durante submit e finalização', () => {
  assert.equal(beginOnboardingSubmission('submitting'), 'submitting');
  assert.equal(beginOnboardingSubmission('finalizing'), 'finalizing');
});

test('todo estado possui formulário ou status visível sem depender de timeout', () => {
  for (const phase of ['idle', 'submitting', 'finalizing'] as const) {
    const view = getOnboardingSubmissionView(phase);
    assert.equal(view.formVisible || view.statusVisible, true);
  }
});
