import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFoodQuantity } from "./quantity";
import { TEST_ONLY_FOOD_CATALOG, TEST_ONLY_FOOD_PORTIONS } from "./test-fixtures";

test("normaliza g, kg, ml com densidade e porção conhecida para gramas", () => {
  const solid = TEST_ONLY_FOOD_CATALOG[0];
  const liquid = TEST_ONLY_FOOD_CATALOG[2];
  assert.equal(normalizeFoodQuantity(solid, 150, "g"), 150);
  assert.equal(normalizeFoodQuantity(solid, 0.5, "kg"), 500);
  assert.equal(normalizeFoodQuantity(liquid, 200, "ml"), 206);
  assert.equal(normalizeFoodQuantity(solid, 2, "known_portion", TEST_ONLY_FOOD_PORTIONS[0]), 150);
});

test("rejeita porção desconhecida, ml sem densidade e quantidade extrema", () => {
  const solid = TEST_ONLY_FOOD_CATALOG[0];
  assert.throws(() => normalizeFoodQuantity(solid, 1, "known_portion"), { code: "UNKNOWN_PORTION" });
  assert.throws(() => normalizeFoodQuantity(solid, 100, "ml"), { code: "MISSING_DENSITY" });
  assert.throws(() => normalizeFoodQuantity(solid, 6000, "g"), { code: "IMPOSSIBLE_PORTION" });
  assert.throws(() => normalizeFoodQuantity(solid, -1, "g"), { code: "INVALID_QUANTITY" });
});
