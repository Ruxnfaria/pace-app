import "server-only";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DatabaseMealPlanActivationRepository } from "./database-activation";
import { DatabaseMealPlanJobRepository } from "./database-jobs";
import { loadMealPlanGenerationContext } from "./context-loader";
import { generateValidatedMealPlan } from "./generator";
import { OpenAiMealPlanCandidateGenerator } from "./openai-generator";
import { DatabaseNutritionFoodCatalogRepository } from "./repository";

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("MEAL_PLAN_SERVER_CONFIGURATION_MISSING");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function generateMealPlanForUser(authClient: SupabaseClient, userId: string) {
  const context = await loadMealPlanGenerationContext(authClient, userId);
  const serverClient = serviceClient();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_CONFIGURATION_MISSING");
  return generateValidatedMealPlan({
    context,
    catalogRepository: new DatabaseNutritionFoodCatalogRepository(serverClient),
    candidateGenerator: new OpenAiMealPlanCandidateGenerator(new OpenAI({ apiKey })),
    activationRepository: new DatabaseMealPlanActivationRepository(serverClient),
    jobRepository: new DatabaseMealPlanJobRepository(serverClient),
  });
}
