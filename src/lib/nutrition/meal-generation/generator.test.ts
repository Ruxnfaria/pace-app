import assert from "node:assert/strict";
import test from "node:test";
import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import { validateDailyMealQuality } from "../meal-quality/daily-quality";
import { validatePortionRealism } from "../meal-quality/portion-realism";
import { InMemoryNutritionFoodCatalogRepository } from "./repository";
import { buildMealPlanGenerationIdempotencyKey, buildMealPlanPromptContext, generateValidatedMealPlan, type MealPlanCandidateGenerator } from "./generator";
import type { AiMealPlanCandidate, MealPlanCatalogPromptContext } from "./domain";
import { validateDailyMealBlueprint } from "./daily-blueprint/validator";
import { calibrateMealPlanPortions } from "./portion-calibration";
import { validateRealMealTemplates } from "./real-meal-templates/validator";
import { balancedCandidate, generationContext, officialTestCatalog } from "./test-helpers";
import { validateMealPlanCandidate } from "./validator";

function cloneCandidate<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function exact2500RuntimeFixture(entries = officialTestCatalog().entries) {
  const base = { entries, aliases: [] };
  const catalog = { ...base, portions: [], readiness: assessTrustedNutritionCatalog(entries).level };
  const roles = ["BREAKFAST", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"] as const;
  const context = generationContext("hypertrophy", [...roles]);
  context.trainingPeriod = "evening";
  context.target = { status: "active", calories: 2500, proteinG: 110, carbsG: 359.75, fatG: 69, fiberG: 35 };
  context.mealMacroTargets = roles.map((role, index) => ({ position: index + 1, role,
    calories: 625, proteinG: 27.5, carbsG: 89.9375, fatG: 17.25, fiberG: 8.75 }));
  const prompt = buildMealPlanPromptContext(context, catalog);
  const recipeIds = ["FRENCH_BREAD_BOILED_EGGS_BANANA", "FRENCH_BREAD_MINAS_CHEESE_BANANA",
    "RICE_BEANS_BEEF_BROCCOLI", "YOGURT_OATS_BANANA"];
  const initialQuantities: Array<Record<string, number>> = [
    { BREAD: 140, EGGS: 100, FRUIT: 130 },
    { BREAD: 140, CHEESE: 70, FRUIT: 130 },
    { RICE: 300, BEANS: 100, PROTEIN: 70, VEGETABLES: 150 },
    { YOGURT: 200, OATS: 70, FRUIT: 130 },
  ];
  const candidate = { meals: recipeIds.map((recipeId, index) => {
    const recipe = prompt.recipeSlots[index].options.find((value) => value.recipeId === recipeId)!;
    return {
      role: roles[index], templateId: recipe.templateId, variantId: recipe.templateVariantId,
      recipeId: recipe.recipeId, recipeVersion: recipe.recipeVersion, recipeFamilyId: recipe.recipeFamilyId,
      recipeVariantId: recipe.recipeVariantId, label: recipe.recipeDisplayName,
      items: recipe.components.filter((component) => component.required).map((component) => ({
        componentId: component.componentId,
        slot: component.slot,
        catalogEntryId: component.catalogEntryIds[0],
        quantityGrams: initialQuantities[index][component.componentId] ?? component.referenceGrams,
        ...(component.preparationNote ? { preparationNote: component.preparationNote } : {}),
      })),
    };
  }) };
  return { base, catalog, context, prompt, candidate };
}

test("catalog-not-ready stops before any AI call", async () => {
  let calls = 0;
  const generator: MealPlanCandidateGenerator = { generate: async () => { calls += 1; return { meals: [] }; }, repair: async () => { calls += 1; return { meals: [] }; } };
  const result = await generateValidatedMealPlan({ context: generationContext(), catalogRepository: new InMemoryNutritionFoodCatalogRepository([]), candidateGenerator: generator });
  assert.equal(result.status, "CATALOG_NOT_READY");
  assert.equal(calls, 0);
});

test("missing required nutritional pool stops before any AI call", async () => {
  let calls = 0;
  const entries = officialTestCatalog().entries.map((entry) => ({
    ...entry,
    nutrientsPer100g: { ...entry.nutrientsPer100g, proteinG: 0 },
  }));
  const generator: MealPlanCandidateGenerator = {
    generate: async () => { calls += 1; return { meals: [] }; },
    repair: async () => { calls += 1; return { meals: [] }; },
  };
  const result = await generateValidatedMealPlan({
    context: generationContext(),
    catalogRepository: new InMemoryNutritionFoodCatalogRepository(entries),
    candidateGenerator: generator,
  });
  assert.equal(result.status, "CATALOG_NOT_READY");
  assert.equal(calls, 0);
});

test("generation receives a bounded catalog-ID candidate set with authoritative nutrient metadata", async () => {
  const context = generationContext();
  let received: MealPlanCatalogPromptContext | null = null;
  const result = await generateValidatedMealPlan({
    context,
    catalogRepository: new InMemoryNutritionFoodCatalogRepository(officialTestCatalog().entries),
    candidateGenerator: {
      generate: async (_context, catalog) => { received = catalog; return balancedCandidate(context.mealRoles); },
      repair: async () => { throw new Error("unexpected repair"); },
    },
  });
  assert.equal(result.status, "ACTIVE");
  assert.ok(received);
  const promptContext = received as MealPlanCatalogPromptContext;
  assert.equal(promptContext.readiness, "CATALOG_BASE_NUTRITION_READY");
  assert.deepEqual(promptContext.authority, {
    source: "TACO", sourceVersion: "4_edicao_2011", catalogVersion: "praxe-food-catalog-taco-v1",
  });
  assert.equal(promptContext.capabilities.catalogEntryIdSelectionOnly, true);
  assert.equal(promptContext.capabilities.supportedQuantityUnit, "g");
  assert.equal(promptContext.capabilities.restrictionMetadataComplete, false);
  assert.ok(promptContext.candidates.length > 0);
  assert.ok(promptContext.candidates.every((candidate) => candidate.catalogEntryId && candidate.source === "TACO"
    && [candidate.calories, candidate.proteinG, candidate.carbsG, candidate.fatG, candidate.fiberG].every(Number.isFinite)));
  assert.equal(promptContext.candidates.some((candidate) => candidate.canonicalName === "Frango, peito, sem pele, grelhado"
    && candidate.fiberG === 0 && candidate.pools.includes("PROTEIN_ANCHOR")), true);
  assert.equal(promptContext.mealSlots.length, context.mealCount);
});

test("a catalog ID outside the server-provided set hard-fails and persists its leaf code", async () => {
  const context = generationContext();
  const invalid = balancedCandidate(context.mealRoles);
  invalid.meals[0].items[0].catalogEntryId = "not-offered-by-server";
  let persistedCode = "";
  const result = await generateValidatedMealPlan({
    context,
    catalogRepository: new InMemoryNutritionFoodCatalogRepository(officialTestCatalog().entries),
    candidateGenerator: { generate: async () => invalid, repair: async () => invalid },
    jobRepository: {
      begin: async () => undefined,
      finish: async (_key, _status, code) => { persistedCode = code; },
    },
  });
  assert.equal(result.status, "REQUIRES_REVIEW");
  assert.equal(persistedCode, "FOOD_ALLOWED_FOR_COMPONENT");
});

test("one controlled repair keeps the identical catalog constraint and can activate", async () => {
  const catalog = officialTestCatalog();
  const context = generationContext();
  const invalid = balancedCandidate(context.mealRoles);
  invalid.meals[1].role = invalid.meals[0].role;
  invalid.meals[1].label = invalid.meals[0].label;
  let repairs = 0;
  let generationIds: string[] = [];
  const generator: MealPlanCandidateGenerator = {
    generate: async (_context, constrainedCatalog) => {
      generationIds = constrainedCatalog.candidates.map((candidate) => candidate.catalogEntryId);
      return invalid;
    },
    repair: async (_context, previous, issues, diagnostics, constrainedCatalog) => {
      repairs += 1;
      assert.ok(issues.some((issue) => issue.code === "MEAL_ROLE_MISMATCH" || issue.code === "TEMPLATE_ROLE_MATCH"));
      assert.ok(diagnostics);
      assert.ok(diagnostics.portionCalibration);
      assert.equal(typeof diagnostics.portionCalibration.normalizedDeviations.fatG, "number");
      assert.ok(["below", "within", "above"].includes(diagnostics.portionCalibration.directions.fatG));
      const selectedIds = new Set(previous.meals.flatMap((meal) => meal.items.map((item) => item.catalogEntryId)));
      assert.deepEqual(new Set(diagnostics.portionCalibration.existingCatalogEntryIds), selectedIds);
      assert.ok(constrainedCatalog.candidates.length >= selectedIds.size);
      assert.ok(constrainedCatalog.candidates.every((candidate) => generationIds.includes(candidate.catalogEntryId)));
      return balancedCandidate(context.mealRoles);
    },
  };
  const result = await generateValidatedMealPlan({ context, catalogRepository: new InMemoryNutritionFoodCatalogRepository(catalog.entries), candidateGenerator: generator });
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.repaired, true);
  assert.equal(repairs, 1);
});

