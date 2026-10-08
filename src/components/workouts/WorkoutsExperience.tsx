"use client";

import {
  ArrowLeft, Check, CheckCircle2, ChevronLeft, ChevronRight,
  Clock3, Dumbbell, History, List, LoaderCircle, LockKeyhole, NotebookPen,
  Pencil, Play, RotateCcw, Sparkles, X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useRewardQueue } from "@/components/gamification/RewardQueueProvider";
import { ExerciseMedia } from "@/components/workouts/ExerciseMedia";
import WorkoutsExperienceV2 from "@/components/workouts/WorkoutsExperienceV2";
import { getBrazilDate } from "@/lib/dates/brazilDate";
import { GamificationActions } from "@/lib/gamification/actions";
import { queueCoreEnergy } from "@/lib/gamification/coreEnergyPulse";
import { createClient } from "@/lib/supabase/client";
import {
  WEEKDAYS, buildWeeklySchedule, getDurationLabel, getNextWorkoutState,
  getScheduleDays, getWeekdayLabel, isoWeekdayFromDate, normalizeWorkout,
  type TrainingScheduleProfile, type Weekday, type Workout, type WorkoutLog,
} from "@/lib/workouts/model";

type Panel = "switch" | "schedule" | "history" | null;
type MissionRow = { id: string; title: string; completed: boolean; current_value: number | null; target_value: number | null };
type CompletionRow = { completed_now?: boolean; energy_awarded?: number };

