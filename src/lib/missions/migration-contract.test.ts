import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/20261019043144_praxe_missions_intelligence_v1.sql",
  import.meta.url,
);

test("migration cria identidade idempotente sem materializar dados", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /unique \(user_id, for_date, algorithm_version, mission_code\)/i);
  assert.match(sql, /on conflict \(user_id, for_date, algorithm_version, mission_code\) do nothing/i);
  assert.match(sql, /jsonb_array_length\(p_missions\)/i);
  assert.doesNotMatch(sql, /insert into public\.daily_missions[\s\S]*?'[0-9a-f]{8}-[0-9a-f-]{27,}'/i);
});

test("RPCs inteligentes são exclusivas de service_role", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const signature of [
    "materialize_daily_missions_v1(uuid, date, text, jsonb)",
    "sync_intelligent_mission_progress_v1(uuid, uuid, integer, boolean)",
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, "\\$&")}[\\s\\S]*?from public, anon, authenticated, service_role`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g, "\\$&")}[\\s\\S]*?to service_role`, "i"));
  }
  assert.match(sql, /Intelligent missions are server-managed/);
  assert.match(sql, /source occurrence is invalid/i);
});
