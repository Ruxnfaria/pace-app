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

    const now = new Date();

const today = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
].join("-");

    const missions = [
      {
        user_id: user.id,
        title: "Concluir o treino de hoje",
        description:
          "Finalize todos os exercícios de uma ficha de treino do PRAXE.",
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
          "Alcance sua meta diária de proteína definida no PRAXE.",
        category: "protein",
        target_value: 1,
        current_value: 0,
        xp_reward: 50,
        completed: false,
        for_date: today,
      },
    ];

    let createdCount = 0;

for (const mission of missions) {
      const { data: existingMission, error: checkError } = await supabase
        .from("daily_missions")
        .select("id")
        .eq("user_id", user.id)
        .eq("for_date", today)
        .eq("category", mission.category)
        .maybeSingle();
    
      if (checkError) {
        throw checkError;
      }
    
      if (!existingMission) {
        const { error: insertError } = await supabase
          .from("daily_missions")
          .insert(mission);
      
        if (insertError) {
          throw insertError;
        }
      
        createdCount += 1;
      }
    }

    return NextResponse.json({
      success: true,
      created: createdCount,
    });
  } catch (error: any) {
    console.error("[PRAXE] Erro ao gerar missões:", error);

    return NextResponse.json(
      {
        error: error?.message || "Erro interno",
      },
      { status: 500 }
    );
  }
}