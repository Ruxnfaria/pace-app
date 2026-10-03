import assert from 'node:assert/strict';
import test from 'node:test';
import { isCompleteOnboardingV22Result } from './onboarding-v22-rpc-result.ts';

for (const result of ['completed', 'replay'] as const) test(`V2.2 reconhece resultado ${result}`, () => {
  assert.equal(isCompleteOnboardingV22Result({ result, onboarding_version: 2, completed_at: '2026-09-28T12:00:00Z' }), true);
});
test('V2.2 rejeita resposta RPC incompatível', () => assert.equal(isCompleteOnboardingV22Result({ result: 'completed', onboarding_version: 3 }), false));
