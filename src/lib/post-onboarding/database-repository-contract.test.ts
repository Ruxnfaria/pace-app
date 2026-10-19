import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("./database-repository.ts", import.meta.url);

test("database repository delegates lifecycle transitions to atomic service-only RPCs", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_SERVICE/);
  for (const rpc of [
    "initialize_post_onboarding_jobs_v1", "claim_post_onboarding_job_v1",
    "finish_post_onboarding_job_v1", "defer_post_onboarding_job_v1",
  ]) assert.match(source, new RegExp(`rpc\\(\\"${rpc}\\"`));
  assert.match(source, /POST_ONBOARDING_MAX_ATTEMPTS/);
  assert.match(source, /POST_ONBOARDING_SAFE_ERROR_CODES/);
});
