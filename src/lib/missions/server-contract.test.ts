import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serverSource = readFileSync(new URL("./server.ts", import.meta.url), "utf8");
const workoutMigration = readFileSync(
  new URL("../../../supabase/migrations/20261004000300_add_praxe_workout_persistence.sql", import.meta.url),
  "utf8",
);

test("mission owner-scoped reads use the authenticated client and server client remains writer-only", () => {
  const contextBlock = serverSource.match(/async function buildDailyContext[\s\S]*?return \{/i)?.[0] ?? "";
  const existingBlock = serverSource.match(/loadExisting:[\s\S]*?materialize:/i)?.[0] ?? "";
  assert.match(contextBlock, /materializeMyWorkoutSchedule\(authClient/);
  assert.match(contextBlock, /authClient\s*\.from\("workout_schedule_occurrences"\)/);
  assert.match(contextBlock, /authClient\s*\.from\("workout_sessions"\)/);
  assert.match(contextBlock, /authClient\s*\.from\("daily_missions"\)/);
  assert.doesNotMatch(contextBlock, /serviceClient/);
  assert.match(existingBlock, /options\.authClient\s*\.from\("daily_missions"\)/);
  assert.doesNotMatch(existingBlock, /serviceClient\s*\.from/);
  assert.match(serverSource, /serviceClient\.rpc\("materialize_daily_missions_v1"/);
  assert.match(serverSource, /serviceClient\.rpc\("sync_intelligent_mission_progress_v1"/);
});

test("workout owner RLS remains scoped to auth.uid and service-role SELECT is not granted", () => {
  assert.match(workoutMigration, /workout_sessions_select_own[\s\S]*?\(select auth\.uid\(\)\) = user_id/i);
  assert.match(workoutMigration, /workout_schedule_occurrences_select_own[\s\S]*?\(select auth\.uid\(\)\) = user_id/i);
  assert.match(workoutMigration, /revoke all on table public\.workout_sessions from public, anon, authenticated, service_role/i);
  assert.match(workoutMigration, /grant select on table public\.workout_sessions to authenticated/i);
  assert.doesNotMatch(workoutMigration, /grant select on table public\.workout_sessions to service_role/i);
});
