"use client";

import Link from "next/link";
import { ArrowLeft, Lock, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import {
  CORE_RANKS,
  getCoreRankProgress,
} from "@/lib/gamification/coreStages";

export default function RanksPage() {
  const supabase = createClient();

  const [totalEnergy, setTotalEnergy] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRankData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("total_xp")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error(
          "[PACE] Erro ao carregar progressão:",
          error
        );

        setLoading(false);
        return;
      }

      setTotalEnergy(Number(profile?.total_xp) || 0);
      setLoading(false);
    }

    loadRankData();
  }, [supabase]);

  const progress = useMemo(
    () => getCoreRankProgress(totalEnergy),
    [totalEnergy]
  );

  const currentRankIndex = CORE_RANKS.findIndex(
    (rank) => rank.id === progress.currentRank.id
  );

  if (loading) {
    return (
      <div className="p-6 lg:p-10 space-y-6 animate-pulse">
        <div className="h-10 w-64 rounded-xl bg-[#111111]" />
        <div className="h-80 rounded-3xl bg-[#111111]" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 space-y-8">

      {/* HEADER */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="p-3 rounded-xl bg-[#111111] border border-[#1f1f1f] hover:border-[#7c3aed]/40 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>

        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[#a855f7] font-black">
            Progressão do Núcleo
          </p>

          <h1 className="text-3xl font-black text-white">
            Caminho dos Ranks
          </h1>

          <p className="mt-1 text-sm text-zinc-500">
            Alimente seu Núcleo, evolua e alcance os ranks mais altos do PACE.
          </p>
        </div>
      </div>

      {/* RANK ATUAL */}
      <section className="rounded-3xl border border-[#7c3aed]/30 bg-gradient-to-r from-[#7c3aed]/15 to-purple-500/5 p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">

          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-500">
              Seu rank atual
            </p>

            <h2 className="mt-2 text-3xl font-black text-white">
              {progress.currentRank.name}
            </h2>

            <p className="mt-1 text-sm font-bold text-[#a855f7]">
              {progress.currentRank.coreName}
            </p>

            <p className="mt-2 max-w-md text-sm text-zinc-400">
              {progress.currentRank.description}
            </p>
          </div>

          <div className="min-w-[230px]">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-black text-zinc-500">
                  Evolução atual
                </p>

                <p className="mt-1 text-xs text-zinc-400">
                  {progress.nextRank
                    ? `Próximo: ${progress.nextRank.name}`
                    : "Rank máximo alcançado"}
                </p>
              </div>

              <p className="text-3xl font-black text-white">
                {Math.round(progress.progressPercentage)}
                <span className="text-sm text-[#a855f7]">
                  %
                </span>
              </p>
            </div>

            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-[#c084fc] transition-all duration-700"
                style={{
                  width: `${progress.progressPercentage}%`,
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* TODOS OS RANKS */}
      <section className="rounded-3xl border border-[#1f1f1f] bg-[#0d0d12] p-6">
        <div className="mb-7">
          <p className="text-[10px] uppercase tracking-[0.24em] font-black text-[#a855f7]">
            Todos os ranks
          </p>

          <h2 className="mt-2 text-xl font-black text-white">
            Sua jornada até o topo
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {CORE_RANKS.map((rank, index) => {
            const current = index === currentRankIndex;
            const unlocked = index < currentRankIndex;
            const locked = index > currentRankIndex;

            return (
              <div
                key={rank.id}
                className={`relative overflow-hidden rounded-3xl border p-5 transition-all ${
                  current
                    ? "border-[#a855f7] bg-[#7c3aed]/15 shadow-[0_0_35px_rgba(124,58,237,0.16)]"
                    : unlocked
                    ? "border-emerald-500/20 bg-emerald-500/[0.03]"
                    : "border-[#1f1f1f] bg-[#111111]"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
                      current
                        ? "border-[#7c3aed]/40 bg-[#7c3aed]/20 text-[#c084fc]"
                        : unlocked
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                        : "border-white/[0.05] bg-white/[0.03] text-zinc-700"
                    }`}
                  >
                    {unlocked ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : locked ? (
                      <Lock className="h-5 w-5" />
                    ) : (
                      <span className="text-lg">⚡</span>
                    )}
                  </div>

                  {current && (
                    <span className="rounded-full bg-[#7c3aed]/20 px-2.5 py-1 text-[8px] uppercase tracking-widest font-black text-[#c084fc]">
                      Atual
                    </span>
                  )}
                </div>

                <p className="mt-5 text-lg font-black text-white">
                  {rank.name}
                </p>

                <p className="mt-1 text-xs font-bold text-[#a855f7]">
                  {rank.coreName}
                </p>

                <p className="mt-3 text-xs leading-5 text-zinc-500">
                  {rank.description}
                </p>

                {rank.id === "legend" && (
                  <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.05] p-3">
                    <p className="text-[9px] uppercase tracking-widest font-black text-yellow-400">
                      Rank máximo
                    </p>

                    <p className="mt-1 text-xs text-zinc-400">
                      Desbloqueia a disputa pelo Ranking Global.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="rounded-3xl border border-[#1f1f1f] bg-[#111111] p-6">
        <p className="text-[10px] uppercase tracking-[0.22em] font-black text-[#a855f7]">
          Como funciona
        </p>

        <h2 className="mt-2 text-xl font-black text-white">
          Tudo começa alimentando seu Núcleo
        </h2>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">

          <div className="rounded-2xl bg-white/[0.025] p-4">
            <p className="text-2xl font-black text-[#a855f7]">
              01
            </p>

            <p className="mt-2 font-black text-white">
              Complete ações
            </p>

            <p className="mt-1 text-xs text-zinc-500">
              Treino, nutrição, água, cardio, sono e missões.
            </p>
          </div>

          <div className="rounded-2xl bg-white/[0.025] p-4">
            <p className="text-2xl font-black text-[#a855f7]">
              02
            </p>

            <p className="mt-2 font-black text-white">
              Gere Energia
            </p>

            <p className="mt-1 text-xs text-zinc-500">
              Cada ação fortalece a evolução do seu Núcleo.
            </p>
          </div>

          <div className="rounded-2xl bg-white/[0.025] p-4">
            <p className="text-2xl font-black text-[#a855f7]">
              03
            </p>

            <p className="mt-2 font-black text-white">
              Suba de Rank
            </p>

            <p className="mt-1 text-xs text-zinc-500">
              Complete a evolução e desbloqueie o próximo estágio.
            </p>
          </div>

          <div className="rounded-2xl bg-white/[0.025] p-4">
            <p className="text-2xl font-black text-[#a855f7]">
              04
            </p>

            <p className="mt-2 font-black text-white">
              Domine o Ranking
            </p>

            <p className="mt-1 text-xs text-zinc-500">
              Compita com outros atletas e tente chegar ao topo.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}