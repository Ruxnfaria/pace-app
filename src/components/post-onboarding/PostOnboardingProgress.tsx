"use client";

import { Check, LoaderCircle, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";

import { usePostOnboardingStatus } from "@/hooks/usePostOnboardingStatus";
import type { PostOnboardingJobStatus } from "@/lib/post-onboarding/domain";

const ITEMS = [
  ["workout", "Seu plano de treino"], ["missions", "Suas primeiras missões"], ["mealPlan", "Seu plano alimentar"],
] as const;

function StatusIcon({ status }: { status: PostOnboardingJobStatus | null }) {
  if (status === "ready") return <Check className="h-4 w-4 text-emerald-400" />;
  if (status === "requires_review") return <TriangleAlert className="h-4 w-4 text-amber-400" />;
  return <LoaderCircle className="h-4 w-4 animate-spin text-[#ff7a00] motion-reduce:animate-none" />;
}

export default function PostOnboardingProgress() {
  const { status, loading, processing, unavailable, retry } = usePostOnboardingStatus();
  const values = ITEMS.map(([key]) => status[key]);
  if (loading || values.every((value) => value === null) || values.every((value) => value === "ready")) return null;
  const canRetry = unavailable || values.some((value) => value === "failed_retryable");
  return (
    <section className="mt-5 rounded-[24px] border border-orange-400/[0.12] bg-gradient-to-br from-[#19130e] to-[#0d0d0d] p-4" aria-live="polite">
      <div className="flex items-center gap-2 text-[#ff7a00]"><Sparkles className="h-4 w-4" /><p className="text-[10px] font-bold uppercase tracking-[.18em]">Estamos preparando seu PRAXE</p></div>
      <p className="mt-2 text-xs leading-5 text-zinc-400">Seus planos são criados com segurança após o cadastro. Você pode continuar usando o app.</p>
      <div className="mt-4 space-y-2.5">
        {ITEMS.map(([key, label]) => <div key={key} className="flex items-center justify-between rounded-xl bg-white/[0.025] px-3 py-2.5"><span className="text-[11px] text-zinc-300">{label}</span><StatusIcon status={status[key]} /></div>)}
      </div>
      {canRetry && <button type="button" disabled={processing} onClick={() => void retry()} className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-[#ff8a2b] disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />Tentar novamente</button>}
    </section>
  );
}
