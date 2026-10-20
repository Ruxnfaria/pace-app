import OpenAI from "openai";
import { NextResponse } from "next/server";

import { AccessError, requireActiveSubscription } from "@/lib/auth/require-active-subscription";
import { FitnessContextError } from "@/lib/fitness-context/model";
import { FitnessRouteServiceError, runWorkoutGenerationRoute } from "@/lib/fitness-context/route-pipeline";
import { getUserFitnessContext } from "@/lib/fitness-context/server";
import {
  persistGeneratedWorkoutPlan,
  type WorkoutRpcClient,
} from "@/lib/workouts/persistence";
import { isWorkoutPersistenceV2Enabled } from "@/lib/workouts/runtime-policy";
import { buildExerciseCatalogPrompt } from "@/lib/workouts/validation/exercise-metadata";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function workoutPrompt(fitnessPrompt: string): string {
  return `Você é o Coach Lucas Zanetti, treinador de alta performance, especialista em cinesiologia e musculação da assessoria esportiva Praxe App.
Crie uma rotina semanal de musculação personalizada usando apenas o contexto necessário abaixo:
${fitnessPrompt}

Retorne somente JSON neste formato:
{
  "sessions": [{
    "session_id": "session-01",
    "session_kind": "RESISTANCE",
    "iso_weekday": 1,
    "title": "Título humano compatível com o foco prescrito",
    "exercises": [{
      "slot_id": "copie exatamente o id do requiredSlot",
      "name": "Nome do exercício",
      "sets": 3,
      "rep_min": 5,
      "rep_max": 12,
      "rest_seconds": 120,
      "tip": "Dica técnica de execução"
    }],
    "cardio": null
  }]
}

Quando a sessão tiver cardio, substitua null por um objeto que copie exatamente kind, duration_minutes, effort_method, target_rpe_min, target_rpe_max, talk_test, interval_work_seconds, interval_recovery_seconds e rounds da prescrição.
Inclua exatamente uma sessão para cada session id e exatamente um exercício para cada required slot. Copie session_kind, iso_weekday, sets, repMin/repMax e restSeconds sem alterar. Para aerobic_modality, escolha somente uma modalidade compatível do catálogo e mantenha os números sentinela prescritos.
O título deve ser curto, em português e refletir o foco real prescrito, nunca apenas Treino A/B/C. Todos os campos são obrigatórios. Não inclua links, GIFs, vídeos ou qualquer mídia de terceiros; a mídia é resolvida separadamente pelo PRAXE.

CATÁLOGO CONTROLADO DE EXERCÍCIOS — use somente canonicalName desta lista:
${buildExerciseCatalogPrompt()}`;
}

export async function POST() {
  try {
    const persistenceV2Enabled = isWorkoutPersistenceV2Enabled();
    let responsePayload: Record<string, unknown> = { success: true };
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
      onValidationAudit: (audit) => {
        console.info("workout_validation", audit);
      },
      persistWorkouts: async (access, workouts, context) => {
        const persistence = await persistGeneratedWorkoutPlan({
          persistenceV2Enabled,
          client: access.client as unknown as WorkoutRpcClient,
          workouts,
          training: context.training,
          persistLegacy: async () => {
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
        if (persistence.mode === "v2") {
          responsePayload = { success: true, persistence: "v2", ...persistence.result };
        }
      },
    });
    return NextResponse.json(
      responsePayload,
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    if (error instanceof FitnessContextError) return NextResponse.json({ error: error.code }, { status: error.code === "READ_FAILED" ? 503 : 409, headers: { "Cache-Control": "no-store" } });
    if (error instanceof FitnessRouteServiceError) return NextResponse.json({ error: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
