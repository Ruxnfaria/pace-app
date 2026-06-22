'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Dumbbell, CheckCircle2, Loader2, X, Info, Sparkles, Play } from 'lucide-react';

interface Exercise {
  name: string;
  sets: string;
  reps: string;
  rest: string;
  tip: string;
  gif_url?: string; // Campo opcional preparado para receber o link do GIF do exercício
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

  // Chama a API para gerar os treinos com a inteligência do Coach Lucas Zanetti
  async function generatePlan() {
    setGenerating(true);
    try {
      const response = await fetch('/api/workouts/generate', { method: 'POST' });
      if (response.ok) {
        await loadWorkouts();
      } else {
        alert('Erro ao conectar com a assessoria. Verifique as chaves de API.');
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

    await supabase
      .from('workouts')
      .update({ completed: true, completed_at: new Date().toISOString(), xp_earned: 100 })
      .eq('id', workoutId);

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
      
      {/* HEADER E SOLICITAÇÃO AO COACH */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">MÓDULO DE TREINOS</h1>
          <p className="text-xs lg:text-sm text-zinc-500">Acesse suas planilhas de força e performance estruturadas pelo Coach Lucas Zanetti.</p>
        </div>
        
        <button
          onClick={generatePlan}
          disabled={generating || loading}
          className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#7c3aed] text-white text-xs font-black hover:bg-[#6d28d9] transition-all disabled:opacity-40 shadow-lg shadow-purple-500/10"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Coach Zanetti Montando Treino...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 fill-white" /> Solicitar Cronograma ao Coach Zanetti
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
          <h3 className="text-sm font-bold text-zinc-200">Nenhum treino montado</h3>
          <p className="text-xs text-zinc-500 max-w-xs mx-auto">Clique no botão superior para que o Coach Lucas Zanetti monte sua divisão semanal de alta performance.</p>
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
                <span className="flex items-center gap-1">⏱️ Estimativa: ~50 min</span>
                <span className="text-[#7c3aed] font-bold flex items-center gap-1">Ver ficha <Play className="w-2.5 h-2.5 fill-[#7c3aed]" /></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DETALHADO COM OS GIFS DEMONSTRATIVOS */}
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

            {/* Ficha de Exercícios + Player de Mídia */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar bg-[#070707]">
              {selectedWorkout.exercises.map((ex, i) => (
                <div key={i} className="p-4 rounded-xl bg-[#111111] border border-[#1f1f1f] space-y-3 shadow-inner">
                  
                  {/* Título e Séries */}
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-white uppercase tracking-tight">{i + 1}. {ex.name}</h4>
                    <span className="text-[11px] text-purple-400 font-black bg-[#7c3aed]/10 px-2.5 py-1 rounded border border-[#7c3aed]/20 shadow-sm">
                      {ex.sets}x {ex.reps}
                    </span>
                  </div>

                  {/* PLAYER DO GIF DEMONSTRATIVO */}
                  <div className="relative w-full h-44 bg-zinc-950 rounded-xl overflow-hidden border border-zinc-900 flex items-center justify-center group">
                    {ex.gif_url ? (
                      <img 
                        src={ex.gif_url} 
                        alt={`Execução de ${ex.name}`} 
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      // Fallback visual premium com animação enquanto não há URL real injetada
                      <div className="flex flex-col items-center justify-center space-y-2 text-zinc-600">
                        <div className="p-3 bg-zinc-900/50 rounded-full border border-zinc-800/80 animate-bounce">
                          <Dumbbell className="w-5 h-5 text-[#7c3aed]" />
                        </div>
                        <span className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Execução em Loop</span>
                      </div>
                    )}
                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md border border-zinc-800 px-2 py-0.5 rounded text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                      Vídeo de Apoio
                    </div>
                  </div>

                  {/* Detalhes Técnicos */}
                  <div className="flex gap-4 text-[10px] text-zinc-500 font-bold px-1">
                    <span>⏱️ Descanso: {ex.rest}</span>
                  </div>

                  {/* Dica do Coach Zanetti */}
                  <div className="bg-[#0a0a0a] p-3 rounded-lg border border-zinc-900 flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-[#7c3aed] mt-0.5 shrink-0" />
                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                      <span className="font-bold text-zinc-200 uppercase text-[9px] tracking-wider block mb-0.5">Instrução do Coach Zanetti:</span> 
                      {ex.tip}
                    </p>
                  </div>

                </div>
              ))}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-4 border-t border-[#1f1f1f] bg-[#0a0a0a] flex justify-between items-center">
              <span className="text-[11px] text-zinc-500 font-bold tracking-tight">+100 XP por treino concluído</span>
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