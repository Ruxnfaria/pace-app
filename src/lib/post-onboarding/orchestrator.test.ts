import assert from "node:assert/strict";
import test from "node:test";

import type { ArtifactProcessOutcome } from "./domain.ts";
import {
  createPendingPostOnboardingJobs,
  InMemoryPostOnboardingJobRepository,
  processPostOnboardingJobs,
  type PostOnboardingProcessors,
} from "./orchestrator.ts";

const userId = "11111111-1111-4111-8111-111111111111";

function processors(overrides: Partial<PostOnboardingProcessors> = {}): PostOnboardingProcessors {
  const ready = async (): Promise<ArtifactProcessOutcome> => ({ status: "ready" });
  return { WORKOUT_PLAN: ready, MISSIONS: ready, MEAL_PLAN: ready, ...overrides };
}

test("happy path materializes all three artifacts once", async () => {
  const repository = new InMemoryPostOnboardingJobRepository(createPendingPostOnboardingJobs(userId));
  const calls = { workout: 0, missions: 0, meal: 0 };
  const jobs = await processPostOnboardingJobs({ userId, repository, processors: processors({
    WORKOUT_PLAN: async () => { calls.workout += 1; return { status: "ready" }; },
    MISSIONS: async () => { calls.missions += 1; return { status: "ready" }; },
    MEAL_PLAN: async () => { calls.meal += 1; return { status: "ready" }; },
  }) });
  assert.deepEqual(calls, { workout: 1, missions: 1, meal: 1 });
  assert.ok(jobs.every((job) => job.status === "ready"));
  await processPostOnboardingJobs({ userId, repository, processors: processors() });
  assert.equal((await repository.list(userId)).length, 3);
});

test("workout failure does not block meal and keeps workout-dependent missions pending", async () => {
  let missions = 0;
  const repository = new InMemoryPostOnboardingJobRepository(createPendingPostOnboardingJobs(userId));
  const jobs = await processPostOnboardingJobs({ userId, repository, processors: processors({
    WORKOUT_PLAN: async () => ({ status: "failed_retryable", errorCode: "WORKOUT_GENERATION_FAILED" }),
    MISSIONS: async () => { missions += 1; return { status: "ready" }; },
  }) });
  assert.equal(jobs.find((job) => job.artifact === "WORKOUT_PLAN")?.status, "failed_retryable");
  assert.equal(jobs.find((job) => job.artifact === "MEAL_PLAN")?.status, "ready");
  assert.equal(jobs.find((job) => job.artifact === "MISSIONS")?.status, "pending");
  assert.equal(missions, 0);
});

test("meal validation failure leaves workout and missions ready", async () => {
  const repository = new InMemoryPostOnboardingJobRepository(createPendingPostOnboardingJobs(userId));
  const jobs = await processPostOnboardingJobs({ userId, repository, processors: processors({
    MEAL_PLAN: async () => ({ status: "failed_retryable", errorCode: "MEAL_VALIDATION_FAILED" }),
  }) });
  assert.equal(jobs.find((job) => job.artifact === "MEAL_PLAN")?.status, "failed_retryable");
  assert.equal(jobs.find((job) => job.artifact === "WORKOUT_PLAN")?.status, "ready");
  assert.equal(jobs.find((job) => job.artifact === "MISSIONS")?.status, "ready");
});

test("catalog dependency does not consume an attempt and restriction review is terminal", async () => {
  const repository = new InMemoryPostOnboardingJobRepository(createPendingPostOnboardingJobs(userId));
  await processPostOnboardingJobs({ userId, repository, processors: processors({
    MEAL_PLAN: async () => ({ status: "dependency_pending", errorCode: "CATALOG_NOT_READY", retryAfterMs: 60_000 }),
  }) });
  const catalog = (await repository.list(userId)).find((job) => job.artifact === "MEAL_PLAN")!;
  assert.equal(catalog.status, "pending");
  assert.equal(catalog.attemptCount, 0);

  const reviewRepository = new InMemoryPostOnboardingJobRepository(createPendingPostOnboardingJobs(userId));
  let calls = 0;
  const reviewProcessors = processors({ MEAL_PLAN: async () => {
    calls += 1;
    return { status: "requires_review", errorCode: "MEAL_PLAN_NOT_ELIGIBLE" };
  } });
  await processPostOnboardingJobs({ userId, repository: reviewRepository, processors: reviewProcessors });
  await processPostOnboardingJobs({ userId, repository: reviewRepository, processors: reviewProcessors });
  assert.equal(calls, 1);
});

test("concurrent processors claim each artifact at most once", async () => {
  const repository = new InMemoryPostOnboardingJobRepository(createPendingPostOnboardingJobs(userId));
  const counts = { WORKOUT_PLAN: 0, MISSIONS: 0, MEAL_PLAN: 0 };
  const delayed = (artifact: keyof typeof counts) => async (): Promise<ArtifactProcessOutcome> => {
    counts[artifact] += 1;
    await Promise.resolve();
    return { status: "ready" };
  };
  const concurrentProcessors = processors({
    WORKOUT_PLAN: delayed("WORKOUT_PLAN"), MISSIONS: delayed("MISSIONS"), MEAL_PLAN: delayed("MEAL_PLAN"),
  });
  await Promise.all([
    processPostOnboardingJobs({ userId, repository, processors: concurrentProcessors }),
    processPostOnboardingJobs({ userId, repository, processors: concurrentProcessors }),
  ]);
  assert.deepEqual(counts, { WORKOUT_PLAN: 1, MISSIONS: 1, MEAL_PLAN: 1 });
  assert.equal((await repository.list(userId)).length, 3);
});

test("third failed attempt moves a job to requires_review", async () => {
  const jobs = createPendingPostOnboardingJobs(userId).filter((job) => job.artifact === "WORKOUT_PLAN");
  const repository = new InMemoryPostOnboardingJobRepository(jobs);
  const failing = processors({ WORKOUT_PLAN: async () => ({ status: "failed_retryable", errorCode: "WORKOUT_GENERATION_FAILED" }) });
  for (let index = 0; index < 3; index += 1) await processPostOnboardingJobs({ userId, repository, processors: failing });
  const workout = (await repository.list(userId))[0];
  assert.equal(workout.attemptCount, 3);
  assert.equal(workout.status, "requires_review");
});
