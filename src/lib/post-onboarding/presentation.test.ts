import assert from "node:assert/strict";
import test from "node:test";

import { resolveArtifactPresentation } from "./presentation.ts";

test("dashboard artifact states are explicit and safe", () => {
  assert.equal(resolveArtifactPresentation(null), "hidden");
  assert.equal(resolveArtifactPresentation("pending"), "preparing");
  assert.equal(resolveArtifactPresentation("processing"), "preparing");
  assert.equal(resolveArtifactPresentation("ready"), "ready");
  assert.equal(resolveArtifactPresentation("failed_retryable"), "retry");
  assert.equal(resolveArtifactPresentation("requires_review"), "review");
});
