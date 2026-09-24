'use client';

import { useCallback } from 'react';
import { useOnboardingV2Attempt } from '../hooks/useOnboardingV2Attempt';
import { buildOnboardingV2Payload } from '../lib/build-onboarding-v2-payload';
import { completeOnboardingV2 } from '../lib/complete-onboarding-v2';
import { replaceWithDashboard } from '../lib/onboarding-completion-navigation';
import type { OnboardingV2FormState } from '../lib/onboarding-v2-types';
import { OnboardingV2Flow, type OnboardingV2SubmitResult } from './OnboardingV2Flow';

export function OnboardingV2Production({ userId }: { userId: string }) {
  const { idempotencyKey } = useOnboardingV2Attempt(userId);

  const navigateToDashboard = useCallback(() => {
    replaceWithDashboard(window.location);
  }, []);

  const submit = useCallback(
    async (form: OnboardingV2FormState): Promise<OnboardingV2SubmitResult> => {
      if (!idempotencyKey) {
        return { ok: false, message: 'Estamos preparando seu cadastro. Tente novamente em instantes.' };
      }

      try {
        const payload = buildOnboardingV2Payload(form, idempotencyKey);
        const outcome = await completeOnboardingV2(payload);

        if (outcome.status === 'success') {
          return { ok: true, completion: outcome.data.result };
        }

        if (outcome.status === 'unauthenticated') {
          console.error('[PRAXE] Onboarding V2.1 submission rejected because the session is no longer valid.');
          return { ok: false, message: 'Sua sessão expirou. Entre novamente antes de concluir.' };
        }

        if (outcome.status === 'backend_error') {
          console.error('[PRAXE] complete_onboarding_v2 failed.', {
            code: outcome.code,
            message: outcome.message,
          });
        } else {
          console.error('[PRAXE] Unexpected complete_onboarding_v2 failure.', outcome.error);
        }
      } catch (error) {
        console.error('[PRAXE] Onboarding V2.1 preflight or serialization failed.', error);
        return { ok: false, message: 'Algumas respostas precisam ser revisadas antes de concluir.' };
      }

      return { ok: false, message: 'Não foi possível concluir seu cadastro agora. Tente novamente.' };
    },
    [idempotencyKey],
  );

  return (
    <OnboardingV2Flow
      draftScope={userId}
      onSubmit={submit}
      onCompleted={navigateToDashboard}
    />
  );
}
