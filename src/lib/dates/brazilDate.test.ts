import assert from "node:assert/strict";
import test from "node:test";

import { getBrazilDate } from "./brazilDate.ts";

test("calendário Brasil respeita a virada do dia em America/Sao_Paulo", () => {
  assert.equal(getBrazilDate(new Date("2026-10-03T02:59:59.000Z")), "2026-10-02");
  assert.equal(getBrazilDate(new Date("2026-10-03T03:00:00.000Z")), "2026-10-03");
});

test("calendário Brasil não depende do timezone do processo", () => {
  assert.equal(getBrazilDate(new Date("2026-01-01T01:30:00.000Z")), "2025-12-31");
});
