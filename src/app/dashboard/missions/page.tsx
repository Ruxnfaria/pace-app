'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Target, Shield, Award, CheckCircle2, Loader2, Sparkles, Zap } from 'lucide-react';

interface Mission {
  id: string;
  title: string;
  description: string;
  xp_reward: number;
  completed: boolean;
  type: string;
}

export default function MissionsPage() {
  const supabase = createClient();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [userXp, setUserXp] = useState(0);

  // Sistema de Níveis baseado no XP acumulado
  const getLevelInfo = (xp: number) => {
    if (xp < 500) return { name: 'Iniciante 🌱', nextXp: 500, prevXp: 0 };
    if (xp < 1500) return { name: 'Bronze 🥉', nextXp: 1500, prevXp: 500 };
    if (xp < 3000) return { name: 'Prata 🥈', nextXp: 3000, prevXp: 1500 };
    if (xp < 6000) return { name: 'Ouro 🥇', nextXp: 6000, prevXp: 3000 };
    return { name: 'Elite 🏆', nextXp: xp, prevXp: 6000 };
  };

  async function loadMissionsAndData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // 1. Busca XP do Perfil
      const { data: profile } = await supabase
        .from('profiles')
        .select('xp')
        .eq('user_id', user.id)
        .single();
      if (profile) setUserXp(profile.xp || 0);

      // 2. Busca as missões no banco
      const { data: missionsData } = await supabase
        .from('missions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (missionsData) {
        setMissions(missionsData.map(m => ({
          id: m.id,
          title: m.title,
          description: m.description || '',
          xp_reward: m.xp_reward,
          completed: m.completed,
          type: m.type
        })));
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    loadMissionsAndData();
  }, []);

  // Gera missões personalizadas com IA
  async function generateMissions() {
    setGenerating(true);
    try {
      const response = await fetch('/api/missions/generate', { method: 'POST' });
      if (response.ok) {
        await loadMissionsAndData();
      } else {
        alert('Erro ao gerar missões diárias.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  // Completa a missão, dispara o XP e atualiza a tela
  async function completeMission(missionId: string, rewardXp: number) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Marca missão como completada
    await supabase.from('missions').update({ completed: true }).eq('id', missionId);

    // 2. Soma o XP na conta do usuário
    await supabase.from('profiles').update({ xp: userXp + rewardXp }).eq('user_id', user.id);

    setUserXp(prev => prev + rewardXp);
    setMissions(prev => prev.map(m => m.id === missionId ? { ...m, completed: true } : m));
  }

  const lvl = getLevelInfo(userXp);
  const progressoXp = lvl.nextXp === lvl.prevXp ? 100 : ((userXp - lvl.prevXp) / (lvl.nextXp - lvl.prevXp)) * 100;

  return (
    <div className="p-6 lg:p-10 space-y-8">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">SISTEMA DE MISSÕES</h1>
          <p className="text-xs lg:text-sm text-zinc-500">Cumpra os objetivos diários para coletar XP e subir de patente.</p>
        </div>
        
        <button
          onClick={generateMissions}
          disabled={generating || loading}
          className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#7c3aed] text-white text-xs font-black hover:bg-[#6d28d9] transition-all disabled:opacity-40 shadow-lg"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Sincronizando...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 fill-white" /> Atualizar Foco com IA
            </>
          )}
        </button>
      </div>

      {/* CARD DE PROGRESSÃO DE NÍVEL / GAMIFICAÇÃO */}
      <div className="p-6 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col md:flex-row items-center gap-6">
        <div className="p-4 rounded-xl bg-[#7c3aed]/10 border border-[#7c3aed]/20 text-[#7c3aed] shadow-inner">
          <Shield className="w-10 h-10 fill-[#7c3aed]/10" />
        </div>
        <div className="flex-1 w-full space-y-3">
          <div className="flex justify-between items-end">
            <div>
              <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Patente Atual</span>
              <h2 className="text-xl font-black text-white mt-0.5">{lvl.name}</h2>
            </div>
            <span className="text-xs font-bold text-zinc-400">{userXp} / {lvl.nextXp} XP</span>
          </div>
          <div className="w-full bg-[#1f1f1f] h-3 rounded-full overflow-hidden relative shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-[#7c3aed] to-purple-500 rounded-full transition-all duration-500 shadow-lg shadow-purple-500/30" 
              style={{ width: `${progressoXp}%` }}
            />
          </div>
        </div>
      </div>

      {/* LISTAGEM DE MISSÕES */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Objetivos Ativos</h3>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-[#111111] rounded-xl border border-[#1f1f1f]" />)}
          </div>
        ) : missions.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-[#1f1f1f] bg-[#111111]/30 max-w-xl mx-auto space-y-3">
            <div className="p-3 bg-[#1f1f1f] w-fit mx-auto rounded-xl text-zinc-500">
              <Target className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold">Nenhum foco diário ativo</h3>
            <p className="text-xs text-zinc-500 max-w-xs mx-auto">Clique no botão superior para fazer a ARIA varrer suas metas e disparar missões dinâmicas de hidratação, sono e treinos.</p>
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
                <div className="flex items-start gap-3.5">
                  <div className={`p-2.5 rounded-lg border mt-0.5 ${mission.completed ? 'bg-green-500/10 border-green-500/20 text-[#22c55e]' : 'bg-[#1f1f1f] border-zinc-800 text-zinc-500'}`}>
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`text-xs font-bold ${mission.completed ? 'text-zinc-500 line-through' : 'text-white'}`}>{mission.title}</h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{mission.description}</p>
                  </div>
                </div>

                <div>
                  {!mission.completed ? (
                    <button
                      onClick={() => completeMission(mission.id, mission.xp_reward)}
                      className="flex items-center gap-1 py-2 px-3 bg-[#1f1f1f] hover:bg-zinc-800 border border-zinc-800 rounded-xl text-[11px] font-bold text-zinc-300 transition-colors"
                    >
                      Resgatar +{mission.xp_reward} <Zap className="w-3 h-3 fill-orange-400 text-orange-400" />
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-[#22c55e] bg-green-500/10 px-3 py-1.5 rounded-xl border border-green-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Reclamado
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}