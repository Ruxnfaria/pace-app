import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFoodQuery, resolveFoodCatalogEntry } from "./normalization";
import { TEST_ONLY_FOOD_ALIASES, TEST_ONLY_FOOD_CATALOG } from "./test-fixtures";

test("normaliza acentos e resolve nome canônico exato", () => {
  assert.equal(normalizeFoodQuery("  CÉREAL,  Cozido! "), "cereal cozido");
  const result = resolveFoodCatalogEntry("Alimento teste cereal, cozido", TEST_ONLY_FOOD_CATALOG, TEST_ONLY_FOOD_ALIASES);
  assert.equal(result.status, "EXACT_MATCH");
  if (result.status === "EXACT_MATCH") assert.equal(result.entry.preparationState, "cooked");
});

test("resolve alias curado e falha fechado para alias ambíguo ou desconhecido", () => {
  assert.equal(resolveFoodCatalogEntry("cereal cozido", TEST_ONLY_FOOD_CATALOG, TEST_ONLY_FOOD_ALIASES).status, "ALIAS_MATCH");
  assert.equal(resolveFoodCatalogEntry("alimento base", TEST_ONLY_FOOD_CATALOG, TEST_ONLY_FOOD_ALIASES).status, "AMBIGUOUS");
  assert.equal(resolveFoodCatalogEntry("comida inexistente", TEST_ONLY_FOOD_CATALOG, TEST_ONLY_FOOD_ALIASES).status, "NOT_FOUND");
});

test("estado cru e cozido permanecem entradas distintas", () => {
  const cooked = resolveFoodCatalogEntry("Alimento teste cereal, cozido", TEST_ONLY_FOOD_CATALOG, []);
  const raw = resolveFoodCatalogEntry("Alimento teste cereal, cru", TEST_ONLY_FOOD_CATALOG, []);
  assert.equal(cooked.status, "EXACT_MATCH");
  assert.equal(raw.status, "EXACT_MATCH");
  if (cooked.status === "EXACT_MATCH" && raw.status === "EXACT_MATCH") {
    assert.notEqual(cooked.entry.id, raw.entry.id);
    assert.notEqual(cooked.entry.nutrientsPer100g.calories, raw.entry.nutrientsPer100g.calories);
  }
});