test("E2E_2500_FAT_OUT_OF_RANGE_RUNTIME_CLASS adds one template-approved fat anchor deterministically", async (t) => {
  const { base, catalog, context, prompt, candidate } = exact2500RuntimeFixture();
  context.target = { ...context.target, fatG: 80 };
  context.mealMacroTargets = context.mealMacroTargets.map((target) => ({ ...target, fatG: 20 }));
  const beforeCalibration = calibrateMealPlanPortions(context, candidate, catalog, prompt.candidates, prompt.recipeSlots);
  const before = validateMealPlanCandidate(
    context, beforeCalibration.candidate, catalog, prompt.candidates, prompt.templateSlots,
  );
  assert.equal(before.valid, false);
  assert.deepEqual(before.issues.filter((issue) => issue.severity === "HARD_FAILURE").map((issue) => issue.code),
    ["FAT_OUT_OF_RANGE"]);
  assert.ok((before.diagnostics?.actualFatG ?? 0) < 72);

  let aiRepairCalls = 0;
  const result = await generateValidatedMealPlan({
    context,
    catalogRepository: new InMemoryNutritionFoodCatalogRepository(base.entries),
    candidateGenerator: {
      generate: async () => candidate,
      repair: async () => { aiRepairCalls += 1; return candidate; },
    },
  });
  assert.equal(result.status, "ACTIVE", JSON.stringify(result.report.issues));
  assert.equal(aiRepairCalls, 0);
  assert.equal(result.repaired, true);
  if (result.status === "ACTIVE") {
    assert.ok(result.plan.totals.fatG >= 72 && result.plan.totals.fatG <= 88);
    assert.ok(result.plan.meals.some((meal) => meal.items.some((item) => item.slot === "FAT_ANCHOR")));
    assert.equal(result.report.coherence?.valid, true);
    assert.equal(validateDailyMealQuality(result.plan).valid, true);
    assert.equal(validatePortionRealism(result.plan).valid, true);
    const finalCandidate = { meals: result.plan.meals.map((meal) => ({
      role: meal.role,
      templateId: meal.templateId,
      variantId: meal.variantId,
      label: meal.label,
      items: meal.items.map((item) => ({
        componentId: item.componentId,
        slot: item.slot,
        catalogEntryId: item.food.id,
        quantityGrams: item.quantityGrams,
        ...(item.preparationNote ? { preparationNote: item.preparationNote } : {}),
      })),
    })) };
    assert.equal(validateRealMealTemplates(context, finalCandidate, prompt.templateSlots).valid, true);
    assert.equal(validateDailyMealBlueprint(context, finalCandidate).valid, true);
    const addedItems = result.plan.meals.flatMap((meal, mealIndex) => meal.items.filter((item) =>
      !candidate.meals[mealIndex].items.some((original) => original.componentId === item.componentId))
      .map((item) => ({ meal, mealIndex, item })));
    assert.equal(addedItems.length, 1);
    const added = addedItems[0];
    const originalMeal = candidate.meals[added.mealIndex];
    const option = prompt.templateSlots[added.mealIndex].options.find((value) =>
      value.templateId === originalMeal.templateId && value.variantId === originalMeal.variantId)!;
    const component = option.components.find((value) => value.componentId === added.item.componentId)!;
    assert.equal(component.required, false);
    assert.equal(component.slot, "FAT_ANCHOR");
    assert.ok(component.catalogEntryIds.includes(added.item.food.id));
    assert.ok(prompt.candidates.some((value) => value.catalogEntryId === added.item.food.id));
    assert.equal(added.meal.templateId, originalMeal.templateId);
    assert.equal(added.meal.variantId, originalMeal.variantId);
    assert.equal(added.meal.role, originalMeal.role);
    assert.ok(!result.report.issues.some((issue) => issue.code === "SUPPORTING_ITEM_DOMINATES_MEAL"
      || issue.code === "ADDED_FAT_PORTION_IMPLAUSIBLE"));
    const stableStructure = result.plan.meals.map((meal) => ({ templateId: meal.templateId, variantId: meal.variantId,
      role: meal.role, items: meal.items.map((item) => ({ componentId: item.componentId,
        catalogEntryId: item.food.id, quantityGrams: item.quantityGrams })) }));
    for (let run = 0; run < 2; run += 1) {
      const repeated = await generateValidatedMealPlan({
        context,
        catalogRepository: new InMemoryNutritionFoodCatalogRepository(base.entries),
        candidateGenerator: { generate: async () => cloneCandidate(candidate),
          repair: async () => { throw new Error("unexpected repair"); } },
      });
      assert.equal(repeated.status, "ACTIVE");
      if (repeated.status === "ACTIVE") {
        assert.deepEqual(repeated.plan.meals.map((meal) => ({ templateId: meal.templateId,
          variantId: meal.variantId, role: meal.role, items: meal.items.map((item) => ({
            componentId: item.componentId, catalogEntryId: item.food.id, quantityGrams: item.quantityGrams,
          })) })), stableStructure);
        assert.equal(repeated.plan.totals.fatG, result.plan.totals.fatG);
      }
    }
    t.diagnostic(`BEFORE_FIX_TOTALS=${JSON.stringify(before.diagnostics)}`);
    t.diagnostic(`AFTER_FIX_TOTALS=${JSON.stringify(result.plan.totals)}`);
    t.diagnostic(`ADDED_COMPONENT=${added.item.componentId}`);
    t.diagnostic(`ADDED_FOOD=${added.item.food.canonicalName}`);
    t.diagnostic(`ADDED_GRAMS=${added.item.quantityGrams}`);
  }
});

