"use client";

import { useEffect, useState } from "react";
import { X, Zap } from "lucide-react";

import Core from "@/components/pace/core/Core";
import type { CoreRank } from "@/lib/gamification/coreStages";

type CoreRankUpOverlayProps = {
  open: boolean;
  previousRank: CoreRank | null;
  newRank: CoreRank | null;
  onClose: () => void;
};

export default function CoreRankUpOverlay({
  open,
  previousRank,
  newRank,
  onClose,
}: CoreRankUpOverlayProps) {
  const [phase, setPhase] = useState<
    "old" | "charging" | "flash" | "new"
  >("old");

  useEffect(() => {
    if (!open || !previousRank || !newRank) return;

    setPhase("old");

    const chargeTimer = window.setTimeout(() => {
      setPhase("charging");
    }, 700);

    const flashTimer = window.setTimeout(() => {
      setPhase("flash");
    }, 1900);

    const newRankTimer = window.setTimeout(() => {
      setPhase("new");
    }, 2250);

    return () => {
      window.clearTimeout(chargeTimer);
      window.clearTimeout(flashTimer);
      window.clearTimeout(newRankTimer);
    };
  }, [open, previousRank, newRank]);

  if (!open || !previousRank || !newRank) {
    return null;
  }

  const showingNewRank = phase === "new";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-black/90 backdrop-blur-md">
      {/* Fundo energético */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className={`absolute left-1/2 top-1/2 h-[650px] w-[650px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7c3aed]/20 blur-[140px] transition-all duration-700 ${
            phase === "charging"
              ? "scale-125 opacity-100"
              : phase === "new"
              ? "scale-110 opacity-80"
              : "scale-75 opacity-40"
          }`}
        />

        <div
          className={`absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.22),transparent_48%)] transition-opacity duration-500 ${
            phase === "flash" ? "opacity-100" : "opacity-50"
          }`}
        />

        <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:42px_42px]" />
      </div>

      {/* Flash da evolução */}
      <div
        className={`pointer-events-none absolute inset-0 bg-white transition-opacity duration-300 ${
          phase === "flash" ? "opacity-90" : "opacity-0"
        }`}
      />

      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-zinc-400 transition hover:bg-white/[0.1] hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center px-6 text-center">
        <div
          className={`mb-3 inline-flex items-center gap-2 rounded-full border px-4 py-2 transition-all duration-500 ${
            showingNewRank
              ? "border-[#a855f7]/40 bg-[#7c3aed]/15 text-[#c084fc]"
              : "border-white/10 bg-white/[0.04] text-zinc-400"
          }`}
        >
          <Zap
            className={`h-4 w-4 ${
              showingNewRank
                ? "fill-[#a855f7] text-[#a855f7]"
                : "text-zinc-500"
            }`}
          />

          <span className="text-[10px] font-black uppercase tracking-[0.22em]">
            {showingNewRank
              ? "Núcleo evoluído"
              : "Evolução em andamento"}
          </span>
        </div>

        <h1
          className={`text-4xl font-black tracking-tight transition-all duration-500 sm:text-5xl ${
            showingNewRank
              ? "scale-100 text-white opacity-100"
              : "scale-95 text-zinc-500 opacity-80"
          }`}
        >
          {showingNewRank ? "RANK UP" : previousRank.name}
        </h1>

        <p className="mt-2 text-sm text-zinc-500">
          {showingNewRank
            ? `Seu Núcleo alcançou ${newRank.name}.`
            : "Seu Núcleo está concentrando Energia para evoluir."}
        </p>

        {/* Núcleo */}
        <div className="relative mt-8 flex h-[360px] w-[360px] items-center justify-center">
          <div
            className={`absolute inset-0 rounded-full bg-[#7c3aed]/15 blur-[85px] transition-all duration-500 ${
              phase === "charging"
                ? "scale-125 opacity-100"
                : showingNewRank
                ? "scale-110 opacity-90"
                : "scale-90 opacity-50"
            }`}
          />

          <div
            className={`relative transition-all duration-700 ${
              phase === "charging"
                ? "scale-[1.12] animate-pulse"
                : phase === "flash"
                ? "scale-[1.3] opacity-0"
                : showingNewRank
                ? "scale-[1.12] opacity-100"
                : "scale-100 opacity-100"
            }`}
          >
            <Core
              rank={
                showingNewRank
                  ? newRank.id
                  : previousRank.id
              }
              energy={showingNewRank ? 0 : 100}
            />
          </div>
        </div>

        {/* Rank novo */}
        <div
          className={`mt-2 transition-all duration-700 ${
            showingNewRank
              ? "translate-y-0 opacity-100"
              : "translate-y-5 opacity-0"
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#a855f7]">
            Novo rank
          </p>

          <h2 className="mt-2 text-4xl font-black text-white">
            {newRank.name}
          </h2>

          <p className="mt-1 text-sm font-bold text-[#c084fc]">
            {newRank.coreName}
          </p>

          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
            {newRank.description}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={!showingNewRank}
          className={`mt-8 min-h-12 min-w-[220px] rounded-2xl px-6 text-sm font-black transition-all ${
            showingNewRank
              ? "bg-gradient-to-r from-[#7c3aed] to-[#9333ea] text-white shadow-[0_12px_35px_rgba(124,58,237,0.35)] hover:-translate-y-0.5"
              : "cursor-not-allowed bg-white/[0.05] text-zinc-700"
          }`}
        >
          Continuar evolução
        </button>
      </div>
    </div>
  );
}