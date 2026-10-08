import OpenAI from "openai";
import { NextResponse } from "next/server";

import { AccessError, requireActiveSubscription } from "@/lib/auth/require-active-subscription";
import { FitnessContextError } from "@/lib/fitness-context/model";
import { FitnessRouteServiceError, runWorkoutGenerationRoute } from "@/lib/fitness-context/route-pipeline";
import { getUserFitnessContext } from "@/lib/fitness-context/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function workoutPrompt(fitnessPrompt: string): string {
  return `Você é o Coach Lucas Zanetti, treinador de alta performance, especialista em cinesiologia e musculação da assessoria esportiva Praxe App.
Crie uma rotina semanal de musculação personalizada usando apenas o contexto necessário abaixo:
${fitnessPrompt}

Retorne somente JSON neste formato:
{
  "workouts": [{
    "name": "Treino A",
    "muscle_group": "Grupo muscular principal",
    "exercises": [{
      "name": "Nome do exercício",
      "sets": "4",
      "reps": "10 a 12",
      "rest": "60s",
      "tip": "Dica técnica de execução"
    }]
  }]
}

Todos os campos são obrigatórios. Não inclua links, GIFs, vídeos ou qualquer mídia de terceiros; a mídia é resolvida separadamente pelo PRAXE.`;
}

export async function POST() {
  try {
    await runWorkoutGenerationRoute({
      requireActiveSubscription: async () => {
        const { supabase, user } = await requireActiveSubscription();
        return { client: supabase, userId: user.id };
      },
      loadFitnessContext: getUserFitnessContext,
      invokeOpenAI: async (fitnessPrompt) => {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: workoutPrompt(fitnessPrompt) }],
          temperature: 0.6,
          response_format: { type: "json_object" },
        });
        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error("Empty OpenAI response");
        return content;
      },
      persistWorkouts: async (access, workouts) => {
        const { error: deleteError } = await access.client
          .from("workouts")
          .delete()
          .eq("user_id", access.userId);
        if (deleteError) throw deleteError;

        for (const workout of workouts) {
          const { error } = await access.client.from("workouts").insert({
            user_id: access.userId,
            title: workout.name,
            exercises: workout.exercises,
          });
          if (error) throw error;
        }
      },
    });
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    if (error instanceof FitnessContextError) return NextResponse.json({ error: error.code }, { status: error.code === "READ_FAILED" ? 503 : 409, headers: { "Cache-Control": "no-store" } });
    if (error instanceof FitnessRouteServiceError) return NextResponse.json({ error: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
