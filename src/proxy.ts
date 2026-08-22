import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function proxy(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl.clone();

  if (url.pathname.startsWith("/dashboard")) {
    // 1. Precisa estar logado
    if (!user) {
      url.pathname = "/login";
      return NextResponse.redirect(url);
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
      return NextResponse.redirect(url);
    }

    // 4. Assinante novo precisa concluir onboarding
    if (!profile.onboarding_completed) {
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};