test("catalog-constrained fat completion respects an exhausted optional-component cap", async () => {
  const { base, catalog, context, candidate } = exact2500RuntimeFixture();
  context.dislikedFoods = base.entries.filter((entry) => ["163", "260"].includes(entry.sourceFoodId))
    .map((entry) => entry.canonicalName);
  const prompt = buildMealPlanPromptContext(context, catalog);
  const breakfastOption = prompt.templateSlots[0].options.find((value) =>
    value.templateId === candidate.meals[0].templateId && value.variantId === candidate.meals[0].variantId)!;
  const coffee = breakfastOption.components.find((component) => component.componentId === "COFFEE")!;
  candidate.meals[0].items.push({ componentId: coffee.componentId, slot: coffee.slot,
    catalogEntryId: coffee.catalogEntryIds[0], quantityGrams: 100,
    ...(coffee.preparationNote ? { preparationNote: coffee.preparationNote } : {}) });
  let repairCalls = 0;
  let repairInput: AiMealPlanCandidate = cloneCandidate(candidate);
  const result = await generateValidatedMealPlan({
    context,
    catalogRepository: new InMemoryNutritionFoodCatalogRepository(base.entries),
    candidateGenerator: { generate: async () => candidate, repair: async (_context, previous) => {
      repairCalls += 1; repairInput = cloneCandidate(previous); return previous;
    } },
  });
  assert.equal(result.status, "REQUIRES_REVIEW");
  assert.equal(repairCalls, 1);
  const selectedOptional = repairInput.meals[0].items.filter((item) =>
    breakfastOption.components.some((component) => !component.required && component.componentId === item.componentId));
  assert.deepEqual(selectedOptional.map((item) => item.componentId), ["COFFEE"]);
  assert.ok(selectedOptional.length <= breakfastOption.maximumOptionalComponents);
  assert.ok(!repairInput.meals[0].items.some((item) => item.componentId === "SPREAD"));
});

