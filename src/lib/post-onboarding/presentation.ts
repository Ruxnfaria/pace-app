import type { PostOnboardingJobStatus } from "./domain";

export type ArtifactPresentation = "hidden" | "preparing" | "ready" | "retry" | "review";

export function resolveArtifactPresentation(status: PostOnboardingJobStatus | null): ArtifactPresentation {
  if (status === null) return "hidden";
  if (status === "pending" || status === "processing") return "preparing";
  if (status === "ready") return "ready";
  if (status === "failed_retryable") return "retry";
  return "review";
}
