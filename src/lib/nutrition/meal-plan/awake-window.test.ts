import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAwakeWindow } from "./awake-window";

test("normaliza janela acordada que cruza meia-noite", () => {
  assert.deepEqual(normalizeAwakeWindow("11:00", "03:00"), {
    wakeMinute: 660,
    sleepMinute: 1620,
    durationMinutes: 960,
    crossesMidnight: true,
  });
});

test("rejeita relógios inválidos e janelas ambíguas", () => {
  assert.throws(() => normalizeAwakeWindow("11:00", "11:00"), { code: "INVALID_CONTEXT" });
  assert.throws(() => normalizeAwakeWindow("25:00", "03:00"), { code: "INVALID_CONTEXT" });
});
