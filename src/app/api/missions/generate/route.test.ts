import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test, { mock } from "node:test";

const srcRoot = new URL("../../../../", import.meta.url);
const projectRoot = new URL("../../../../../", import.meta.url);
type ResolveContext = { parentURL?: string };
type ResolveResult = { url: string; shortCircuit?: boolean };
type NextResolve = (specifier: string, context: ResolveContext) => ResolveResult;
const registerHooks = (nodeModule as unknown as {
  registerHooks(options: {
    resolve(specifier: string, context: ResolveContext, nextResolve: NextResolve): ResolveResult;
  }): void;
}).registerHooks;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return { url: new URL(`${specifier.slice(2)}.ts`, srcRoot).href, shortCircuit: true };
    }
    if (specifier === "next/server") {
      return { url: new URL("node_modules/next/server.js", projectRoot).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

let authenticated = true;
let generationError: Error | null = null;
let generationCalls = 0;

const moduleOptions = (exports: object) => ({ exports }) as unknown as Parameters<typeof mock.module>[1];
mock.module("next/server", moduleOptions({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));
mock.module("@/lib/supabase/server", moduleOptions({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: authenticated ? { id: "11111111-1111-4111-8111-111111111111" } : null },
      }),
    },
  }),
}));
mock.module("@/lib/dates/brazilDate", moduleOptions({ getBrazilDate: () => "2026-10-19" }));
mock.module("@/lib/missions/server", moduleOptions({
  generateUserDailyMissions: async (input: { authClient: unknown; userId: string; date: string }) => {
    generationCalls += 1;
    assert.deepEqual(input, {
      authClient: input.authClient,
      userId: "11111111-1111-4111-8111-111111111111",
      date: "2026-10-19",
    });
    if (generationError) throw generationError;
    return {
      algorithmVersion: "praxe-missions-v1",
      created: 2,
      selected: 2,
      materialized: 2,
      completedNow: 0,
      returnedFewerReasonCodes: ["NO_CONSUMPTION_CONTRACT"],
    };
  },
}));

let POST: typeof import("./route.ts")["POST"];
test.before(async () => {
  ({ POST } = await import("./route.ts"));
});

test("POST exige usuário autenticado antes de gerar", async () => {
  authenticated = false;
  generationCalls = 0;
  const response = await POST();
  assert.equal(response.status, 401);
  assert.equal(generationCalls, 0);
});

test("POST preserva auto-trigger e retorna seleção materializada", async () => {
  authenticated = true;
  generationError = null;
  generationCalls = 0;
  const response = await POST();
  assert.equal(response.status, 200);
  assert.equal(generationCalls, 1);
  const body = await response.json();
  assert.equal(body.algorithmVersion, "praxe-missions-v1");
  assert.equal(body.created, 2);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("POST sanitiza falha server-side", async () => {
  authenticated = true;
  generationError = new Error("secret database detail");
  const original = console.error;
  console.error = () => undefined;
  try {
    const response = await POST();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "MISSION_GENERATION_FAILED" });
  } finally {
    console.error = original;
    generationError = null;
  }
});
