'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Dumbbell, X, Info, Sparkles, Play, Calendar, Trash2, Zap, Flame, Activity, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface Exercise {
  name: string;
  sets: string;
  reps: string;
  rest: string;
  tip: string;
  gif_url?: string;
}

interface Workout {
  id: string;
  title: string;
  exercises: Exercise[] | string;
  isRawText: boolean;
  created_at: string;
}

function RenderAnimatedFallback({ exerciseName }: { exerciseName: string }) {
  const name = exerciseName.toLowerCase();
  const clean = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  if (clean.includes('rosca') || clean.includes('biceps') || clean.includes('braco')) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-gradient-to-br from-purple-950/40 to-zinc-950 p-4">
        <Dumbbell className="w-8 h-8 text-[#7c3aed] animate-bounce" />
        <span className="text-[8px] font-black tracking-widest text-purple-400 uppercase mt-2">BÍCEPS ACTIVE</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-gradient-to-br from-zinc-900 to-black p-4">
      <Activity className="w-7 h-7 text-zinc-500 animate-pulse" />
      <span className="text-[8px] font-black tracking-widest text-zinc-400 uppercase mt-2">PACE PLAY</span>
    </div>
  );
}

function ExerciseGif({ name, index }: { name: string; index: number }) {
  const [gifUrl, setGifUrl] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const delayTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/exercise?name=${encodeURIComponent(name)}`);
        const data = await res.json();

        if (data.gifUrl) {
          setGifUrl(data.gifUrl);
        } else if (data.error) {
          setErrorMsg(data.error);
        }
      } catch {
        setErrorMsg('Erro de Conexão');
      } finally {
        setLoading(false);
      }
    }, index * 400);

    return () => clearTimeout(delayTimer);
  }, [name, index]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-zinc-950/40 p-4">
        <Activity className="w-5 h-5 text-purple-500 animate-spin mb-1" />
        <span className="text-[7px] text-zinc-500 font-mono tracking-widest">AGUARDANDO FLUXO...</span>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-gradient-to-br from-red-950/50 to-zinc-950 p-2 text-center border border-red-900/30">
        <AlertTriangle className="w-4 h-4 text-red-500 mb-1 mx-auto" />
        <span className="text-[7px] font-black tracking-widest text-red-400 uppercase">ERRO</span>
        <span className="text-[8px] text-zinc-400 mt-0.5 font-mono line-clamp-2 px-1">{errorMsg}</span>
      </div>
    );
  }

  if (!gifUrl) {
    return <RenderAnimatedFallback exerciseName={name} />;
  }

  return (
    <img 
      src={gifUrl} 
      alt={name} 
      className="w-full h-full object-cover"
      onError={() => setGifUrl('')}
    />
  );
}

export default function WorkoutsPage() {
  const supabase = createClient();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [completedExercises, setCompletedExercises] = useState<number[]>([]);
  async function loadWorkouts() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('workouts')
        .select('id, title, exercises, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (data) {
        const formatted = data.map((w: any) => {
          let parsedExercises: any = [];
          let isRawText = false;

          try {
            const trimmed = w.exercises.trim();
            if (trimmed.startsWith('[')) {
              parsedExercises = JSON.parse(trimmed);
            } else {
              parsedExercises = w.exercises;
              isRawText = true;
            }
          } catch (e) {
            parsedExercises = w.exercises;
            isRawText = true;
          }

          return {
            id: w.id,
            title: w.title,
            exercises: parsedExercises,
            isRawText,
            created_at: w.created_at
          };
        });
        setWorkouts(formatted);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    loadWorkouts();
  }, []);

  async function handleDeleteWorkout(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm('Tem certeza que deseja excluir este treino permanentemente?')) {
      const { error } = await supabase.from('workouts').delete().eq('id', id);
      if (!error) setWorkouts(prev => prev.filter(w => w.id !== id));
    }
  }

  const isWorkoutArray = selectedWorkout && !selectedWorkout.isRawText && Array.isArray(selectedWorkout.exercises) && selectedWorkout.exercises.length > 0;
  const toggleExercise = (index: number) => {
    setCompletedExercises((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index]
    );
  };
  
  const allExercisesCompleted =
    isWorkoutArray &&
    completedExercises.length ===
      (selectedWorkout?.exercises as Exercise[])?.length;
  async function handleFinishWorkout() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
  
    const todayStr = new Date().toISOString().split("T")[0];
  
    const { error } = await supabase
      .from("daily_missions")
      .update({
        completed: true,
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("for_date", todayStr)
      .ilike("title", "%Treinar%");
  
    if (error) {
      console.error("Erro ao finalizar treino:", error);
      return;
    }
  
    alert("Treino finalizado! +XP nas missões.");
    setCompletedExercises([]);
setSelectedWorkout(null);
  }
  return (
    <div className="p-6 lg:p-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">MÓDULO DE TREINOS</h1>
          <p className="text-xs lg:text-sm text-zinc-500">Acesse suas planilhas de performance estruturadas pelo Coach Lucas Zanetti.</p>
        </div>
        <Link href="/dashboard/aria" className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#7c3aed] text-white text-xs font-black hover:bg-[#6d28d9] transition-all shadow-lg">
          <Sparkles className="w-4 h-4 fill-white" /> Ajustar Treino na Mentoria
        </Link>
      </div>
{/* TREINO DE HOJE */}
{workouts.length > 0 && (
  <div className="p-6 rounded-2xl bg-[#111111] border border-[#7c3aed]/20">
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-[#7c3aed] font-black">
          Treino de Hoje
        </p>

        <h2 className="text-2xl font-black text-white mt-1">
          {workouts[0].title}
        </h2>

        <p className="text-sm text-zinc-500 mt-2">
          {Array.isArray(workouts[0].exercises)
            ? `${workouts[0].exercises.length} exercícios cadastrados`
            : "Treino disponível"}
        </p>
      </div>

      <button
       onClick={() => {
        setCompletedExercises([]);
        setSelectedWorkout(workouts[0]);
      }}
        className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#7c3aed] text-white font-black text-sm hover:bg-[#6d28d9] transition-all"
      >
        <Play className="w-4 h-4 fill-white" />
        Iniciar Agora
      </button>
    </div>
  </div>
)}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="h-40 bg-[#111111] rounded-2xl border border-[#1f1f1f]" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workouts.map((workout) => (
            <div key={workout.id} onClick={() => setSelectedWorkout(workout)} className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] hover:border-zinc-700 transition-all cursor-pointer flex flex-col justify-between h-44 relative group/card">
              <button onClick={(e) => handleDeleteWorkout(workout.id, e)} className="absolute top-4 right-4 p-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-zinc-500 hover:text-red-500 hover:border-red-500/30 opacity-0 group-hover/card:opacity-100 transition-all duration-200">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase bg-[#1f1f1f] px-2.5 py-1 rounded-full text-zinc-400 tracking-wider flex items-center gap-1 w-fit">
                  <Calendar className="w-3 h-3" /> {new Date(workout.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                </span>
                <h3 className="text-base font-bold tracking-tight text-white line-clamp-1 pr-6">{workout.title}</h3>
                <p className="text-xs text-zinc-500"> Ficha de treino ativa </p>
              </div>
              <div className="pt-3 border-t border-[#1f1f1f] flex justify-between items-center text-[11px] text-zinc-400 font-medium">
                <span>⏱️ Prescrição Ativa</span>
                <span className="text-[#7c3aed] font-bold flex items-center gap-1">Ver ficha de elite <Play className="w-2.5 h-2.5 fill-[#7c3aed]" /></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedWorkout && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#111111] border border-[#1f1f1f] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-[#1f1f1f] flex justify-between items-start">
              <div>
                <span className="text-[9px] font-black uppercase bg-[#7c3aed]/10 text-[#7c3aed] px-2 py-0.5 rounded border border-[#7c3aed]/20">Execução Técnica</span>
                <h2 className="text-base font-bold mt-1 text-white">{selectedWorkout.title}</h2>
              </div>
              <button onClick={() => setSelectedWorkout(null)} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            {isWorkoutArray && (
  <div className="px-5 pt-4">
    <div className="flex justify-between text-xs text-zinc-400 mb-2">
      <span>Progresso do treino</span>
      <span>
        {completedExercises.length}/
        {(selectedWorkout.exercises as Exercise[]).length}
      </span>
    </div>

    <div className="w-full h-2 bg-[#1f1f1f] rounded-full overflow-hidden">
      <div
        className="h-full bg-[#7c3aed] transition-all"
        style={{
          width: `${
            (completedExercises.length /
              (selectedWorkout.exercises as Exercise[]).length) *
            100
          }%`,
        }}
      />
    </div>
  </div>
)}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-[#070707]">
              {isWorkoutArray ? (
                (selectedWorkout.exercises as Exercise[]).map((ex, i) => (
                  <div key={i} className="p-4 rounded-xl bg-[#111111] border border-[#1f1f1f] flex flex-col sm:flex-row gap-4 items-center sm:items-start shadow-inner">
                    
                    {/* ENVIANDO O INDEX PARA ENFILEIRAR AS REQUISIÇÕES */}
                    <div className="relative w-28 h-28 sm:w-32 sm:h-32 bg-zinc-950 rounded-xl overflow-hidden border border-zinc-900 shrink-0 shadow-md flex items-center justify-center">
                      <ExerciseGif name={ex.name} index={i} />
                    </div>

                    <div className="flex-1 w-full space-y-2">
                    <div className="flex justify-end">
  <button
    onClick={() => toggleExercise(i)}
    className={`text-[10px] px-3 py-1 rounded-lg font-bold transition-all ${
      completedExercises.includes(i)
        ? "bg-green-500/20 text-green-400 border border-green-500/30"
        : "bg-zinc-800 text-zinc-400 border border-zinc-700"
    }`}
  >
    {completedExercises.includes(i)
      ? "✓ Concluído"
      : "Marcar Exercício"}
  </button>
</div>
                      <div className="flex flex-wrap justify-between items-start gap-2">
                        <h4 className="text-xs font-black text-white uppercase tracking-tight">{i + 1}. {ex.name}</h4>
                        <span className="text-[10px] text-purple-400 font-black bg-[#7c3aed]/10 px-2 py-0.5 rounded border border-[#7c3aed]/20">{ex.sets}x {ex.reps}</span>
                      </div>
                      <p className="text-[10px] text-zinc-500 font-bold">⏱️ Descanso: {ex.rest}</p>
                      <div className="bg-[#0a0a0a] p-2.5 rounded-lg border border-zinc-900/80 flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 text-[#7c3aed] shrink-0 mt-0.5" />
                        <p className="text-[10px] text-zinc-400 leading-relaxed"><span className="font-bold text-zinc-200">Instrução:</span> {ex.tip}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-5 rounded-xl bg-[#111111] border border-[#1f1f1f] text-xs text-zinc-300 whitespace-pre-wrap">
                  {typeof selectedWorkout.exercises === 'string' ? selectedWorkout.exercises : JSON.stringify(selectedWorkout.exercises)}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-[#1f1f1f] bg-[#0a0a0a] flex justify-between items-center gap-3">
  <button
    onClick={() => setSelectedWorkout(null)}
    className="py-2 px-4 rounded-xl bg-zinc-800 text-white text-xs font-bold hover:bg-zinc-700 transition-all"
  >
    Fechar Ficha
  </button>

  <button
  onClick={handleFinishWorkout}
  disabled={!allExercisesCompleted}
  className={`py-2 px-4 rounded-xl text-xs font-bold transition-all ${
    allExercisesCompleted
      ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
      : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
  }`}
>
  {allExercisesCompleted
    ? "⚡ Finalizar Treino +XP"
    : `🔒 Complete todos os exercícios (${completedExercises.length}/${(selectedWorkout?.exercises as Exercise[])?.length || 0})`}
</button>
</div>
          </div>
        </div>
      )}
    </div>
  );
}