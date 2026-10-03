import "server-only";

import { isAuthApiError, isAuthSessionMissingError } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { AccessError, assertActiveSubscription } from "./access";

export { AccessError } from "./access";

export type ActiveSubscriptionAccess = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string };
};

export async function requireActiveSubscription(): Promise<ActiveSubscriptionAccess> {
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();

  if (authError) {
    const invalidSession =
      isAuthSessionMissingError(authError) ||
      (isAuthApiError(authError) && [401, 403].includes(authError.status));

    assertActiveSubscription({
      kind: invalidSession ? "unauthenticated" : "unavailable",
    });
  }

  if (!data.user) throw new AccessError("UNAUTHENTICATED", 401);

  const userId = data.user.id;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("status_assinatura")
    .eq("user_id", userId)
    .maybeSingle();

  const authorizedUserId = assertActiveSubscription(
    profileError
      ? { kind: "unavailable" }
      : {
          kind: "authenticated",
          userId,
          status: profile?.status_assinatura ?? null,
        }
  );

  return { supabase, user: { id: authorizedUserId } };
}
