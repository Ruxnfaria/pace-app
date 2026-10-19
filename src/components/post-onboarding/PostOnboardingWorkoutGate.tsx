"use client";

import { Dumbbell, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { usePostOnboardingStatus } from "@/hooks/usePostOnboardingStatus";

export default function PostOnboardingWorkoutGate({ children }: { children: ReactNode }) {
  const { status, loading, processing, unavailable, retry } = usePostOnboardingStatus();
  const value = status.workout;
  if (loading || value === null || value === "ready") return children;
  const review = value === "requires_review";
  const failed = value === "failed_retryable" || unavailable;
  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] px-5 pb-28 pt-8">
      <section className="mt-16 rounded-[28px] border border-orange-400/[0.12] bg-gradient-to-br from-[#19130e] to-[#0d0d0d] p-6 text-center" aria-live="polite">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/[0.08] text-[#ff7a00]">{review ? <TriangleAlert className="h-6 w-6" /> : failed ? <Dumbbell className="h-6 w-6" /> : <LoaderCircle className="h-6 w-6 animate-spin motion-reduce:animate-none" />}</span>
        <h1 className="mt-5 text-xl font-semibold text-white">{review ? "Seu treino precisa de revisão" : failed ? "Não foi possível preparar seu treino" : "Estamos preparando seu treino"}</h1>
        <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-zinc-500">{review ? "Nenhum treino inválido será disponibilizado. Seus dados permanecem seguros." : failed ? "A preparação pode ser retomada com segurança." : "A prescrição está sendo validada para sua meta e sua rotina."}</p>
        {failed && <button type="button" disabled={processing} onClick={() => void retry()} className="mx-auto mt-5 flex items-center gap-2 rounded-full bg-[#ff6a00] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />Tentar novamente</button>}
      </section>
    </main>
  );
}