test("catalog-constrained fat completion is a no-op when selected templates offer no fat anchor", async () => {
  const { base, catalog, context, candidate } = exact2500RuntimeFixture();
  context.target = { ...context.target, fatG: 80 };
  context.mealMacroTargets = context.mealMacroTargets.map((target) => ({ ...target, fatG: 20 }));
  context.dislikedFoods = base.entries.filter((entry) => ["163", "260", "468"].includes(entry.sourceFoodId))
    .map((entry) => entry.canonicalName);
  const prompt = buildMealPlanPromptContext(context, catalog);
  assert.ok(prompt.templateSlots.every((slot, index) => {
    const selected = slot.options.find((option) => option.templateId === candidate.meals[index].templateId
      && option.variantId === candidate.meals[index].variantId)!;
    return !selected.components.some((component) => !component.required && component.slot === "FAT_ANCHOR");
  }));
  const originalStructure = candidate.meals.map((meal) => ({ templateId: meal.templateId,
    variantId: meal.variantId, role: meal.role, componentIds: meal.items.map((item) => item.componentId) }));
  let repairCalls = 0;
  let repairStructure: Array<{ templateId: string; variantId: string; role: string; componentIds: string[] }> = [];
  const result = await generateValidatedMealPlan({
    context,
    catalogRepository: new InMemoryNutritionFoodCatalogRepository(base.entries),
    candidateGenerator: { generate: async () => candidate, repair: async (_context, previous) => {
      repairCalls += 1;
      repairStructure = previous.meals.map((meal) => ({ templateId: meal.templateId,
        variantId: meal.variantId, role: meal.role, componentIds: meal.items.map((item) => item.componentId) }));
      return previous;
    } },
  });
  assert.equal(result.status, "REQUIRES_REVIEW");
  assert.equal(repairCalls, 1);
  assert.deepEqual(repairStructure, originalStructure);
});

