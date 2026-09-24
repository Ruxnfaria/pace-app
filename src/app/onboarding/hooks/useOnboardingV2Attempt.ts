'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const ATTEMPT_KEY_PREFIX = 'pace:onboarding-v2:attempt:v1';

function getAttemptStorageKey(userId: string): string {
  return `${ATTEMPT_KEY_PREFIX}:${encodeURIComponent(userId)}`;
}

function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function useOnboardingV2Attempt(userId: string): {
  idempotencyKey: string | null;
  resetAttempt: () => void;
} {
  const storageKey = useMemo(() => getAttemptStorageKey(userId), [userId]);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let key = createIdempotencyKey();
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      if (saved) key = saved;
      else window.sessionStorage.setItem(storageKey, key);
    } catch {
      // The stable in-memory key still protects repeated clicks in this mounted flow.
    }
    queueMicrotask(() => {
      if (active) setIdempotencyKey(key);
    });
    return () => {
      active = false;
    };
  }, [storageKey]);

  const resetAttempt = useCallback(() => {
    const key = createIdempotencyKey();
    setIdempotencyKey(key);
    try {
      window.sessionStorage.setItem(storageKey, key);
    } catch {
      // Storage is best-effort; a new in-memory attempt is still available.
    }
  }, [storageKey]);

  return { idempotencyKey, resetAttempt };
}
