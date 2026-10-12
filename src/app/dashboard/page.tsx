"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Circle, Flame, Target } from "lucide-react";

import CoreHero from "@/components/dashboard/cards/CoreHero";
import { getCoreRankProgress } from "@/lib/gamification/coreStages";
import { createClient } from "@/lib/supabase/client";

type DashboardProfile = { total_xp?: number | null; level?: number | null; streak?: number | null };
type DashboardMission = { id: string; title: string; description?: string | null; completed: boolean; xp_reward?: number | null };

const WEEKDAY_LABELS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

function formatLocalDate(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function getWeekDates() {
  const today = new Date();
  const monday = new Date(today);
  const day = today.getDay();
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  return WEEKDAY_LABELS.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return { label, date: formatLocalDate(date) };
  });
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [missions, setMissions] = useState<DashboardMission[]>([]);
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadDashboard() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { if (!cancelled) setLoading(false); return; }
      const today = formatLocalDate(new Date());
      const weekStart = getWeekDates()[0].date;
      const [profileResult, missionsResult, workoutsResult, nutritionResult, waterResult, cardioResult, sleepResult] = await Promise.all([
        supabase.from("profiles").select("total_xp, level, streak").eq("user_id", user.id).maybeSingle(),
        supabase.from("daily_missions").select("id, title, description, completed, xp_reward").eq("user_id", user.id).eq("for_date", today).order("created_at", { ascending: true }),
        supabase.from("workout_logs").select("workout_date").eq("user_id", user.id).gte("workout_date", weekStart),
        supabase.from("nutrition_logs").select("logged_at").eq("user_id", user.id).gte("logged_at", `${weekStart}T00:00:00`),
        supabase.from("water_logs").select("logged_date").eq("user_id", user.id).gte("logged_date", weekStart),
        supabase.from("cardio_logs").select("cardio_date").eq("user_id", user.id).gte("cardio_date", weekStart),
        supabase.from("sleep_logs").select("sleep_date").eq("user_id", user.id).gte("sleep_date", weekStart),
      ]);
      if (cancelled) return;
      setProfile(profileResult.data);
      let todayMissions = missionsResult.data ?? [];
      if (todayMissions.length === 0) {
        const response = await fetch("/api/missions/generate", { method: "POST" });
        if (response.ok) {
          const refreshed = await supabase.from("daily_missions").select("id, title, description, completed, xp_reward").eq("user_id", user.id).eq("for_date", today).order("created_at", { ascending: true });
          todayMissions = refreshed.data ?? [];
        }
      }
      if (cancelled) return;
      setMissions(todayMissions);
      const dates = new Set<string>();
      for (const row of workoutsResult.data ?? []) if (row.workout_date) dates.add(row.workout_date);
      for (const row of nutritionResult.data ?? []) if (row.logged_at) dates.add(formatLocalDate(new Date(row.logged_at)));
      for (const row of waterResult.data ?? []) if (row.logged_date) dates.add(row.logged_date);
      for (const row of cardioResult.data ?? []) if (row.cardio_date) dates.add(row.cardio_date);
      for (const row of sleepResult.data ?? []) if (row.sleep_date) dates.add(row.sleep_date);
      setActiveDates(dates);
      setLoading(false);
    }
    void loadDashboard();
    return () => { cancelled = true; };
  }, [supabase]);

  const totalEnergy = Math.max(0, Number(profile?.total_xp) || 0);
  const level = Math.max(1, Number(profile?.level) || Math.floor(totalEnergy / 500) + 1);
  const streak = Math.max(0, Number(profile?.streak) || 0);
  const coreProgress = getCoreRankProgress(totalEnergy);
  const energyGoal = coreProgress.energyNeeded || Math.max(totalEnergy, 1);
  const energyInLevel = coreProgress.reachedMaximumRank ? totalEnergy : coreProgress.energyInsideRank;
  const progress = Math.round(coreProgress.progressPercentage);
  const week = getWeekDates();
  const visibleMissions = missions.slice(0, 3);

  if (loading) return <main className="mx-auto min-h-screen w-full max-w-[560px] animate-pulse px-5 pb-32 pt-6 sm:px-8"><div className="h-8 w-28 rounded-lg bg-white/[0.06]" /><div className="mx-auto mt-16 h-72 w-72 rounded-full bg-white/[0.04]" /><div className="mt-10 h-2 rounded-full bg-white/[0.06]" /><div className="mt-14 space-y-3"><div className="h-20 rounded-[24px] bg-white/[0.05]" /><div className="h-20 rounded-[24px] bg-white/[0.05]" /></div></main>;

  return (
    <main className="mx-auto min-h-screen w-full max-w-[560px] overflow-hidden px-5 pb-32 pt-6 sm:px-8 sm:pt-8 lg:pb-16">
      <header className="flex items-center justify-between">
        <div className="flex h-9 w-32 items-center" data-praxe-logo-slot>
          {/* Replace with /public/brand/praxe-logo.svg when the supplied wordmark is available. */}
          <span className="text-xl font-black tracking-[0.22em] text-white" aria-label="PRAXE">PRAXE</span>
        </div>
        <div className="flex items-center gap-1.5" aria-label={`${streak} dias de consistência`}><Flame className="h-5 w-5 fill-[#ff6a00] text-[#ff6a00]" aria-hidden="true" /><span className="text-base font-bold tabular-nums text-white">{streak}</span></div>
      </header>

      <section className="mt-9 text-center" aria-labelledby="core-title">
        <h1 id="core-title" className="text-[1.7rem] font-medium tracking-[-0.04em] text-[#f7f4ef]">Seu Núcleo</h1>
        <CoreHero totalXP={totalEnergy} />
        <div className="-mt-2">
          <p className="text-lg font-semibold text-white">Nível {level}</p>
          <p className="mt-1 text-sm font-medium text-zinc-400"><span className="text-[#ff7a00]">{energyInLevel.toLocaleString("pt-BR")}</span>{" / "}{energyGoal.toLocaleString("pt-BR")} Energia</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#242424]" aria-label={`${progress}% do nível atual`}><div className="h-full rounded-full bg-[#ff6a00] shadow-[0_0_18px_rgba(255,106,0,0.48)] transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div>
        </div>
      </section>

      <section className="mt-8" aria-label="Consistência semanal">
        <div className="grid grid-cols-7 gap-1.5">
          {week.map((day) => {
            const checked = activeDates.has(day.date);
            return <div key={day.date} className="flex flex-col items-center gap-2.5"><span className="text-[10px] font-bold tracking-[0.04em] text-zinc-500">{day.label}</span><span className={`flex h-8 w-8 items-center justify-center rounded-full border ${checked ? "border-[#ff6a00] bg-[#ff6a00] text-white" : "border-zinc-700 bg-[#111] text-zinc-700"}`} aria-label={`${day.label}: ${checked ? "atividade concluída" : "sem atividade"}`}>{checked ? <Check className="h-4 w-4 stroke-[3]" aria-hidden="true" /> : <Circle className="h-2 w-2 fill-current" aria-hidden="true" />}</span></div>;
          })}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="missions-title">
        <div className="flex items-center justify-between"><h2 id="missions-title" className="text-xl font-semibold tracking-[-0.03em] text-white">Missões de hoje</h2><Link href="/dashboard/missions" className="flex min-h-11 items-center gap-1 text-xs font-semibold text-zinc-400 transition hover:text-white">Ver todas <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link></div>
        <div className="mt-3 space-y-3">
          {visibleMissions.map((mission) => <Link key={mission.id} href="/dashboard/missions" className={`flex min-h-[78px] items-center gap-4 rounded-[24px] bg-[#f4f1eb] px-4 py-3.5 text-[#101010] transition active:scale-[0.99] motion-reduce:transition-none ${mission.completed ? "opacity-75" : ""}`}><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${mission.completed ? "bg-[#ff6a00] text-white" : "bg-black/[0.06] text-black"}`}>{mission.completed ? <Check className="h-5 w-5 stroke-[3]" aria-hidden="true" /> : <Target className="h-5 w-5" aria-hidden="true" />}</span><span className="min-w-0 flex-1"><span className={`block truncate text-sm font-bold ${mission.completed ? "line-through decoration-black/40" : ""}`}>{mission.title}</span><span className="mt-1 block text-xs font-semibold text-[#d55200]">+{mission.xp_reward ?? 0} Energia{mission.completed ? " · Concluída" : ""}</span></span><ChevronRight className="h-5 w-5 shrink-0 text-black/35" aria-hidden="true" /></Link>)}
          {visibleMissions.length === 0 && <div className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] px-5 py-7 text-center text-sm text-zinc-500">Nenhuma missão disponível hoje.</div>}
        </div>
      </section>
    </main>
  );
}
