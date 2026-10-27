import assert from "node:assert/strict";
import test from "node:test";

import type { NutritionFoodCatalogEntry } from "../food-catalog/domain";
import { buildMealPlanCandidateSet } from "../meal-generation/candidate-set";
import { generationContext, officialTestCatalog } from "../meal-generation/test-helpers";
import { auditFoodSuitability } from "./catalog-audit";
import { classifyFoodSuitability, stableFoodIdentityKey } from "./food-suitability";

function named(name: string, sourceFoodId: string, overrides: Partial<NutritionFoodCatalogEntry> = {}): NutritionFoodCatalogEntry {
  const base = officialTestCatalog().entries[0];
  return { ...base, id: `quality-${sourceFoodId}`, sourceFoodId, canonicalName: name,
    normalizedName: name.toLowerCase(), foodGroup: "test", nutrientsPer100g: {
      calories: 380, proteinG: 1, carbsG: 90, fatG: 1, fiberG: 1,
    }, ...overrides };
}

test("food suitability classifies culinary ingredients, sweets, powders and core foods deterministically", () => {
  const cases = [
    [named("Açúcar, cristal", "q1"), "SWEET", "OCCASIONAL", false],
    [named("Achocolatado, pó, solúvel", "q2"), "POWDER_OR_MIX", "INGREDIENT_ONLY", false],
    [named("Farinha, de babaçu", "q3"), "POWDER_OR_MIX", "INGREDIENT_ONLY", false],
    [named("Doce, de goiaba", "q4"), "SWEET", "OCCASIONAL", false],
    [named("Arroz, integral, cozido", "q5"), "COOKED_COMPONENT", "CORE", true],
  ] as const;
  for (const [entry, form, quality, approved] of cases) {
    const profile = classifyFoodSuitability(entry);
    assert.equal(profile.form, form);
    assert.equal(profile.qualityClass, quality);
    assert.equal(profile.autoGenerationApproved, approved);
    assert.equal(stableFoodIdentityKey(entry), `TACO:4_edicao_2011:${entry.sourceFoodId}`);
  }
});

test("preparation suitability rejects raw animal proteins but keeps raw fruit eligible", () => {
  const rawMeat = classifyFoodSuitability(named("Frango, peito, sem pele, cru", "raw-meat", {
    foodGroup: "poultry", preparationState: "raw",
  }));
  const rawFruit = classifyFoodSuitability(named("Banana, prata, crua", "raw-fruit", {
    foodGroup: "fruits", preparationState: "raw",
  }));
  const grilledMeat = classifyFoodSuitability(named("Frango, peito, sem pele, grelhado", "grilled-meat", {
    foodGroup: "poultry", preparationState: "grilled",
  }));
  assert.equal(rawMeat.preparedState, "REQUIRES_PREPARATION");
  assert.equal(rawMeat.autoGenerationApproved, false);
  assert.equal(rawFruit.preparedState, "RAW_READY");
  assert.equal(rawFruit.autoGenerationApproved, true);
  assert.equal(grilledMeat.preparedState, "PREPARED");
  assert.equal(grilledMeat.autoGenerationApproved, true);
});

test("food-name tokens do not confuse sweet potatoes, kale or fruit pulp with ingredients", () => {
  const sweetPotato = classifyFoodSuitability(named("Batata, doce, cozida", "sweet-potato", {
    foodGroup: "vegetables", preparationState: "cooked",
  }));
  const kale = classifyFoodSuitability(named("Couve, manteiga, refogada", "kale", {
    foodGroup: "vegetables", preparationState: "sauteed",
  }));
  const fruitPulp = classifyFoodSuitability(named("Manga, polpa, congelada", "fruit-pulp", {
    foodGroup: "fruits", preparationState: "as_described",
  }));
  assert.equal(sweetPotato.qualityClass, "CORE");
  assert.ok(sweetPotato.culinaryRoles.includes("STARCH"));
  assert.equal(kale.form, "COOKED_COMPONENT");
  assert.ok(!kale.culinaryRoles.includes("CULINARY_FAT"));
  assert.equal(fruitPulp.form, "READY_TO_EAT_FOOD");
});

