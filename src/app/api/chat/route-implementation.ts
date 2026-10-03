import OpenAI from "openai";

import { requireActiveSubscription } from "@/lib/auth/require-active-subscription";
import type { FitnessRouteAccess } from "@/lib/fitness-context/route-pipeline";
import { getUserFitnessContext } from "@/lib/fitness-context/server";
import {
  handleChatRoutePost,
  type ChatPersistenceCommand,
} from "./handler";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "salvar_treino",
      description: "Salva uma ficha de treino estruturada.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          exercises: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" }, sets: { type: "string" },
                reps: { type: "string" }, rest: { type: "string" }, tip: { type: "string" },
              },
              required: ["name", "sets", "reps", "rest", "tip"],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "exercises"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "salvar_nutricao",
      description: "Salva o plano alimentar completo do aluno.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string" }, calories: { type: "number" },
          protein: { type: "number" }, carbs: { type: "number" }, fat: { type: "number" },
          meals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                icon: { type: "string" }, title: { type: "string" }, time: { type: "string" },
                short: { type: "string" }, foods: { type: "array", items: { type: "string" } },
                protein: { type: "string" }, carbs: { type: "string" }, fat: { type: "string" },
              },
              required: ["icon", "title", "time", "short", "foods", "protein", "carbs", "fat"],
              additionalProperties: false,
            },
          },
        },
        required: ["goal", "calories", "protein", "carbs", "fat", "meals"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "salvar_missao_diaria",
      description: "Cria uma missão diária individual.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
];

type SupabaseAccess = Awaited<ReturnType<typeof requireActiveSubscription>>["supabase"];

async function persistCommand(
  access: FitnessRouteAccess<SupabaseAccess>,
  command: ChatPersistenceCommand
): Promise<void> {
  if (command.type === "workout") {
    const { error } = await access.client.from("workouts").insert({
      user_id: access.userId,
      title: command.title,
      exercises: JSON.stringify(command.exercises),
    });
    if (error) throw error;
    return;
  }
  if (command.type === "nutrition") {
    const { error: deactivateError } = await access.client
      .from("nutrition_plans").update({ active: false }).eq("user_id", access.userId);
    if (deactivateError) throw deactivateError;
    const { error } = await access.client.from("nutrition_plans").insert({
      user_id: access.userId, ...command.plan, active: true,
    });
    if (error) throw error;
    return;
  }
  const { error } = await access.client.from("daily_missions").insert({
    user_id: access.userId, title: command.title, completed: false,
  });
  if (error) throw error;
}

export async function POST(req: Request) {
  return handleChatRoutePost(req, {
    requireActiveSubscription: async () => {
      const { supabase, user } = await requireActiveSubscription();
      return { client: supabase, userId: user.id };
    },
    loadFitnessContext: getUserFitnessContext,
    loadHistory: async (access) => {
      const { data, error } = await access.client.from("chat_messages")
        .select("sender, content").eq("user_id", access.userId)
        .order("created_at", { ascending: true }).limit(15);
      if (error) throw error;
      return (data ?? []) as Array<{ sender: string; content: string }>;
    },
    persistUserMessage: async (access, content) => {
      const { error } = await access.client.from("chat_messages").insert({
        user_id: access.userId, sender: "user", content,
      });
      if (error) throw error;
    },
    invokeOpenAI: async ({ systemPrompt, history, message, imageUrl }) => {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...history.map((item) => ({
          role: item.sender === "user" ? ("user" as const) : ("assistant" as const),
          content: item.content,
        })),
      ];
      messages.push(imageUrl ? {
        role: "user",
        content: [
          { type: "text", text: message || "Analise meus dados." },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      } : { role: "user", content: message });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", messages, tools, tool_choice: "auto", temperature: 0.5,
      });
      const response = completion.choices[0]?.message;
      if (!response) throw new Error("Empty OpenAI response");
      return {
        content: response.content,
        toolCalls: response.tool_calls
          ?.filter((call) => call.type === "function")
          .map((call) => ({ id: call.id, type: "function" as const, function: call.function })),
      };
    },
    persistCommand,
    persistAssistantMessage: async (access, content) => {
      const { error } = await access.client.from("chat_messages").insert({
        user_id: access.userId, sender: "assistant", content,
      });
      if (error) throw error;
    },
  });
}
