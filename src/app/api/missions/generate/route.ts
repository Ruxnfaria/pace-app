import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401 }
      );
    }

    const today = new Date().toISOString().split("T")[0];

    // Evita duplicar missões do mesmo dia
    const { data: existingMissions, error: existingError } =
      await supabase
        .from("daily_missions")
        .select("id")
        .eq("user_id", user.id)
        .eq("for_date", today);

    if (existingError) {
      throw existingError;
    }

    if (existingMissions && existingMissions.length > 0) {
      return NextResponse.json({
        success: true,
        alreadyExists: true,
      });
    }

    const missions = [
      {
        user_id: user.id,
        title: "Concluir o treino de hoje",
        description:
          "Finalize todos os exercícios de uma ficha de treino do PACE.",
        category: "workout",
        target_value: 1,
        current_value: 0,
        xp_reward: 50,
        completed: false,
        for_date: today,
      },
      {
        user_id: user.id,
        title: "Registrar 3 refeições hoje",
        description:
          "Registre pelo menos 3 refeições durante o dia.",
        category: "nutrition",
        target_value: 3,
        current_value: 0,
        xp_reward: 50,
        completed: false,
        for_date: today,
      },
      {
        user_id: user.id,
        title: "Bater sua meta de proteína",
        description:
          "Alcance sua meta diária de proteína definida no PACE.",
        category: "protein",
        target_value: 1,
        current_value: 0,
        xp_reward: 50,
        completed: false,
        for_date: today,
      },
    ];

    const { error: insertError } = await supabase
      .from("daily_missions")
      .insert(missions);

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      success: true,
      created: missions.length,
    });
  } catch (error: any) {
    console.error("[PACE] Erro ao gerar missões:", error);

    return NextResponse.json(
      {
        error: error?.message || "Erro interno",
      },
      { status: 500 }
    );
  }
}