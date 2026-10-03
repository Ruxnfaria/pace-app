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

test('assinante ativo e incompleto recebe V2.1 quando a flag V2.2 está ausente', () => {
  assert.equal(getConfiguredOnboardingFlow(undefined, undefined), 'v2');
  assert.deepEqual(
    resolveOnboardingEntry(
      {
        authenticated: true,
        subscriptionStatus: 'ativo',
        onboardingCompleted: false,
      },
      getConfiguredOnboardingFlow(undefined, undefined),
    ),
    { type: 'render', flow: 'v2' },
  );
});

test('rollback server-side renderiza V1 somente para usuário incompleto elegível', () => {
  assert.equal(getConfiguredOnboardingFlow('v1', undefined), 'v1');
  assert.deepEqual(
    resolveOnboardingEntry(
      {
        authenticated: true,
        subscriptionStatus: 'ativo',
        onboardingCompleted: false,
      },
      getConfiguredOnboardingFlow('v1', undefined),
    ),
    { type: 'render', flow: 'v1' },
  );
});

test('V2.2 exige o valor server-side exato true', () => {
  assert.equal(getConfiguredOnboardingFlow(undefined, 'true'), 'v22');
  assert.deepEqual(
    resolveOnboardingEntry(
      {
        authenticated: true,
        subscriptionStatus: 'ativo',
        onboardingCompleted: false,
      },
      getConfiguredOnboardingFlow(undefined, 'true'),
    ),
    { type: 'render', flow: 'v22' },
  );
});

for (const value of ['', 'false', 'TRUE', '1', 'unexpected']) {
  test(`flag V2.2 inválida (${JSON.stringify(value)}) falha fechada para V2.1`, () => {
    assert.equal(getConfiguredOnboardingFlow(undefined, value), 'v2');
  });
}

test('rollback V1 tem prioridade mesmo se V2.2 estiver habilitado', () => {
  assert.equal(getConfiguredOnboardingFlow('v1', 'true'), 'v1');
});

for (const flow of ['v1', 'v2', 'v22'] as const) {
  test(`usuário concluído continua no dashboard com fluxo configurado ${flow}`, () => {
    assert.deepEqual(
      resolveOnboardingEntry(
        {
          authenticated: true,
          subscriptionStatus: 'ativo',
          onboardingCompleted: true,
        },
        flow,
      ),
      { type: 'redirect', destination: '/dashboard' },
    );
  });
}
