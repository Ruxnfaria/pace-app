export type OnboardingFlowVersion = 'v1' | 'v2';

export type OnboardingEntryDecision =
  | { type: 'redirect'; destination: '/login' | '/blocked' | '/dashboard' }
  | { type: 'render'; flow: OnboardingFlowVersion };

export interface OnboardingEntryState {
  authenticated: boolean;
  subscriptionStatus: string | null;
  onboardingCompleted: boolean;
}

export function resolveOnboardingEntry(
  state: OnboardingEntryState,
  flow: OnboardingFlowVersion,
): OnboardingEntryDecision {
  if (!state.authenticated) return { type: 'redirect', destination: '/login' };
  if (state.subscriptionStatus !== 'ativo') {
    return { type: 'redirect', destination: '/blocked' };
  }
  if (state.onboardingCompleted) {
    return { type: 'redirect', destination: '/dashboard' };
  }
  return { type: 'render', flow };
}

export function getConfiguredOnboardingFlow(
  configuredValue = process.env.PRAXE_ONBOARDING_FLOW,
): OnboardingFlowVersion {
  return configuredValue === 'v1' ? 'v1' : 'v2';
}
