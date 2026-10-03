export type OnboardingFlowVersion = 'v1' | 'v2' | 'v22';

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
  v22EnabledValue = process.env.PRAXE_ONBOARDING_V22_ENABLED,
): OnboardingFlowVersion {
  // Preserve the existing emergency rollback even if both flags are set.
  if (configuredValue === 'v1') return 'v1';

  // V2.2 is fail-closed: only the exact server-side value "true" enables it.
  return v22EnabledValue === 'true' ? 'v22' : 'v2';
}
