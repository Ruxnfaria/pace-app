import { NextResponse, type NextRequest } from "next/server";
import { isAuthApiError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const { supabase, user, authError, response, preserveSession } = await updateSession(request);

  const invalidSession = isAuthSessionMissingError(authError) ||
    (isAuthApiError(authError) && [401, 403].includes(authError.status));
  if (authError && !invalidSession) {
    // Fail closed, but never turn an infrastructure failure into a logout.
    // Discard pending cookie writes/deletions from this failed auth attempt.
    console.error("[PRAXE] Session verification unavailable; session cookies preserved.");
    return NextResponse.json(
      { error: "session_verification_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } }
    );
  }

  const url = request.nextUrl.clone();

  if (url.pathname.startsWith("/dashboard")) {
    // 1. Precisa estar logado
    if (!user) {
      url.pathname = "/login";
      return preserveSession(NextResponse.redirect(url));
    }

    // 2. Busca assinatura + onboarding
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("status_assinatura, onboarding_completed")
      .eq("user_id", user.id)
      .single();

    if (error) {
      console.error("[PRAXE] Erro ao verificar perfil:", error);
    }

    // 3. Precisa ter assinatura ativa
    if (!profile || profile.status_assinatura !== "ativo") {
      url.pathname = "/blocked";
      return preserveSession(NextResponse.redirect(url));
    }

    // 4. Assinante novo precisa concluir onboarding
    if (!profile.onboarding_completed) {
      url.pathname = "/onboarding";
      return preserveSession(NextResponse.redirect(url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
