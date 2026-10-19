"use client";

import { Apple, Check, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";

import { usePostOnboardingStatus } from "@/hooks/usePostOnboardingStatus";

export default function MealPlanPreparation() {
  const { status, processing, unavailable, retry } = usePostOnboardingStatus();
  const value = status.mealPlan;
  const pending = value === "pending" || value === "processing";
  const review = value === "requires_review";
  const failed = value === "failed_retryable" || unavailable;
  const Icon = value === "ready" ? Check : review ? TriangleAlert : pending ? LoaderCircle : Apple;
  const title = value === "ready" ? "Seu plano alimentar está pronto."
    : review ? "Seu plano precisa de uma revisão antes de ser exibido."
    : failed ? "Não foi possível preparar seu plano agora."
    : pending ? "Estamos preparando seu plano alimentar."
    : "Nenhum plano alimentar ativo.";
  const detail = pending ? "Você pode continuar usando o app enquanto finalizamos essa etapa."
    : review ? "Seus dados permanecem seguros e nenhum plano inválido será publicado."
    : failed ? "Tente novamente quando estiver pronto."
    : value === "ready" ? "A estratégia validada já está disponível para sua rotina."
    : "Conclua o onboarding mais recente para iniciar a preparação.";
  return (
    <div className="mt-3 flex items-center gap-3.5 rounded-[22px] border border-white/[0.055] bg-white/[0.018] p-4" aria-live="polite">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.05] text-[#ff7a00]"><Icon className={`h-5 w-5 ${pending ? "animate-spin motion-reduce:animate-none" : ""}`} /></span>
      <div className="min-w-0 flex-1"><p className="text-[11px] font-medium text-zinc-300">{title}</p><p className="mt-1 text-[9px] leading-4 text-zinc-600">{detail}</p>{failed && <button type="button" disabled={processing} onClick={() => void retry()} className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-[#ff7a00] disabled:opacity-50"><RotateCcw className="h-3 w-3" />Tentar novamente</button>}</div>
    </div>
  );
}
