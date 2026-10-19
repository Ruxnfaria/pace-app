import { NextResponse } from "next/server";

import { AccessError, requireActiveSubscription } from "@/lib/auth/require-active-subscription";
import {
  initializePostOnboardingJobs,
  processPostOnboardingForUser,
} from "@/lib/post-onboarding/server";

const NO_STORE = { "Cache-Control": "no-store" };

function isMissingEligibleReceipt(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P0002");
}

export async function POST() {
  try {
    const { supabase, user } = await requireActiveSubscription();
    try {
      await initializePostOnboardingJobs(user.id);
    } catch (error) {
      if (!isMissingEligibleReceipt(error)) throw error;
    }
    return NextResponse.json(await processPostOnboardingForUser(supabase, user.id), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.code }, { status: error.status, headers: NO_STORE });
    }
    console.error("post_onboarding_process_failed", { code: "POST_ONBOARDING_PROCESS_FAILED" });
    return NextResponse.json({ error: "POST_ONBOARDING_PROCESS_FAILED" }, { status: 503, headers: NO_STORE });
  }
}
