'use client';

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { getOnboardingV22DraftKey, parseOnboardingV22Draft, serializeOnboardingV22Draft } from '../lib/onboarding-v22-draft';
import type { OnboardingV22State } from '../lib/onboarding-v22-types';

export function useOnboardingV22Draft(userScope: string, state: OnboardingV22State, onHydrate: (state: OnboardingV22State) => void) {
  const key = useMemo(() => getOnboardingV22DraftKey(userScope), [userScope]);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const hydrate = useEffectEvent(onHydrate);
  useEffect(() => {
    let active = true;
    try {
      const saved = sessionStorage.getItem(key);
      const restored = saved ? parseOnboardingV22Draft(saved, userScope) : null;
      if (restored) hydrate(restored);
    } catch { /* Storage is best-effort; state remains safely in memory. */ }
    queueMicrotask(() => { if (active) setHydratedKey(key); });
    return () => { active = false; };
  }, [key, userScope]);
  useEffect(() => {
    if (hydratedKey !== key) return;
    try { sessionStorage.setItem(key, serializeOnboardingV22Draft(userScope, state)); } catch { /* no-op */ }
  }, [hydratedKey, key, state, userScope]);
  const clearDraft = useCallback(() => { try { sessionStorage.removeItem(key); } catch { /* no-op */ } }, [key]);
  return { isHydrated: hydratedKey === key, clearDraft };
}
