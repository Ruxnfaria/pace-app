import assert from "node:assert/strict";
import test from "node:test";

import { auditCurrentMissionCapabilities } from "./capabilities.ts";

test("auditoria declara apenas sinais atualmente verificáveis como suportados", () => {
  const audit = auditCurrentMissionCapabilities();
  const supported = audit.filter((item) => item.supported).map((item) => item.code);
  assert.deepEqual(supported, [
    "WORKOUT_COMPLETION",
    "SCHEDULED_CARDIO_COMPLETION",
    "WORKOUT_CONSISTENCY",
  ]);
  for (const capability of audit.filter((item) => item.supported)) {
    assert.equal(capability.canVerifyServerSide, true);
    assert.ok(capability.measurementSource);
  }
  for (const capability of audit.filter((item) => !item.supported)) {
    assert.equal(capability.canVerifyServerSide, false);
    assert.ok(capability.reasonUnavailable);
  }
});

test("nutrition e progressive overload permanecem indisponíveis sem contratos reais", () => {
  const byCode = new Map(auditCurrentMissionCapabilities().map((item) => [item.code, item]));
  assert.equal(byCode.get("MEAL_LOGGING")?.reasonUnavailable, "NO_CONSUMPTION_CONTRACT");
  assert.equal(byCode.get("PROTEIN_TARGET")?.reasonUnavailable, "NO_CONSUMPTION_CONTRACT");
  assert.equal(byCode.get("CALORIE_TARGET")?.reasonUnavailable, "NO_CONSUMPTION_CONTRACT");
  assert.equal(byCode.get("PROGRESSIVE_OVERLOAD")?.reasonUnavailable, "NO_SET_LOGS");
});
