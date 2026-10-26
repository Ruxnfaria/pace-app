import assert from "node:assert/strict";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MealPlanPreparationView } from "./MealPlanPreparation.tsx";
import type { PostOnboardingJobStatus } from "@/lib/post-onboarding/domain";

function render(value: PostOnboardingJobStatus | null, options: { unavailable?: boolean; readyContent?: ReactNode; readyLoading?: boolean; readyLoadFailed?: boolean } = {}) {
  return renderToStaticMarkup(
    <MealPlanPreparationView
      value={value}
      processing={false}
      unavailable={options.unavailable ?? false}
      retry={() => undefined}
      reloadReady={() => undefined}
      readyContent={options.readyContent}
      readyLoading={options.readyLoading}
      readyLoadFailed={options.readyLoadFailed}
    />,
  );
}

test("keeps pending and processing preparation states", () => {
  assert.match(render("pending"), /Estamos preparando seu plano alimentar/);
  assert.match(render("processing"), /Estamos preparando seu plano alimentar/);
});

test("keeps failed retryable and review states", () => {
  assert.match(render("failed_retryable"), /Tentar novamente/);
  assert.match(render("requires_review"), /precisa de uma revisão/);
  assert.match(render("requires_review"), /Nenhuma geração automática será iniciada/);
});

test("ready replaces the status card with the active plan", () => {
  const html = render("ready", { readyContent: <div>ACTIVE PLAN CONTENT</div> });
  assert.match(html, /ACTIVE PLAN CONTENT/);
  assert.doesNotMatch(html, /Seu plano alimentar está pronto/);
});

test("ready without a plan and read failure expose a read-only reload", () => {
  const missing = render("ready");
  const failed = render("ready", { readyLoadFailed: true });
  for (const html of [missing, failed]) {
    assert.match(html, /não conseguimos carregá-lo agora/);
    assert.match(html, /Tentar carregar novamente/);
    assert.match(html, /não inicia outra geração/);
    assert.doesNotMatch(html, />Tentar novamente</);
  }
  assert.match(failed, /data-load-failed="true"/);
});

test("ready plan read has its own loading state", () => {
  assert.match(render("ready", { readyLoading: true }), /Carregando plano alimentar/);
});
