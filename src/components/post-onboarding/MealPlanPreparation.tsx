"use client";

import type { ReactNode } from "react";
import { Apple, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";

import { usePostOnboardingStatus } from "@/hooks/usePostOnboardingStatus";
import type { PostOnboardingJobStatus } from "@/lib/post-onboarding/domain";

type MealPlanPreparationViewProps = {
  value: PostOnboardingJobStatus | null;
  processing: boolean;
  unavailable: boolean;
  retry: () => void;
  readyContent?: ReactNode;
  readyLoading?: boolean;
  readyLoadFailed?: boolean;
  reloadReady?: () => void;
};

export function MealPlanPreparationView({
  value,
  processing,
  unavailable,
  retry,
  readyContent,
  readyLoading = false,
  readyLoadFailed = false,
  reloadReady,
}: MealPlanPreparationViewProps) {
  const pending = value === "pending" || value === "processing";
  const review = value === "requires_review";
  const failed = value === "failed_retryable" || unavailable;
  if (value === "ready" && readyLoading) {
    return <div className="mt-3 h-56 animate-pulse rounded-[22px] border border-white/[0.04] bg-white/[0.018]" aria-label="Carregando plano alimentar" />;
  }
  if (value === "ready" && readyContent) return readyContent;
  if (value === "ready") {
    return (
      <div className="mt-3 flex items-center gap-3.5 rounded-[22px] border border-orange-400/[0.1] bg-white/[0.018] p-4" aria-live="polite" data-load-failed={readyLoadFailed || undefined}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.05] text-[#ff7a00]"><TriangleAlert className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-zinc-300">Seu plano foi concluído, mas não conseguimos carregá-lo agora.</p>
          <p className="mt-1 text-[9px] leading-4 text-zinc-600">Tente uma nova leitura do plano. Isso não inicia outra geração.</p>
          <button type="button" onClick={reloadReady} className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-[#ff7a00]"><RotateCcw className="h-3 w-3" />Tentar carregar novamente</button>
        </div>
      </div>
    );
  }
  const Icon = review ? TriangleAlert : pending ? LoaderCircle : Apple;
  const title = review ? "Seu plano precisa de uma revisão antes de ser exibido."
    : failed ? "Não foi possível preparar seu plano agora."
    : pending ? "Estamos preparando seu plano alimentar."
    : "Nenhum plano alimentar ativo.";
  const detail = pending ? "Você pode continuar usando o app enquanto finalizamos essa etapa."
    : review ? "Precisamos revisar seus dados de saúde antes de calcular o plano. Nenhuma geração automática será iniciada."
    : failed ? "Tente novamente quando estiver pronto."
    : "Conclua o onboarding mais recente para iniciar a preparação.";
  return (
    <div className="mt-3 flex items-center gap-3.5 rounded-[22px] border border-white/[0.055] bg-white/[0.018] p-4" aria-live="polite">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.05] text-[#ff7a00]"><Icon className={`h-5 w-5 ${pending ? "animate-spin motion-reduce:animate-none" : ""}`} /></span>
      <div className="min-w-0 flex-1"><p className="text-[11px] font-medium text-zinc-300">{title}</p><p className="mt-1 text-[9px] leading-4 text-zinc-600">{detail}</p>{failed && <button type="button" disabled={processing} onClick={() => void retry()} className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-[#ff7a00] disabled:opacity-50"><RotateCcw className="h-3 w-3" />Tentar novamente</button>}</div>
    </div>
  );
}

type MealPlanPreparationProps = Pick<MealPlanPreparationViewProps, "readyContent" | "readyLoading" | "readyLoadFailed" | "reloadReady">;

export default function MealPlanPreparation(props: MealPlanPreparationProps) {
  const { status, processing, unavailable, retry } = usePostOnboardingStatus();
  return <MealPlanPreparationView value={status.mealPlan} processing={processing} unavailable={unavailable} retry={() => void retry()} {...props} />;
}
