import { NextResponse } from "next/server";

import { getBrazilDate } from "@/lib/dates/brazilDate";
import { generateUserDailyMissions } from "@/lib/missions/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const result = await generateUserDailyMissions({
      authClient: supabase,
      userId: user.id,
      date: getBrazilDate(new Date()),
    });
    return NextResponse.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("[PRAXE] Erro ao gerar missões:", error);
    return NextResponse.json(
      { error: "MISSION_GENERATION_FAILED" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
