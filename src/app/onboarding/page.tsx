import { redirect } from 'next/navigation';
import { isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { OnboardingV1Flow } from './components/OnboardingV1Flow';
import { OnboardingV2Production } from './components/OnboardingV2Production';
import {
  getConfiguredOnboardingFlow,
  resolveOnboardingEntry,
} from './lib/onboarding-entry';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  const invalidSession = isAuthSessionMissingError(authError) ||
    (isAuthApiError(authError) && [401, 403].includes(authError.status));

  if (authError && !invalidSession) {
    console.error('[PRAXE] Onboarding session verification unavailable.');
    throw new Error('session_verification_unavailable', { cause: authError });
  }

  const user = authData.user;
  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('status_assinatura, onboarding_completed')
    .eq('user_id', user.id)
    .single();

  if (profileError) {
    console.error('[PRAXE] Unable to verify the onboarding entry profile.', {
      code: profileError.code,
      message: profileError.message,
    });
  }

  const decision = resolveOnboardingEntry(
    {
      authenticated: true,
      subscriptionStatus: profile?.status_assinatura ?? null,
      onboardingCompleted: profile?.onboarding_completed === true,
    },
    getConfiguredOnboardingFlow(),
  );

  if (decision.type === 'redirect') redirect(decision.destination);

  return decision.flow === 'v1'
    ? <OnboardingV1Flow />
    : <OnboardingV2Production userId={user.id} />;
}
