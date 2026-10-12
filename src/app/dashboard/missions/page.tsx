'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Target, CheckCircle2, Sparkles, Calendar } from 'lucide-react';
import Link from 'next/link';
import { getCoreRankProgress } from '@/lib/gamification/coreStages';
import { getBrazilDate, getBrazilMonthRangeFromDate } from '@/lib/dates/brazilDate';
import MissionsExperience, { type ChestView, type MissionView } from '@/components/missions/MissionsExperience';

interface Mission {
  id: string;
  title: string;
  completed: boolean;
  for_date: string;
  xp_reward: number;
  current_value: number;
  target_value: number;
  description: string | null;
  category: string | null;
}

type UserChest = { status: 'granted' | 'opened'; source_id: string | null };

export default function MissionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [userXp, setUserXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [userChests, setUserChests] = useState<UserChest[]>([]);


  const loadMissionsAndData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await fetch('/api/missions/generate', {
        method: 'POST',
      });
      // 1. Busca Energia real do perfil do usuário
      const { data: profile } = await supabase
        .from('profiles')
        .select('total_xp, streak')
        .eq('user_id', user.id)
        .single();
        if (profile) {
          setUserXp(profile.total_xp || 0);
          setStreak(Math.max(0, Number(profile.streak) || 0));
        }

      // 2. Busca todas as missões da tabela correta (daily_missions)
      const { data: missionsData } = await supabase
        .from('daily_missions')
        .select('id, title, description, category, completed, for_date, xp_reward, current_value, target_value')
        .eq('user_id', user.id)
        .order('for_date', { ascending: false })
        .order('created_at', { ascending: false });

        if (missionsData) {
          setMissions(missionsData.map(m => ({
            id: m.id,
            title: m.title,
            completed: m.completed,
            for_date: m.for_date,
            xp_reward: m.xp_reward || 50,
            current_value: m.current_value || 0,
            target_value: m.target_value || 1,
            description: m.description,
            category: m.category,
          })));
        }

      const { data: chestsData } = await supabase
        .from('user_chests')
        .select('status, source_id')
        .eq('user_id', user.id);
      setUserChests((chestsData ?? []) as UserChest[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMissionsAndData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMissionsAndData]);

  const coreProgress = getCoreRankProgress(userXp);
  const currentRank = coreProgress.currentRank;
  const nextRank = coreProgress.nextRank;
  const progressoEnergia = Math.round(coreProgress.progressPercentage);
  const today = getBrazilDate();
  const month = getBrazilMonthRangeFromDate(today);
  const todayMissions = missions.filter((mission) => mission.for_date === today).reverse();
  const completedToday = todayMissions.filter((mission) => mission.completed).length;
  const activeDays = new Set(
    missions
      .filter((mission) => mission.completed && mission.for_date >= month.startDate && mission.for_date <= today)
      .map((mission) => mission.for_date),
  ).size;
  const missionViews: MissionView[] = todayMissions.map((mission) => ({
    id: mission.id,
    title: mission.title,
    description: mission.description,
    category: mission.category,
    completed: mission.completed,
    xpReward: mission.xp_reward,
    currentValue: mission.current_value,
    targetValue: mission.target_value,
  }));
  const chest = (sourceId: string, progress: number, target: number): ChestView => ({
    status: userChests.find((item) => item.source_id === sourceId)?.status ?? 'locked',
    progress,
    target,
  });

  return (
    <>
      <MissionsExperience
        loading={loading}
        streak={streak}
        missions={missionViews}
        common={chest(`daily-common:${today}`, completedToday, 2)}
        rare={chest(`daily-rare:${today}`, completedToday, 3)}
        epic={chest(`monthly:${month.monthId}`, activeDays, 20)}
      />
    <div className="hidden">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">SISTEMA DE MISSÕES</h1>
          <p className="text-xs lg:text-sm text-zinc-500">
  Cumpra os objetivos diários para gerar Energia e fortalecer seu Núcleo.
</p>
        </div>

        <Link
          href="/dashboard/aria"
          className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#7c3aed] text-white text-xs font-black hover:bg-[#6d28d9] transition-all shadow-lg"
        >
          <Sparkles className="w-4 h-4 fill-white" /> Solicitar Mais Missões na IA
        </Link>
      </div>

      {/* CARD DE PROGRESSÃO DE PATENTE */}
      <div className="p-6 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col md:flex-row items-center gap-6">
        <div className="p-4 rounded-xl bg-[#7c3aed]/10 border border-[#7c3aed]/20 text-[#7c3aed]">
          <Target className="w-10 h-10" />
        </div>
        <div className="flex-1 w-full space-y-3">
          <div className="flex justify-between items-end">
            <div>
              <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Rank atual</span>
              <h2 className="text-xl font-black text-white mt-0.5">
  {currentRank.name}
</h2>
            </div>
            <span className="text-xs font-bold text-zinc-400">
  {progressoEnergia}%
  {nextRank ? ` para ${nextRank.name}` : ''}
</span>
          </div>
          <div className="w-full bg-[#1f1f1f] h-3 rounded-full overflow-hidden relative shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-[#7c3aed] to-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${progressoEnergia}%` }}
            />
          </div>
        </div>
      </div>

      {/* OBJETIVOS GERADOS */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Seu Checklist de Performance</h3>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-[#111111] rounded-xl border border-[#1f1f1f]" />)}
          </div>
        ) : missions.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-[#1f1f1f] bg-[#111111]/30 max-w-xl mx-auto space-y-3">
            <div className="p-3 bg-[#1f1f1f] w-fit mx-auto rounded-xl text-zinc-500">
              <Target className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold">Nenhum foco ativo</h3>
            <p className="text-xs text-zinc-500 max-w-xs mx-auto">Vá até o chat da Mentoria Praxe e solicite o planejamento do dia para fragmentar sua rotina em metas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {missions.map((mission) => (
              <div
                key={mission.id}
                className={`p-4 rounded-xl bg-[#111111] border transition-all flex items-center justify-between gap-4 ${
                  mission.completed
                    ? 'border-green-500/10 bg-gradient-to-r from-[#111111] to-green-500/5 opacity-60'
                    : 'border-[#1f1f1f]'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-1 ${
                    mission.completed ? 'bg-green-500/10 border-green-500/20 text-[#22c55e]' : 'bg-[#1f1f1f] border-zinc-800 text-zinc-400'
                  }`}>
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(mission.for_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                  </div>
                  <div>
                    <h4 className={`text-xs font-bold ${mission.completed ? 'text-zinc-500 line-through' : 'text-white'}`}>
                      {mission.title}
                    </h4>
                  </div>
                </div>

                <div>
                {!mission.completed ? (
  <span className="flex items-center gap-1 text-[11px] font-bold text-zinc-400 bg-[#1f1f1f] px-3 py-1.5 rounded-xl border border-zinc-800">
    {mission.current_value}/{mission.target_value}
  </span>
) : (
    <span className="flex items-center gap-1 text-[11px] font-bold text-[#22c55e] bg-green-500/10 px-3 py-1.5 rounded-xl border border-green-500/20">
      <CheckCircle2 className="w-3.5 h-3.5" /> Batida
    </span>
  )}
</div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
    </>
  );
}
