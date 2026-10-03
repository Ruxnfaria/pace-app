import assert from "node:assert/strict";
import test from "node:test";

import { AccessError, assertActiveSubscription } from "./access.ts";

function assertDenied(
  run: () => unknown,
  code: AccessError["code"],
  status: AccessError["status"]
) {
  assert.throws(
    run,
    (error) =>
      error instanceof AccessError &&
      error.code === code &&
      error.status === status
  );
}

test("gate retorna 401 para sessão ausente", () => {
  assertDenied(
    () => assertActiveSubscription({ kind: "unauthenticated" }),
    "UNAUTHENTICATED",
    401
  );
});

test("gate retorna 403 para assinatura não ativa", () => {
  assertDenied(
    () =>
      assertActiveSubscription({
        kind: "authenticated",
        userId: "user-id",
        status: "inativo",
      }),
    "SUBSCRIPTION_REQUIRED",
    403
  );
});

test("gate retorna 503 quando a infraestrutura está indisponível", () => {
  assertDenied(
    () => assertActiveSubscription({ kind: "unavailable" }),
    "ACCESS_UNAVAILABLE",
    503
  );
});

test("gate libera somente assinatura ativa", () => {
  assert.equal(
    assertActiveSubscription({
      kind: "authenticated",
      userId: "user-id",
      status: "ativo",
    }),
    "user-id"
  );
});
