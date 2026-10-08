import assert from "node:assert/strict";
import test from "node:test";

import { buildLegacyFitnessContext, buildV22FitnessContext, type LegacyProfileRow, type V22ContextRows } from "./model.ts";
import { handleChatPost } from "../../app/api/chat/handler.ts";
import {
  FitnessRouteServiceError,
  parseGeneratedWorkouts,
  runFitnessRoutePipeline,
  runWorkoutGenerationRoute,
} from "./route-pipeline.ts";

const context = buildLegacyFitnessContext({
  nome: "Pessoa",
  onboarding_version: null,
  objetivo: "saúde",
  nivel_experiencia: "iniciante",
  dias_treino: 3,
  idade: 30,
  sexo: null,
  peso: 70,
  altura: 170,
} satisfies LegacyProfileRow);

const v22Context = buildV22FitnessContext(
  { nome: "Pessoa V2.2", onboarding_version: 2, objetivo: null, nivel_experiencia: null, dias_treino: null, idade: null, sexo: null, peso: null, altura: null },
  {
    health: { birth_date: "2000-01-01", biological_sex: "not_specified", height_cm: 170, weight_kg: 70, target_weight_kg: null, primary_goal: "conditioning" },
    training: { onboarding_payload_schema_version: 3, primary_goal: "conditioning", priority_muscles: null, training_experience: null, exercise_confidence: null, recent_training_break: null, initial_training_level: "beginner", training_days_per_week: 3, available_weekdays: null, preferred_weekdays: [1, 3], session_duration_min: null, session_duration_is_plus: null, session_duration_range: "30_45", training_location: "full_gym", other_location_label: null, available_equipment: [], other_equipment_label: null, pain_or_limitation: null, affected_body_areas: null, aerobic_practice_frequency: "regularly", aerobic_safety_limitation: false },
    nutrition: { onboarding_payload_schema_version: 3, meals_per_day: null, meal_schedule_flexibility: null, food_preparation_style: null, food_budget_style: null, available_meal_moments: ["lunch", "dinner"], food_preparation_availability: "limited", current_eating_routine: "irregular", dietary_pattern: "omnivore", dietary_pattern_other_label: null, has_food_restrictions: false, uses_supplements: false, accepts_eggs: null, accepts_dairy: null },
    activities: [{ onboarding_payload_schema_version: 3, activity_code: "walking", other_activity_label: null, schedule_type: null, available_weekdays: null, sessions_per_week: 2, duration_range: "30_45", intensity: "low" }],
    restrictions: [], dislikedFoods: [], preferredFoods: [], supplements: [],
  } satisfies V22ContextRows
);

for (const route of ["/api/chat", "/api/workouts/generate"]) {
  test(`${route}: executa assinatura, contexto e validação antes do mock OpenAI`, async () => {
    const order: string[] = [];
    let receivedPayload: unknown;

    const result = await runFitnessRoutePipeline({
      requireActiveSubscription: async () => {
        order.push("subscription");
        return { client: { kind: "mock" }, userId: "internal-id" };
      },
      loadFitnessContext: async () => {
        order.push("context");
        return context;
      },
      validate: () => {
        order.push("validation");
        return "validated";
      },
      invokeOpenAI: async (payload) => {
        order.push("openai");
        receivedPayload = payload;
        return "ok";
      },
    });

    assert.equal(result, "ok");
    assert.equal(receivedPayload, "validated");
    assert.deepEqual(order, ["subscription", "context", "validation", "openai"]);
  });

  for (const status of [401, 403] as const) {
    test(`${route}: ${status} não chama o mock OpenAI`, async () => {
      let openAICalls = 0;

      await assert.rejects(
        runFitnessRoutePipeline({
          requireActiveSubscription: async () => {
            throw Object.assign(new Error("access denied"), { status });
          },
          loadFitnessContext: async () => context,
          validate: () => "validated",
          invokeOpenAI: async () => {
            openAICalls += 1;
          },
        }),
        (error) =>
          error instanceof Error &&
          "status" in error &&
          error.status === status
      );

      assert.equal(openAICalls, 0);
    });
  }

  for (const status of [409, 503] as const) {
    test(`${route}: falha de contexto ${status} não chama o mock OpenAI`, async () => {
      let validationCalls = 0;
      let openAICalls = 0;

      await assert.rejects(
        runFitnessRoutePipeline({
          requireActiveSubscription: async () => ({
            client: { kind: "mock" },
            userId: "internal-id",
          }),
          loadFitnessContext: async () => {
            throw Object.assign(new Error("context unavailable"), { status });
          },
          validate: () => {
            validationCalls += 1;
            return "validated";
          },
          invokeOpenAI: async () => {
            openAICalls += 1;
          },
        }),
        (error) =>
          error instanceof Error &&
          "status" in error &&
          error.status === status
      );

      assert.equal(validationCalls, 0);
      assert.equal(openAICalls, 0);
    });
  }
}

