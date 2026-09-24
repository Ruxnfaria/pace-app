import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getConfiguredOnboardingFlow,
  resolveOnboardingEntry,
} from './onboarding-entry.ts';

test('sem sessão redireciona para login antes das demais guardas', () => {
  assert.deepEqual(
    resolveOnboardingEntry(
      {
        authenticated: false,
        subscriptionStatus: 'ativo',
        onboardingCompleted: false,
      },
      'v2',
    ),
    { type: 'redirect', destination: '/login' },
  );
});

test('assinatura inativa redireciona para blocked antes do onboarding', () => {
  assert.deepEqual(
    resolveOnboardingEntry(
      {
        authenticated: true,
        subscriptionStatus: 'inativo',
        onboardingCompleted: false,
      },
      'v2',
    ),
    { type: 'redirect', destination: '/blocked' },
  );
});

for (const onboardingVersion of [null, 1, 2]) {
  test(`usuário concluído vai ao dashboard sem depender da versão ${onboardingVersion}`, () => {
    assert.deepEqual(
      resolveOnboardingEntry(
        {
          authenticated: true,
          subscriptionStatus: 'ativo',
          onboardingCompleted: true,
        },
        'v2',
      ),
      { type: 'redirect', destination: '/dashboard' },
    );
  });
}

test('assinante ativo e incompleto recebe V2 por padrão', () => {
  assert.equal(getConfiguredOnboardingFlow(undefined), 'v2');
  assert.deepEqual(
    resolveOnboardingEntry(
      {
        authenticated: true,
        subscriptionStatus: 'ativo',
        onboardingCompleted: false,
      },
      getConfiguredOnboardingFlow(undefined),
    ),
    { type: 'render', flow: 'v2' },
  );
});

test('rollback server-side renderiza V1 somente para usuário incompleto elegível', () => {
  assert.equal(getConfiguredOnboardingFlow('v1'), 'v1');
  assert.deepEqual(
    resolveOnboardingEntry(
      {
        authenticated: true,
        subscriptionStatus: 'ativo',
        onboardingCompleted: false,
      },
      getConfiguredOnboardingFlow('v1'),
    ),
    { type: 'render', flow: 'v1' },
  );
});

test('valor desconhecido da flag falha de forma segura para V2', () => {
  assert.equal(getConfiguredOnboardingFlow('unexpected'), 'v2');
});
