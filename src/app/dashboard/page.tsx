"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";


import { MissionsList } from "@/components/dashboard/cards/MissionsList";
import { TodayGoal } from "@/components/dashboard/cards/TodayGoal";
import CoreHero from "@/components/dashboard/cards/CoreHero";
import NextActionCard from "@/components/dashboard/cards/NextActionCard";
import MissionOverviewCard from "@/components/dashboard/MissionOverviewCard";
import BottomSummary from "@/components/dashboard/BottomSummary";
import { useRewardQueue } from "@/components/gamification/RewardQueueProvider";
import { GamificationActions } from "@/lib/gamification/actions";
import EnergyToday from "@/components/dashboard/EnergyToday";
import {
  didCoreStageChange,
  getCoreRankProgress,
} from "@/lib/gamification/coreStages";

import {
  Zap,
  Play,
  MessageSquare,
  ArrowRight,
  ClipboardList,
  CheckCircle2,
  Circle,
} from "lucide-react";
function getMissionsByGoal(goal?: string | null, userId?: string, dateStr?: string) {
  const normalizedGoal = (goal || "").toLowerCase();

  const base = {
    user_id: userId,
    completed: false,
    for_date: dateStr,
    current_value: 0,
  };

  if (normalizedGoal.includes("emagrec")) {
    return [
      { ...base, title: "Ficar dentro da meta calórica", description: "Finalize o dia dentro das calorias planejadas.", category: "daily", xp_reward: 50, target_value: 1 },
      { ...base, title: "Fazer cardio ou caminhada", description: "Complete pelo menos 30 minutos.", category: "daily", xp_reward: 40, target_value: 1 },
      { ...base, title: "Treinar 3 vezes na semana", description: "Complete 3 treinos nesta semana.", category: "weekly", xp_reward: 150, target_value: 3 },
      { ...base, title: "Fazer 2 cardios na semana", description: "Complete 2 sessões de cardio.", category: "weekly", xp_reward: 120, target_value: 2 },
      { ...base, title: "Perder 2kg no mês", description: "Meta mensal de emagrecimento saudável.", category: "monthly", xp_reward: 300, target_value: 2 },
    ];
  }

  return [
    { ...base, title: "Treinar musculação hoje", description: "Complete o treino planejado.", category: "daily", xp_reward: 50, target_value: 1 },
    { ...base, title: "Bater proteína do dia", description: "Consuma sua meta de proteína.", category: "daily", xp_reward: 40, target_value: 1 },
    { ...base, title: "Treinar 5 vezes na semana", description: "Complete 5 treinos de musculação.", category: "weekly", xp_reward: 180, target_value: 5 },
    { ...base, title: "Fazer 1 cardio leve na semana", description: "Cardio leve para saúde cardiovascular.", category: "weekly", xp_reward: 80, target_value: 1 },
    { ...base, title: "Ganhar 1kg no mês", description: "Meta mensal de evolução em massa corporal.", category: "monthly", xp_reward: 300, target_value: 1 },
  ];
}
export default function DashboardPage() {
  const supabase = createClient();
  const { enqueueActions } = useRewardQueue();
  const [userName, setUserName] = useState('Atleta');
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Estados reais para armazenar os dados vindo do Supabase
  const [latestWorkout, setLatestWorkout] = useState<any>(null);
  const [latestNutrition, setLatestNutrition] = useState<any>(null);
  const [missions, setMissions] = useState<any[]>([]);
  const [completedMissionDates, setCompletedMissionDates] = useState<string[]>([]);
  const [rankingPosition, setRankingPosition] = useState<number | null>(null);
  useEffect(() => {
    async function loadDashboardData() {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const startDate = new Date();
startDate.setDate(startDate.getDate() - 6);

const startDateStr = [
  startDate.getFullYear(),
  String(startDate.getMonth() + 1).padStart(2, "0"),
  String(startDate.getDate()).padStart(2, "0"),
].join("-");

const { data: completedHistory, error: completedHistoryError } =
  await supabase
    .from("daily_missions")
    .select("for_date, completed")
    .eq("user_id", user.id)
    .eq("completed", true)
    .gte("for_date", startDateStr)
    .order("for_date", { ascending: true });

if (completedHistoryError) {
  console.error(
    "Erro ao carregar calendário:",
    completedHistoryError
  );
} else {
  const completedDates = Array.from(
    new Set(
      (completedHistory || [])
        .map((mission) => mission.for_date)
        .filter(Boolean)
    )
  );

  setCompletedMissionDates(completedDates);
}
        // 1. Puxa os dados cadastrais do Perfil
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
          console.log("USER ID:", user.id);
          console.log("PROFILE DATA:", profileData);
        if (profileData) {
          setProfile(profileData);
          if (profileData.nome) {
            setUserName(profileData.nome.split(' ')[0]);
          }
        }
        const { data: rankingData } = await supabase
  .from("profiles")
  .select("user_id, total_xp")
  .order("total_xp", { ascending: false });

if (rankingData && profileData) {
  const userEnergy = Number(profileData.total_xp) || 0;

  const userRank = getCoreRankProgress(
    userEnergy
  ).currentRank.id;

  const usersInSameRank = rankingData.filter((item) => {
    const itemEnergy = Number(item.total_xp) || 0;

    return (
      getCoreRankProgress(itemEnergy).currentRank.id ===
      userRank
    );
  });

  const position =
    usersInSameRank.findIndex(
      (item) => item.user_id === user.id
    ) + 1;

  setRankingPosition(
    position > 0 ? position : null
  );
}

        // 2. BUSCA EM TEMPO REAL: Último Treino injetado pela IA
        const { data: workoutData } = await supabase
          .from('workouts')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (workoutData) setLatestWorkout(workoutData);

        // 3. BUSCA EM TEMPO REAL: Último Plano Nutricional injetado pela IA
        const { data: nutritionData } = await supabase
  .from('nutrition_plans')
  .select('*')
  .eq('user_id', user.id)
  .eq('active', true)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();
        
        if (nutritionData) setLatestNutrition(nutritionData);

        // 4. BUSCA EM TEMPO REAL: Missões do dia de hoje
        const todayStr = new Date().toISOString().split('T')[0];
        const { data: missionsData } = await supabase
          .from('daily_missions')
          .select('*')
          .eq('user_id', user.id)
          .eq('for_date', todayStr)
          .order('created_at', { ascending: true });
        
          if (missionsData && missionsData.length > 0) {
            setMissions(missionsData);
          } else {
            const generatedMissions = getMissionsByGoal(
              profileData?.objetivo || profileData?.goal,
              user.id,
              todayStr
            );
            console.log("OBJETIVO:", profile?.objetivo || profile?.goal);
console.log("MISSÕES GERADAS:", generatedMissions);
            const { data: insertedMissions, error: insertError } = await supabase
              .from("daily_missions")
              .insert(generatedMissions)
              .select("*");
              console.log("ERRO AO INSERIR MISSÕES:", insertError);
              console.log("MISSÕES INSERIDAS:", insertedMissions);
            if (!insertError && insertedMissions) {
              setMissions(insertedMissions);
            }
          }
      }
      setLoading(false);
    }
    
    loadDashboardData();
  }, [supabase]);

  async function handleToggleMission(id: string, currentStatus: boolean) {
    const mission = missions.find((m) => m.id === id);
    if (!mission) return;
  
    const xpReward = mission.xp_reward || 50;
    const newStatus = !currentStatus;
    const xpChange = newStatus ? xpReward : -xpReward;
    const currentXP = profile?.total_xp || 0;
    
    const currentTotalXP = profile?.total_xp || 0;
    const newTotalXP = Math.max(0, currentTotalXP + xpChange);
    const newLevel = Math.max(1, Math.floor(newTotalXP / 500) + 1);
    const coreStageChanged = didCoreStageChange(
      currentTotalXP,
      newTotalXP
    );
  
    let newStreak = profile?.streak || 0;
  
    if (newStatus) {
      const today = new Date().toISOString().split("T")[0];
  
      if (!profile?.last_activity_date) {
        newStreak = 1;
      } else {
        const lastDate = new Date(profile.last_activity_date);
        const currentDate = new Date(today);
  
        const diffDays = Math.floor(
          (currentDate.getTime() - lastDate.getTime()) /
            (1000 * 60 * 60 * 24)
        );
  
        if (diffDays === 1) {
          newStreak += 1;
        } else if (diffDays > 1) {
          newStreak = 1;
        }
      }
  
      const { data: existingBadge } = await supabase
        .from("badges")
        .select("*")
        .eq("user_id", mission.user_id)
        .eq("badge_name", "Primeiro Passo")
        .maybeSingle();
  
      if (!existingBadge) {
        await supabase.from("badges").insert({
          user_id: mission.user_id,
          badge_name: "Primeiro Passo",
          badge_description: "Complete sua primeira missão.",
        });
      }
  
      const { data: consistencyBadge } = await supabase
        .from("badges")
        .select("*")
        .eq("user_id", mission.user_id)
        .eq("badge_name", "Consistência")
        .maybeSingle();
  
      if (newStreak >= 7 && !consistencyBadge) {
        await supabase.from("badges").insert({
          user_id: mission.user_id,
          badge_name: "Consistência",
          badge_description: "Complete missões por 7 dias seguidos.",
        });
      }
    }
  
    const { data, error: missionError } =
    await supabase.rpc(
      "toggle_mission_with_xp",
      {
        p_mission_id: id,
        p_completed: newStatus,
      }
    );
  
    if (missionError) {
      console.error("Erro ao atualizar missão:", missionError);
      return;
    }
    console.log("XP atualizado:", data);
    const { error: profileError } = await supabase
  .from("profiles")
  .upsert(
    {
      user_id: mission.user_id,
      total_xp: newTotalXP,
      level: newLevel,
      streak: newStreak,
      last_activity_date: newStatus
        ? new Date().toISOString().split("T")[0]
        : profile?.last_activity_date,
    },
    { onConflict: "user_id" }
  );
  
    if (profileError) {
      console.error("Erro ao atualizar perfil:", profileError);
      return;
    }
  
    setMissions((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              completed: newStatus,
              completed_at: newStatus
                ? new Date().toISOString()
                : null,
            }
          : m
      )
    );
    if (newStatus)
    setProfile((prev: any) => ({
      ...prev,
      total_xp: newTotalXP,
      level: newLevel,
      streak: newStreak,
      last_activity_date: new Date().toISOString().split("T")[0],
    }));
  }

  // Cálculos matemáticos de progresso dinâmico
  const totalMissions = missions.length;
  const completedMissions = missions.filter(m => m.completed).length;
  const progressPercent = totalMissions > 0 ? Math.round((completedMissions / totalMissions) * 100) : 0;

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const totalXP = profile?.total_xp || 0;