test("catalog-constrained low-fat completion does not run for fat above tolerance", async () => {
  const { base, context, candidate } = exact2500RuntimeFixture();
  context.target = { ...context.target, fatG: 10 };
  context.mealMacroTargets = context.mealMacroTargets.map((target) => ({ ...target, fatG: 2.5 }));
  let repairCalls = 0;
  let repairInputHasFatAnchor = false;
  const result = await generateValidatedMealPlan({
    context,
    catalogRepository: new InMemoryNutritionFoodCatalogRepository(base.entries),
    candidateGenerator: { generate: async () => candidate, repair: async (_context, previous, issues, diagnostics) => {
      repairCalls += 1;
      assert.ok(issues.some((issue) => issue.code === "FAT_OUT_OF_RANGE"));
      assert.equal(diagnostics?.portionCalibration?.directions.fatG, "above");
      repairInputHasFatAnchor = previous.meals.some((meal) => meal.items.some((item) => item.slot === "FAT_ANCHOR"));
      return previous;
    } },
  });
  assert.equal(result.status, "REQUIRES_REVIEW");
  assert.equal(repairCalls, 1);
  assert.equal(repairInputHasFatAnchor, false);
});

for (const calibrationCase of ["calorie_mismatch", "protein_mismatch"] as const) {
  test(`deterministic calibration handles ${calibrationCase} before controlled repair`, async () => {
    const catalog = officialTestCatalog();
    const context = generationContext();
    const invalid = balancedCandidate(context.mealRoles);
    if (calibrationCase === "calorie_mismatch") {
      invalid.meals.forEach((meal) => meal.items.forEach((item) => { item.quantityGrams *= 0.85; }));
    }
    if (calibrationCase === "protein_mismatch") {
      invalid.meals.forEach((meal) => { meal.items.find((item) => item.slot === "PROTEIN_ANCHOR")!.quantityGrams = 50; });
    }
    let repairs = 0;
    const generator: MealPlanCandidateGenerator = { generate: async () => invalid, repair: async () => { repairs += 1; return balancedCandidate(context.mealRoles); } };
    const result = await generateValidatedMealPlan({ context, catalogRepository: new InMemoryNutritionFoodCatalogRepository(catalog.entries), candidateGenerator: generator });
    assert.equal(result.status, "ACTIVE");
    assert.equal(repairs, 0);
  });
}

