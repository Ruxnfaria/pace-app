import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);

test("schema 5 onboarding only initializes jobs after the atomic writer returns", async () => {
  const source = await readFile(new URL("app/api/onboarding/complete-v2/route.ts", root), "utf8");
  const writer = source.indexOf("await completeOnboardingWithNutritionTarget");
  const initialize = source.indexOf("await initializePostOnboardingJobs");
  assert.ok(writer >= 0 && initialize > writer);
  assert.match(source, /payload\.payload_schema_version === 5/);
  assert.doesNotMatch(source.slice(0, writer), /await initializePostOnboardingJobs/);
});

test("status and process routes require active subscription and return no-store responses", async () => {
  for (const path of ["app/api/post-onboarding/status/route.ts", "app/api/post-onboarding/process/route.ts"]) {
    const source = await readFile(new URL(path, root), "utf8");
    assert.match(source, /requireActiveSubscription/);
    assert.match(source, /Cache-Control.*no-store/);
    assert.doesNotMatch(source, /error\.message|error\.stack/);
  }
});

test("process route distinguishes initial processing from explicit retry", async () => {
  const source = await readFile(new URL("app/api/post-onboarding/process/route.ts", root), "utf8");
  assert.match(source, /parsePostOnboardingProcessMode/);
  assert.match(source, /processPostOnboardingForUser\(supabase, user\.id, mode\)/);
  const hook = await readFile(new URL("hooks/usePostOnboardingStatus.ts", root), "utf8");
  assert.match(hook, /process\(false\)/);
  assert.match(hook, /process\(true\)/);
  assert.doesNotMatch(hook, /value === "pending" \|\| value === "failed_retryable"/);
});

test("daily dashboard mission generation waits for an active post-onboarding workout dependency", async () => {
  const source = await readFile(new URL("app/dashboard/page.tsx", root), "utf8");
  const statusRead = source.indexOf('fetch("/api/post-onboarding/status"');
  const missionGeneration = source.indexOf('fetch("/api/missions/generate"');
  assert.ok(statusRead >= 0 && missionGeneration > statusRead);
  assert.match(source, /!orchestration\?\.workout \|\| orchestration\.workout === "ready"/);
});

test("meal failures expose only server-calculated numeric validation diagnostics", async () => {
  const source = await readFile(new URL("lib/post-onboarding/server.ts", root), "utf8");
  assert.match(source, /result\.report\.diagnostics/);
  assert.match(source, /numeric_validation:\s*result\.report\.diagnostics/);
  assert.doesNotMatch(source, /providerResponse|rawPrompt|completion\.choices/);
});
