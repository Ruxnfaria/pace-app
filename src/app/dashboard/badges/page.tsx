"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Lock, Sparkles, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRewardQueue } from "@/components/gamification/RewardQueueProvider";
import { GamificationActions } from "@/lib/gamification/actions";

type Profile = {
  total_xp?: number | null;
  level?: number | null;
  streak?: number | null;
};

type BadgeRecord = {
  badge_name?: string | null;
};

type Achievement = {
  key: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  target: number;
  progressLabel: string;
};

export default function BadgesPage() {
  const supabase = createClient();
  const { enqueueActions } = useRewardQueue();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [savedBadges, setSavedBadges] = useState<BadgeRecord[]>([]);
  const [completedMissions, setCompletedMissions] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAchievements() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const [
        { data: profileData },
        { data: badgesData },
        { count: missionCount },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("total_xp, level, streak")
          .eq("user_id", user.id)
          .maybeSingle(),

        supabase
          .from("badges")
          .select("badge_name")
          .eq("user_id", user.id),

        supabase
          .from("daily_missions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("completed", true),
      ]);

      setProfile(profileData || null);
      setSavedBadges(badgesData || []);
      setCompletedMissions(missionCount || 0);
      setLoading(false);
    }

    loadAchievements();
  }, [supabase]);

  const achievements = useMemo<Achievement[]>(() => {
    const totalXP = profile?.total_xp || 0;
    const level = profile?.level || 1;
    const streak = profile?.streak || 0;

    const unlockedNames = new Set(
      savedBadges
        .map((badge) => badge.badge_name)
        .filter((name): name is string => Boolean(name))
    );

    const hasBadge = (name: string) => unlockedNames.has(name);

    return [
      {
        key: "first_mission",
        name: "Primeiro Passo",
        description: "Complete sua primeira missão no Pace.",
        icon: "🏅",
        unlocked: completedMissions >= 1 || hasBadge("Primeiro Passo"),
        progress: Math.min(completedMissions, 1),
        target: 1,
        progressLabel: `${Math.min(completedMissions, 1)}/1 missão`,
      },
      {
        key: "100_xp",
        name: "Início da Jornada",
        description: "Acumule suas primeiras 100 de Energia.",
        icon: "⚡",
        unlocked: totalXP >= 100,
        progress: Math.min(totalXP, 100),
        target: 100,
        progressLabel: `${Math.min(totalXP, 100)}/100 Energia`,      },
      {
        key: "500_xp",
        name: "Atleta Disciplinado",
        description: "Alcance a marca de 500 de Energia.",
        icon: "💪",
        unlocked: totalXP >= 500,
        progress: Math.min(totalXP, 500),
        target: 500,
        progressLabel: `${Math.min(totalXP, 500)}/500 Energia`,
      },
      {
        key: "7_day_streak",
        name: "Consistência",
        description: "Complete missões por 7 dias consecutivos.",
        icon: "🔥",
        unlocked: streak >= 7 || hasBadge("Consistência"),
        progress: Math.min(streak, 7),
        target: 7,
        progressLabel: `${Math.min(streak, 7)}/7 dias`,
      },
      {
        key: "level_5",
        name: "Nível 5",
        description: "Alcance o nível 5 no Pace.",
        icon: "🚀",
        unlocked: level >= 5,
        progress: Math.min(level, 5),
        target: 5,
        progressLabel: `Nível ${Math.min(level, 5)}/5`,
      },
      {
        key: "30_day_streak",
        name: "Guerreiro Pace",
        description: "Mantenha uma sequência de 30 dias.",
        icon: "🏆",
        unlocked: streak >= 30,
        progress: Math.min(streak, 30),
        target: 30,
        progressLabel: `${Math.min(streak, 30)}/30 dias`,
      },
    ];
  }, [profile, savedBadges, completedMissions]);

  useEffect(() => {
    async function syncUnlockedAchievements() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
  
      if (!user) return;
  
      const savedBadgeNames = new Set(
        savedBadges
          .map((badge) => badge.badge_name)
          .filter((name): name is string => Boolean(name))
      );
  
      const newlyUnlocked = achievements.filter(
        (achievement) =>
          achievement.unlocked && !savedBadgeNames.has(achievement.name)
      );
  
      if (newlyUnlocked.length === 0) return;
  
      const newBadgeRecords: BadgeRecord[] = [];
  
      for (const achievement of newlyUnlocked) {
        const { error } = await supabase.from("badges").insert({
          user_id: user.id,
          badge_name: achievement.name,
          badge_description: achievement.description,
        });
  
        if (error) {
          console.error(
            `[PACE] Erro ao salvar conquista ${achievement.name}:`,
            error
          );
          continue;
        }
  
        newBadgeRecords.push({
          badge_name: achievement.name,
        });
  
        enqueueActions([
          GamificationActions.showAchievementUnlocked(
            achievement.key,
            achievement.name
          ),
        ]);
      }
  
      if (newBadgeRecords.length > 0) {
        setSavedBadges((current) => [
          ...current,
          ...newBadgeRecords,
        ]);
      }
    }
  
    if (!loading) {
      syncUnlockedAchievements();
    }
  }, [
    achievements,
    loading,
    savedBadges,
    supabase,
    enqueueActions,
  ]);

  const unlockedCount = achievements.filter(
    (achievement) => achievement.unlocked
  ).length;

  if (loading) {
    return (
      <div className="p-6 lg:p-10 space-y-6 animate-pulse">
        <div className="h-20 rounded-3xl bg-[#111111]" />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div
              key={item}
              className="h-60 rounded-3xl bg-[#111111]"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 space-y-8">
      <div className="rounded-3xl border border-[#7c3aed]/30 bg-gradient-to-r from-[#7c3aed]/20 to-purple-500/5 p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[#a855f7]">
              Sua jornada no Pace
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
              Conquistas
            </h1>

            <p className="mt-2 max-w-xl text-sm text-zinc-400">
            Complete missões, gere Energia e mantenha sua sequência para
            fortalecer seu Núcleo e desbloquear novos marcos.
            </p>
          </div>

          <div className="min-w-44 rounded-2xl border border-[#7c3aed]/30 bg-black/20 p-4">
            <div className="flex items-center gap-2 text-[#a855f7]">
              <Trophy className="h-5 w-5" />

              <span className="text-xs font-black uppercase tracking-wider">
                Progresso
              </span>
            </div>

            <p className="mt-2 text-3xl font-black text-white">
              {unlockedCount}/{achievements.length}
            </p>

            <p className="text-xs text-zinc-500">
              conquistas desbloqueadas
            </p>
          </div>
        </div>

        <div className="mt-6 h-3 overflow-hidden rounded-full bg-[#1f1f1f]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-purple-400 transition-all duration-700"
            style={{
              width: `${
                achievements.length > 0
                  ? (unlockedCount / achievements.length) * 100
                  : 0
              }%`,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {achievements.map((achievement) => {
          const progressPercent = Math.min(
            (achievement.progress / achievement.target) * 100,
            100
          );

          return (
            <div
              key={achievement.key}
              className={`relative min-h-64 overflow-hidden rounded-3xl border p-6 transition-all ${
                achievement.unlocked
                  ? "border-[#7c3aed]/50 bg-[#7c3aed]/10 shadow-lg shadow-purple-950/10"
                  : "border-[#1f1f1f] bg-[#111111]"
              }`}
            >
              {achievement.unlocked && (
                <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[#7c3aed]/10 blur-3xl" />
              )}

              <div className="relative flex h-full flex-col">
                <div className="flex items-start justify-between">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-3xl ${
                      achievement.unlocked
                        ? "border-[#7c3aed]/30 bg-[#7c3aed]/15"
                        : "border-[#1f1f1f] bg-[#0a0a0a] grayscale"
                    }`}
                  >
                    {achievement.icon}
                  </div>

                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                      achievement.unlocked
                        ? "border-green-500/30 bg-green-500/10 text-green-400"
                        : "border-[#1f1f1f] bg-[#0a0a0a] text-zinc-600"
                    }`}
                  >
                    {achievement.unlocked ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                  </div>
                </div>

                <div className="mt-5">
                  <h2 className="text-lg font-black text-white">
                    {achievement.name}
                  </h2>

                  <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                    {achievement.description}
                  </p>
                </div>

                <div className="mt-auto pt-6">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-500">
                      {achievement.progressLabel}
                    </span>

                    <span
                      className={`font-black ${
                        achievement.unlocked
                          ? "text-green-400"
                          : "text-[#a855f7]"
                      }`}
                    >
                      {achievement.unlocked
                        ? "Desbloqueada"
                        : `${Math.round(progressPercent)}%`}
                    </span>
                  </div>

                  <div className="h-2.5 overflow-hidden rounded-full bg-[#1f1f1f]">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        achievement.unlocked
                          ? "bg-gradient-to-r from-green-500 to-emerald-400"
                          : "bg-gradient-to-r from-[#7c3aed] to-purple-400"
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Sparkles
                      className={`h-4 w-4 ${
                        achievement.unlocked
                          ? "text-yellow-400"
                          : "text-zinc-700"
                      }`}
                    />

                    <span
                      className={`text-[10px] font-black uppercase tracking-widest ${
                        achievement.unlocked
                          ? "text-yellow-400"
                          : "text-zinc-600"
                      }`}
                    >
                      {achievement.unlocked
                        ? "Conquista alcançada"
                        : "Continue evoluindo"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}