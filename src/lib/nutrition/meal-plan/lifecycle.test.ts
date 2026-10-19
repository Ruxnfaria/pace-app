import assert from "node:assert/strict";
import test from "node:test";
import { buildMealPlanIdempotencyKey, resolveMealPlanGenerationDisposition } from "./lifecycle";

test("target ativo inicia lifecycle idempotente e target em review fica bloqueado", () => {
  assert.deepEqual(resolveMealPlanGenerationDisposition({ status: "active" }), {
    jobStatus: "pending", planStatus: "pending", mayActivate: true,
  });
  assert.deepEqual(resolveMealPlanGenerationDisposition({ status: "requires_review" }), {
    jobStatus: "requires_review", planStatus: "requires_review", mayActivate: false,
  });
  const id = "8264b967-5376-4bf5-97fe-85cc145baf13";
  assert.equal(buildMealPlanIdempotencyKey(id), buildMealPlanIdempotencyKey(id));
  assert.match(buildMealPlanIdempotencyKey(id), /praxe-nutrition-goal-strategy-v1/);
});
