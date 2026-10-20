import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AUTHORIZED_TACO_STAGING_PROJECT_REF,
  assertAuthorizedTacoImportTarget,
} from "./import-guard";

const STAGING_URL = "https://fuagyujetzuzfjzhllko.supabase.co";
const PRODUCTION_REF = "fgxnynucppwmbscmzpgq";
const PRODUCTION_URL = `https://${PRODUCTION_REF}.supabase.co`;

test("staging ref and staging URL are authorized", () => {
  assert.deepEqual(assertAuthorizedTacoImportTarget(AUTHORIZED_TACO_STAGING_PROJECT_REF, STAGING_URL), {
    projectRef: AUTHORIZED_TACO_STAGING_PROJECT_REF,
    supabaseUrl: STAGING_URL,
  });
});

for (const [name, projectRef, url] of [
  ["production ref and production URL", PRODUCTION_REF, PRODUCTION_URL],
  ["other ref and matching URL", "abcdefghijklmnopqrst", "https://abcdefghijklmnopqrst.supabase.co"],
  ["staging ref and production URL", AUTHORIZED_TACO_STAGING_PROJECT_REF, PRODUCTION_URL],
  ["production ref and staging URL", PRODUCTION_REF, STAGING_URL],
  ["missing target ref", undefined, STAGING_URL],
  ["malformed Supabase URL", AUTHORIZED_TACO_STAGING_PROJECT_REF, "not-a-url"],
] as const) {
  test(`${name} fail closed`, () => {
    let remoteCallAttempted = false;
    assert.throws(() => {
      assertAuthorizedTacoImportTarget(projectRef, url);
      remoteCallAttempted = true;
    }, /UNAUTHORIZED_TACO_TARGET_PROJECT/);
    assert.equal(remoteCallAttempted, false);
  });
}

test("script authorizes the target before reading the service credential or creating a client", async () => {
  const script = await readFile(new URL("../../../../../scripts/import-taco.ts", import.meta.url), "utf8");
  const guard = script.indexOf("assertAuthorizedTacoImportTarget(");
  const credential = script.indexOf('requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY")');
  const client = script.indexOf("createClient(");
  assert.ok(guard >= 0);
  assert.ok(credential > guard);
  assert.ok(client > credential);
});
