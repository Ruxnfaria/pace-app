'use client';

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import {
  ONBOARDING_V2_DRAFT_VERSION,
  parseOnboardingV2DraftEnvelope,
  type OnboardingV2DraftEnvelope,
} from '../lib/onboarding-v2-draft';
import type { OnboardingV2State } from '../lib/onboarding-v2-types';

const DRAFT_KEY_PREFIX = 'pace:onboarding-v2:draft:v2';

export interface UseOnboardingV2DraftOptions {
  userId: string | null | undefined;
  state: OnboardingV2State;
  scopeComplete?: boolean;
  onHydrate: (state: OnboardingV2State, scopeComplete: boolean) => void;
}

export function getOnboardingV2DraftKey(userId: string): string {
  return `${DRAFT_KEY_PREFIX}:${encodeURIComponent(userId)}`;
}

export function useOnboardingV2Draft({
  userId,
  state,
  scopeComplete = false,
  onHydrate,
}: UseOnboardingV2DraftOptions): { isHydrated: boolean; clearDraft: () => void } {
  const storageKey = useMemo(
    () => (userId ? getOnboardingV2DraftKey(userId) : null),
    [userId],
  );
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const hydrate = useEffectEvent(onHydrate);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    let active = true;

    try {
      const serialized = window.sessionStorage.getItem(storageKey);
      const restored = serialized ? parseOnboardingV2DraftEnvelope(serialized) : null;
      if (restored) hydrate(restored.state, restored.scopeComplete === true);
    } catch {
      // Storage may be unavailable (privacy mode, policy, or quota). The form still works in memory.
    }

    queueMicrotask(() => {
      if (active) setHydratedKey(storageKey);
    });

    return () => {
      active = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || hydratedKey !== storageKey || typeof window === 'undefined') return;

    const envelope: OnboardingV2DraftEnvelope = {
      version: ONBOARDING_V2_DRAFT_VERSION,
      state,
      scopeComplete,
    };
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(envelope));
    } catch {
      // Draft persistence is best-effort; submission validation remains independent.
    }
  }, [hydratedKey, scopeComplete, state, storageKey]);

  const clearDraft = useCallback(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Clearing an unavailable storage area is already effectively complete.
    }
  }, [storageKey]);

  return { isHydrated: storageKey !== null && hydratedKey === storageKey, clearDraft };
}