test("valid plan activates once with immutable TACO item snapshots", async () => {
  const catalog = officialTestCatalog();
  const context = generationContext();
  let activations = 0;
  const result = await generateValidatedMealPlan({
    context,
    catalogRepository: new InMemoryNutritionFoodCatalogRepository(catalog.entries),
    candidateGenerator: { generate: async () => balancedCandidate(context.mealRoles), repair: async () => { throw new Error("unexpected repair"); } },
    activationRepository: { activate: async (plan, receivedContext, key) => {
      activations += 1;
      assert.equal(receivedContext.targetSnapshotId, context.targetSnapshotId);
      assert.match(key, /praxe-meal-plan-generator-v2/);
      assert.ok(plan.meals.every((meal) => meal.items.every((item) => item.food.source === "TACO" && item.food.sourceVersion === "4_edicao_2011")));
      return { planId: "plan-1", reused: false };
    } },
  });
  assert.equal(result.status, "ACTIVE");
  assert.equal(activations, 1);
  if (result.status === "ACTIVE") assert.equal(result.planId, "plan-1");
});

test("second invalid response fails and immutable meal count cannot be repaired away", async () => {
  const catalog = officialTestCatalog();
  const context = generationContext();
  const invalid = { meals: balancedCandidate(context.mealRoles).meals.slice(0, 2) };
  let repairs = 0;
  const jobEvents: string[] = [];
  const generator: MealPlanCandidateGenerator = { generate: async () => invalid,
    repair: async () => { repairs += 1; return invalid; } };
  const result = await generateValidatedMealPlan({ context, catalogRepository: new InMemoryNutritionFoodCatalogRepository(catalog.entries), candidateGenerator: generator,
    jobRepository: { begin: async () => { jobEvents.push("processing"); }, finish: async (_key, status, code) => { jobEvents.push(`${status}:${code}`); } } });
  assert.equal(result.status, "REQUIRES_REVIEW");
  assert.equal(repairs, 1);
  assert.ok(result.report.issues.some((issue) => issue.code === "MEAL_COUNT_MISMATCH"));
  assert.deepEqual(jobEvents, ["processing", "failed_retryable:MEAL_COUNT_MISMATCH"]);
});

test("controlled repair cannot replace or invent catalog identities", async () => {
  const catalog = officialTestCatalog();
  const context = generationContext();
  const invalid = balancedCandidate(context.mealRoles);
  invalid.meals[1].role = invalid.meals[0].role;
  const replacement = balancedCandidate(context.mealRoles);
  replacement.meals[0].items[0].catalogEntryId = "invented-by-repair";
  const result = await generateValidatedMealPlan({
    context,
    catalogRepository: new InMemoryNutritionFoodCatalogRepository(catalog.entries),
    candidateGenerator: { generate: async () => invalid, repair: async () => replacement },
  });
  assert.equal(result.status, "REQUIRES_REVIEW");
  assert.ok(result.report.issues.some((issue) => issue.code === "MEAL_ROLE_MISMATCH"));
});

