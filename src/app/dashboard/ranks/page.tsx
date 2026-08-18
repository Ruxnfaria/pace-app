"use client";

import Link from "next/link";
import { ArrowLeft, Lock, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import {
  CORE_RANKS,
  getCoreRankProgress,
} from "@/lib/gamification/coreStages";
import Core from "@/components/pace/core/Core";

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
  const rankGroups = [
    {
      title: "Iniciante",
      ranks: CORE_RANKS.filter((rank) => rank.id === "beginner"),
    },
    {
      title: "Bronze",
      ranks: CORE_RANKS.filter((rank) =>
        ["bronze_3", "bronze_2", "bronze_1"].includes(rank.id)
      ),
    },
    {
      title: "Prata",
      ranks: CORE_RANKS.filter((rank) =>
        ["silver_3", "silver_2", "silver_1"].includes(rank.id)
      ),
    },
    {
      title: "Ouro",
      ranks: CORE_RANKS.filter((rank) =>
        ["gold_3", "gold_2", "gold_1"].includes(rank.id)
      ),
    },
    {
        title: "Diamante",
        ranks: CORE_RANKS.filter((rank) =>
          ["diamond_3", "diamond_2", "diamond_1"].includes(rank.id)
        ),
      },
    {
      title: "Imparável",
      ranks: CORE_RANKS.filter((rank) => rank.id === "unstoppable"),
    },
    {
      title: "Inabalável",
      ranks: CORE_RANKS.filter((rank) => rank.id === "unshakable"),
    },
    {
      title: "Lenda",
      ranks: CORE_RANKS.filter((rank) => rank.id === "legend"),
    },
  ];

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
<section className="rounded-3xl border border-[#1f1f1f] bg-gradient-to-b from-[#121022] to-[#0b0b11] p-6 overflow-hidden">
  <div className="mb-8">
    <p className="text-[10px] uppercase tracking-[0.24em] font-black text-[#a855f7]">
      Todos os ranks
    </p>

    <h2 className="mt-2 text-2xl font-black text-white">
      Caminho dos Ranks
    </h2>

    <p className="mt-2 text-sm text-zinc-500">
      Cada etapa transforma seu Núcleo e aproxima você do topo do PACE.
    </p>
  </div>

  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">

      {rankGroups.map((group) => {
        const groupHasCurrentRank = group.ranks.some(
          (rank) => rank.id === progress.currentRank.id
        );

        return (
          <div
            key={group.title}
            className={`min-w-0 rounded-2xl border px-2 py-4 transition-all ${
              groupHasCurrentRank
                ? "border-[#a855f7]/60 bg-[#7c3aed]/10 shadow-[0_0_30px_rgba(124,58,237,0.12)]"
                : "border-white/[0.06] bg-white/[0.02]"
            }`}
          >
            <div className="mb-5 text-center">
              <p
                className={`text-xs font-black uppercase tracking-[0.16em] ${
                  groupHasCurrentRank
                    ? "text-[#c084fc]"
                    : "text-zinc-400"
                }`}
              >
                {group.title}
              </p>
            </div>

            <div className="flex flex-col items-center gap-6">
              {group.ranks.map((rank) => {
                const rankIndex = CORE_RANKS.findIndex(
                  (item) => item.id === rank.id
                );

                const current = rank.id === progress.currentRank.id;
                const unlocked = rankIndex < currentRankIndex;
                const future = rankIndex > currentRankIndex;

                const divisionLabel =
                  rank.id.endsWith("_3")
                    ? "III"
                    : rank.id.endsWith("_2")
                    ? "II"
                    : rank.id.endsWith("_1")
                    ? "I"
                    : null;

                return (
                  <div
                    key={rank.id}
                    className="relative flex flex-col items-center"
                  >
                    <div
                     className={`relative flex h-[92px] w-[92px] items-center justify-center rounded-full transition-all duration-500 ${
                        current
                          ? "scale-105"
                          : future
                          ? "opacity-55"
                          : "opacity-100"
                      }`}
                    >
                      {current && (
                        <div className="absolute inset-0 rounded-full bg-[#7c3aed]/20 blur-2xl" />
                      )}

<div className="relative scale-[0.27]">
                        <Core
                          rank={rank.id}
                          energy={
                            current
                              ? Math.round(
                                  progress.progressPercentage
                                )
                              : unlocked
                              ? 100
                              : 20
                          }
                        />
                      </div>
                    </div>

                    <div className="mt-2 text-center">
                      <p
                        className={`text-xs font-black ${
                          current
                            ? "text-white"
                            : future
                            ? "text-zinc-600"
                            : "text-zinc-300"
                        }`}
                      >
                        {divisionLabel || rank.name}
                      </p>

                      {current && (
                        <span className="mt-1 inline-flex rounded-full bg-[#7c3aed]/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-[#c084fc]">
                          Atual
                        </span>
                      )}

                      {unlocked && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Conquistado
                        </span>
                      )}

                      {future && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-zinc-700">
                          <Lock className="h-3 w-3" />
                          Bloqueado
                        </span>
                      )}

                      {rank.id === "legend" && (
                        <p className="mt-2 max-w-[120px] text-[9px] font-black uppercase tracking-wider text-yellow-400">
                          Ranking Global
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
    })}

    </div>
  
    <div className="mt-6 border-t border-white/[0.06] pt-5">
    <p className="text-xs leading-5 text-zinc-500">
      Alimente seu Núcleo para avançar pelos ranks. Cada nova etapa
      altera o visual do Núcleo e libera uma nova posição competitiva
      dentro do PACE.
    </p>
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