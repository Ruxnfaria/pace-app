import { AccessError } from "../../../lib/auth/access.ts";
import {
  FitnessContextError,
  type UserFitnessContext,
} from "../../../lib/fitness-context/model.ts";
import {
  buildChatFitnessPrompt,
  inferChatFitnessContextScope,
} from "../../../lib/fitness-context/prompt.ts";
import {
  FitnessRouteServiceError,
  runFitnessRoutePipeline,
  type FitnessRouteAccess,
} from "../../../lib/fitness-context/route-pipeline.ts";

export type StoredChatMessage = { sender: string; content: string };

export type ChatToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatCompletionResult = {
  content: string | null;
  toolCalls?: readonly ChatToolCall[];
};

export type ChatPersistenceCommand =
  | {
      type: "workout";
      title: string;
      exercises: readonly Record<string, string>[];
    }
  | {
      type: "nutrition";
      plan: {
        goal: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        meals: readonly Record<string, unknown>[];
      };
    }
  | { type: "daily_mission"; title: string };

type ChatAiRequest = {
  systemPrompt: string;
  history: readonly StoredChatMessage[];
  message: string;
  imageUrl: string;
};

export type ChatHandlerDependencies<TClient> = {
  requireActiveSubscription: () => Promise<FitnessRouteAccess<TClient>>;
  loadFitnessContext: (
    client: TClient,
    userId: string
  ) => Promise<UserFitnessContext>;
  loadHistory: (
    access: FitnessRouteAccess<TClient>
  ) => Promise<readonly StoredChatMessage[]>;
  persistUserMessage: (
    access: FitnessRouteAccess<TClient>,
    message: string
  ) => Promise<void>;
  invokeOpenAI: (request: ChatAiRequest) => Promise<ChatCompletionResult>;
  persistCommand: (
    access: FitnessRouteAccess<TClient>,
    command: ChatPersistenceCommand
  ) => Promise<void>;
  persistAssistantMessage: (
    access: FitnessRouteAccess<TClient>,
    message: string
  ) => Promise<void>;
};

export class ChatRequestValidationError extends Error {
  constructor() {
    super("INVALID_REQUEST");
    this.name = "ChatRequestValidationError";
  }
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function nonEmptyString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : null;
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname.toLowerCase();
  if (!normalized.includes(":")) return false;
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("fec") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("::ffff:")
  );
}

function optionalImageUrl(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  const raw = nonEmptyString(value, 2_048);
  if (!raw) throw new ChatRequestValidationError();

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ChatRequestValidationError();
  }

  const hostname = url.hostname.toLowerCase();
  const privateHostname =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    isPrivateIpv6(hostname) ||
    isPrivateIpv4(hostname);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    privateHostname
  ) {
    throw new ChatRequestValidationError();
  }
  return url.toString();
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(
  value: Record<string, unknown>,
  key: string,
  max = 500
): string {
  const parsed = nonEmptyString(value[key], max);
  if (!parsed) {
    throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
  }
  return parsed;
}

function numberField(value: Record<string, unknown>, key: string): number {
  const parsed = value[key];
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < 0) {
    throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
  }
  return parsed;
}

function parseCommand(toolCall: ChatToolCall): ChatPersistenceCommand {
  if (
    toolCall.type !== "function" ||
    !nonEmptyString(toolCall.id, 200) ||
    typeof toolCall.function?.arguments !== "string"
  ) {
    throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
  }

  let args: unknown;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch (error) {
    throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502, error);
  }
  const value = record(args);
  if (!value) {
    throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
  }

  if (toolCall.function.name === "salvar_treino") {
    if (
      !Array.isArray(value.exercises) ||
      value.exercises.length === 0 ||
      value.exercises.length > 40
    ) {
      throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
    }
    const exercises = value.exercises.map((item) => {
      const exercise = record(item);
      if (!exercise) {
        throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
      }
      return {
        name: stringField(exercise, "name", 160),
        sets: stringField(exercise, "sets", 40),
        reps: stringField(exercise, "reps", 80),
        rest: stringField(exercise, "rest", 80),
        tip: stringField(exercise, "tip", 500),
      };
    });
    return {
      type: "workout",
      title: stringField(value, "title", 160),
      exercises,
    };
  }

  if (toolCall.function.name === "salvar_nutricao") {
    if (
      !Array.isArray(value.meals) ||
      value.meals.length === 0 ||
      value.meals.length > 20
    ) {
      throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
    }
    const meals = value.meals.map((item) => {
      const meal = record(item);
      if (
        !meal ||
        !Array.isArray(meal.foods) ||
        meal.foods.length === 0 ||
        meal.foods.some((food) => !nonEmptyString(food, 200))
      ) {
        throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
      }
      return {
        icon: stringField(meal, "icon", 40),
        title: stringField(meal, "title", 160),
        time: stringField(meal, "time", 40),
        short: stringField(meal, "short", 500),
        foods: meal.foods.map((food) => String(food).trim()),
        protein: stringField(meal, "protein", 80),
        carbs: stringField(meal, "carbs", 80),
        fat: stringField(meal, "fat", 80),
      };
    });
    return {
      type: "nutrition",
      plan: {
        goal: stringField(value, "goal", 160),
        calories: numberField(value, "calories"),
        protein: numberField(value, "protein"),
        carbs: numberField(value, "carbs"),
        fat: numberField(value, "fat"),
        meals,
      },
    };
  }

  if (toolCall.function.name === "salvar_missao_diaria") {
    return {
      type: "daily_mission",
      title: stringField(value, "title", 200),
    };
  }

  throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
}

