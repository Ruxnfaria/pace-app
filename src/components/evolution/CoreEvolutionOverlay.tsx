"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

import CoreOrb from "@/components/pace/CoreOrb";
import {
  getCoreStage,
  type CoreStageInfo,
} from "@/lib/gamification/coreStages";

type EvolutionEventDetail = {
  previousXP: number;
  newXP: number;
};

type EvolutionData = {
  previousXP: number;
  newXP: number;
  previousStage: CoreStageInfo;
  newStage: CoreStageInfo;
};

export function CoreEvolutionOverlay() {
  const [evolution, setEvolution] =
    useState<EvolutionData | null>(null);

  const [phase, setPhase] = useState<
    "charging" | "transforming" | "completed"
  >("charging");

  useEffect(() => {
    function handleEvolution(event: Event) {
      const customEvent =
        event as CustomEvent<EvolutionEventDetail>;

      const previousXP = customEvent.detail?.previousXP ?? 0;
      const newXP = customEvent.detail?.newXP ?? previousXP;

      const previousStage = getCoreStage(previousXP);
      const newStage = getCoreStage(newXP);

      if (previousStage.id === newStage.id) {
        return;
      }

      setEvolution({
        previousXP,
        newXP,
        previousStage,
        newStage,
      });

      setPhase("charging");

      window.setTimeout(() => {
        setPhase("transforming");
      }, 1250);

      window.setTimeout(() => {
        setPhase("completed");
      }, 2400);
    }

    window.addEventListener(
      "pace:core-evolution",
      handleEvolution
    );

    return () => {
      window.removeEventListener(
        "pace:core-evolution",
        handleEvolution
      );
    };
  }, []);

  if (!evolution) {
    return null;
  }

  const visibleStage =
    phase === "charging"
      ? evolution.previousStage
      : evolution.newStage;

  const closeOverlay = () => {
    setEvolution(null);
    setPhase("charging");
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center overflow-hidden bg-black/90 p-5 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(124,58,237,0.28),transparent_45%)]" />

      <div
        className={`pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/20 blur-[130px] ${
          phase === "transforming"
            ? "core-evolution-flash"
            : ""
        }`}
      />

      <div className="relative flex w-full max-w-xl flex-col items-center text-center">
        <div className="flex items-center gap-2 text-violet-300">
          <Sparkles className="h-4 w-4" />

          <p className="text-[11px] font-black uppercase tracking-[0.3em]">
            Evolução do Núcleo
          </p>
        </div>

        <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">
          {phase === "charging"
            ? "Energia máxima atingida"
            : phase === "transforming"
              ? "Núcleo evoluindo..."
              : `${evolution.newStage.name} desbloqueado`}
        </h2>

        <p className="mt-3 text-sm text-zinc-400">
          {phase === "completed"
            ? `Seu Núcleo evoluiu de ${evolution.previousStage.name} para ${evolution.newStage.name}.`
            : "Toda a sua evolução está sendo absorvida."}
        </p>

        <div
          className={`relative mt-6 ${
            phase === "transforming"
              ? "core-evolution-transform"
              : ""
          }`}
        >
<CoreOrb
  energy={100}
  level={1}
  state={visibleStage.visualState}
  size="lg"
  showParticles
  showEnergyLabel={false}
/>

          {phase === "transforming" && (
            <div className="core-evolution-wave absolute inset-0 rounded-full border-2 border-violet-200/80" />
          )}
        </div>

        <div className="mt-3 flex items-center gap-4">
          <span
            className={`text-lg font-black ${
              phase === "charging"
                ? "text-white"
                : "text-zinc-600"
            }`}
          >
            {evolution.previousStage.name}
          </span>

          <ArrowRight className="h-5 w-5 text-violet-400" />

          <span
            className={`text-lg font-black ${
              phase === "completed"
                ? "text-violet-300"
                : "text-zinc-600"
            }`}
          >
            {evolution.newStage.name}
          </span>
        </div>

        <div className="mt-7 w-full max-w-md">
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={`h-full rounded-full bg-gradient-to-r from-violet-700 via-violet-400 to-white shadow-[0_0_25px_rgba(168,85,247,0.75)] ${
                phase === "charging"
                  ? "core-evolution-progress"
                  : "w-full"
              }`}
            />
          </div>

          <div className="mt-2 flex justify-between text-xs font-bold text-zinc-500">
            <span>{evolution.previousXP} XP</span>
            <span>{evolution.newXP} XP</span>
          </div>
        </div>

        {phase === "completed" && (
          <button
            type="button"
            onClick={closeOverlay}
            className="mt-8 min-h-14 w-full max-w-md rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-500 px-6 text-sm font-black text-white shadow-[0_16px_50px_rgba(124,58,237,0.35)] transition hover:-translate-y-0.5"
          >
            Continuar evolução
          </button>
        )}
      </div>
    </div>
  );
}