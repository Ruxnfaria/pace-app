import {
  POST_ONBOARDING_ARTIFACTS,
  POST_ONBOARDING_MAX_ATTEMPTS,
  POST_ONBOARDING_ORCHESTRATOR_VERSION,
  POST_ONBOARDING_RETRY_POLICY_VERSION,
  type ArtifactProcessOutcome,
  type PostOnboardingArtifact,
  type PostOnboardingJob,
  type PostOnboardingSafeErrorCode,
} from "./domain";

export interface PostOnboardingJobRepository {
  list(userId: string): Promise<PostOnboardingJob[]>;
  claim(userId: string, artifact: PostOnboardingArtifact): Promise<PostOnboardingJob | null>;
  finish(jobId: string, status: "ready" | "failed_retryable" | "requires_review", errorCode: PostOnboardingSafeErrorCode | null): Promise<PostOnboardingJob>;
  defer(jobId: string, errorCode: PostOnboardingSafeErrorCode, retryAfterMs: number): Promise<PostOnboardingJob>;
}

export type PostOnboardingProcessors = Record<PostOnboardingArtifact, (job: PostOnboardingJob) => Promise<ArtifactProcessOutcome>>;
export type SafeJobLog = (entry: { jobId: string; artifact: PostOnboardingArtifact; fromStatus: "processing"; toStatus: string; attempt: number; durationMs: number; errorCode: PostOnboardingSafeErrorCode | null }) => void;

const GENERIC_ERROR: Record<PostOnboardingArtifact, PostOnboardingSafeErrorCode> = {
  WORKOUT_PLAN: "WORKOUT_GENERATION_FAILED",
  MISSIONS: "MISSION_GENERATION_FAILED",
  MEAL_PLAN: "MEAL_GENERATION_FAILED",
};

async function processArtifact(args: {
  userId: string;
  artifact: PostOnboardingArtifact;
  repository: PostOnboardingJobRepository;
  processors: PostOnboardingProcessors;
  log?: SafeJobLog;
}): Promise<PostOnboardingJob | null> {
  const job = await args.repository.claim(args.userId, args.artifact);
  if (!job) return null;
  const started = Date.now();
  let outcome: ArtifactProcessOutcome;
  try {
    outcome = await args.processors[args.artifact](job);
  } catch {
    outcome = { status: "failed_retryable", errorCode: GENERIC_ERROR[args.artifact] };
  }
  const result = outcome.status === "dependency_pending"
    ? await args.repository.defer(job.id, outcome.errorCode, outcome.retryAfterMs)
    : await args.repository.finish(job.id, outcome.status, outcome.status === "ready" ? null : outcome.errorCode);
  args.log?.({ jobId: job.id, artifact: job.artifact, fromStatus: "processing", toStatus: result.status, attempt: result.attemptCount,
    durationMs: Date.now() - started, errorCode: result.errorCode });
  return result;
}

export async function processPostOnboardingJobs(args: {
  userId: string;
  repository: PostOnboardingJobRepository;
  processors: PostOnboardingProcessors;
  log?: SafeJobLog;
}): Promise<PostOnboardingJob[]> {
  await Promise.all([
    processArtifact({ ...args, artifact: "WORKOUT_PLAN" }),
    processArtifact({ ...args, artifact: "MEAL_PLAN" }),
  ]);
  const afterIndependent = await args.repository.list(args.userId);
  const workout = afterIndependent.find((job) => job.artifact === "WORKOUT_PLAN");
  if (workout?.status === "ready") {
    await processArtifact({ ...args, artifact: "MISSIONS" });
  }
  return args.repository.list(args.userId);
}

export class InMemoryPostOnboardingJobRepository implements PostOnboardingJobRepository {
  private readonly jobs = new Map<string, PostOnboardingJob>();
  constructor(jobs: readonly PostOnboardingJob[]) { jobs.forEach((job) => this.jobs.set(job.id, { ...job })); }
  async list(userId: string) { return [...this.jobs.values()].filter((job) => job.userId === userId).map((job) => ({ ...job })); }
  async claim(userId: string, artifact: PostOnboardingArtifact) {
    const job = [...this.jobs.values()].find((value) => value.userId === userId && value.artifact === artifact);
    if (!job || !["pending", "failed_retryable"].includes(job.status)
      || job.attemptCount >= POST_ONBOARDING_MAX_ATTEMPTS
      || new Date(job.availableAfter).getTime() > Date.now()) return null;
    job.status = "processing"; job.attemptCount += 1; job.startedAt = new Date().toISOString(); job.errorCode = null;
    return { ...job };
  }
  async finish(jobId: string, status: "ready" | "failed_retryable" | "requires_review", errorCode: PostOnboardingSafeErrorCode | null) {
    const job = this.jobs.get(jobId); if (!job || job.status !== "processing") throw new Error("JOB_NOT_PROCESSING");
    job.status = status === "failed_retryable" && job.attemptCount >= POST_ONBOARDING_MAX_ATTEMPTS ? "requires_review" : status;
    job.errorCode = errorCode; job.completedAt = ["ready", "requires_review"].includes(job.status) ? new Date().toISOString() : null;
    return { ...job };
  }
  async defer(jobId: string, errorCode: PostOnboardingSafeErrorCode, retryAfterMs: number) {
    const job = this.jobs.get(jobId); if (!job || job.status !== "processing") throw new Error("JOB_NOT_PROCESSING");
    job.status = "pending"; job.attemptCount -= 1; job.errorCode = errorCode; job.startedAt = null;
    job.availableAfter = new Date(Date.now() + retryAfterMs).toISOString(); return { ...job };
  }
}

export function createPendingPostOnboardingJobs(userId: string): PostOnboardingJob[] {
  const now = new Date().toISOString();
  return POST_ONBOARDING_ARTIFACTS.map((artifact, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, userId,
    receiptOnboardingVersion: 2, receiptIdempotencyKey: "10000000-0000-4000-8000-000000000001",
    artifact, algorithmVersion: POST_ONBOARDING_ORCHESTRATOR_VERSION,
    retryPolicyVersion: POST_ONBOARDING_RETRY_POLICY_VERSION, status: "pending", attemptCount: 0,
    idempotencyKey: `${userId}:${artifact}`, errorCode: null, contextDate: "2026-10-19",
    availableAfter: now, createdAt: now, startedAt: null, completedAt: null,
  }));
}
