export const ONBOARDING_COMPLETION_DESTINATION = '/dashboard';

export type OnboardingSubmissionPhase = 'idle' | 'submitting' | 'finalizing';

export interface OnboardingSubmissionView {
  formVisible: boolean;
  statusVisible: boolean;
  statusMessage: string | null;
}

export function beginOnboardingSubmission(
  phase: OnboardingSubmissionPhase,
): OnboardingSubmissionPhase {
  return phase === 'idle' ? 'submitting' : phase;
}

export function finishOnboardingSubmission(
  succeeded: boolean,
): OnboardingSubmissionPhase {
  return succeeded ? 'finalizing' : 'idle';
}

export function getOnboardingSubmissionView(
  phase: OnboardingSubmissionPhase,
): OnboardingSubmissionView {
  if (phase === 'finalizing') {
    return {
      formVisible: false,
      statusVisible: true,
      statusMessage: 'Finalizando seu cadastro...',
    };
  }

  return {
    formVisible: true,
    statusVisible: phase === 'submitting',
    statusMessage: phase === 'submitting'
      ? 'Salvando seu cadastro. Aguarde sem fechar esta tela.'
      : null,
  };
}

export function createSingleNavigation(navigate: () => void): () => boolean {
  let started = false;

  return () => {
    if (started) return false;
    started = true;
    navigate();
    return true;
  };
}

export function replaceWithDashboard(
  location: Pick<Location, 'replace'>,
): void {
  location.replace(ONBOARDING_COMPLETION_DESTINATION);
}