test("/api/chat: handler real minimiza saudação e usa somente mocks", async () => {
  const order: string[] = [];
  let systemPrompt = "";
  const response = await handleChatPost(
    new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: "oi" }),
      headers: { "content-type": "application/json" },
    }),
    {
      requireActiveSubscription: async () => {
        order.push("auth");
        return { client: {}, userId: "internal-id" };
      },
      loadFitnessContext: async () => {
        order.push("context");
        return context;
      },
      loadHistory: async () => {
        order.push("history");
        return [];
      },
      persistUserMessage: async () => { order.push("persist-user"); },
      invokeOpenAI: async (request) => {
        order.push("openai-mock");
        systemPrompt = request.systemPrompt;
        return { content: "Olá!" };
      },
      persistCommand: async () => { order.push("persist-command"); },
      persistAssistantMessage: async () => { order.push("persist-assistant"); },
    }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(order, ["auth", "context", "history", "persist-user", "openai-mock", "persist-assistant"]);
  assert.match(systemPrompt, /BEGIN_FITNESS_JSON\n\{\}\nEND_FITNESS_JSON/);
  assert.doesNotMatch(systemPrompt, /age|heightCm|weightKg|limitations|nutrition|supplements/);
});

test("/api/chat: falha de contexto impede histórico, persistência e OpenAI", async () => {
  let downstreamCalls = 0;
  await assert.rejects(
    handleChatPost(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "treino" }),
      }),
      {
        requireActiveSubscription: async () => ({ client: {}, userId: "id" }),
        loadFitnessContext: async () => {
          throw Object.assign(new Error("invalid context"), { status: 409 });
        },
        loadHistory: async () => { downstreamCalls += 1; return []; },
        persistUserMessage: async () => { downstreamCalls += 1; },
        invokeOpenAI: async () => { downstreamCalls += 1; return { content: "x" }; },
        persistCommand: async () => { downstreamCalls += 1; },
        persistAssistantMessage: async () => { downstreamCalls += 1; },
      }
    )
  );
  assert.equal(downstreamCalls, 0);
});

function chatRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function chatDependencies(
  toolCalls: readonly {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[] = []
) {
  const commandWrites: string[] = [];
  let openAICalls = 0;
  let assistantWrites = 0;
  return {
    commandWrites,
    get openAICalls() { return openAICalls; },
    get assistantWrites() { return assistantWrites; },
    dependencies: {
      requireActiveSubscription: async () => ({ client: {}, userId: "id" }),
      loadFitnessContext: async () => context,
      loadHistory: async () => [],
      persistUserMessage: async () => {},
      invokeOpenAI: async () => {
        openAICalls += 1;
        return { content: "Resposta", toolCalls };
      },
      persistCommand: async (_access: unknown, command: { type: string }) => {
        commandWrites.push(command.type);
      },
      persistAssistantMessage: async () => { assistantWrites += 1; },
    },
  };
}

test("/api/chat aceita URLs públicas HTTP/HTTPS com path, query e IPv6", async () => {
  for (const imageUrl of [
    "https://example.com/image.jpg",
    "http://example.com/image.png",
    "https://cdn.example.com/assets/image.jpg?size=large&fit=cover",
    "https://[2606:4700:4700::1111]/image.jpg",
  ]) {
    const state = chatDependencies();
    const response = await handleChatPost(
      chatRequest({ imageUrl }),
      state.dependencies
    );
    assert.equal(response.status, 200, imageUrl);
    assert.equal(state.openAICalls, 1, imageUrl);
  }
});

test("/api/chat rejeita URLs com credenciais, hosts locais e endereços não públicos", async () => {
  for (const imageUrl of [
    "http://user:pass@example.com/a.jpg",
    "https://user@example.com/a.jpg",
    "http://localhost/a.jpg",
    "http://api.localhost/a.jpg",
    "http://device.local/a.jpg",
    "http://127.0.0.1/a.jpg",
    "http://10.0.0.1/a.jpg",
    "http://172.16.0.1/a.jpg",
    "http://192.168.1.1/a.jpg",
    "http://169.254.1.1/a.jpg",
    "http://0.0.0.1/a.jpg",
    "http://[::]/a.jpg",
    "http://[::1]/a.jpg",
    "http://[fc00::1]/a.jpg",
    "http://[fd00::1]/a.jpg",
    "http://[fe80::1]/a.jpg",
    "http://[fec0::1]/a.jpg",
    "http://[fed0::1]/a.jpg",
    "http://[ff02::1]/a.jpg",
    "http://[::ffff:127.0.0.1]/a.jpg",
    "file:///secret",
    "not a url",
  ]) {
    const state = chatDependencies();
    await assert.rejects(
      handleChatPost(chatRequest({ imageUrl }), state.dependencies),
      (error) => error instanceof Error && error.name === "ChatRequestValidationError",
      imageUrl
    );
    assert.equal(state.openAICalls, 0, imageUrl);
    assert.deepEqual(state.commandWrites, [], imageUrl);
  }
});

const validMissionToolCall = {
  id: "call-mission",
  type: "function" as const,
  function: {
    name: "salvar_missao_diaria",
    arguments: JSON.stringify({ title: "Caminhar por 20 minutos" }),
  },
};
const validWorkoutToolCall = {
  id: "call-workout",
  type: "function" as const,
  function: {
    name: "salvar_treino",
    arguments: JSON.stringify({
      title: "Treino A",
      exercises: [{ name: "Supino", sets: "4", reps: "10", rest: "60s", tip: "Controle" }],
    }),
  },
};
const unknownToolCall = {
  id: "call-unknown",
  type: "function" as const,
  function: { name: "ferramenta_desconhecida", arguments: "{}" },
};

for (const [name, toolCalls] of [
  ["válido seguido de inválido", [validMissionToolCall, unknownToolCall]],
  ["inválido seguido de válido", [unknownToolCall, validMissionToolCall]],
  ["desconhecido entre válidos", [validMissionToolCall, unknownToolCall, validWorkoutToolCall]],
  ["JSON malformado após válido", [validMissionToolCall, {
    id: "call-malformed",
    type: "function" as const,
    function: { name: "salvar_missao_diaria", arguments: "{" },
  }]],
  ["shape malformado após válido", [validMissionToolCall, {
    id: "",
    type: "function" as const,
    function: { name: "salvar_missao_diaria", arguments: "{}" },
  }]],
  ["id duplicado com payload malformado", [validMissionToolCall, {
    id: validMissionToolCall.id,
    type: "function" as const,
    function: { name: "salvar_missao_diaria", arguments: "{" },
  }]],
] as const) {
  test(`/api/chat valida o lote antes de escrever: ${name}`, async () => {
    const state = chatDependencies(toolCalls);
    await assert.rejects(
      handleChatPost(chatRequest({ message: "Monte meu plano" }), state.dependencies),
      (error) => error instanceof FitnessRouteServiceError && error.code === "INVALID_AI_RESPONSE"
    );
    assert.deepEqual(state.commandWrites, []);
    assert.equal(state.assistantWrites, 0);
  });
}

test("/api/chat persiste lote totalmente válido na ordem original", async () => {
  const state = chatDependencies([validMissionToolCall, validWorkoutToolCall]);
  const response = await handleChatPost(
    chatRequest({ message: "Monte meu plano" }),
    state.dependencies
  );
  assert.equal(response.status, 200);
  assert.deepEqual(state.commandWrites, ["daily_mission", "workout"]);
  assert.equal(state.assistantWrites, 1);
});

const validWorkoutJson = JSON.stringify({
  workouts: [{
    name: "Treino A",
    muscle_group: "Peito",
    exercises: [{
      name: "Supino",
      sets: "4",
      reps: "10",
      rest: "60s",
      tip: "Controle a descida",
    }],
  }],
});

test("/api/workouts/generate: pipeline real valida saída antes de persistir", async () => {
  const order: string[] = [];
  await runWorkoutGenerationRoute({
    requireActiveSubscription: async () => {
      order.push("auth");
      return { client: {}, userId: "internal-id" };
    },
    loadFitnessContext: async () => {
      order.push("context");
      return context;
    },
    invokeOpenAI: async (prompt) => {
      order.push("openai-mock");
      assert.doesNotMatch(prompt, /internal-id/);
      assert.doesNotMatch(prompt, /nutrition|supplement/i);
      return validWorkoutJson;
    },
    persistWorkouts: async (_access, workouts, receivedContext) => {
      order.push("persist");
      assert.equal(workouts[0].exercises[0].name, "Supino");
      assert.equal(receivedContext, context);
    },
  });
  assert.deepEqual(order, ["auth", "context", "openai-mock", "persist"]);
});

test("/api/workouts/generate: saída inválida falha fechada sem persistência", async () => {
  let persistenceCalls = 0;
  await assert.rejects(
    runWorkoutGenerationRoute({
      requireActiveSubscription: async () => ({ client: {}, userId: "id" }),
      loadFitnessContext: async () => context,
      invokeOpenAI: async () => '{"workouts":[{"name":"sem exercícios"}]}',
      persistWorkouts: async () => { persistenceCalls += 1; },
    }),
    (error) => error instanceof FitnessRouteServiceError && error.code === "INVALID_AI_RESPONSE" && error.status === 502
  );
  assert.equal(persistenceCalls, 0);
});

test("validador de workout rejeita mídia injetada no contrato", () => {
  const invalid = validWorkoutJson.replace(
    '"tip":"Controle a descida"',
    '"tip":"Controle a descida","gif_url":"https://third-party.invalid/supino.gif"'
  );
  assert.throws(
    () => parseGeneratedWorkouts(invalid),
    (error) => error instanceof FitnessRouteServiceError && error.code === "INVALID_AI_RESPONSE"
  );
});

test("/api/workouts/generate aceita FitnessContext V2.2 sem dados nutricionais", async () => {
  let receivedPrompt = "";
  await runWorkoutGenerationRoute({
    requireActiveSubscription: async () => ({ client: {}, userId: "id" }),
    loadFitnessContext: async () => v22Context,
    invokeOpenAI: async (prompt) => { receivedPrompt = prompt; return validWorkoutJson; },
    persistWorkouts: async () => {},
  });
  assert.match(receivedPrompt, /conditioning|preferredWeekdays|walking/);
  assert.doesNotMatch(receivedPrompt, /availableMealMoments|currentEatingRoutine|supplement/i);
});

test("/api/chat aceita FitnessContext V2.2 e minimiza escopo nutricional", async () => {
  let receivedPrompt = "";
  const response = await handleChatPost(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ message: "como organizar minha alimentação?" }) }), {
    requireActiveSubscription: async () => ({ client: {}, userId: "id" }),
    loadFitnessContext: async () => v22Context,
    loadHistory: async () => [], persistUserMessage: async () => {},
    invokeOpenAI: async ({ systemPrompt }) => { receivedPrompt = systemPrompt; return { content: "Resposta" }; },
    persistCommand: async () => {}, persistAssistantMessage: async () => {},
  });
  assert.equal(response.status, 200); assert.match(receivedPrompt, /currentEatingRoutine|physicalActivity|walking/);
  assert.doesNotMatch(receivedPrompt, /equipment|aerobicSafetyLimitation/);
});