const asNumbers = (value: unknown) => Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : null;
const asNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const asBoolean = (value: unknown) => typeof value === "boolean" ? value : null;
const asString = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`));

function Modal({ title, eyebrow, close, children }: { title: string; eyebrow: string; close: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-black/75 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <button type="button" aria-label="Fechar painel" onClick={close} className="absolute inset-0" />
      <section className="relative z-10 max-h-[88vh] w-full overflow-hidden rounded-t-[30px] border border-white/[0.08] bg-[#101014] shadow-2xl sm:max-w-xl sm:rounded-[30px]">
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-5 sm:px-6">
          <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-400">{eyebrow}</p><h2 className="mt-2 text-xl font-black text-white">{title}</h2></div>
          <button type="button" onClick={close} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.05] text-zinc-400 hover:text-white"><X className="h-5 w-5" /></button>
        </header>
        <div className="max-h-[calc(88vh-88px)] overflow-y-auto p-5 sm:p-6">{children}</div>
      </section>
    </div>
  );
}

export default function WorkoutsExperience({
  persistenceV2Enabled = false,
}: {
  persistenceV2Enabled?: boolean;
}) {
  return persistenceV2Enabled ? <WorkoutsExperienceV2 /> : <LegacyWorkoutsExperience />;
}

function LegacyWorkoutsExperience() {
  const supabase = useMemo(() => createClient(), []);
  const { enqueueActions } = useRewardQueue();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [profile, setProfile] = useState<TrainingScheduleProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [temporaryWorkout, setTemporaryWorkout] = useState<Workout | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<Weekday[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [sessionNote, setSessionNote] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const [success, setSuccess] = useState("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Sessão não encontrada.");
      const [workoutResult, profileResult, logResult] = await Promise.all([
        supabase.from("workouts").select("id, title, exercises, created_at").eq("user_id", user.id).order("created_at", { ascending: true }),
        supabase.from("training_profiles").select("training_days_per_week, available_weekdays, preferred_weekdays, session_duration_min, session_duration_is_plus, session_duration_range").eq("user_id", user.id).maybeSingle(),
        supabase.from("workout_logs").select("id, workout_id, workout_date").eq("user_id", user.id).order("workout_date", { ascending: false }).limit(40),
      ]);
      if (workoutResult.error) throw workoutResult.error;
      if (logResult.error) throw logResult.error;
      setWorkouts((workoutResult.data ?? []).map(normalizeWorkout).filter((item): item is Workout => item !== null));
      const row = profileResult.data as Record<string, unknown> | null;
      setProfile(row ? {
        trainingDaysPerWeek: asNumber(row.training_days_per_week),
        availableWeekdays: asNumbers(row.available_weekdays),
        preferredWeekdays: asNumbers(row.preferred_weekdays),
        sessionDurationMin: asNumber(row.session_duration_min),
        sessionDurationIsPlus: asBoolean(row.session_duration_is_plus),
        sessionDurationRange: asString(row.session_duration_range),
      } : null);
      setLogs((logResult.data ?? []).flatMap((item) => item.id && item.workout_id && item.workout_date ? [{ id: String(item.id), workoutId: String(item.workout_id), workoutDate: String(item.workout_date) }] : []));
    } catch (error) {
      console.error("[PRAXE] Erro ao carregar treinos:", error);
      setLoadError("Não foi possível carregar seus treinos agora.");
    } finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const today = getBrazilDate();
  const todayWeekday = isoWeekdayFromDate(today);
  const scheduleDays = useMemo(() => getScheduleDays(profile), [profile]);
  const schedule = useMemo(() => buildWeeklySchedule(workouts, scheduleDays), [workouts, scheduleDays]);
  const nextState = useMemo(() => getNextWorkoutState(workouts, schedule, logs, today), [workouts, schedule, logs, today]);
  const nextWorkout = temporaryWorkout ?? nextState.workout;
  const duration = getDurationLabel(profile);
  const latestLog = logs[0] ?? null;
  const latestWorkout = latestLog ? workouts.find((item) => item.id === latestLog.workoutId) ?? null : null;
  const exercise = activeWorkout?.exercises[activeIndex] ?? null;
  const allDone = Boolean(activeWorkout?.exercises.length && completedIds.length === activeWorkout.exercises.length);

  const startWorkout = (workout: Workout) => {
    setActiveWorkout(workout); setActiveIndex(0); setCompletedIds([]); setSessionNote(""); setFinishError(""); setPanel(null);
  };
  const leaveWorkout = () => {
    if ((completedIds.length || sessionNote.trim()) && !window.confirm("Sair do treino? O progresso e as notas ainda não são persistidos.")) return;
    setActiveWorkout(null); setCompletedIds([]); setSessionNote("");
  };
  const toggleExercise = (id: string) => setCompletedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const openSchedule = () => { setScheduleDraft(scheduleDays); setPanel("schedule"); };
  const toggleDay = (day: Weekday) => setScheduleDraft((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => a - b));

  async function finishWorkout() {
    if (!activeWorkout || !allDone || finishing) return;
    setFinishing(true); setFinishError("");
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Sessão não encontrada.");
      const workoutDate = getBrazilDate();
      const { data: existing, error: checkError } = await supabase.from("workout_logs").select("id").eq("user_id", user.id).eq("workout_id", activeWorkout.id).eq("workout_date", workoutDate).maybeSingle();
      if (checkError) throw checkError;
      if (!existing) {
        const { error: insertError } = await supabase.from("workout_logs").insert({ user_id: user.id, workout_id: activeWorkout.id, workout_date: workoutDate });
        if (insertError) throw insertError;
      }
      const { data: missionData, error: missionError } = await supabase.from("daily_missions").select("id, title, completed, current_value, target_value").eq("user_id", user.id).eq("for_date", workoutDate).eq("category", "workout").maybeSingle();
      if (missionError) throw missionError;
      const mission = missionData as MissionRow | null;
      if (mission && !mission.completed) {
        const target = Math.max(mission.target_value ?? 1, 1);
        const nextValue = Math.min((mission.current_value ?? 0) + (existing ? 0 : 1), target);
        if (nextValue < target) {
          if (!existing) {
            const { error } = await supabase.from("daily_missions").update({ current_value: nextValue }).eq("id", mission.id).eq("completed", false);
            if (error) throw error;
            enqueueActions([GamificationActions.showMissionProgress(mission.id, nextValue, target)]);
          }
        } else {
          const { data, error } = await supabase.rpc("complete_mission_with_energy", { p_mission_id: mission.id });
          if (error) throw error;
          const result = (Array.isArray(data) ? data[0] : data) as CompletionRow | null;
          const energy = Number(result?.energy_awarded ?? 0);
          if (result?.completed_now && energy > 0) {
            queueCoreEnergy(energy);
            enqueueActions([GamificationActions.showMissionCompleted(mission.id, mission.title, energy)]);
          }
        }
      }
      setSuccess(existing ? "Este treino já estava concluído hoje. Nenhuma recompensa foi duplicada." : "Treino concluído. Seu próximo passo já está preparado.");
      setActiveWorkout(null); setCompletedIds([]); setSessionNote(""); await loadData();
    } catch (error) {
      console.error("[PRAXE] Erro ao finalizar treino:", error);
      setFinishError("Não foi possível finalizar o treino. Tente novamente.");
    } finally { setFinishing(false); }
  }

  async function generateWorkout() {
    setGenerating(true); setGenerateError("");
    try {
      const response = await fetch("/api/workouts/generate", { method: "POST" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Erro ao gerar treino.");
      await loadData();
    } catch (error) { setGenerateError(error instanceof Error ? error.message : "Não foi possível gerar seu treino."); }
    finally { setGenerating(false); }
  }

  if (activeWorkout) {
    const progress = activeWorkout.exercises.length ? Math.round(completedIds.length / activeWorkout.exercises.length * 100) : 0;
    return (
      <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#08080b] text-white">
        <div className="mx-auto flex min-h-full max-w-6xl flex-col px-4 pb-24 pt-4 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between gap-3">
            <button type="button" onClick={leaveWorkout} className="flex min-h-11 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-bold text-zinc-300"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Sair</span></button>
            <div className="min-w-0 text-center"><p className="truncate text-xs font-black uppercase tracking-[0.18em] text-violet-400">{activeWorkout.title}</p><p className="mt-1 text-xs text-zinc-500">{completedIds.length} de {activeWorkout.exercises.length} exercícios</p></div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setListOpen(true)} aria-label="Lista completa" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-zinc-300"><List className="h-4 w-4" /></button>
              <button type="button" onClick={() => setNotesOpen(true)} className="relative flex min-h-11 items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/[0.08] px-4 text-sm font-bold text-violet-200"><NotebookPen className="h-4 w-4" /><span className="hidden sm:inline">Notas</span>{sessionNote.trim() && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-violet-300" />}</button>
            </div>
          </header>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-300 transition-all" style={{ width: `${progress}%` }} /></div>

          {exercise ? (
            <main className="mx-auto mt-6 grid w-full max-w-5xl flex-1 gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0d0d12] shadow-2xl"><ExerciseMedia key={exercise.id} exerciseId={exercise.id} exerciseName={exercise.name} /></div>
              <section>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-400">Exercício {activeIndex + 1}</p>
                <h1 className="mt-3 text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">{exercise.name}</h1>
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[['Séries', exercise.sets], ['Repetições', exercise.reps], ...(exercise.rest ? [['Descanso', exercise.rest]] : [])].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">{label}</p><p className="mt-2 text-xl font-black text-white">{value}</p></div>)}
                </div>
                {exercise.tip && <p className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-sm leading-6 text-zinc-400">{exercise.tip}</p>}
                <button type="button" onClick={() => toggleExercise(exercise.id)} className={`mt-6 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl text-sm font-black ${completedIds.includes(exercise.id) ? "border border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "bg-white text-black"}`}><CheckCircle2 className="h-5 w-5" />{completedIds.includes(exercise.id) ? "Exercício concluído" : "Marcar como concluído"}</button>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button type="button" disabled={activeIndex === 0} onClick={() => setActiveIndex((i) => i - 1)} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] text-sm font-bold text-zinc-300 disabled:opacity-30"><ChevronLeft className="h-4 w-4" />Anterior</button>
                  <button type="button" disabled={activeIndex === activeWorkout.exercises.length - 1} onClick={() => setActiveIndex((i) => i + 1)} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] text-sm font-bold text-zinc-300 disabled:opacity-30">Próximo<ChevronRight className="h-4 w-4" /></button>
                </div>
                {finishError && <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">{finishError}</p>}
                <button type="button" disabled={!allDone || finishing} onClick={() => void finishWorkout()} className="mt-4 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-violet-600 text-sm font-black text-white disabled:bg-white/[0.06] disabled:text-zinc-600">{finishing ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}{allDone ? "Finalizar treino" : "Conclua todos os exercícios"}</button>
              </section>
            </main>
          ) : <div className="mx-auto mt-16 max-w-xl rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-8 text-center"><Dumbbell className="mx-auto h-8 w-8 text-violet-300" /><h1 className="mt-4 text-2xl font-black">Ficha em formato legado</h1><p className="mt-3 whitespace-pre-wrap text-sm text-zinc-400">{activeWorkout.rawText || "Nenhum exercício estruturado disponível."}</p></div>}
        </div>

        {notesOpen && <Modal eyebrow="Privado · sessão atual" title="Notas do treino" close={() => setNotesOpen(false)}>
          <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-4 text-xs leading-5 text-amber-100/75">Rascunho desta tela. O banco atual ainda não oferece notas privadas; este texto não será salvo ao sair ou finalizar.</div>
          <label htmlFor="workout-note" className="mt-5 block text-xs font-black uppercase tracking-wider text-zinc-500">Cargas, sensações e lembretes</label>
          <textarea id="workout-note" value={sessionNote} onChange={(e) => setSessionNote(e.target.value.slice(0, 2000))} rows={8} placeholder="Ex.: Agachamento 50 kg. Próxima vez tentar +5 kg." className="mt-3 w-full resize-none rounded-2xl border border-white/[0.09] bg-black/30 p-4 text-sm leading-6 text-white outline-none focus:border-violet-400/40" />
          <div className="mt-3 flex justify-between text-xs text-zinc-600"><span>Disponível durante todo o treino</span><span>{sessionNote.length}/2000</span></div>
          <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Última vez</p><p className="mt-2 text-sm text-zinc-500">A nota anterior aparecerá aqui após a persistência privada ser aprovada.</p></div>
        </Modal>}

        {listOpen && <Modal eyebrow={`${completedIds.length} de ${activeWorkout.exercises.length}`} title="Exercícios do treino" close={() => setListOpen(false)}><div className="space-y-2">{activeWorkout.exercises.map((item, index) => <button type="button" key={item.id} onClick={() => { setActiveIndex(index); setListOpen(false); }} className="flex w-full items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-left"><span className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-black ${completedIds.includes(item.id) ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.06] text-zinc-500"}`}>{completedIds.includes(item.id) ? <Check className="h-4 w-4" /> : index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white">{item.name}</span><span className="mt-1 block text-xs text-zinc-600">{item.sets} séries · {item.reps} repetições</span></span><ChevronRight className="h-4 w-4 text-zinc-700" /></button>)}</div></Modal>}
      </div>
    );
  }

  const label = temporaryWorkout ? "Escolhido para hoje" : nextState.kind === "pending" ? "Treino pendente" : nextState.kind === "today" ? "Treino de hoje" : "Próximo treino";
  const description = temporaryWorkout ? "Esta escolha vale somente para agora. Sua semana continua igual." : nextState.kind === "pending" ? "Ele continua aqui. Retome quando fizer sentido para você." : "Seu próximo passo, no seu ritmo.";

  return (
    <div className="space-y-7 p-5 sm:p-6 lg:p-10"><div>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.28em] text-violet-400">Seu plano de treino</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Treinos</h1><p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">Sua rotina personalizada, pronta para a próxima sessão.</p></div><div className="flex gap-2"><button type="button" onClick={() => setPanel("history")} className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 text-sm font-bold text-zinc-300"><History className="h-4 w-4" /><span className="hidden sm:inline">Histórico</span></button><Link href="/dashboard/aria" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 text-xs font-black text-violet-200"><Sparkles className="h-4 w-4" />Ajustar na Mentoria</Link></div></header>
      {success && <div className="mt-6 flex justify-between rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.07] p-4 text-sm text-emerald-200"><span>{success}</span><button type="button" onClick={() => setSuccess("")}><X className="h-4 w-4" /></button></div>}
      {loadError && <div className="mt-6 rounded-2xl border border-red-400/15 bg-red-400/[0.07] p-4 text-sm text-red-200">{loadError}</div>}

      {loading ? <div className="animate-pulse space-y-5"><div className="h-72 rounded-[30px] bg-white/[0.04]" /><div className="h-32 rounded-[24px] bg-white/[0.04]" /></div> : workouts.length === 0 ? (
        <section className="relative overflow-hidden rounded-[30px] border border-violet-500/25 bg-[#0b0914] p-6 shadow-[0_24px_80px_rgba(76,29,149,0.14)] sm:p-8 lg:p-10"><div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-600/20 blur-[90px]" /><div className="relative max-w-2xl"><div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-300"><Dumbbell className="h-7 w-7" /></div><p className="mt-6 text-[10px] font-black uppercase tracking-[0.25em] text-violet-400">Sua jornada começa aqui</p><h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Vamos criar seu primeiro treino</h2><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">O PRAXE monta sua rotina com base no seu objetivo, experiência, dados físicos e dias disponíveis para treinar.</p>{generateError && <p className="mt-4 rounded-2xl border border-red-400/15 bg-red-500/[0.08] p-3 text-sm text-red-200">{generateError}</p>}<button type="button" disabled={generating} onClick={() => void generateWorkout()} className="mt-7 flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-violet-600 px-6 text-sm font-black text-white shadow-[0_16px_40px_rgba(109,40,217,0.28)] disabled:opacity-50">{generating ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}{generating ? "Montando seu plano..." : "Gerar meu plano"}</button></div></section>
      ) : <>
        {nextWorkout && <section className="group relative overflow-hidden rounded-[30px] border border-violet-500/25 bg-[#0b0914] p-5 shadow-[0_24px_80px_rgba(76,29,149,0.16)] sm:p-7 lg:p-8"><div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-violet-600/20 blur-[100px]" /><div className="relative grid min-h-56 gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"><div><div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${nextState.kind === "pending" && !temporaryWorkout ? "border border-amber-300/20 bg-amber-300/[0.08] text-amber-200" : "border border-violet-300/20 bg-violet-500/10 text-violet-200"}`}>{label}</span>{nextState.scheduledDay && !temporaryWorkout && <span className="text-xs font-bold text-zinc-600">{getWeekdayLabel(nextState.scheduledDay)}</span>}</div><h2 className="mt-5 max-w-3xl break-words text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-4xl">{nextWorkout.title}</h2><p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p><div className="mt-5 flex flex-wrap gap-2"><span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-xs font-bold text-zinc-300"><Dumbbell className="h-4 w-4 text-violet-400" />{nextWorkout.exercises.length || "—"} exercícios</span>{duration && <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-xs font-bold text-zinc-300"><Clock3 className="h-4 w-4 text-violet-400" />{duration} planejados</span>}</div></div><div className="flex min-w-60 flex-col gap-3"><button type="button" onClick={() => startWorkout(nextWorkout)} className="flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-violet-600 px-6 text-sm font-black text-white shadow-[0_16px_40px_rgba(109,40,217,0.3)]"><Play className="h-4 w-4 fill-current" />Iniciar treino</button><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setPanel("switch")} className="min-h-11 rounded-xl border border-white/[0.08] text-xs font-bold text-zinc-300">Trocar treino</button><button type="button" onClick={openSchedule} className="min-h-11 rounded-xl border border-white/[0.08] text-xs font-bold text-zinc-300">Editar semana</button></div></div></div></section>}

        <section className="mt-6 rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-600">Sua semana</p><h2 className="mt-2 text-lg font-black text-white">Plano compacto</h2></div><button type="button" onClick={openSchedule} className="flex min-h-10 items-center gap-2 px-3 text-xs font-bold text-violet-300"><Pencil className="h-3.5 w-3.5" />Editar</button></div><div className="mt-5 grid grid-cols-7 gap-2 overflow-x-auto pb-1">{WEEKDAYS.map((day) => { const item = schedule.find((entry) => entry.day === day.value); const current = day.value === todayWeekday; return <div key={day.value} className={`min-w-16 rounded-2xl border p-3 text-center ${current ? "border-violet-400/30 bg-violet-400/[0.08]" : "border-white/[0.06] bg-black/15"}`}><p className={`text-[10px] font-black uppercase ${current ? "text-violet-300" : "text-zinc-600"}`}>{day.short}</p><div className={`mx-auto mt-3 h-1.5 w-1.5 rounded-full ${item ? "bg-violet-400" : "bg-zinc-800"}`} /><p className="mt-2 truncate text-[10px] font-bold text-zinc-400" title={item?.workout.title}>{item ? item.workout.title : "Pausa"}</p></div>; })}</div>{!schedule.length && <p className="mt-4 text-xs text-zinc-600">Sem dias preferidos definidos. Os treinos continuam disponíveis sem agenda fixa.</p>}</section>
        {latestLog && <section className="mt-5 flex flex-col gap-4 rounded-[24px] border border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Último treino</p><p className="mt-2 text-sm font-black text-white">{latestWorkout?.title ?? "Treino concluído"}</p><p className="mt-1 text-xs text-zinc-600">{formatDate(latestLog.workoutDate)}</p></div><button type="button" onClick={() => setPanel("history")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.07] px-4 text-xs font-bold text-zinc-300"><History className="h-4 w-4" />Ver histórico</button></section>}
      </>}
    </div>

    {panel === "switch" && <Modal eyebrow="Somente hoje" title="Fazer outro treino" close={() => setPanel(null)}><p className="mb-5 text-sm text-zinc-500">A escolha vale somente para agora e não altera sua semana.</p><div className="space-y-2">{workouts.map((item) => <button type="button" key={item.id} onClick={() => { setTemporaryWorkout(item); setPanel(null); }} className="flex w-full items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-left"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05] text-violet-300"><Dumbbell className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-white">{item.title}</span><span className="mt-1 block text-xs text-zinc-600">{item.exercises.length || "—"} exercícios</span></span><ChevronRight className="h-4 w-4 text-zinc-700" /></button>)}</div>{temporaryWorkout && <button type="button" onClick={() => { setTemporaryWorkout(null); setPanel(null); }} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 text-xs font-bold text-zinc-500"><RotateCcw className="h-4 w-4" />Voltar ao próximo treino</button>}</Modal>}

    {panel === "schedule" && <Modal eyebrow="Prévia sem salvamento" title="Editar semana" close={() => setPanel(null)}><div className="flex gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-4"><LockKeyhole className="h-4 w-4 shrink-0 text-amber-200" /><p className="text-xs leading-5 text-amber-100/75">A agenda permanente ainda não possui armazenamento próprio. Nenhuma mudança será salva nesta versão.</p></div><div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-7">{WEEKDAYS.map((day) => <button type="button" key={day.value} onClick={() => toggleDay(day.value)} className={`flex min-h-16 flex-col items-center justify-center rounded-2xl border text-xs font-black ${scheduleDraft.includes(day.value) ? "border-violet-400/35 bg-violet-400/[0.11] text-violet-200" : "border-white/[0.07] text-zinc-600"}`}>{day.short}{scheduleDraft.includes(day.value) && <Check className="mt-1 h-3.5 w-3.5" />}</button>)}</div><div className="mt-6 space-y-2">{buildWeeklySchedule(workouts, scheduleDraft).map((item) => <div key={item.day} className="flex items-center justify-between rounded-xl border border-white/[0.06] px-4 py-3"><span className="text-xs font-bold text-zinc-500">{getWeekdayLabel(item.day)}</span><span className="truncate text-sm font-black text-white">{item.workout.title}</span></div>)}</div><button type="button" onClick={() => setScheduleDraft(scheduleDays)} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.07] text-xs font-bold text-zinc-400"><RotateCcw className="h-4 w-4" />Restaurar plano original</button><button type="button" disabled className="mt-3 min-h-12 w-full rounded-xl bg-white/[0.05] text-sm font-black text-zinc-600">Salvar após aprovação da persistência</button></Modal>}

    {panel === "history" && <Modal eyebrow="Consistência" title="Histórico de treinos" close={() => setPanel(null)}>{!logs.length ? <div className="py-10 text-center"><History className="mx-auto h-7 w-7 text-zinc-700" /><p className="mt-4 text-sm font-bold text-zinc-400">Seu primeiro treino concluído aparecerá aqui.</p></div> : <div className="space-y-3">{logs.map((log) => { const workout = workouts.find((item) => item.id === log.workoutId); const expanded = expandedLogId === log.id; return <article key={log.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><button type="button" onClick={() => setExpandedLogId(expanded ? null : log.id)} className="flex w-full justify-between gap-4 text-left"><div><p className="text-sm font-black text-white">{workout?.title ?? "Treino anterior"}</p><p className="mt-1 text-xs text-zinc-600">{formatDate(log.workoutDate)}</p></div><span className="h-fit rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] px-2.5 py-1 text-[10px] font-black uppercase text-emerald-300">Concluído</span></button>{expanded && <div className="mt-4 border-t border-white/[0.06] pt-4"><p className="text-xs leading-5 text-zinc-500">A ficha abaixo é a versão atual. O banco ainda não preserva o snapshot nem quais exercícios foram concluídos nesta sessão.</p>{workout?.exercises.map((item) => <p key={item.id} className="mt-2 text-sm text-zinc-300">• {item.name}</p>)}<p className="mt-4 text-xs text-zinc-600">Nota e duração real indisponíveis.</p></div>}</article>; })}<p className="pt-2 text-xs leading-5 text-zinc-600">Notas, duração e exercícios efetivamente concluídos dependem do modelo privado de sessões ainda não aprovado.</p></div>}</Modal>}
    </div>
  );
}
