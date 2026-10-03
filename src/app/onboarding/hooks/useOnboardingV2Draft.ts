'use client';

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { ONBOARDING_V2_STEPS } from '../lib/onboarding-v2-steps';
import type { OnboardingV2State } from '../lib/onboarding-v2-types';

const DRAFT_VERSION = 2;
const DRAFT_KEY_PREFIX = 'pace:onboarding-v2:draft:v2';

interface DraftEnvelope {
  version: typeof DRAFT_VERSION;
  state: OnboardingV2State;
  scopeComplete?: boolean;
}

export interface UseOnboardingV2DraftOptions {
  userId: string | null | undefined;
  state: OnboardingV2State;
  scopeComplete?: boolean;
  onHydrate: (state: OnboardingV2State, scopeComplete: boolean) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOnboardingV2State(value: unknown): value is OnboardingV2State {
  if (!isRecord(value) || typeof value.currentStepId !== 'string' || !isRecord(value.form)) {
    return false;
  }

  const { form } = value;
  if (!isRecord(form.health) || !isRecord(form.training) || !isRecord(form.nutrition)) {
    return false;
  }

  const nutritionListsAreSafe = [
    form.nutrition.restrictions,
    form.nutrition.dislikedFoods,
    form.nutrition.preferredFoods,
    form.nutrition.supplements,
  ].every((items) => Array.isArray(items) && items.every(isRecord));

  return (
    ONBOARDING_V2_STEPS.some(({ id }) => id === value.currentStepId) &&
    Array.isArray(form.training.priorityMuscles) &&
    Array.isArray(form.training.availableWeekdays) &&
    Array.isArray(form.training.availableEquipment) &&
    Array.isArray(form.training.painAreas) &&
    nutritionListsAreSafe
  );
}

export function parseOnboardingV2Draft(serialized: string): OnboardingV2State | null {
  return parseOnboardingV2DraftEnvelope(serialized)?.state ?? null;
}

function parseOnboardingV2DraftEnvelope(serialized: string): DraftEnvelope | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value.version !== DRAFT_VERSION || !isOnboardingV2State(value.state)) {
      return null;
    }
    return {
      version: DRAFT_VERSION,
      state: value.state,
      scopeComplete: value.scopeComplete === true,
    };
  } catch {
    return null;
  }
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

    const envelope: DraftEnvelope = { version: DRAFT_VERSION, state, scopeComplete };
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
