'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getOnboardingV22AttemptKey, isOnboardingV22Attempt } from '../lib/onboarding-v22-attempt';

export function useOnboardingV22Attempt(userScope: string) {
  const storageKey = useMemo(() => getOnboardingV22AttemptKey(userScope), [userScope]);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const newKey = useCallback(() => {
    const value = crypto.randomUUID();
    setIdempotencyKey(value);
    try { sessionStorage.setItem(storageKey, value); } catch { /* stable in memory */ }
    return value;
  }, [storageKey]);
  useEffect(() => {
    let active = true;
    let value: string | null = null;
    try { value = sessionStorage.getItem(storageKey); } catch { /* create below */ }
    if (!isOnboardingV22Attempt(value)) value = crypto.randomUUID();
    try { sessionStorage.setItem(storageKey, value); } catch { /* stable in memory */ }
    queueMicrotask(() => { if (active) setIdempotencyKey(value); });
    return () => { active = false; };
  }, [storageKey]);
  return { idempotencyKey, resetAttempt: newKey };
}
