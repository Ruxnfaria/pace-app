import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function proxy(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl.clone();

  if (url.pathname.startsWith("/dashboard")) {
    if (!user) {
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    const emailAdmin = "ruangabrielfaria10@gmail.com";

    if (user.email === emailAdmin) {
      return NextResponse.next();
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("status_assinatura")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.status_assinatura !== "ativo") {
      url.pathname = "/blocked";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};