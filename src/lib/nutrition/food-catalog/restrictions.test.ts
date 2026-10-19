import assert from "node:assert/strict";
import test from "node:test";
import { canUseFoodForRestrictions } from "./restrictions";
import { TEST_ONLY_FOOD_CATALOG } from "./test-fixtures";

test("alergênico declarado bloqueia e metadado incompleto falha fechado", () => {
  const base = TEST_ONLY_FOOD_CATALOG[0];
  assert.deepEqual(canUseFoodForRestrictions({ ...base, allergenTags: ["contains_milk"] }, {
    dietaryPattern: "omnivore", allergenRestrictions: ["contains_milk"],
  }), { allowed: false, reason: "ALLERGY_OR_RESTRICTION_VIOLATION" });
  assert.deepEqual(canUseFoodForRestrictions({ ...base, allergenDataComplete: false }, {
    dietaryPattern: "omnivore", allergenRestrictions: ["contains_gluten"],
  }), { allowed: false, reason: "ALLERGEN_DATA_INCOMPLETE" });
});

test("padrão alimentar usa tags curadas e não inferência pelo nome", () => {
  const base = TEST_ONLY_FOOD_CATALOG[0];
  assert.deepEqual(canUseFoodForRestrictions({ ...base, dietaryTags: [] }, {
    dietaryPattern: "vegan", allergenRestrictions: [],
  }), { allowed: false, reason: "DIETARY_PATTERN_VIOLATION" });
  assert.deepEqual(canUseFoodForRestrictions(base, {
    dietaryPattern: "vegan", allergenRestrictions: [],
  }), { allowed: true });
});
