import type { PostOnboardingJob, PostOnboardingProcessMode, PostOnboardingStatusView } from "./domain";

export function shouldAutoProcessPostOnboarding(view: PostOnboardingStatusView): boolean {
  const values = [view.workout, view.missions, view.mealPlan];
  return values.every((value) => value === null) || values.some((value) => value === "pending");
}

export function isPostOnboardingJobClaimable(
  job: Pick<PostOnboardingJob, "status" | "attemptCount" | "availableAfter">,
  mode: PostOnboardingProcessMode,
  maxAttempts: number,
  now = Date.now(),
): boolean {
  const statusAllowed = job.status === "pending"
    || (mode === "explicit_retry" && job.status === "failed_retryable");
  return statusAllowed
    && job.attemptCount < maxAttempts
    && new Date(job.availableAfter).getTime() <= now;
}

export function parsePostOnboardingProcessMode(body: unknown): PostOnboardingProcessMode {
  if (body === undefined || body === null) return "initial";
  if (typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_PROCESS_REQUEST");
  const retry = (body as { retry?: unknown }).retry;
  if (retry === undefined || retry === false) return "initial";
  if (retry === true) return "explicit_retry";
  throw new Error("INVALID_PROCESS_REQUEST");
}
