import assert from "node:assert/strict";
import test from "node:test";

import type { PostOnboardingStatusView } from "./domain.ts";
import {
  parsePostOnboardingProcessMode,
  shouldAutoProcessPostOnboarding,
} from "./processing-policy.ts";

test("dashboard auto processing starts pending jobs but never failed retryable jobs", () => {
  const pending: PostOnboardingStatusView = { workout: "pending", missions: "pending", mealPlan: "pending", errors: {} };
  const failed: PostOnboardingStatusView = { workout: "failed_retryable", missions: "pending", mealPlan: "failed_retryable", errors: {} };
  const failedOnly: PostOnboardingStatusView = { workout: "failed_retryable", missions: "processing", mealPlan: "failed_retryable", errors: {} };
  assert.equal(shouldAutoProcessPostOnboarding(pending), true);
  assert.equal(shouldAutoProcessPostOnboarding(failed), true, "pending dependency may still be checked without retrying failed artifacts");
  assert.equal(shouldAutoProcessPostOnboarding(failedOnly), false);
});

test("process request requires an explicit retry boolean", () => {
  assert.equal(parsePostOnboardingProcessMode(undefined), "initial");
  assert.equal(parsePostOnboardingProcessMode({ retry: false }), "initial");
  assert.equal(parsePostOnboardingProcessMode({ retry: true }), "explicit_retry");
  assert.throws(() => parsePostOnboardingProcessMode({ retry: "true" }), /INVALID_PROCESS_REQUEST/);
});
