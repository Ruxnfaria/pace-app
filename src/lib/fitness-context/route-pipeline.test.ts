import assert from "node:assert/strict";
import test from "node:test";

import { buildLegacyFitnessContext } from "./model.ts";
import { runFitnessRoutePipeline } from "./route-pipeline.ts";

const context = buildLegacyFitnessContext({
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

test("pipeline executa gate, contexto, validação e operação nessa ordem", async () => {
  const order: string[] = [];
  const result = await runFitnessRoutePipeline({
    requireActiveSubscription: async () => {
      order.push("access");
      return { client: {}, userId: "user-id" };
    },
    loadFitnessContext: async () => {
      order.push("context");
      return context;
    },
    validate: () => {
      order.push("validate");
      return "validated";
    },
    run: async (validated) => {
      order.push("run");
      return validated;
    },
  });

  assert.equal(result, "validated");
  assert.deepEqual(order, ["access", "context", "validate", "run"]);
});

test("pipeline rejeita no gate sem executar nenhum downstream", async () => {
  let downstreamCalls = 0;
  await assert.rejects(
    runFitnessRoutePipeline({
      requireActiveSubscription: async () => {
        throw new Error("denied");
      },
      loadFitnessContext: async () => {
        downstreamCalls += 1;
        return context;
      },
      validate: () => {
        downstreamCalls += 1;
        return "validated";
      },
      run: async () => {
        downstreamCalls += 1;
      },
    }),
    /denied/
  );
  assert.equal(downstreamCalls, 0);
});