test("controlled repair may switch to another approved real-meal template variant", async () => {
  const catalog = officialTestCatalog();
  const context = generationContext();
  const invalid = balancedCandidate(context.mealRoles);
  invalid.meals[1].role = invalid.meals[0].role;
  const repaired = balancedCandidate(context.mealRoles);
  repaired.meals[1].items[0].catalogEntryId = catalog.entries.find((entry) => entry.canonicalName.includes("patinho"))!.id;
  repaired.meals[1].templateId = "MAIN_RICE_BEANS_BEEF_VEGETABLES";
  repaired.meals[1].variantId = "WHITE_CARIOCA_BEEF_BROCCOLI";
  repaired.meals[1].recipeId = "RICE_BEANS_BEEF_BROCCOLI";
  repaired.meals[1].recipeFamilyId = "RICE_BEANS_PROTEIN_VEGETABLES";
  repaired.meals[1].recipeVariantId = "RICE_BEANS_BEEF_BROCCOLI_V1";
  repaired.meals[1].label = "Arroz, feijão, patinho e brócolis";
  const result = await generateValidatedMealPlan({
    context,
    catalogRepository: new InMemoryNutritionFoodCatalogRepository(catalog.entries),
    candidateGenerator: { generate: async () => invalid, repair: async () => repaired },
  });
  assert.equal(result.status, "ACTIVE", JSON.stringify(result.report.issues));
  if (result.status === "ACTIVE") assert.equal(result.plan.meals[1].items[0].food.canonicalName.includes("patinho"), true);
});

test("controlled repair rejects a catalog ID assigned to the wrong pool", async () => {
  const catalog = officialTestCatalog();
  const context = generationContext();
  const invalid = balancedCandidate(context.mealRoles);
  invalid.meals[1].role = invalid.meals[0].role;
  const wrongPool = balancedCandidate(context.mealRoles);
  wrongPool.meals[0].items[0].catalogEntryId = catalog.entries.find((entry) => entry.canonicalName.startsWith("Arroz"))!.id;
  const result = await generateValidatedMealPlan({
    context,
    catalogRepository: new InMemoryNutritionFoodCatalogRepository(catalog.entries),
    candidateGenerator: { generate: async () => invalid, repair: async () => wrongPool },
  });
  assert.equal(result.status, "REQUIRES_REVIEW");
  assert.ok(result.report.issues.some((issue) => issue.code === "MEAL_ROLE_MISMATCH"));
});

test("idempotency includes user, target, strategy and generator version", () => {
  const context = generationContext();
  const first = buildMealPlanGenerationIdempotencyKey(context);
  assert.equal(first, buildMealPlanGenerationIdempotencyKey(context));
  assert.match(first, /praxe-meal-plan-generator-v2/);
  assert.notEqual(first, buildMealPlanGenerationIdempotencyKey({ ...context, targetSnapshotId: "other" }));
});

test("provider failures persist only a fixed safe job code", async () => {
  const context = generationContext();
  let persistedCode = "";
  await assert.rejects(() => generateValidatedMealPlan({
    context,
    catalogRepository: new InMemoryNutritionFoodCatalogRepository(officialTestCatalog().entries),
    candidateGenerator: {
      generate: async () => { throw new Error("provider detail that must not be persisted"); },
      repair: async () => { throw new Error("unexpected repair"); },
    },
    jobRepository: {
      begin: async () => undefined,
      finish: async (_key, status, code) => {
        assert.equal(status, "failed_retryable");
        persistedCode = code;
      },
    },
  }), /provider detail/);
  assert.equal(persistedCode, "GENERATION_FAILED");
});
