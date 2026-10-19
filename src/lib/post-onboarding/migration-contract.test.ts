import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration = new URL("../../../supabase/migrations/20261019193825_praxe_post_onboarding_orchestrator_v1.sql", import.meta.url);

test("migration enforces unified job identity, RLS, attempts and atomic claim", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /unique\s*\(user_id, receipt_idempotency_key, artifact, algorithm_version\)/i);
  assert.match(sql, /attempt_count between 0 and 3/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /for select to authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.post_onboarding_jobs to service_role/i);
  assert.match(sql, /Artifact does not exist; ready transition refused/i);
  assert.doesNotMatch(sql, /grant (?:insert|update|delete).*authenticated/i);
});

test("migration exposes orchestration RPCs only to service_role", async () => {
  const sql = await readFile(migration, "utf8");
  for (const name of ["initialize", "claim", "finish", "defer"]) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}_post_onboarding_job(?:s)?_v1\\([^;]+to service_role`, "i"));
  }
  assert.match(sql, /payload_schema_version = 5/i);
  assert.match(sql, /canonicalization_version = 5/i);
});
