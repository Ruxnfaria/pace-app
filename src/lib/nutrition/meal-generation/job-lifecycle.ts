export type MealPlanJobStatus = "pending" | "processing" | "ready" | "failed_retryable" | "requires_review";

export interface MealPlanGenerationJob {
  idempotencyKey: string;
  status: MealPlanJobStatus;
  attemptCount: number;
  safeErrorCode: string | null;
}

export class InMemoryMealPlanJobRepository {
  private readonly jobs = new Map<string, MealPlanGenerationJob>();

  start(idempotencyKey: string): MealPlanGenerationJob {
    const existing = this.jobs.get(idempotencyKey);
    if (existing?.status === "ready") return { ...existing };
    const job = { idempotencyKey, status: "processing" as const, attemptCount: (existing?.attemptCount ?? 0) + 1, safeErrorCode: null };
    this.jobs.set(idempotencyKey, job);
    return { ...job };
  }

  finish(idempotencyKey: string, status: "ready" | "failed_retryable" | "requires_review", safeErrorCode: string | null = null): MealPlanGenerationJob {
    const existing = this.jobs.get(idempotencyKey) ?? { idempotencyKey, status: "pending" as const, attemptCount: 0, safeErrorCode: null };
    const job = { ...existing, status, safeErrorCode };
    this.jobs.set(idempotencyKey, job);
    return { ...job };
  }

  get(idempotencyKey: string): MealPlanGenerationJob | null { return this.jobs.has(idempotencyKey) ? { ...this.jobs.get(idempotencyKey)! } : null; }
}
