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

const { data: workoutLog, error: workoutLogError } = await supabase
  .from("workout_logs")
  .select("id")
  .eq("user_id", user.id)
  .eq("workout_date", today)
  .limit(1)
  .maybeSingle();

if (workoutLogError) {
  throw workoutLogError;
}

const workoutCompletedToday = Boolean(workoutLog);

const { data: nutritionLogs, error: nutritionLogsError } = await supabase
  .from("nutrition_logs")
  .select("protein, logged_at")
  .eq("user_id", user.id);

if (nutritionLogsError) {
  throw nutritionLogsError;
}

const todayProteinLogs = (nutritionLogs || []).filter((log) => {
  if (!log.logged_at) return false;

  const logDate = new Date(log.logged_at);

  const logDay = [
    logDate.getFullYear(),
    String(logDate.getMonth() + 1).padStart(2, "0"),
    String(logDate.getDate()).padStart(2, "0"),
  ].join("-");

  return logDay === today;
});

const mealsRegisteredToday = todayProteinLogs.length;

const nutritionCompletedToday = mealsRegisteredToday >= 3;

const totalProteinToday = todayProteinLogs.reduce(
  (sum, log) => sum + (Number(log.protein) || 0),
  0
);

const { data: activeNutritionPlan, error: nutritionPlanError } =
  await supabase
    .from("nutrition_plans")
    .select("protein")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

if (nutritionPlanError) {
  throw nutritionPlanError;
}

const proteinGoal = Number(activeNutritionPlan?.protein) || 180;

const proteinCompletedToday = totalProteinToday >= proteinGoal;

async function awardEnergy(amount: number) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("total_xp")
    .eq("user_id", user!.id)
    .single();

  if (profileError) {
    throw profileError;
  }

  const currentEnergy = Number(profile?.total_xp) || 0;

  const { error: energyError } = await supabase
    .from("profiles")
    .update({
      total_xp: currentEnergy + amount,
    })
    .eq("user_id", user!.id)

  if (energyError) {
    throw energyError;
  }
}

    const missions = [
      {
        user_id: user.id,
        title: "Concluir o treino de hoje",
        description:
          "Finalize todos os exercícios de uma ficha de treino do PRAXE.",
        category: "workout",
        target_value: 1,
        current_value: workoutCompletedToday ? 1 : 0,
        xp_reward: 50,
        completed: workoutCompletedToday,
        completed_at: workoutCompletedToday ? now.toISOString() : null,
        for_date: today,
      },
      {
        user_id: user.id,
        title: "Registrar 3 refeições hoje",
        description:
          "Registre pelo menos 3 refeições durante o dia.",
        category: "nutrition",
        target_value: 3,
        current_value: Math.min(mealsRegisteredToday, 3),
        xp_reward: 50,
        completed: nutritionCompletedToday,
        completed_at: nutritionCompletedToday ? now.toISOString() : null,
        for_date: today,
      },
      {
        user_id: user.id,
        title: "Bater sua meta de proteína",
        description:
          "Alcance sua meta diária de proteína definida no PRAXE.",
        category: "protein",
        target_value: 1,
        current_value: proteinCompletedToday ? 1 : 0,
        xp_reward: 50,
        completed: proteinCompletedToday,
        completed_at: proteinCompletedToday ? now.toISOString() : null,
        for_date: today,
      },
    ];

    let createdCount = 0;

for (const mission of missions) {
      const { data: existingMission, error: checkError } = await supabase
        .from("daily_missions")
        .select("id, completed, completed_at")
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

        if (mission.completed) {
          await awardEnergy(mission.xp_reward);
        }
      } 
      else {
        // Se a missão já foi concluída anteriormente,
        // nunca volta para incompleta e preserva o completed_at original.
        if (existingMission.completed) {
          const { error: updateError } = await supabase
            .from("daily_missions")
            .update({
              current_value: mission.current_value,
            })
            .eq("id", existingMission.id);
      
          if (updateError) {
            throw updateError;
          }
      
          continue;
        }
      
        // Detecta a transição real: incompleta -> completa.
        if (mission.completed) {
          const { data: completedNow, error: completeError } = await supabase
            .from("daily_missions")
            .update({
              current_value: mission.current_value,
              completed: true,
              completed_at: now.toISOString(),
            })
            .eq("id", existingMission.id)
            .eq("completed", false)
            .select("id")
            .maybeSingle();
      
          if (completeError) {
            throw completeError;
          }
      
          if (completedNow) {
            await awardEnergy(mission.xp_reward);
          
            console.log(
              `[PRAXE] Missão concluída agora: ${mission.category} (+${mission.xp_reward} Energia)`
            );
          }
        } else {
          const { error: progressError } = await supabase
            .from("daily_missions")
            .update({
              current_value: mission.current_value,
            })
            .eq("id", existingMission.id)
            .eq("completed", false);
      
          if (progressError) {
            throw progressError;
          }
        }
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