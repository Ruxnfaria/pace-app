import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const migration = new URL(
  '../../../../supabase/migrations/20261026015609_add_reproductive_context_to_onboarding_schema5.sql',
  import.meta.url,
);

test('forward migration persists explicit reproductive context without changing schema version', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /add column pregnancy_status text/i);
  assert.match(sql, /add column lactation_status text/i);
  assert.match(sql, /update public\.user_health_profiles h[\s\S]*pregnancy_status = v_pregnancy_status[\s\S]*lactation_status = v_lactation_status/i);
  assert.match(sql, /payload_schema_version' <> '5'/i);
  assert.match(sql, /complete_onboarding_v24_internal\(v_schema4_payload\)/i);
  assert.doesNotMatch(sql, /alter table[\s\S]*alter column[\s\S]*set default/i);
});

test('migration keeps legacy rows unknown and enforces explicit safe states for new schema-5 writes', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /pregnancy_status is null[\s\S]*lactation_status is null/i);
  assert.match(sql, /pregnancy_status in \('yes', 'no', 'unknown', 'prefer_not_to_say'\)/i);
  assert.match(sql, /lactation_status in \('yes', 'no', 'unknown', 'prefer_not_to_say'\)/i);
  assert.match(sql, /pregnancy_status = 'not_applicable'[\s\S]*lactation_status = 'not_applicable'/i);
  assert.doesNotMatch(sql, /update public\.user_health_profiles[\s\S]*where pregnancy_status is null/i);
});

test('schema-5 canonical hash includes reproductive context while schema-4 delegation removes it', async () => {
  const sql = await readFile(migration, 'utf8');
  const hash = sql.indexOf("v_schema5_payload - 'idempotency_key'");
  const strip = sql.indexOf("#- '{health,pregnancy_status}'");
  assert.ok(hash >= 0 && strip > hash);
  assert.match(sql, /v_receipt\.payload_hash = v_payload_hash/i);
  assert.match(sql, /canonicalization_version = 5/i);
});
