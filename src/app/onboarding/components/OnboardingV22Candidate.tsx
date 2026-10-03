'use client';

import { useCallback } from 'react';
import { useOnboardingV22Attempt } from '../hooks/useOnboardingV22Attempt';
import { buildOnboardingV22PayloadFromState } from '../lib/build-onboarding-v22-payload';
import { completeOnboardingV22 } from '../lib/complete-onboarding-v22';
import { replaceWithDashboard } from '../lib/onboarding-completion-navigation';
import type { OnboardingV22FormState } from '../lib/onboarding-v22-types';
import { OnboardingV22Flow, type OnboardingV22SubmitResult } from './OnboardingV22Flow';

/** Activation adapter. The server-side onboarding entry flag is its only route. */
export function OnboardingV22Candidate({ userId, initialName = '' }: { userId: string; initialName?: string }) {
  const { idempotencyKey } = useOnboardingV22Attempt(userId);
  const navigateToDashboard = useCallback(() => {
    replaceWithDashboard(window.location);
  }, []);
  const submit = useCallback(async (form: OnboardingV22FormState): Promise<OnboardingV22SubmitResult> => {
    if (!idempotencyKey) return { ok: false, message: 'Estamos preparando sua tentativa. Aguarde um instante.' };
    try {
      const outcome = await completeOnboardingV22(buildOnboardingV22PayloadFromState(form, idempotencyKey));
      if (outcome.status === 'success') return { ok: true, completion: outcome.data.result };
      if (outcome.status === 'unauthenticated') return { ok: false, message: 'Sua sessão expirou. Entre novamente antes de concluir.' };
    } catch { return { ok: false, message: 'Revise as respostas destacadas antes de concluir.' }; }
    return { ok: false, message: 'Não foi possível concluir agora. Tente novamente.' };
  }, [idempotencyKey]);
  return <OnboardingV22Flow userScope={userId} initialName={initialName} onSubmit={submit} onCompleted={navigateToDashboard} />;
}
