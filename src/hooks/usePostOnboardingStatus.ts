"use client";

import { useCallback, useEffect, useState } from "react";

import type { PostOnboardingStatusView } from "@/lib/post-onboarding/domain";
import { shouldAutoProcessPostOnboarding } from "@/lib/post-onboarding/processing-policy";

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

  const process = useCallback(async (retry: boolean) => {
    setProcessing(true);
    setUnavailable(false);
    try {
      const response = await fetch("/api/post-onboarding/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry }),
      });
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
          if (shouldAutoProcessPostOnboarding(current)) void process(false);
        })
        .catch(() => { if (!cancelled) setUnavailable(true); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [process, refresh]);

  const retry = useCallback(() => process(true), [process]);
  return { status, loading, processing, unavailable, retry, refresh };
}
