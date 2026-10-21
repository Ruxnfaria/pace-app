import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  POST_ONBOARDING_ARTIFACTS,
  POST_ONBOARDING_MAX_ATTEMPTS,
  POST_ONBOARDING_ORCHESTRATOR_VERSION,
  POST_ONBOARDING_RETRY_POLICY_VERSION,
  POST_ONBOARDING_SAFE_ERROR_CODES,
  type PostOnboardingArtifact,
  type PostOnboardingJob,
  type PostOnboardingProcessMode,
  type PostOnboardingSafeErrorCode,
} from "./domain";
import type { PostOnboardingJobRepository } from "./orchestrator";
import { isPostOnboardingJobClaimable } from "./processing-policy";

type Row = Record<string, unknown>;

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("POST_ONBOARDING_SERVER_CONFIGURATION_MISSING");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function oneRow(operation: string, data: unknown): Row {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`${operation}_MALFORMED_RESPONSE`);
  return row as Row;
}

function rows(operation: string, data: unknown): Row[] {
  if (!Array.isArray(data)) throw new Error(`${operation}_MALFORMED_RESPONSE`);
  return data as Row[];
}

function parseJob(row: Row): PostOnboardingJob {
  const artifact = row.artifact as PostOnboardingArtifact;
  const status = row.status as PostOnboardingJob["status"];
  const errorCode = row.error_code as PostOnboardingSafeErrorCode | null;
  if (!POST_ONBOARDING_ARTIFACTS.includes(artifact)
    || row.algorithm_version !== POST_ONBOARDING_ORCHESTRATOR_VERSION
    || row.retry_policy_version !== POST_ONBOARDING_RETRY_POLICY_VERSION
    || !["pending", "processing", "ready", "failed_retryable", "requires_review"].includes(status)
    || (errorCode !== null && !POST_ONBOARDING_SAFE_ERROR_CODES.includes(errorCode))) {
    throw new Error("POST_ONBOARDING_JOB_MALFORMED");
  }
  return {
    id: String(row.id), userId: String(row.user_id),
    receiptOnboardingVersion: Number(row.receipt_onboarding_version),
    receiptIdempotencyKey: String(row.receipt_idempotency_key), artifact,
    algorithmVersion: POST_ONBOARDING_ORCHESTRATOR_VERSION,
    retryPolicyVersion: POST_ONBOARDING_RETRY_POLICY_VERSION,
    status, attemptCount: Number(row.attempt_count),
    idempotencyKey: String(row.idempotency_key), errorCode,
    contextDate: String(row.context_date), availableAfter: String(row.available_after),
    createdAt: String(row.created_at), startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

export class DatabasePostOnboardingJobRepository implements PostOnboardingJobRepository {
  constructor(private readonly client: SupabaseClient = serviceClient()) {}

  async initialize(userId: string, completedAt?: string): Promise<PostOnboardingJob[]> {
    const { data, error } = await this.client.rpc("initialize_post_onboarding_jobs_v1", {
      p_user_id: userId, p_completed_at: completedAt ?? null,
    });
    if (error) throw error;
    return rows("INITIALIZE_POST_ONBOARDING", data).map(parseJob);
  }

  async list(userId: string): Promise<PostOnboardingJob[]> {
    const { data, error } = await this.client.from("post_onboarding_jobs").select("*")
      .eq("user_id", userId).eq("algorithm_version", POST_ONBOARDING_ORCHESTRATOR_VERSION)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows("LIST_POST_ONBOARDING", data).map(parseJob);
  }

  async claim(userId: string, artifact: PostOnboardingArtifact, mode: PostOnboardingProcessMode): Promise<PostOnboardingJob | null> {
    const current = (await this.list(userId)).find((job) => job.artifact === artifact);
    if (!current || !isPostOnboardingJobClaimable(current, mode, POST_ONBOARDING_MAX_ATTEMPTS)) return null;
    const { data, error } = await this.client.rpc("claim_post_onboarding_job_v1", {
      p_user_id: userId, p_artifact: artifact,
      p_algorithm_version: POST_ONBOARDING_ORCHESTRATOR_VERSION,
      p_max_attempts: POST_ONBOARDING_MAX_ATTEMPTS,
    });
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) return null;
    return parseJob(oneRow("CLAIM_POST_ONBOARDING", data));
  }

  async finish(jobId: string, status: "ready" | "failed_retryable" | "requires_review", errorCode: PostOnboardingSafeErrorCode | null) {
    const { data, error } = await this.client.rpc("finish_post_onboarding_job_v1", {
      p_job_id: jobId, p_status: status, p_error_code: errorCode,
    });
    if (error) throw error;
    return parseJob(oneRow("FINISH_POST_ONBOARDING", data));
  }

  async defer(jobId: string, errorCode: PostOnboardingSafeErrorCode, retryAfterMs: number) {
    const { data, error } = await this.client.rpc("defer_post_onboarding_job_v1", {
      p_job_id: jobId, p_error_code: errorCode,
      p_available_after: new Date(Date.now() + retryAfterMs).toISOString(),
    });
    if (error) throw error;
    return parseJob(oneRow("DEFER_POST_ONBOARDING", data));
  }
}

export async function readOwnPostOnboardingJobs(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from("post_onboarding_jobs").select("*")
    .eq("user_id", userId).eq("algorithm_version", POST_ONBOARDING_ORCHESTRATOR_VERSION)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return rows("READ_OWN_POST_ONBOARDING", data).map(parseJob);
}
