import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test, { mock } from "node:test";

type Scenario = {
  user: { id: string } | null;
  rpcData: unknown;
  rpcError: { code: string } | null;
  walletCrystals: number | null;
  rpcCalls: Array<{ name: string; args: object }>;
};

const srcRoot = new URL("../../../../../", import.meta.url);
const projectRoot = new URL("../../../../../../", import.meta.url);
type ResolveContext = { parentURL?: string };
type ResolveResult = { url: string; shortCircuit?: boolean };
type NextResolve = (
  specifier: string,
  context: ResolveContext,
) => ResolveResult;
const registerHooks = (nodeModule as unknown as {
  registerHooks(options: {
    resolve(
      specifier: string,
      context: ResolveContext,
      nextResolve: NextResolve,
    ): ResolveResult;
  }): void;
}).registerHooks;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return {
        url: new URL(`${specifier.slice(2)}.ts`, srcRoot).href,
        shortCircuit: true,
      };
    }
    if (specifier === "next/server") {
      return {
        url: new URL("node_modules/next/server.js", projectRoot).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

let scenario: Scenario;
const moduleOptions = (exports: object) =>
  ({ exports }) as unknown as Parameters<typeof mock.module>[1];

mock.module("next/server", moduleOptions({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

mock.module("@/lib/supabase/server", moduleOptions({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: scenario.user },
        error: scenario.user ? null : { message: "missing session" },
      }),
    },
    rpc: async (name: string, args: object) => {
      scenario.rpcCalls.push({ name, args });
      return { data: scenario.rpcData, error: scenario.rpcError };
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: scenario.walletCrystals === null
            ? null
            : { crystals: scenario.walletCrystals },
          error: null,
        }),
      };
      return query;
    },
  }),
}));

const { POST } = await import("./route.ts");
const chestId = "11111111-1111-4111-8111-111111111111";

function resetScenario() {
  scenario = {
    user: { id: "22222222-2222-4222-8222-222222222222" },
    rpcData: [{
      chest_id: chestId,
      chest_slug: "common_chest",
      chest_name: "Baú Comum",
      chest_rarity: "common",
      reward_type: "crystals",
      amount: 5,
      item_id: null,
    }],
    rpcError: null,
    walletCrystals: 25,
    rpcCalls: [],
  };
}

test("POST requires authentication", async () => {
  resetScenario();
  scenario.user = null;
  const response = await POST(new Request("http://local.test", {
    method: "POST",
    body: JSON.stringify({ chestId }),
  }));
  assert.equal(response.status, 401);
  assert.equal(scenario.rpcCalls.length, 0);
});

test("POST accepts only a chest UUID and forwards no client reward data", async () => {
  resetScenario();
  const response = await POST(new Request("http://local.test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chestId,
      userId: "attacker",
      rewardType: "energy",
      amount: 999999,
    }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(scenario.rpcCalls, [{
    name: "open_user_chest",
    args: { p_chest_id: chestId },
  }]);
  const payload = await response.json();
  assert.equal(payload.reward.amount, 5);
  assert.equal(payload.walletCrystals, 25);
});

test("POST maps ownership/not-found failures without leaking database details", async () => {
  resetScenario();
  scenario.rpcError = { code: "P0002" };
  scenario.rpcData = null;
  const response = await POST(new Request("http://local.test", {
    method: "POST",
    body: JSON.stringify({ chestId }),
  }));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Baú não encontrado" });
});
