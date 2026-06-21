'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Dumbbell, Calendar, CheckCircle2, Loader2, X, Info, Sparkles } from 'lucide-react';

interface Exercise {
  name: string;
  sets: string;
  reps: string;
  rest: string;
  tip: string;
}

interface Workout {
  id: string;
  name: string;
  muscle_group: string;
  exercises: Exercise[];
  completed: boolean;
}

export default function WorkoutsPage() {
  const supabase = createClient();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);

  // Carrega os treinos do usuário salvos no Supabase
  async function loadWorkouts() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (data) {
        // Trata o campo JSONB vindo do banco
        setWorkouts(data.map(w => ({
          id: w.id,
          name: w.name,
          muscle_group: w.muscle_group || 'Geral',
          exercises: typeof w.exercises === 'string' ? JSON.parse(w.exercises) : (w.exercises as Exercise[] || []),
          completed: w.completed
        })));
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    loadWorkouts();
  }, []);

  // Chama a API para gerar os treinos usando IA
  async function generatePlan() {
    setGenerating(true);
    try {
      const response = await fetch('/api/workouts/generate', { method: 'POST' });
      if (response.ok) {
        await loadWorkouts(); // Recarrega a lista com os novos treinos
      } else {
        alert('Erro ao gerar treinos. Verifique suas chaves de API.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  // Marca o treino como concluído no Supabase e soma XP
  async function completeWorkout(workoutId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Atualiza o status do treino
    await supabase
      .from('workouts')
      .update({ completed: true, completed_at: new Date().toISOString(), xp_earned: 100 })
      .eq('id', workoutId);

    // 2. Busca o XP atual do usuário para somar +100
    const { data: profile } = await supabase
      .from('profiles')
      .select('xp')
      .eq('user_id', user.id)
      .single();

    const currentXp = profile?.xp || 0;

    await supabase
      .from('profiles')
      .update({ xp: currentXp + 100 })
      .eq('user_id', user.id);

    setSelectedWorkout(null);
    loadWorkouts();
  }

  return (
    <div className="p-6 lg:p-10 space-y-8">
      
      {/* HEADER E BOTÃO DE GERAR COM IA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">MÓDULO DE TREINOS</h1>
          <p className="text-xs lg:text-sm text-zinc-500">Gerencie e execute suas planilhas de força e performance.</p>
        </div>
        
        <button
          onClick={generatePlan}
          disabled={generating || loading}
          className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#7c3aed] text-white text-xs font-black hover:bg-[#6d28d9] transition-all disabled:opacity-40 shadow-lg shadow-purple-500/10"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Montando Rotina...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 fill-white" /> Gerar Plano Semanal com IA
            </>
          )}
        </button>
      </div>

      {/* LISTAGEM DE CARDS */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="h-40 bg-[#111111] rounded-2xl border border-[#1f1f1f]" />)}
        </div>
      ) : workouts.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-[#1f1f1f] bg-[#111111]/30 max-w-xl mx-auto space-y-3">
          <div className="p-3 bg-[#1f1f1f] w-fit mx-auto rounded-xl text-zinc-500">
            <Dumbbell className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold">Nenhum treino montado</h3>
          <p className="text-xs text-zinc-500 max-w-xs mx-auto">Clique no botão superior para que a IA analise seu biotipo, nível e monte sua divisão semanal premium.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workouts.map((workout) => (
            <div 
              key={workout.id}
              onClick={() => setSelectedWorkout(workout)}
              className={`p-5 rounded-2xl bg-[#111111] border transition-all cursor-pointer flex flex-col justify-between h-44 ${
                workout.completed 
                  ? 'border-green-500/20 bg-gradient-to-br from-[#111111] to-green-500/5' 
                  : 'border-[#1f1f1f] hover:border-zinc-700'
              }`}
            >
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-black uppercase bg-[#1f1f1f] px-2.5 py-1 rounded-full text-zinc-400 tracking-wider">
                    {workout.muscle_group}
                  </span>
                  {workout.completed && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-[#22c55e] bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                      <CheckCircle2 className="w-3 h-3" /> Concluído
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold tracking-tight text-white line-clamp-1">{workout.name}</h3>
                <p className="text-xs text-zinc-500">{workout.exercises.length} exercícios prescritos</p>
              </div>

              <div className="pt-3 border-t border-[#1f1f1f] flex justify-between items-center text-[11px] text-zinc-400 font-medium">
                <span className="flex items-center gap-1">⏱️ Meta: ~50 min</span>
                <span className="text-[#7c3aed] font-bold group-hover:underline">Ver ficha →</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DETALHADO DO TREINO SELECIONADO */}
      {selectedWorkout && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#111111] border border-[#1f1f1f] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            
            {/* Header Modal */}
            <div className="p-5 border-b border-[#1f1f1f] flex justify-between items-start">
              <div>
                <span className="text-[9px] font-black uppercase bg-[#7c3aed]/10 text-[#7c3aed] px-2 py-0.5 rounded border border-[#7c3aed]/20">{selectedWorkout.muscle_group}</span>
                <h2 className="text-base font-bold mt-1 text-white">{selectedWorkout.name}</h2>
              </div>
              <button onClick={() => setSelectedWorkout(null)} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Ficha de Exercícios */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              {selectedWorkout.exercises.map((ex, i) => (
                <div key={i} className="p-4 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-white">{i + 1}. {ex.name}</h4>
                    <span className="text-[11px] text-purple-400 font-bold bg-[#7c3aed]/5 px-2 py-0.5 rounded border border-[#7c3aed]/10">
                      {ex.sets}x {ex.reps}
                    </span>
                  </div>
                  <div className="flex gap-4 text-[10px] text-zinc-500 font-medium">
                    <span>⏱️ Descanso: {ex.rest}</span>
                  </div>
                  <div className="bg-[#111111] p-2.5 rounded-lg border border-zinc-900 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-zinc-500 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-zinc-400 leading-relaxed"><span className="font-semibold text-zinc-300">Execução:</span> {ex.tip}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-4 border-t border-[#1f1f1f] bg-[#0a0a0a] flex justify-between items-center">
              <span className="text-[11px] text-zinc-500 font-bold">+100 XP por conclusão</span>
              {!selectedWorkout.completed ? (
                <button
                  onClick={() => completeWorkout(selectedWorkout.id)}
                  className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#7c3aed] to-purple-600 text-white text-xs font-black hover:opacity-90 transition-all shadow-lg shadow-purple-500/10"
                >
                  Concluir Treino ✅
                </button>
              ) : (
                <span className="text-xs font-bold text-[#22c55e] bg-green-500/5 px-3 py-2 rounded-xl border border-green-500/10">Treino Finalizado!</span>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}