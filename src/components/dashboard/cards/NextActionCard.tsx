"use client";

import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  Dumbbell,
  Gem,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";

type NextActionCardProps = {
  title?: string | null;
  exerciseCount?: number;
  duration?: number;
  energyReward?: number;
  xpReward?: number;
  crystalReward?: number;
  href?: string;
};

export default function NextActionCard({
  title,
  exerciseCount = 0,
  duration = 50,
  energyReward = 120,
  xpReward = 50,
  crystalReward = 8,
  href = "/dashboard/workouts",
}: NextActionCardProps) {
  const workoutTitle = title || "Seu próximo treino";
  const hasWorkout = Boolean(title);

  return (
    <section className="relative overflow-hidden rounded-[30px] border border-[#7c3aed]/30 bg-[#0b0914] p-6 sm:p-7">
      {/* Fundo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#7c3aed]/20 blur-[100px]" />

        <div className="absolute -bottom-28 left-16 h-64 w-64 rounded-full bg-[#4c1d95]/15 blur-[110px]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_30%,rgba(168,85,247,0.12),transparent_35%)]" />
      </div>

      <div className="relative z-10">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#a855f7]">
              Próximo passo
            </p>

            <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
              {workoutTitle}
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {hasWorkout
                ? "Complete esta missão para fortalecer seu Núcleo."
                : "Seu próximo treino ainda está sendo preparado."}
            </p>
          </div>

          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#7c3aed]/30 bg-[#7c3aed]/10 shadow-[0_0_30px_rgba(124,58,237,0.16)]">
            <Dumbbell className="h-6 w-6 text-[#c084fc]" />
          </div>
        </div>

        {/* Informações do treino */}
        <div className="mt-6 flex flex-wrap gap-3">
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2">
            <Clock3 className="h-4 w-4 text-zinc-500" />

            <span className="text-xs font-bold text-zinc-300">
              {duration} minutos
            </span>
          </div>

          {exerciseCount > 0 && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2">
              <Dumbbell className="h-4 w-4 text-zinc-500" />

              <span className="text-xs font-bold text-zinc-300">
                {exerciseCount}{" "}
                {exerciseCount === 1 ? "exercício" : "exercícios"}
              </span>
            </div>
          )}
        </div>

        {/* Recompensas */}
        <div className="mt-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
            Recompensas
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-2xl border border-violet-400/15 bg-violet-400/[0.06] p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-400/10">
                <Zap className="h-5 w-5 fill-[#a855f7] text-[#a855f7]" />
              </div>

              <div>
                <p className="text-lg font-black text-white">
                  +{energyReward}
                </p>

                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Energia
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10">
                <Sparkles className="h-5 w-5 text-amber-300" />
              </div>

              <div>
                <p className="text-lg font-black text-white">
                  +{xpReward}
                </p>

                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  XP
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10">
                <Gem className="h-5 w-5 text-cyan-300" />
              </div>

              <div>
                <p className="text-lg font-black text-white">
                  +{crystalReward}
                </p>

                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Cristais
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Próxima recompensa */}
        <div className="mt-5 flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#7c3aed]/20 bg-[#7c3aed]/10">
            <Trophy className="h-5 w-5 text-[#c084fc]" />
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
              Ao concluir
            </p>

            <p className="mt-1 text-sm font-black text-white">
              Progresso diário e +1 na sequência
            </p>
          </div>
        </div>

        {/* Botão */}
        <Link
          href={href}
          className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#9333ea] px-6 text-sm font-black text-white shadow-[0_12px_38px_rgba(124,58,237,0.28)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(124,58,237,0.38)]"
        >
          {hasWorkout ? "Iniciar evolução" : "Ver meus treinos"}

          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}