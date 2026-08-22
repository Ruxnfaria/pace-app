"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Crown,
  Medal,
  Trophy,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

import {
  CORE_RANKS,
  CoreRankId,
  getCoreRankProgress,
} from "@/lib/gamification/coreStages";

type RankingUser = {
  user_id: string;
  nome?: string | null;
  total_xp: number;
  rankId: CoreRankId;
  rankName: string;
};

export default function RankingPage() {
  const supabase = createClient();

  const [ranking, setRanking] = useState<RankingUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedRank, setSelectedRank] =
    useState<CoreRankId>("beginner");

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRanking() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setCurrentUserId(user.id);

      const { data: profilesData, error } = await supabase
        .from("profiles")
        .select("user_id, nome, total_xp")
        .order("total_xp", { ascending: false });

      if (error) {
        console.error(
          "[PRAXE] Erro ao carregar ranking:",
          error
        );

        setLoading(false);
        return;
      }

      const formatted: RankingUser[] = (profilesData || []).map(
        (profile) => {
          const energy = Number(profile.total_xp) || 0;
          const progress = getCoreRankProgress(energy);

          return {
            user_id: profile.user_id,
            nome: profile.nome,
            total_xp: energy,
            rankId: progress.currentRank.id,
            rankName: progress.currentRank.name,
          };
        }
      );

      setRanking(formatted);

      const currentUser = formatted.find(
        (person) => person.user_id === user.id
      );

      if (currentUser) {
        setSelectedRank(currentUser.rankId);
      }

      setLoading(false);
    }

    loadRanking();
  }, [supabase]);

  const currentUser = useMemo(
    () =>
      ranking.find(
        (person) => person.user_id === currentUserId
      ) || null,
    [ranking, currentUserId]
  );

  const currentUserProgress = useMemo(() => {
    return getCoreRankProgress(
      currentUser?.total_xp || 0
    );
  }, [currentUser]);

  const selectedRankInfo = CORE_RANKS.find(
    (rank) => rank.id === selectedRank
  );

  const selectedRanking = useMemo(() => {
    return ranking
      .filter((person) => person.rankId === selectedRank)
      .sort((a, b) => b.total_xp - a.total_xp);
  }, [ranking, selectedRank]);

  const currentPosition =
    selectedRanking.findIndex(
      (person) => person.user_id === currentUserId
    ) + 1;

  const topThree = selectedRanking.slice(0, 3);
  const remainingUsers = selectedRanking.slice(3);

  if (loading) {
    return (
      <div className="p-6 lg:p-10 space-y-5 animate-pulse">
        <div className="h-8 w-56 bg-[#111111] rounded-xl" />
        <div className="h-72 bg-[#111111] rounded-3xl" />
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
          <p className="text-xs uppercase tracking-widest text-[#7c3aed] font-black">
            Competição Praxe
          </p>

          <h1 className="text-3xl font-black text-white">
            Ranking
          </h1>
        </div>
      </div>

      {/* SEU RANK */}
      <section className="rounded-3xl border border-[#7c3aed]/30 bg-gradient-to-r from-[#7c3aed]/15 to-purple-500/5 p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
              Seu rank atual
            </p>

            <h2 className="mt-2 text-3xl font-black text-white">
              {currentUserProgress.currentRank.name}
            </h2>

            <p className="mt-1 text-sm font-bold text-[#a855f7]">
              {currentUserProgress.currentRank.coreName}
            </p>
          </div>

          <div className="min-w-[220px]">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
                  Evolução
                </p>

                <p className="mt-1 text-xs text-zinc-400">
                  {currentUserProgress.nextRank
                    ? `Rumo a ${currentUserProgress.nextRank.name}`
                    : "Rank máximo"}
                </p>
              </div>

              <p className="text-3xl font-black text-white">
                {Math.round(
                  currentUserProgress.progressPercentage
                )}
                <span className="text-sm text-[#a855f7]">
                  %
                </span>
              </p>
            </div>

            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-[#c084fc] transition-all duration-700"
                style={{
                  width: `${currentUserProgress.progressPercentage}%`,
                }}
              />
            </div>

            {currentPosition > 0 &&
              selectedRank === currentUser?.rankId && (
                <p className="mt-3 text-xs font-bold text-zinc-400">
                  Você está em{" "}
                  <span className="text-[#a855f7]">
                    #{currentPosition}
                  </span>{" "}
                  neste rank.
                </p>
              )}
          </div>
        </div>
      </section>

      {/* CAMINHO DOS RANKS */}
      <section className="rounded-3xl border border-[#1f1f1f] bg-[#0d0d12] p-6">
        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#a855f7]">
            Caminho dos Ranks
          </p>

          <h2 className="mt-2 text-xl font-black text-white">
            Escolha um rank para ver a competição
          </h2>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-3">
          {CORE_RANKS.map((rank, index) => {
            const selected = selectedRank === rank.id;

            const userRankIndex = CORE_RANKS.findIndex(
              (item) =>
                item.id ===
                currentUserProgress.currentRank.id
            );

            const completed = index < userRankIndex;
            const current =
              rank.id ===
              currentUserProgress.currentRank.id;

            return (
              <button
                key={rank.id}
                onClick={() => setSelectedRank(rank.id)}
                className={`group min-w-[150px] rounded-2xl border p-4 text-left transition-all ${
                  selected
                    ? "border-[#a855f7] bg-[#7c3aed]/15 shadow-[0_0_30px_rgba(124,58,237,0.15)]"
                    : current
                    ? "border-[#7c3aed]/40 bg-[#7c3aed]/5"
                    : "border-[#1f1f1f] bg-[#111111] hover:border-[#7c3aed]/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      completed
                        ? "bg-emerald-500/10 text-emerald-400"
                        : selected || current
                        ? "bg-[#7c3aed]/20 text-[#c084fc]"
                        : "bg-white/[0.04] text-zinc-600"
                    }`}
                  >
                    <Trophy className="h-4 w-4" />
                  </div>

                  {current && (
                    <span className="text-[8px] uppercase tracking-wider font-black text-[#a855f7]">
                      Você
                    </span>
                  )}
                </div>

                <p
                  className={`mt-4 text-sm font-black ${
                    selected
                      ? "text-white"
                      : "text-zinc-300"
                  }`}
                >
                  {rank.name}
                </p>

                <p className="mt-1 text-[10px] text-zinc-600">
                  {rank.coreName}
                </p>

                {rank.id === "legend" && (
                  <p className="mt-3 text-[9px] font-black uppercase tracking-wider text-yellow-400">
                    Ranking Global
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* CLASSIFICAÇÃO */}
      <section className="space-y-5">

        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-500">
              Classificação
            </p>

            <h2 className="mt-1 text-2xl font-black text-white">
              {selectedRank === "legend"
                ? "Ranking Global Praxe"
                : `Ranking ${selectedRankInfo?.name || ""}`}
            </h2>
          </div>

          <p className="text-xs text-zinc-500">
            {selectedRanking.length}{" "}
            {selectedRanking.length === 1
              ? "atleta"
              : "atletas"}
          </p>
        </div>

        {selectedRanking.length === 0 ? (
          <div className="rounded-3xl border border-[#1f1f1f] bg-[#111111] p-12 text-center">
            <Trophy className="mx-auto h-8 w-8 text-zinc-700" />

            <h3 className="mt-4 font-black text-white">
              Ninguém chegou aqui ainda
            </h3>

            <p className="mt-2 text-sm text-zinc-500">
              Continue alimentando seu Núcleo e seja um
              dos primeiros atletas deste rank.
            </p>
          </div>
        ) : (
          <>
            {/* TOP 3 */}
            <div
              className={`grid gap-4 ${
                topThree.length === 1
                  ? "grid-cols-1 justify-items-center"
                  : topThree.length === 2
                  ? "grid-cols-1 md:grid-cols-2"
                  : "grid-cols-1 md:grid-cols-3"
              }`}
            >
              {topThree.map((person, index) => {
                const position = index + 1;
                const isCurrentUser =
                  person.user_id === currentUserId;

                const Icon =
                  position === 1
                    ? Crown
                    : position === 2
                    ? Medal
                    : Trophy;

                return (
                  <div
                    key={person.user_id}
                    className={`w-full rounded-3xl border p-6 ${
                      isCurrentUser
                        ? "border-[#7c3aed]/60 bg-[#7c3aed]/10"
                        : "border-[#1f1f1f] bg-[#111111]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-3xl font-black text-white">
                        #{position}
                      </span>

                      <Icon
                        className={`h-7 w-7 ${
                          position === 1
                            ? "text-yellow-400"
                            : position === 2
                            ? "text-zinc-300"
                            : "text-orange-400"
                        }`}
                      />
                    </div>

                    <h3 className="mt-5 text-lg font-black text-white">
                      {person.nome || "Atleta Praxe"}
                    </h3>

                    <p className="mt-1 text-xs text-zinc-500">
                      {person.rankName}
                    </p>

                    <p className="mt-4 text-xl font-black text-[#a855f7]">
                      ⚡ {person.total_xp} Energia
                    </p>

                    {isCurrentUser && (
                      <span className="mt-3 inline-flex rounded-full bg-[#7c3aed]/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#c084fc]">
                        Você
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* RESTANTE */}
            {remainingUsers.length > 0 && (
              <div className="overflow-hidden rounded-3xl border border-[#1f1f1f] bg-[#111111]">
                <div className="divide-y divide-[#1f1f1f]">
                  {remainingUsers.map(
                    (person, index) => {
                      const position = index + 4;
                      const isCurrentUser =
                        person.user_id === currentUserId;

                      return (
                        <div
                          key={person.user_id}
                          className={`flex items-center justify-between p-5 ${
                            isCurrentUser
                              ? "bg-[#7c3aed]/10"
                              : "hover:bg-white/[0.02]"
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <span className="w-10 font-black text-zinc-500">
                              #{position}
                            </span>

                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-white">
                                  {person.nome ||
                                    "Atleta Praxe"}
                                </p>

                                {isCurrentUser && (
                                  <span className="rounded-full bg-[#7c3aed]/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#a855f7]">
                                    Você
                                  </span>
                                )}
                              </div>

                              <p className="mt-1 text-xs text-zinc-600">
                                {person.rankName}
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="font-black text-[#a855f7]">
                              ⚡ {person.total_xp}
                            </p>

                            <p className="mt-1 text-[9px] uppercase tracking-wider text-zinc-600">
                              Energia
                            </p>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}