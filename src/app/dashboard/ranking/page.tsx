"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Crown, Medal, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type RankingUser = {
  user_id: string;
  nome?: string | null;
  weekly_xp?: number | null;
  league?: string | null;
  level?: number | null;
};
export default function RankingPage() {
  const supabase = createClient();

  const [ranking, setRanking] = useState<RankingUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRanking() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserId(user?.id || null);

      const { data: leaderboardData, error: leaderboardError } =
      await supabase
        .from("leaderboard")
        .select("user_id, weekly_xp, league")
        .order("weekly_xp", { ascending: false });
    
    if (leaderboardError) {
      console.error(
        "Erro ao carregar leaderboard:",
        leaderboardError
      );
    
      setLoading(false);
      return;
    }
    
    const userIds = (leaderboardData || []).map(
      (item) => item.user_id
    );
    
    const { data: profilesData, error: profilesError } =
      await supabase
        .from("profiles")
        .select("user_id, nome, level")
        .in("user_id", userIds);
    
    if (profilesError) {
      console.error(
        "Erro ao carregar perfis do ranking:",
        profilesError
      );
    
      setLoading(false);
      return;
    }
    
    const formattedRanking: RankingUser[] =
      (leaderboardData || []).map((item) => {
        const profile = (profilesData || []).find(
          (profileItem) =>
            profileItem.user_id === item.user_id
        );
    
        return {
          user_id: item.user_id,
          nome: profile?.nome || null,
          level: profile?.level || 1,
          weekly_xp: item.weekly_xp || 0,
          league: item.league || "Bronze",
        };
      });
    
    setRanking(formattedRanking);
      setLoading(false);
    }

    loadRanking();
  }, [supabase]);

  if (loading) {
    return (
      <div className="p-6 lg:p-10 space-y-5 animate-pulse">
        <div className="h-8 w-56 bg-[#111111] rounded-xl" />
        <div className="h-72 bg-[#111111] rounded-3xl" />
      </div>
    );
  }

  const topThree = ranking.slice(0, 3);
  const remainingUsers = ranking.slice(3);

  return (
    <div className="p-6 lg:p-10 space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="p-3 rounded-xl bg-[#111111] border border-[#1f1f1f] hover:border-[#7c3aed]/40 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>

        <div>
          <p className="text-xs uppercase tracking-widest text-[#7c3aed] font-black">
            Competição global
          </p>

          <h1 className="text-3xl font-black text-white">
            Ranking Pace
          </h1>
        </div>
      </div>

      <div className="rounded-3xl bg-gradient-to-r from-[#7c3aed]/20 to-purple-500/5 border border-[#7c3aed]/30 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-400 font-black">
              Sua liga atual
            </p>

            <h2 className="text-2xl font-black text-white mt-2">
              Liga Prata
            </h2>

            <p className="text-sm text-zinc-400 mt-1">
              Continue completando missões para subir para a Liga Ouro.
            </p>
          </div>

          <Trophy className="w-10 h-10 text-yellow-400" />
        </div>

        <div className="mt-5">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-zinc-400">Progresso da liga</span>
            <span className="font-black text-[#a855f7]">
              240 XP restantes
            </span>
          </div>

          <div className="h-3 rounded-full bg-[#1f1f1f] overflow-hidden">
            <div className="h-full w-[72%] bg-gradient-to-r from-[#7c3aed] to-purple-400 rounded-full" />
          </div>
        </div>
      </div>

      <div
  className={`grid gap-4 ${
    topThree.length === 1
      ? "grid-cols-1 justify-items-center"
      : topThree.length === 2
      ? "grid-cols-1 md:grid-cols-2 justify-items-center"
      : "grid-cols-1 md:grid-cols-3"
  }`}
>
        {topThree.map((person, index) => {
          const position = index + 1;
          const isCurrentUser = person.user_id === currentUserId;

          const Icon =
            position === 1 ? Crown : position === 2 ? Medal : Trophy;

          return (
            <div
              key={person.user_id}
              className={`w-full max-w-sm p-6 rounded-3xl border ${
                isCurrentUser
                  ? "bg-[#7c3aed]/10 border-[#7c3aed]/50"
                  : "bg-[#111111] border-[#1f1f1f]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl font-black text-white">
                  #{position}
                </span>

                <Icon
                  className={`w-7 h-7 ${
                    position === 1
                      ? "text-yellow-400"
                      : position === 2
                      ? "text-zinc-300"
                      : "text-orange-400"
                  }`}
                />
              </div>

              <h3 className="text-lg font-black text-white mt-5">
                {person.nome || "Atleta Pace"}
              </h3>

              <p className="text-sm text-zinc-500 mt-1">
  Liga {person.league || "Bronze"}
</p>

              <p className="text-2xl font-black text-[#7c3aed] mt-4">
                {person.weekly_xp || 0} XP
              </p>

              {isCurrentUser && (
                <span className="inline-flex mt-3 px-2.5 py-1 rounded-full bg-[#7c3aed]/20 text-[#a855f7] text-[10px] font-black uppercase tracking-wider">
                  Você
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl bg-[#111111] border border-[#1f1f1f] overflow-hidden">
        <div className="p-5 border-b border-[#1f1f1f]">
          <h2 className="text-sm font-black uppercase tracking-wider text-white">
            Classificação geral
          </h2>
        </div>

        <div className="divide-y divide-[#1f1f1f]">
          {remainingUsers.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-zinc-500">
                Você é o primeiro atleta do Ranking Pace.
              </p>

              <p className="mt-2 font-black text-[#7c3aed]">
                Convide outros atletas para competir com você.
              </p>
            </div>
          ) : (
            remainingUsers.map((person, index) => {
              const position = index + 4;
              const isCurrentUser = person.user_id === currentUserId;

              return (
                <div
                  key={person.user_id}
                  className={`flex items-center justify-between p-5 transition-colors ${
                    isCurrentUser
                      ? "bg-[#7c3aed]/10"
                      : "hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="w-8 text-sm font-black text-zinc-500">
                      #{position}
                    </span>

                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-white">
                          {person.nome || "Atleta Pace"}
                        </p>

                        {isCurrentUser && (
                          <span className="rounded-full bg-[#7c3aed]/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#a855f7]">
                            Você
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-zinc-500">
  Liga {person.league || "Bronze"}
</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-black text-[#7c3aed]">
                      {person.weekly_xp || 0} XP
                    </p>

                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                      Atleta Pace
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}