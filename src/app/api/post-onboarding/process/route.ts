import { NextResponse } from "next/server";

import { AccessError, requireActiveSubscription } from "@/lib/auth/require-active-subscription";
import {
  initializePostOnboardingJobs,
  processPostOnboardingForUser,
} from "@/lib/post-onboarding/server";
import { parsePostOnboardingProcessMode } from "@/lib/post-onboarding/processing-policy";

const NO_STORE = { "Cache-Control": "no-store" };

function isMissingEligibleReceipt(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P0002");
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    let mode;
    try {
      mode = parsePostOnboardingProcessMode(rawBody.trim() ? JSON.parse(rawBody) : undefined);
    } catch {
      return NextResponse.json({ error: "INVALID_PROCESS_REQUEST" }, { status: 400, headers: NO_STORE });
    }
    const { supabase, user } = await requireActiveSubscription();
    try {
      await initializePostOnboardingJobs(user.id);
    } catch (error) {
      if (!isMissingEligibleReceipt(error)) throw error;
    }
    return NextResponse.json(await processPostOnboardingForUser(supabase, user.id, mode), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.code }, { status: error.status, headers: NO_STORE });
    }
    console.error("post_onboarding_process_failed", { code: "POST_ONBOARDING_PROCESS_FAILED" });
    return NextResponse.json({ error: "POST_ONBOARDING_PROCESS_FAILED" }, { status: 503, headers: NO_STORE });
  }
}
