import assert from "node:assert/strict";
import test from "node:test";

import { AccessError } from "../../../lib/auth/access.ts";
import {
  buildLegacyFitnessContext,
  type UserFitnessContext,
} from "../../../lib/fitness-context/model.ts";
import {
  handleChatRoutePost,
  type ChatHandlerDependencies,
} from "./handler.ts";

function fitnessContext(source: "v1" | "v2_1" | "v2_2"): UserFitnessContext {
  const legacy = buildLegacyFitnessContext({
    nome: "Pessoa",
    onboarding_version: null,
    objetivo: "massa",
    nivel_experiencia: "iniciante",
    dias_treino: 3,
    idade: 30,
    sexo: null,
    peso: 70,
    altura: 170,
  });
  if (source === "v1") return legacy;
  return {
    ...legacy,
    source,
    onboardingVersion: 2,
    payloadSchemaVersion: source === "v2_1" ? 2 : 3,
  } as UserFitnessContext;
}

type Counters = {
  context: number;
  history: number;
  userWrite: number;
  openai: number;
  commandWrite: number;
  assistantWrite: number;
};

function dependencies(
  context: UserFitnessContext,
  counters: Counters,
  completion: { content: string | null; toolCalls?: never[] } = {
    content: "Resposta segura",
  }
): ChatHandlerDependencies<Record<string, never>> {
  return {
    requireActiveSubscription: async () => ({ client: {}, userId: "user-id" }),
    loadFitnessContext: async () => {
      counters.context += 1;
      return context;
    },
    loadHistory: async () => {
      counters.history += 1;
      return [];
    },
    persistUserMessage: async () => {
      counters.userWrite += 1;
    },
    invokeOpenAI: async () => {
      counters.openai += 1;
      return completion;
    },
    persistCommand: async () => {
      counters.commandWrite += 1;
    },
    persistAssistantMessage: async () => {
      counters.assistantWrite += 1;
    },
  };
}

function emptyCounters(): Counters {
  return {
    context: 0,
    history: 0,
    userWrite: 0,
    openai: 0,
    commandWrite: 0,
    assistantWrite: 0,
  };
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

for (const source of ["v1", "v2_1", "v2_2"] as const) {
  test(`Chat aceita FitnessContext ${source} e envia DTO allowlisted`, async () => {
    const counters = emptyCounters();
    let systemPrompt = "";
    const deps = dependencies(fitnessContext(source), counters);
    deps.invokeOpenAI = async (input) => {
      counters.openai += 1;
      systemPrompt = input.systemPrompt;
      return { content: "Resposta segura" };
    };

    const response = await handleChatRoutePost(
      request({ message: "Como ajustar meu treino?" }),
      deps
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(systemPrompt, /"primaryGoal":"massa"/);
    assert.doesNotMatch(systemPrompt, /user-id|onboardingVersion|payloadSchemaVersion/);
    assert.deepEqual(counters, {
      context: 1,
      history: 1,
      userWrite: 1,
      openai: 1,
      commandWrite: 0,
      assistantWrite: 1,
    });
  });
}

test("request malformado retorna 400 antes de OpenAI e persistência", async () => {
  const counters = emptyCounters();
  const response = await handleChatRoutePost(
    new Request("http://localhost/api/chat", { method: "POST", body: "{" }),
    dependencies(fitnessContext("v1"), counters)
  );
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(counters.openai, 0);
  assert.equal(counters.userWrite, 0);
});

test("URL inválida, privada ou com credenciais retorna 400", async () => {
  for (const imageUrl of [
    "file:///secret",
    "http://127.0.0.1/image.jpg",
    "http://[fc00::1]/image.jpg",
    "http://[fe80::1]/image.jpg",
    "https://user:password@example.com/image.jpg",
  ]) {
    const counters = emptyCounters();
    const response = await handleChatRoutePost(
      request({ imageUrl }),
      dependencies(fitnessContext("v1"), counters)
    );
    assert.equal(response.status, 400);
    assert.equal(counters.openai, 0);
  }
});

test("URL HTTPS pública, inclusive IPv6, permanece aceita", async () => {
  for (const imageUrl of [
    "https://example.com/image.jpg",
    "https://[2606:4700:4700::1111]/image.jpg",
  ]) {
    const counters = emptyCounters();
    const response = await handleChatRoutePost(
      request({ imageUrl }),
      dependencies(fitnessContext("v1"), counters)
    );
    assert.equal(response.status, 200);
    assert.equal(counters.openai, 1);
  }
});

for (const accessError of [
  new AccessError("UNAUTHENTICATED", 401),
  new AccessError("SUBSCRIPTION_REQUIRED", 403),
  new AccessError("ACCESS_UNAVAILABLE", 503),
]) {
  test(`gate ${accessError.status} falha fechado antes dos downstreams`, async () => {
    const counters = emptyCounters();
    const deps = dependencies(fitnessContext("v1"), counters);
    deps.requireActiveSubscription = async () => {
      throw accessError;
    };
    const response = await handleChatRoutePost(
      request({ message: "Olá" }),
      deps
    );
    assert.equal(response.status, accessError.status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(counters, emptyCounters());
  });
}

test("tool calls são todas validadas antes de qualquer persistência", async () => {
  const counters = emptyCounters();
  const deps = dependencies(fitnessContext("v1"), counters);
  deps.invokeOpenAI = async () => {
    counters.openai += 1;
    return {
      content: "não deve persistir",
      toolCalls: [
        {
          id: "call-valid",
          type: "function",
          function: {
            name: "salvar_missao_diaria",
            arguments: JSON.stringify({ title: "Caminhar por 20 minutos" }),
          },
        },
        {
          id: "call-invalid",
          type: "function",
          function: { name: "ferramenta_desconhecida", arguments: "{}" },
        },
      ],
    };
  };
  const response = await handleChatRoutePost(
    request({ message: "Monte algo" }),
    deps
  );
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(counters.commandWrite, 0);
  assert.equal(counters.assistantWrite, 0);
});
