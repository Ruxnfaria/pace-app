import { NextResponse } from "next/server";

import { AccessError, requireActiveSubscription } from "@/lib/auth/require-active-subscription";
import { readPostOnboardingStatus } from "@/lib/post-onboarding/server";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const { supabase, user } = await requireActiveSubscription();
    return NextResponse.json(await readPostOnboardingStatus(supabase, user.id), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.code }, { status: error.status, headers: NO_STORE });
    }
    return NextResponse.json({ error: "POST_ONBOARDING_STATUS_UNAVAILABLE" }, { status: 503, headers: NO_STORE });
  }
}
