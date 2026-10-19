"use client";

import { useCallback, useEffect, useState } from "react";

import type { PostOnboardingStatusView } from "@/lib/post-onboarding/domain";

const EMPTY: PostOnboardingStatusView = { workout: null, missions: null, mealPlan: null, errors: {} };

function isView(value: unknown): value is PostOnboardingStatusView {
  return Boolean(value && typeof value === "object" && "workout" in value && "missions" in value && "mealPlan" in value);
}

export function usePostOnboardingStatus() {
  const [status, setStatus] = useState<PostOnboardingStatusView>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/post-onboarding/status", { cache: "no-store" });
    if (!response.ok) throw new Error("STATUS_UNAVAILABLE");
    const body: unknown = await response.json();
    if (!isView(body)) throw new Error("STATUS_MALFORMED");
    setStatus(body);
    return body;
  }, []);

  const process = useCallback(async () => {
    setProcessing(true);
    setUnavailable(false);
    try {
      const response = await fetch("/api/post-onboarding/process", { method: "POST" });
      if (!response.ok) throw new Error("PROCESS_UNAVAILABLE");
      const body: unknown = await response.json();
      if (!isView(body)) throw new Error("PROCESS_MALFORMED");
      setStatus(body);
    } catch {
      setUnavailable(true);
    } finally {
      setProcessing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void refresh()
        .then((current) => {
          if (cancelled) return;
          const values = [current.workout, current.missions, current.mealPlan];
          if (values.every((value) => value === null)
            || values.some((value) => value === "pending" || value === "failed_retryable")) {
            void process();
          }
        })
        .catch(() => { if (!cancelled) setUnavailable(true); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [process, refresh]);

  return { status, loading, processing, unavailable, retry: process, refresh };
}
