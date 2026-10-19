import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { FitnessRouteServiceError } from "@/lib/fitness-context/route-pipeline";
import { generateUserDailyMissions } from "@/lib/missions/server";
import { generateMealPlanForUser } from "@/lib/nutrition/meal-generation/server";
import { generateWorkoutPlanForUser } from "@/lib/workouts/server-generator";

import { DatabasePostOnboardingJobRepository, readOwnPostOnboardingJobs } from "./database-repository";
import { toPostOnboardingStatusView, type ArtifactProcessOutcome } from "./domain";
import { processPostOnboardingJobs, type PostOnboardingProcessors } from "./orchestrator";

const CATALOG_RETRY_MS = 6 * 60 * 60 * 1000;

function workoutFailure(error: unknown): ArtifactProcessOutcome {
  if (error instanceof FitnessRouteServiceError && error.code === "WORKOUT_VALIDATION_FAILED") {
    return { status: "failed_retryable", errorCode: "WORKOUT_VALIDATION_FAILED" };
  }
  return { status: "failed_retryable", errorCode: "WORKOUT_GENERATION_FAILED" };
}

export async function initializePostOnboardingJobs(userId: string, completedAt?: string) {
  return new DatabasePostOnboardingJobRepository().initialize(userId, completedAt);
}

export async function processPostOnboardingForUser(authClient: SupabaseClient, userId: string) {
  const repository = new DatabasePostOnboardingJobRepository();
  const processors: PostOnboardingProcessors = {
    WORKOUT_PLAN: async () => {
      try {
        await generateWorkoutPlanForUser(authClient, userId);
        return { status: "ready" };
      } catch (error) {
        return workoutFailure(error);
      }
    },
    MEAL_PLAN: async () => {
      try {
        const result = await generateMealPlanForUser(authClient, userId);
        if (result.status === "ACTIVE") return { status: "ready" };
        if (result.status === "CATALOG_NOT_READY") {
          return { status: "dependency_pending", errorCode: "CATALOG_NOT_READY", retryAfterMs: CATALOG_RETRY_MS };
        }
        if (result.status === "USER_NOT_ELIGIBLE") {
          return { status: "requires_review", errorCode: "MEAL_PLAN_NOT_ELIGIBLE" };
        }
        return { status: "failed_retryable", errorCode: "MEAL_VALIDATION_FAILED" };
      } catch {
        return { status: "failed_retryable", errorCode: "MEAL_GENERATION_FAILED" };
      }
    },
    MISSIONS: async (job) => {
      try {
        const result = await generateUserDailyMissions({ authClient, userId, date: job.contextDate });
        return result.materialized > 0
          ? { status: "ready" }
          : { status: "failed_retryable", errorCode: "MISSION_GENERATION_FAILED" };
      } catch {
        return { status: "failed_retryable", errorCode: "MISSION_GENERATION_FAILED" };
      }
    },
  };
  const jobs = await processPostOnboardingJobs({
    userId, repository, processors,
    log: (entry) => console.info("post_onboarding_job", entry),
  });
  return toPostOnboardingStatusView(jobs);
}

export async function readPostOnboardingStatus(authClient: SupabaseClient, userId: string) {
  return toPostOnboardingStatusView(await readOwnPostOnboardingJobs(authClient, userId));
}
