import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryMealPlanJobRepository } from "./job-lifecycle";
import { InMemoryNutritionFoodCatalogRepository } from "./repository";
import { officialTestCatalog } from "./test-helpers";

test("in-memory catalog repository provides deterministic database-absent testing", async () => {
  const catalog = officialTestCatalog();
  const repository = new InMemoryNutritionFoodCatalogRepository(catalog.entries, catalog.aliases);
  const first = await repository.loadSnapshot();
  const second = await repository.loadSnapshot();
  assert.equal(first.readiness, "CATALOG_BASE_NUTRITION_READY");
  assert.deepEqual(first, second);
});

test("job lifecycle preserves one idempotent ready job and safe error only", () => {
  const jobs = new InMemoryMealPlanJobRepository();
  assert.equal(jobs.start("key").attemptCount, 1);
  assert.equal(jobs.finish("key", "failed_retryable", "AI_TIMEOUT").safeErrorCode, "AI_TIMEOUT");
  assert.equal(jobs.start("key").attemptCount, 2);
  jobs.finish("key", "ready");
  const reused = jobs.start("key");
  assert.equal(reused.status, "ready");
  assert.equal(reused.attemptCount, 2);
});
