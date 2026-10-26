import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryNutritionFoodCatalogRepository } from "./repository";
import { buildMealPlanGenerationIdempotencyKey, generateValidatedMealPlan, type MealPlanCandidateGenerator } from "./generator";
import type { MealPlanCatalogPromptContext } from "./domain";
import { balancedCandidate, generationContext, officialTestCatalog } from "./test-helpers";

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
  assert.equal(persistedCode, "UNKNOWN_CATALOG_ENTRY_ID");
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
      assert.ok(issues.some((issue) => issue.code === "DUPLICATE_MEAL_STRUCTURE"));
      assert.ok(diagnostics);
      assert.ok(diagnostics.portionCalibration);
      assert.equal(typeof diagnostics.portionCalibration.normalizedDeviations.fatG, "number");
      assert.ok(["below", "within", "above"].includes(diagnostics.portionCalibration.directions.fatG));
      const selectedIds = new Set(previous.meals.flatMap((meal) => meal.items.map((item) => item.catalogEntryId)));
      assert.deepEqual(new Set(diagnostics.portionCalibration.existingCatalogEntryIds), selectedIds);
      assert.ok(constrainedCatalog.candidates.length > selectedIds.size);
      assert.ok(constrainedCatalog.candidates.every((candidate) => generationIds.includes(candidate.catalogEntryId)));
      return balancedCandidate(context.mealRoles);
    },
  };
  const result = await generateValidatedMealPlan({ context, catalogRepository: new InMemoryNutritionFoodCatalogRepository(catalog.entries), candidateGenerator: generator });
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.repaired, true);
  assert.equal(repairs, 1);
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
      const chickenId = officialTestCatalog().entries.find((entry) => entry.canonicalName.startsWith("Frango"))!.id;
      invalid.meals.forEach((meal) => { meal.items.find((item) => item.catalogEntryId === chickenId)!.quantityGrams = 50; });
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
      assert.match(key, /praxe-meal-plan-generator-v1/);
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

test("controlled repair may swap a protein anchor only within its approved pool", async () => {
  const catalog = officialTestCatalog();
  const context = generationContext();
  const invalid = balancedCandidate(context.mealRoles);
  invalid.meals[1].role = invalid.meals[0].role;
  const repaired = balancedCandidate(context.mealRoles);
  repaired.meals[0].items[0].catalogEntryId = catalog.entries.find((entry) => entry.canonicalName.includes("patinho"))!.id;
  const result = await generateValidatedMealPlan({
    context,
    catalogRepository: new InMemoryNutritionFoodCatalogRepository(catalog.entries),
    candidateGenerator: { generate: async () => invalid, repair: async () => repaired },
  });
  assert.equal(result.status, "ACTIVE", JSON.stringify(result.report.issues));
  if (result.status === "ACTIVE") assert.equal(result.plan.meals[0].items[0].food.canonicalName.includes("patinho"), true);
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
  assert.match(first, /praxe-meal-plan-generator-v1/);
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