const coreProgress = getCoreRankProgress(totalXP);
const currentRank = coreProgress.currentRank;
const nextRank = coreProgress.nextRank;
const coreProgressPercent = Math.round(
  coreProgress.progressPercentage
);
  

      const today = new Date();

      function formatLocalDate(date: Date) {
        return [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, "0"),
          String(date.getDate()).padStart(2, "0"),
        ].join("-");
      }
      
      const weekDays = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(today);
      
        date.setDate(today.getDate() - (6 - index));
      
        const dateString = formatLocalDate(date);
        const isToday = index === 6;
      
        return {
          label: isToday
            ? "Hoje"
            : date
                .toLocaleDateString("pt-BR", {
                  weekday: "short",
                })
                .replace(".", ""),
          day: date.getDate().toString(),
          date: dateString,
          checked: completedMissionDates.includes(dateString),
        };
      });
      function getExerciseCount(exercises: unknown) {
        if (!exercises) return 0;
      
        try {
          const parsedExercises =
            typeof exercises === "string"
              ? JSON.parse(exercises)
              : exercises;
      
          return Array.isArray(parsedExercises)
            ? parsedExercises.length
            : 0;
        } catch {
          return 0;
        }
      }
      
      const latestWorkoutExerciseCount = getExerciseCount(
        latestWorkout?.exercises
      );
  if (loading) {
    return (
      <div className="p-6 lg:p-10 space-y-6 animate-pulse">
        <div className="h-8 bg-[#111111] w-48 rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-[#111111] rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 space-y-8">
  

     {/* EVOLUTION COCKPIT — TOPO */}
<section className="space-y-5">
  {/* HERO / SAUDAÇÃO */}
  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
    <div className="space-y-2">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-[#8b5cf6]">
        Evolution Cockpit
      </p>

      <h1 className="text-3xl font-black tracking-tight text-white lg:text-4xl">
        {saudacao}, {userName}
      </h1>

      <p className="text-sm font-medium text-zinc-300">
        Disciplina hoje, evolução sempre.
      </p>

      <p className="text-xs text-zinc-500">
        {new Date().toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </p>
    </div>

    <div className="flex items-center gap-3 rounded-2xl border border-[#232336] bg-[#111118] px-4 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
        <span className="text-xl">🔥</span>
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
          Sequência atual
        </p>

        <p className="text-lg font-black text-orange-400">
          {profile?.streak || 0}{" "}
          {(profile?.streak || 0) === 1 ? "dia" : "dias"}
        </p>
      </div>
    </div>
  </div>

  {/* CONSISTÊNCIA SEMANAL */}
  <div className="rounded-2xl border border-[#232336] bg-[#0d0d14] p-4">
    <div className="mb-4 flex items-center justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">
          Consistência semanal
        </p>

        <p className="mt-1 text-xs text-zinc-600">
          Cada dia ativo fortalece sua sequência.
        </p>
      </div>

      <span className="text-xs font-black text-[#a855f7]">
        {weekDays.filter((day) => day.checked).length}/7 dias
      </span>
    </div>

    <div className="grid grid-cols-7 gap-2">
      {weekDays.map((day) => {
        const isToday = day.label === "Hoje";

        return (
          <div
            key={day.date}
            className="flex min-w-0 flex-col items-center gap-2"
          >
            <span
              className={`truncate text-[10px] font-black uppercase sm:text-xs ${
                isToday ? "text-[#a855f7]" : "text-zinc-500"
              }`}
            >
              {day.label}
            </span>

            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-black transition-all sm:h-11 sm:w-11 ${
                day.checked
                  ? "border-[#8b5cf6] bg-[#7c3aed]/20 text-white shadow-[0_0_20px_rgba(124,58,237,0.22)]"
                  : isToday
                  ? "border-[#a855f7] bg-[#a855f7]/10 text-[#c084fc]"
                  : "border-[#292938] bg-[#111118] text-zinc-500"
              }`}
            >
              {day.checked ? "✓" : day.day}
            </div>
          </div>
        );
      })}
    </div>
  </div>

 {/* NÚCLEO PRINCIPAL DO PACE */}
 <CoreHero
  level={1}
  levelName={currentRank.name}
  totalXP={totalXP}
  xpMissing={coreProgress.energyMissing}
  xpProgress={coreProgressPercent}
  completedMissions={completedMissions}
  totalMissions={totalMissions}
  rankingPosition={rankingPosition}
/>

<NextActionCard
  title={latestWorkout?.title}
  exerciseCount={latestWorkoutExerciseCount}
  duration={latestWorkout?.duration || 50}
  energyReward={120}
  xpReward={50}
  crystalReward={8}
/>

<EnergyToday
  workoutCompleted={missions.some(
    (mission) =>
      mission.completed &&
      mission.title.toLowerCase().includes("treinar")
  )}
  proteinCompleted={missions.some(
    (mission) =>
      mission.completed &&
      mission.title.toLowerCase().includes("proteína")
  )}
  waterProgress={0}
  cardioCompleted={missions.some(
    (mission) =>
      mission.completed &&
      mission.title.toLowerCase().includes("cardio")
  )}
  sleepCompleted={false}
/>

</section>
<MissionOverviewCard
  missions={missions.length}
  totalXP={totalXP}
/>
<BottomSummary
  streak={profile?.streak || 0}
  rankingPosition={rankingPosition}
  leagueName={currentRank.name}
  xpMissing={coreProgress.energyMissing}
/>

{/* OBJETIVO ATUAL */}
<div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f]">
  <div className="flex items-center justify-between mb-4">
    <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
      🎯 Objetivo Atual
    </span>

    <span className="text-2xl">
      🎯
    </span>
  </div>

  <h3 className="text-lg font-black text-white">
    Ganhar Massa Muscular
  </h3>

  <p className="text-sm text-zinc-400 mt-1">
    {profile?.peso || 66}kg / 70kg
  </p>

  <div className="mt-4">
    <div className="flex justify-between text-xs mb-2">
      <span className="text-zinc-500">Progresso</span>

      <span className="font-black text-[#7c3aed]">
        {Math.round(((profile?.peso || 66) / 70) * 100)}%
      </span>
    </div>

    <div className="w-full bg-zinc-800 h-3 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-purple-500 to-violet-600 rounded-full"
        style={{
          width: `${Math.min(
            ((profile?.peso || 66) / 70) * 100,
            100
          )}%`
        }}
      />
    </div>
  </div>
</div>
<div className="p-6 rounded-3xl bg-[#111111] border border-[#1f1f1f]">
  <div className="flex items-center justify-between mb-4">
    <div>
      <p className="text-xs uppercase tracking-widest text-zinc-500 font-black">
        Dieta Ativa
      </p>

      <h3 className="text-xl font-black text-white mt-1">
        {latestNutrition?.calories || 0} kcal
      </h3>
    </div>

    <span className="text-3xl">🥗</span>
  </div>

  <div className="grid grid-cols-3 gap-3 text-center">
    <div>
      <p className="text-xs text-zinc-500">Proteína</p>
      <p className="font-black text-[#7c3aed]">
        {latestNutrition?.protein || 0}g
      </p>
    </div>

    <div>
      <p className="text-xs text-zinc-500">Carbo</p>
      <p className="font-black text-orange-400">
        {latestNutrition?.carbs || 0}g
      </p>
    </div>

    <div>
      <p className="text-xs text-zinc-500">Gordura</p>
      <p className="font-black text-yellow-400">
        {latestNutrition?.fat || 0}g
      </p>
    </div>
  </div>

  <Link
    href="/dashboard/nutrition"
    className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#7c3aed]"
  >
    Abrir Nutrição
    <ArrowRight className="w-4 h-4" />
  </Link>
</div>
      {/* CALL TO ACTION — MENTORIA PREMIUM */}
      <Link href="/dashboard/aria" className="block p-6 rounded-2xl bg-gradient-to-r from-[#7c3aed]/10 via-purple-500/5 to-transparent border border-[#7c3aed]/20 hover:border-[#7c3aed]/40 transition-all group">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-[#7c3aed] text-white shadow-lg">
              <MessageSquare className="w-5 h-5 fill-white" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white group-hover:text-[#7c3aed] transition-colors flex items-center gap-1.5">
                Falar com os Especialistas Pace <Zap className="w-3.5 h-3.5 text-[#7c3aed] fill-[#7c3aed]" />
              </h3>
              <p className="text-xs text-zinc-400 max-w-xl">
                Acesse o canal direto da sua assessoria privada. Fale agora com o **Coach Lucas Zanetti** (Treino) ou com o **Dr. Gabriel Fontes** (Nutrição) para montar ou ajustar o seu protocolo.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs font-bold text-[#7c3aed] group-hover:translate-x-1 transition-transform">
            Abrir Mentoria <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </Link>

    </div>
  );
}