function buildSystemPrompt(fitnessPrompt: string): string {
  return `Você é a inteligência por trás da Mesa de Elite da Mentoria Praxe.
Você assume a postura de mentores profissionais de altíssimo nível, combinando rigor técnico, sobriedade e assertividade.

${fitnessPrompt}

DIRETRIZES ABSOLUTAS DE AUTOMAÇÃO:
- Responda de forma direta, madura e elegante, em parágrafos corridos e fluidos no chat. PROIBIDO listas por tópicos no seu texto de resposta convencional.
- Sempre que você prescrever, montar ou alterar uma rotina ou divisão de treino, use a ferramenta salvar_treino.
- Ao criar um treino ou uma dieta, crie no mínimo 3 missões diárias com salvar_missao_diaria.
- Ao planejar calorias, macros ou dieta, use salvar_nutricao.

PERSONAS DE ELITE:
1. COACH LUCAS ZANETTI (Treino e Fichas)
2. DR. GABRIEL FONTES (Nutrição e Metabolismo)`;
}

export async function handleChatPost<TClient>(
  req: Request,
  dependencies: ChatHandlerDependencies<TClient>
): Promise<Response> {
  return runFitnessRoutePipeline({
    requireActiveSubscription: dependencies.requireActiveSubscription,
    loadFitnessContext: dependencies.loadFitnessContext,
    validate: async (fitnessContext) => {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new ChatRequestValidationError();
      }
      const value = record(body);
      if (!value) throw new ChatRequestValidationError();

      const message =
        value.message === undefined || value.message === null
          ? ""
          : nonEmptyString(value.message, 10_000);
      if (message === null) throw new ChatRequestValidationError();

      const imageUrl = optionalImageUrl(value.imageUrl);
      if (!message && !imageUrl) throw new ChatRequestValidationError();

      return {
        message,
        imageUrl,
        fitnessPrompt: buildChatFitnessPrompt(
          fitnessContext,
          inferChatFitnessContextScope(message)
        ),
      };
    },
    run: async (validated, access) => {
      const savedMessage =
        validated.message || "[Enviou uma imagem de acompanhamento físico]";
      let history: readonly StoredChatMessage[];
      try {
        history = await dependencies.loadHistory(access);
        await dependencies.persistUserMessage(
          access,
          validated.imageUrl
            ? `${savedMessage} (Mídia anexada: ${validated.imageUrl})`
            : savedMessage
        );
      } catch (error) {
        throw new FitnessRouteServiceError("PERSISTENCE_FAILED", 503, error);
      }

      let completion: ChatCompletionResult;
      try {
        completion = await dependencies.invokeOpenAI({
          systemPrompt: buildSystemPrompt(validated.fitnessPrompt),
          history,
          message: validated.message,
          imageUrl: validated.imageUrl,
        });
      } catch (error) {
        if (error instanceof FitnessRouteServiceError) throw error;
        throw new FitnessRouteServiceError("AI_UNAVAILABLE", 503, error);
      }

      const seenToolCalls = new Set<string>();
      const commands: ChatPersistenceCommand[] = [];
      for (const toolCall of completion.toolCalls ?? []) {
        if (seenToolCalls.has(toolCall.id)) continue;
        seenToolCalls.add(toolCall.id);
        commands.push(parseCommand(toolCall));
      }

      for (const command of commands) {
        try {
          await dependencies.persistCommand(access, command);
        } catch (error) {
          throw new FitnessRouteServiceError("PERSISTENCE_FAILED", 503, error);
        }
      }

      const reply =
        nonEmptyString(completion.content, 50_000) ??
        "Ficha técnica montada e disponibilizada no seu painel.";
      try {
        await dependencies.persistAssistantMessage(access, reply);
      } catch (error) {
        throw new FitnessRouteServiceError("PERSISTENCE_FAILED", 503, error);
      }
      return json({ reply });
    },
  });
}

export function chatErrorResponse(error: unknown): Response {
  if (error instanceof ChatRequestValidationError) {
    return json({ error: "INVALID_REQUEST" }, 400);
  }
  if (error instanceof AccessError) {
    return json({ error: error.code }, error.status);
  }
  if (error instanceof FitnessContextError) {
    const status =
      error.code === "PROFILE_NOT_FOUND"
        ? 404
        : error.code === "READ_FAILED"
          ? 503
          : 409;
    return json({ error: error.code }, status);
  }
  if (error instanceof FitnessRouteServiceError) {
    return json({ error: error.code }, error.status);
  }
  return json({ error: "INTERNAL_ERROR" }, 500);
}

export async function handleChatRoutePost<TClient>(
  req: Request,
  dependencies: ChatHandlerDependencies<TClient>
): Promise<Response> {
  try {
    return await handleChatPost(req, dependencies);
  } catch (error) {
    return chatErrorResponse(error);
  }
}
