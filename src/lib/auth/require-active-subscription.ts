import "server-only";

import { isAuthApiError, isAuthSessionMissingError } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type ActiveSubscriptionAccess = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string };
};

export type AccessErrorCode =
  | "UNAUTHENTICATED"
  | "SUBSCRIPTION_REQUIRED"
  | "ACCESS_UNAVAILABLE";

export class AccessError extends Error {
  readonly code: AccessErrorCode;
  readonly status: 401 | 403 | 503;

  constructor(code: AccessErrorCode, status: 401 | 403 | 503) {
    super(code);
    this.name = "AccessError";
    this.code = code;
    this.status = status;
  }
}

export async function requireActiveSubscription(): Promise<ActiveSubscriptionAccess> {
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();

  if (authError) {
    const invalidSession =
      isAuthSessionMissingError(authError) ||
      (isAuthApiError(authError) && [401, 403].includes(authError.status));

    throw new AccessError(
      invalidSession ? "UNAUTHENTICATED" : "ACCESS_UNAVAILABLE",
      invalidSession ? 401 : 503
    );
  }

  if (!data.user) {
    throw new AccessError("UNAUTHENTICATED", 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("status_assinatura")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (profileError) {
    throw new AccessError("ACCESS_UNAVAILABLE", 503);
  }

  if (!profile || profile.status_assinatura !== "ativo") {
    throw new AccessError("SUBSCRIPTION_REQUIRED", 403);
  }

  return { supabase, user: { id: data.user.id } };
}