test("default breakfast proteins are eggs or dairy rather than meat, poultry or fish", () => {
  const egg = classifyFoodSuitability(named("Ovo, de galinha, inteiro, cozido", "egg", {
    foodGroup: "eggs", preparationState: "cooked",
  }));
  const chicken = classifyFoodSuitability(named("Frango, peito, sem pele, grelhado", "chicken", {
    foodGroup: "poultry", preparationState: "grilled",
  }));
  assert.ok(egg.suitableMealRoles.includes("BREAKFAST"));
  assert.ok(!chicken.suitableMealRoles.includes("BREAKFAST"));
});

test("processed anchors and dehydrated culinary ingredients stay out of automatic generation", () => {
  const processed = classifyFoodSuitability(named("Presunto, sem capa de gordura", "processed", {
    foodGroup: "meats", preparationState: "as_described",
  }));
  const herb = classifyFoodSuitability(named("Coentro, folhas desidratadas", "herb", {
    foodGroup: "vegetables", preparationState: "as_described",
  }));
  const sportsFuel = classifyFoodSuitability(named("Bebida isotônica, sabores variados", "sports", {
    foodGroup: "taco:bebidas_alcoolicas_e_nao_alcoolicas", preparationState: "as_described",
  }));
  assert.equal(processed.qualityClass, "EXCLUDE_FROM_AUTOGENERATION");
  assert.equal(herb.qualityClass, "INGREDIENT_ONLY");
  assert.equal(sportsFuel.form, "SPORTS_FUEL");
});

test("popcorn remains a supporting snack instead of a default main-meal anchor", () => {
  const popcorn = classifyFoodSuitability(named("Pipoca, com óleo de soja, sem sal", "popcorn", {
    foodGroup: "cereals", preparationState: "as_described",
  }));
  assert.equal(popcorn.qualityClass, "SUPPORTING");
  assert.deepEqual(popcorn.suitableMealRoles, ["SNACK"]);
});

test("curated generation set excludes sugar, sweets and culinary powders before AI", () => {
  const catalog = officialTestCatalog();
  const unsafe = [named("Açúcar, refinado", "q10"), named("Chocolate, pó", "q11"), named("Farinha, de milho", "q12")];
  const candidates = buildMealPlanCandidateSet(generationContext(), {
    ...catalog, entries: [...catalog.entries, ...unsafe], portions: [], readiness: "CATALOG_BASE_NUTRITION_READY",
  });
  const ids = new Set(candidates.map((candidate) => candidate.catalogEntryId));
  assert.ok(unsafe.every((entry) => !ids.has(entry.id)));
  assert.ok(candidates.every((candidate) => candidate.source === "TACO" && candidate.sourceFoodId && candidate.sourceVersion));
});

test("catalog audit accounts for every supplied entry without mutating nutrients", () => {
  const entries = [...officialTestCatalog().entries, named("Açúcar, cristal", "q20"), named("Farinha, de arroz", "q21")];
  const before = structuredClone(entries.map((entry) => entry.nutrientsPer100g));
  const audit = auditFoodSuitability(entries);
  assert.equal(audit.total, entries.length);
  assert.equal(Object.values(audit.byQualityClass).reduce((sum, count) => sum + count, 0), entries.length);
  assert.equal(Object.values(audit.byForm).reduce((sum, count) => sum + count, 0), entries.length);
  assert.deepEqual(entries.map((entry) => entry.nutrientsPer100g), before);
});

test("Brazil nut remains in TACO but is excluded from automatic generation by stable source identity", () => {
  const brazilNut = officialTestCatalog().entries.find((entry) => entry.sourceFoodId === "589")!;
  const profile = classifyFoodSuitability(brazilNut);
  assert.equal(profile.specialPortionGuard, "HIGH_MICRONUTRIENT_DENSITY");
  assert.equal(profile.autoGenerationApproved, false);
});

test("prepared composite dishes are not treated as plain starches", () => {
  const bolognese = officialTestCatalog().entries.find((entry) => entry.sourceFoodId === "542")!;
  const profile = classifyFoodSuitability(bolognese);
  assert.equal(profile.form, "PREPARED_COMPOSITE");
  assert.equal(profile.autoGenerationApproved, false);
});
