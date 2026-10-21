export const POST_ONBOARDING_ORCHESTRATOR_VERSION = "praxe-post-onboarding-orchestrator-v1" as const;
export const POST_ONBOARDING_RETRY_POLICY_VERSION = "praxe-post-onboarding-retry-policy-v1" as const;
export const POST_ONBOARDING_MAX_ATTEMPTS = 3 as const;

export const POST_ONBOARDING_ARTIFACTS = ["WORKOUT_PLAN", "MISSIONS", "MEAL_PLAN"] as const;
export type PostOnboardingArtifact = (typeof POST_ONBOARDING_ARTIFACTS)[number];
export type PostOnboardingJobStatus = "pending" | "processing" | "ready" | "failed_retryable" | "requires_review";
export type PostOnboardingProcessMode = "initial" | "explicit_retry";

export const POST_ONBOARDING_SAFE_ERROR_CODES = [
  "WORKOUT_GENERATION_FAILED", "WORKOUT_VALIDATION_FAILED", "CATALOG_NOT_READY",
  "MEAL_PLAN_NOT_ELIGIBLE", "MEAL_GENERATION_FAILED", "MEAL_VALIDATION_FAILED",
  "MISSION_GENERATION_FAILED",
] as const;
export type PostOnboardingSafeErrorCode = (typeof POST_ONBOARDING_SAFE_ERROR_CODES)[number];

export interface PostOnboardingJob {
  id: string;
  userId: string;
  receiptOnboardingVersion: number;
  receiptIdempotencyKey: string;
  artifact: PostOnboardingArtifact;
  algorithmVersion: typeof POST_ONBOARDING_ORCHESTRATOR_VERSION;
  retryPolicyVersion: typeof POST_ONBOARDING_RETRY_POLICY_VERSION;
  status: PostOnboardingJobStatus;
  attemptCount: number;
  idempotencyKey: string;
  errorCode: PostOnboardingSafeErrorCode | null;
  contextDate: string;
  availableAfter: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface SanitizedValidationDiagnostics {
  validator_version: string;
  validation_issue_codes: readonly string[];
  repair_attempted: boolean;
  repair_result: "not_attempted" | "succeeded" | "failed";
}

export type ArtifactProcessOutcome =
  | { status: "ready"; diagnostics?: SanitizedValidationDiagnostics }
  | { status: "failed_retryable"; errorCode: PostOnboardingSafeErrorCode; diagnostics?: SanitizedValidationDiagnostics }
  | { status: "requires_review"; errorCode: PostOnboardingSafeErrorCode; diagnostics?: SanitizedValidationDiagnostics }
  | { status: "dependency_pending"; errorCode: PostOnboardingSafeErrorCode; retryAfterMs: number; diagnostics?: SanitizedValidationDiagnostics };

export interface PostOnboardingStatusView {
  workout: PostOnboardingJobStatus | null;
  missions: PostOnboardingJobStatus | null;
  mealPlan: PostOnboardingJobStatus | null;
  errors: Partial<Record<"workout" | "missions" | "mealPlan", PostOnboardingSafeErrorCode>>;
}

export function toPostOnboardingStatusView(jobs: readonly PostOnboardingJob[]): PostOnboardingStatusView {
  const latest = (artifact: PostOnboardingArtifact) => jobs.find((job) => job.artifact === artifact) ?? null;
  const workout = latest("WORKOUT_PLAN");
  const missions = latest("MISSIONS");
  const mealPlan = latest("MEAL_PLAN");
  return {
    workout: workout?.status ?? null,
    missions: missions?.status ?? null,
    mealPlan: mealPlan?.status ?? null,
    errors: {
      ...(workout?.errorCode ? { workout: workout.errorCode } : {}),
      ...(missions?.errorCode ? { missions: missions.errorCode } : {}),
      ...(mealPlan?.errorCode ? { mealPlan: mealPlan.errorCode } : {}),
    },
  };
}
