import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test, { mock } from "node:test";

type MissionCategory = "workout" | "nutrition" | "protein";

type MissionRecord = {
  id: string;
  completed: boolean;
  completed_at: string | null;
};

type Scenario = {
  missions: Record<MissionCategory, MissionRecord>;
  nutritionLogs: Array<{ protein: number; logged_at: string }>;
  calls: {
    dailyChest: number;
    weeklyChest: number;
    monthlyChest: number;
    energy: number;
    streak: number;
    workoutLogReads: number;
    inserts: number;
    updates: Array<{ category: MissionCategory; values: object }>;
  };
};

const srcRoot = new URL("../../../../", import.meta.url);
const projectRoot = new URL("../../../../../", import.meta.url);
type ResolveContext = { parentURL?: string };
type ResolveResult = { url: string; shortCircuit?: boolean };
type NextResolve = (
  specifier: string,
  context: ResolveContext
) => ResolveResult;
const registerHooks = (nodeModule as unknown as {
  registerHooks(options: {
    resolve(
      specifier: string,
      context: ResolveContext,
      nextResolve: NextResolve
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

    if (specifier === "./mission-containment") {
      return {
        url: new URL(
          "./mission-containment.ts",
          context.parentURL ?? import.meta.url
        ).href,
        shortCircuit: true,
      };
    }

    return nextResolve(specifier, context);
  },
});

const actualRuntimePolicy = await import(
  "../../../../lib/workouts/runtime-policy.ts"
);

let activeScenario: Scenario;
const currentMockModuleOptions = (exports: object) =>
  ({ exports }) as unknown as Parameters<typeof mock.module>[1];

mock.module(
  "next/server",
  currentMockModuleOptions({
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
    },
  })
);

mock.module(
  "@/lib/supabase/server",
  currentMockModuleOptions({
    createClient: async () => createSupabaseStub(activeScenario),
  })
);

mock.module(
  "@/lib/gamification/streaks",
  currentMockModuleOptions({
    recordStreakActivity: async () => {
      activeScenario.calls.streak += 1;
    },
  })
);

mock.module(
  "@/lib/workouts/runtime-policy",
  currentMockModuleOptions({
    ...actualRuntimePolicy,
    isWorkoutPersistenceV2Enabled: () => true,
  })
);

mock.module(
  "@/lib/rewards/server",
  currentMockModuleOptions({
    syncDailyMissionChests: async () => {
      activeScenario.calls.dailyChest += 1;
    },
    syncWeeklyMissionChest: async () => {
      activeScenario.calls.weeklyChest += 1;
    },
    syncMonthlyMissionChest: async () => {
      activeScenario.calls.monthlyChest += 1;
    },
  })
);

const { POST } = await import("./route.ts");

function createScenario(options?: {
  completed?: Partial<Record<MissionCategory, boolean>>;
  nutritionLogs?: Scenario["nutritionLogs"];
}): Scenario {
  const completed = options?.completed ?? {};

  return {
    missions: {
      workout: {
        id: "workout-mission",
        completed: completed.workout ?? false,
        completed_at: completed.workout ? "2026-10-08T12:00:00.000Z" : null,
      },
      nutrition: {
        id: "nutrition-mission",
        completed: completed.nutrition ?? false,
        completed_at: completed.nutrition ? "2026-10-08T12:00:00.000Z" : null,
      },
      protein: {
        id: "protein-mission",
        completed: completed.protein ?? false,
        completed_at: completed.protein ? "2026-10-08T12:00:00.000Z" : null,
      },
    },
    nutritionLogs: options?.nutritionLogs ?? [],
    calls: {
      dailyChest: 0,
      weeklyChest: 0,
      monthlyChest: 0,
      energy: 0,
      streak: 0,
      workoutLogReads: 0,
      inserts: 0,
      updates: [],
    },
  };
}

function createSupabaseStub(scenario: Scenario) {
  let lastSelectedCategory: MissionCategory = "workout";

  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
        error: null,
      }),
    },
    from(table: string) {
      if (table === "workout_logs") {
        scenario.calls.workoutLogReads += 1;
      }

      if (table === "profiles") {
        scenario.calls.energy += 1;
      }

      let operation: "select" | "update" | "insert" = "select";
      let values: object = {};
      const filters = new Map<string, unknown>();

      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.set(column, value);
          if (column === "category") {
            lastSelectedCategory = value as MissionCategory;
          }
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        update(nextValues: object) {
          operation = "update";
          values = nextValues;
          return query;
        },
        insert(nextValues: object) {
          operation = "insert";
          values = nextValues;
          scenario.calls.inserts += 1;
          return query;
        },
        async maybeSingle() {
          if (table === "daily_missions" && operation === "select") {
            return { data: scenario.missions[lastSelectedCategory], error: null };
          }

          if (table === "nutrition_plans") {
            return { data: { protein: 100 }, error: null };
          }

          throw new Error(`Unexpected maybeSingle on ${table}/${operation}`);
        },
        async single() {
          throw new Error(`Unexpected single on ${table}/${operation}`);
        },
        then<TResult1 = unknown, TResult2 = never>(
          onFulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          let result: unknown;

          if (table === "nutrition_logs" && operation === "select") {
            result = { data: scenario.nutritionLogs, error: null };
          } else if (table === "daily_missions" && operation === "update") {
            scenario.calls.updates.push({
              category: lastSelectedCategory,
              values,
            });
            result = { data: null, error: null };
          } else {
            result = Promise.reject(
              new Error(`Unexpected awaited query on ${table}/${operation}`)
            );
          }

          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };

      return query;
    },
  };
}

test("POST mantém recovery final quando nutrition e protein já estavam concluídas", async () => {
  activeScenario = createScenario({
    completed: { nutrition: true, protein: true },
  });

  const response = await POST();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, created: 0 });
  assert.deepEqual(
    {
      daily: activeScenario.calls.dailyChest,
      weekly: activeScenario.calls.weeklyChest,
      monthly: activeScenario.calls.monthlyChest,
    },
    { daily: 1, weekly: 1, monthly: 1 }
  );
  assert.equal(activeScenario.calls.energy, 0);
  assert.equal(activeScenario.calls.streak, 0);
  assert.equal(activeScenario.calls.inserts, 0);
});

test("POST com workout V2 preserva containment durante recovery genérico", async () => {
  activeScenario = createScenario({
    completed: { workout: true },
  });

  const response = await POST();

  assert.equal(response.status, 200);
  assert.equal(activeScenario.calls.workoutLogReads, 0);
  assert.equal(activeScenario.calls.energy, 0);
  assert.equal(activeScenario.calls.streak, 0);
  assert.equal(activeScenario.calls.inserts, 0);
  assert.equal(
    activeScenario.calls.updates.some(({ category }) => category === "workout"),
    false
  );
  assert.deepEqual(
    {
      daily: activeScenario.calls.dailyChest,
      weekly: activeScenario.calls.weeklyChest,
      monthly: activeScenario.calls.monthlyChest,
    },
    { daily: 1, weekly: 1, monthly: 1 }
  );
});
