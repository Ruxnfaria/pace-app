"use client";

import {
  ArrowLeft, Check, CheckCircle2, ChevronLeft, ChevronRight, Dumbbell,
  History, List, LoaderCircle, NotebookPen, Pencil, Play, RotateCcw, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ExerciseMedia } from "@/components/workouts/ExerciseMedia";
import { getBrazilDate } from "@/lib/dates/brazilDate";
import { createClient } from "@/lib/supabase/client";
import { createBrowserWorkoutGateway } from "@/lib/workouts/browser-gateway";
import {
  WorkoutLifecycleCoordinator,
  type WorkoutLifecycleSnapshot,
} from "@/lib/workouts/lifecycle";
import {
  WEEKDAYS, getPendingWorkoutPresentation, getWeekdayLabel, isoWeekdayFromDate,
  type DurableWorkoutHistoryItem, type Workout,
} from "@/lib/workouts/model";

type Panel = "switch" | "schedule" | "history" | null;
type Operation = "bootstrap" | "start" | "exercise" | "note" | "abandon" |
  "skip" | "complete" | "schedule" | "restore" | "generate" | null;

const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
}).format(new Date(`${value}T12:00:00.000Z`));

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes} min ${remainder ? `${remainder}s` : ""}`.trim() : `${remainder}s`;
};

function Modal({
  title, eyebrow, close, children,
}: {
  title: string;
  eyebrow: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-black/75 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <button type="button" aria-label="Fechar painel" onClick={close} className="absolute inset-0" />
      <section className="relative z-10 max-h-[88vh] w-full overflow-hidden rounded-t-[30px] border border-white/[0.08] bg-[#101014] shadow-2xl sm:max-w-xl sm:rounded-[30px]">
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-5 sm:px-6">
          <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-400">{eyebrow}</p><h2 className="mt-2 text-xl font-black text-white">{title}</h2></div>
          <button type="button" onClick={close} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.05] text-zinc-400"><X className="h-5 w-5" /></button>
        </header>
        <div className="max-h-[calc(88vh-88px)] overflow-y-auto p-5 sm:p-6">{children}</div>
      </section>
    </div>
  );
}

function asSnapshotWorkout(snapshot: WorkoutLifecycleSnapshot): Workout | null {
  const session = snapshot.activeSession;
  if (!session) return null;
  return {
    id: session.workoutId ?? session.id,
    title: session.workoutTitle,
    rawText: null,
    createdAt: session.startedAt,
    exercises: snapshot.activeExercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      rest: exercise.rest,
      tip: exercise.tip,
    })),
  };
}

export default function WorkoutsExperienceV2() {
  const supabase = useMemo(() => createClient(), []);
  const coordinator = useMemo(() => new WorkoutLifecycleCoordinator(
    createBrowserWorkoutGateway(supabase)
  ), [supabase]);
  const [snapshot, setSnapshot] = useState<WorkoutLifecycleSnapshot | null>(null);
  const [operation, setOperation] = useState<Operation>("bootstrap");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [temporaryWorkout, setTemporaryWorkout] = useState<Workout | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [persistedNote, setPersistedNote] = useState<string | null>(null);
  const [exerciseSavingId, setExerciseSavingId] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<Record<number, string | null>>({});
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyNoteDraft, setHistoryNoteDraft] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const revisionRef = useRef(0);
  const operationRef = useRef<Operation>("bootstrap");

  const adoptSnapshot = useCallback((next: WorkoutLifecycleSnapshot) => {
    const nextSession = next.activeSession;
    if (nextSession?.id !== sessionIdRef.current) {
      sessionIdRef.current = nextSession?.id ?? null;
      setNoteDraft(nextSession?.note ?? "");
      setPersistedNote(nextSession?.note ?? null);
      setActiveIndex(0);
    }
    setSnapshot(next);
  }, []);

  const applySnapshot = useCallback((next: WorkoutLifecycleSnapshot) => {
    revisionRef.current += 1;
    adoptSnapshot(next);
  }, [adoptSnapshot]);

  useEffect(() => {
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    void coordinator.bootstrap().then(
      (next) => {
        if (revision === revisionRef.current) adoptSnapshot(next);
      },
      (caught: unknown) => {
        if (revision === revisionRef.current) {
          console.error("[PRAXE] Falha no bootstrap persistente de treinos:", caught);
          setError("A persistência de treinos está indisponível. Nenhuma gravação legada foi usada.");
        }
      }
    ).then(() => {
      if (revision === revisionRef.current && operationRef.current === "bootstrap") {
        operationRef.current = null;
        setOperation(null);
      }
    });
  }, [adoptSnapshot, coordinator]);

  const today = getBrazilDate();
  const todayWeekday = isoWeekdayFromDate(today);
  const workouts = snapshot?.workouts ?? [];
  const pending = snapshot?.pending ?? null;
  const scheduledRow = snapshot?.schedule.find((row) => row.isoWeekday === todayWeekday) ?? null;
  const scheduledWorkout = scheduledRow?.workoutId && scheduledRow.effectiveFromDate <= today
    ? workouts.find((workout) => workout.id === scheduledRow.workoutId) ?? null
    : null;
  const pendingPresentation = pending ? getPendingWorkoutPresentation(pending) : null;
  const primaryWorkout = temporaryWorkout ?? pendingPresentation ?? scheduledWorkout ?? workouts[0] ?? null;
  const activeSession = snapshot?.activeSession ?? null;
  const activeWorkout = snapshot ? asSnapshotWorkout(snapshot) : null;
  const activeExercise = snapshot?.activeExercises[activeIndex] ?? null;
  const completedCount = snapshot?.activeExercises.filter((exercise) => exercise.completedAt).length ?? 0;
  const allDone = Boolean(snapshot?.activeExercises.length && completedCount === snapshot.activeExercises.length);
  const previousNote = snapshot?.previousNote ?? null;
  const mutationBusy = operation !== null;

  const beginOperation = useCallback((kind: Exclude<Operation, null>) => {
    if (operationRef.current !== null) return false;
    operationRef.current = kind;
    setOperation(kind);
    setError("");
    return true;
  }, []);

  const finishOperation = useCallback((kind: Exclude<Operation, null>) => {
    if (operationRef.current === kind) {
      operationRef.current = null;
      setOperation(null);
    }
  }, []);

  const run = useCallback(async (
    kind: Exclude<Operation, "bootstrap" | "generate" | null>,
    action: () => Promise<WorkoutLifecycleSnapshot>,
    message?: string
  ) => {
    if (!beginOperation(kind)) return null;
    try {
      const next = await action();
      applySnapshot(next);
      if (message) setSuccess(message);
      return next;
    } catch (caught) {
      console.error(`[PRAXE] Falha em ${kind}:`, caught);
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir a ação.");
      return null;
    } finally { finishOperation(kind); }
  }, [applySnapshot, beginOperation, finishOperation]);

  async function startPrimary() {
    if (!primaryWorkout || operationRef.current !== null || activeSession) return;
    const scheduled = !temporaryWorkout && pending;
    const next = await run("start", () => coordinator.start({
      intentKey: scheduled ? `occurrence:${scheduled.id}` : `workout:${primaryWorkout.id}`,
      workoutId: scheduled ? scheduled.sourceWorkoutId : primaryWorkout.id,
      occurrenceId: scheduled ? scheduled.id : null,
    }));
    if (next?.activeSession) { setTemporaryWorkout(null); setSessionOpen(true); setPanel(null); }
  }

  async function toggleExercise() {
    if (!activeSession || !activeExercise || activeSession.status !== "in_progress" || operationRef.current !== null) return;
    setExerciseSavingId(activeExercise.id);
    await run("exercise", () => coordinator.setExercise({
      sessionId: activeSession.id,
      exerciseId: activeExercise.id,
      completed: !activeExercise.completedAt,
    }));
    setExerciseSavingId(null);
  }

  async function saveCurrentNote() {
    if (!activeSession || operationRef.current !== null) return;
    const next = await run("note", () => coordinator.saveNote(activeSession.id, noteDraft), "Nota salva.");
    if (next?.activeSession) {
      setNoteDraft(next.activeSession.note ?? "");
      setPersistedNote(next.activeSession.note);
    }
  }

  async function completeSession() {
    if (!activeSession || !snapshot || !allDone || operationRef.current !== null) return;
    const next = await run("complete", () => coordinator.complete({
      sessionId: activeSession.id,
      exercises: snapshot.activeExercises,
      note: noteDraft,
      persistedNote,
    }), "Treino concluído. Energy permanece inalterada.");
    if (next) { setSessionOpen(false); setNotesOpen(false); }
  }

  async function abandonSession() {
    if (!activeSession || operationRef.current !== null || !window.confirm("Abandonar esta sessão? O treino pendente será liberado novamente.")) return;
    const next = await run("abandon", () => coordinator.abandon(activeSession.id), "Sessão abandonada.");
    if (next) setSessionOpen(false);
  }

  async function skipPending() {
    if (!pending || operationRef.current !== null || !window.confirm("Pular este treino pendente? Esta ação não abandona uma sessão ativa.")) return;
    const reason = window.prompt("Motivo para pular (1–240 caracteres):", "Imprevisto");
    if (reason === null) return;
    await run("skip", () => coordinator.skip(pending.id, reason), "Treino pendente pulado.");
  }

  function openSchedule() {
    if (operationRef.current !== null) return;
    setScheduleDraft(Object.fromEntries(
      WEEKDAYS.map((day) => [day.value, snapshot?.schedule.find((row) => row.isoWeekday === day.value)?.workoutId ?? null])
    ));
    setPanel("schedule");
  }

  async function saveSchedule() {
    const assignments = WEEKDAYS.map((day) => ({
      iso_weekday: day.value,
      workout_id: scheduleDraft[day.value] ?? null,
    }));
    if (!beginOperation("schedule")) return;
    try {
      const result = await coordinator.updateSchedule(assignments);
      applySnapshot(result.snapshot);
      setSuccess(`Agenda atualizada com vigência em ${formatDate(result.effectiveFromDate)}.`);
      setPanel(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível atualizar a agenda.");
    } finally { finishOperation("schedule"); }
  }

  async function restoreSchedule() {
    if (operationRef.current !== null || !window.confirm("Restaurar a agenda original a partir de amanhã?")) return;
    if (!beginOperation("restore")) return;
    try {
      const result = await coordinator.restoreSchedule();
      applySnapshot(result.snapshot);
      setSuccess(`Agenda original restaurada com vigência em ${formatDate(result.effectiveFromDate)}.`);
      setPanel(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível restaurar a agenda.");
    } finally { finishOperation("restore"); }
  }

  async function saveHistoryNote(item: DurableWorkoutHistoryItem) {
    const draft = historyNoteDraft[item.session.id] ?? item.session.note ?? "";
    await run("note", () => coordinator.saveNote(item.session.id, draft), "Nota histórica atualizada.");
  }

  async function generateFirstWorkout() {
    if (!beginOperation("generate")) return;
    setGenerating(true);
    try {
      const response = await fetch("/api/workouts/generate", { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível gerar o treino.");
      applySnapshot(await coordinator.bootstrap());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível gerar o treino.");
    } finally {
      setGenerating(false);
      finishOperation("generate");
    }
  }

  if (activeSession && sessionOpen && activeWorkout) {
    const progress = snapshot?.activeExercises.length
      ? Math.round(completedCount / snapshot.activeExercises.length * 100) : 0;
    return (
      <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#08080b] text-white">
        <div className="mx-auto flex min-h-full max-w-6xl flex-col px-4 pb-24 pt-4 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => setSessionOpen(false)} className="flex min-h-11 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-bold text-zinc-300"><ArrowLeft className="h-4 w-4" />Sair</button>
            <div className="min-w-0 text-center"><p className="truncate text-xs font-black uppercase tracking-[0.18em] text-violet-400">{activeSession.workoutTitle}</p><p className="mt-1 text-xs text-zinc-500">{completedCount} de {snapshot?.activeExercises.length ?? 0} exercícios</p></div>
            <div className="flex gap-2"><button type="button" onClick={() => setListOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04]"><List className="h-4 w-4" /></button><button type="button" onClick={() => setNotesOpen(true)} className="flex min-h-11 items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/[0.08] px-4 text-sm font-bold text-violet-200"><NotebookPen className="h-4 w-4" />Notas</button></div>
          </header>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-violet-500" style={{ width: `${progress}%` }} /></div>
          {activeExercise ? <main className="mx-auto mt-6 grid w-full max-w-5xl flex-1 gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0d0d12]"><ExerciseMedia exerciseId={activeExercise.exerciseKey ?? activeExercise.id} exerciseName={activeExercise.name} /></div>
            <section><p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-400">Exercício {activeIndex + 1}</p><h1 className="mt-3 text-3xl font-black text-white">{activeExercise.name}</h1><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">{[["Séries", activeExercise.sets], ["Repetições", activeExercise.reps], ...(activeExercise.rest ? [["Descanso", activeExercise.rest]] : [])].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4"><p className="text-[10px] font-black uppercase text-zinc-600">{label}</p><p className="mt-2 text-xl font-black">{value}</p></div>)}</div>{activeExercise.tip && <p className="mt-5 rounded-2xl border border-white/[0.07] p-4 text-sm text-zinc-400">{activeExercise.tip}</p>}
              <button type="button" disabled={mutationBusy} onClick={() => void toggleExercise()} className={`mt-6 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl text-sm font-black ${activeExercise.completedAt ? "border border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "bg-white text-black"}`}>{exerciseSavingId ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}{activeExercise.completedAt ? "Exercício concluído" : "Marcar como concluído"}</button>
              <div className="mt-4 grid grid-cols-2 gap-3"><button type="button" disabled={activeIndex === 0} onClick={() => setActiveIndex((index) => index - 1)} className="min-h-12 rounded-2xl border border-white/[0.08] disabled:opacity-30"><ChevronLeft className="mx-auto h-4 w-4" /></button><button type="button" disabled={activeIndex === (snapshot?.activeExercises.length ?? 1) - 1} onClick={() => setActiveIndex((index) => index + 1)} className="min-h-12 rounded-2xl border border-white/[0.08] disabled:opacity-30"><ChevronRight className="mx-auto h-4 w-4" /></button></div>
              {error && <p className="mt-4 rounded-xl bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
              <button type="button" disabled={!allDone || mutationBusy} onClick={() => void completeSession()} className="mt-4 min-h-14 w-full rounded-2xl bg-violet-600 text-sm font-black disabled:bg-white/[0.06] disabled:text-zinc-600">{operation === "complete" ? "Finalizando..." : allDone ? "Finalizar treino" : "Conclua todos os exercícios"}</button>
              <button type="button" disabled={mutationBusy} onClick={() => void abandonSession()} className="mt-3 min-h-11 w-full text-xs font-bold text-red-300 disabled:opacity-40">Abandonar sessão</button>
            </section>
          </main> : <p className="mt-12 text-center text-zinc-400">Carregando snapshot da sessão...</p>}
        </div>
        {notesOpen && <Modal eyebrow="Sessão persistida" title="Notas do treino" close={() => setNotesOpen(false)}><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value.slice(0, 2000))} rows={8} className="w-full rounded-2xl border border-white/[0.09] bg-black/30 p-4 text-sm text-white" /><div className="mt-3 flex justify-between text-xs text-zinc-600"><span>Salvamento explícito</span><span>{noteDraft.length}/2000</span></div>{previousNote && <div className="mt-5 rounded-2xl border border-white/[0.07] p-4"><p className="text-[10px] font-black uppercase text-zinc-600">Última vez</p><p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">{previousNote}</p></div>}<button type="button" disabled={mutationBusy} onClick={() => void saveCurrentNote()} className="mt-5 min-h-12 w-full rounded-xl bg-violet-600 text-sm font-black text-white disabled:opacity-40">Salvar nota</button></Modal>}
        {listOpen && <Modal eyebrow={`${completedCount} concluídos`} title="Exercícios" close={() => setListOpen(false)}><div className="space-y-2">{snapshot?.activeExercises.map((item, index) => <button type="button" key={item.id} onClick={() => { setActiveIndex(index); setListOpen(false); }} className="flex w-full items-center gap-3 rounded-xl border border-white/[0.07] p-4 text-left"><span>{item.completedAt ? <Check className="h-4 w-4 text-emerald-300" /> : index + 1}</span><span className="font-bold">{item.name}</span></button>)}</div></Modal>}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 text-white sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-400">Treinos persistentes</p><h1 className="mt-2 text-3xl font-black">Sua rotina</h1><p className="mt-2 text-sm text-zinc-500">Sessões, notas e histórico preservados pelo banco.</p></div><div className="flex gap-2"><button type="button" onClick={() => setPanel("history")} className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/[0.08] px-4 text-sm font-bold"><History className="h-4 w-4" />Histórico</button><button type="button" onClick={openSchedule} className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/[0.08] px-4 text-sm font-bold"><Pencil className="h-4 w-4" />Agenda</button></div></header>
      {success && <div className="mb-5 flex justify-between rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.07] p-4 text-sm text-emerald-200"><span>{success}</span><button type="button" onClick={() => setSuccess("")}><X className="h-4 w-4" /></button></div>}
      {error && <div className="mb-5 rounded-2xl border border-red-400/15 bg-red-400/[0.07] p-4 text-sm text-red-200">{error}</div>}
      {operation === "bootstrap" ? <div className="h-72 animate-pulse rounded-[30px] bg-white/[0.04]" /> : <>
        {activeSession && <section className="mb-5 rounded-[24px] border border-amber-300/20 bg-amber-300/[0.07] p-5"><p className="text-xs font-black uppercase text-amber-200">Sessão em andamento</p><h2 className="mt-2 text-xl font-black">{activeSession.workoutTitle}</h2><p className="mt-2 text-sm text-amber-100/70">Iniciada em {new Date(activeSession.startedAt).toLocaleString("pt-BR")}. Seu progresso foi restaurado.</p><button type="button" onClick={() => setSessionOpen(true)} className="mt-4 min-h-12 rounded-xl bg-amber-200 px-5 text-sm font-black text-black">Retomar treino</button></section>}
        {pending && <section className="mb-5 flex flex-col gap-4 rounded-[24px] border border-amber-300/15 bg-amber-300/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase text-amber-200">Pendente desde {formatDate(pending.scheduledForDate)}</p><p className="mt-2 text-lg font-black">{pending.workoutTitle}</p><p className="mt-1 text-sm text-zinc-500">Permanece pendente até concluir ou pular explicitamente.</p></div><button type="button" disabled={Boolean(activeSession) || mutationBusy} onClick={() => void skipPending()} className="min-h-11 rounded-xl border border-amber-200/20 px-4 text-xs font-bold text-amber-100 disabled:opacity-40">Pular com motivo</button></section>}
        {primaryWorkout ? <section className="relative overflow-hidden rounded-[30px] border border-violet-500/25 bg-[#0b0914] p-6 sm:p-8"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">{temporaryWorkout ? "Troca somente nesta sessão" : pending ? "Próximo pendente" : scheduledWorkout ? "Agendado hoje" : scheduledRow && !scheduledRow.workoutId ? "Dia de descanso · treino avulso" : "Treino disponível"}</p><h2 className="mt-4 text-3xl font-black">{primaryWorkout.title}</h2><p className="mt-3 text-sm text-zinc-400">{primaryWorkout.exercises.length || "Snapshot carregado ao iniciar"} {primaryWorkout.exercises.length === 1 ? "exercício" : "exercícios"}</p><div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={Boolean(activeSession) || mutationBusy} onClick={() => void startPrimary()} className="flex min-h-14 items-center gap-3 rounded-2xl bg-violet-600 px-6 text-sm font-black disabled:bg-white/[0.06] disabled:text-zinc-600">{operation === "start" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{activeSession ? "Retome a sessão atual" : "Iniciar treino"}</button><button type="button" disabled={Boolean(activeSession) || mutationBusy} onClick={() => setPanel("switch")} className="min-h-14 rounded-2xl border border-white/[0.08] px-5 text-sm font-bold disabled:opacity-40">Trocar somente agora</button></div></section> : <section className="rounded-[30px] border border-white/[0.08] p-8 text-center"><Dumbbell className="mx-auto h-8 w-8 text-violet-300" /><p className="mt-4 font-bold">Nenhum treino disponível.</p><button type="button" disabled={generating || Boolean(activeSession) || mutationBusy} onClick={() => void generateFirstWorkout()} className="mt-5 min-h-12 rounded-xl bg-violet-600 px-5 text-sm font-black disabled:opacity-50">{generating ? "Gerando treino..." : "Gerar meu primeiro treino"}</button></section>}
        <section className="mt-6 rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase text-zinc-600">Sua semana</p><h2 className="mt-2 text-lg font-black">Agenda permanente</h2></div><button type="button" disabled={mutationBusy} onClick={openSchedule} className="text-xs font-bold text-violet-300 disabled:opacity-40">Editar</button></div><div className="mt-5 grid grid-cols-7 gap-2 overflow-x-auto">{WEEKDAYS.map((day) => { const row = snapshot?.schedule.find((item) => item.isoWeekday === day.value); const workout = workouts.find((item) => item.id === row?.workoutId); return <div key={day.value} className={`min-w-16 rounded-2xl border p-3 text-center ${day.value === todayWeekday ? "border-violet-400/30 bg-violet-400/[0.08]" : "border-white/[0.06]"}`}><p className="text-[10px] font-black text-zinc-500">{day.short}</p><p className="mt-3 truncate text-[10px] font-bold">{workout?.title ?? "Pausa"}</p></div>; })}</div></section>
      </>}

      {panel === "switch" && <Modal eyebrow="Somente esta sessão" title="Trocar treino" close={() => setPanel(null)}><div className="space-y-2">{workouts.map((workout) => <button type="button" key={workout.id} onClick={() => { setTemporaryWorkout(workout); setPanel(null); }} className="flex w-full items-center justify-between rounded-2xl border border-white/[0.07] p-4 text-left"><span><span className="block font-black">{workout.title}</span><span className="mt-1 block text-xs text-zinc-600">Não altera a agenda nem o pendente</span></span><ChevronRight className="h-4 w-4" /></button>)}</div>{temporaryWorkout && <button type="button" onClick={() => { setTemporaryWorkout(null); setPanel(null); }} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 text-xs text-zinc-400"><RotateCcw className="h-4 w-4" />Cancelar troca</button>}</Modal>}
      {panel === "schedule" && <Modal eyebrow="Vigência amanhã" title="Editar agenda" close={() => setPanel(null)}><div className="space-y-3">{WEEKDAYS.map((day) => <label key={day.value} className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] p-3"><span className="text-sm font-bold">{getWeekdayLabel(day.value)}</span><select disabled={mutationBusy} value={scheduleDraft[day.value] ?? ""} onChange={(event) => setScheduleDraft((current) => ({ ...current, [day.value]: event.target.value || null }))} className="max-w-52 rounded-lg bg-zinc-900 p-2 text-sm"><option value="">Pausa</option>{workouts.map((workout) => <option key={workout.id} value={workout.id}>{workout.title}</option>)}</select></label>)}</div><button type="button" disabled={mutationBusy} onClick={() => void saveSchedule()} className="mt-5 min-h-12 w-full rounded-xl bg-violet-600 text-sm font-black disabled:opacity-40">Salvar agenda</button><button type="button" disabled={mutationBusy} onClick={() => void restoreSchedule()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] text-xs font-bold disabled:opacity-40"><RotateCcw className="h-4 w-4" />Restaurar original</button></Modal>}
      {panel === "history" && <Modal eyebrow="Dados persistidos" title="Histórico" close={() => setPanel(null)}><div className="space-y-3">{snapshot?.durableHistory.map((item) => { const expanded = expandedHistoryId === item.session.id; const draft = historyNoteDraft[item.session.id] ?? item.session.note ?? ""; return <article key={item.session.id} className="rounded-2xl border border-white/[0.07] p-4"><button type="button" onClick={() => setExpandedHistoryId(expanded ? null : item.session.id)} className="flex w-full justify-between text-left"><span><span className="block font-black">{item.session.workoutTitle}</span><span className="mt-1 block text-xs text-zinc-600">{formatDate(item.session.completedAt.slice(0, 10))} · {formatDuration(item.durationSeconds)}</span></span><span className="text-xs text-emerald-300">Concluído</span></button>{expanded && <div className="mt-4 border-t border-white/[0.06] pt-4">{item.exercises.map((exercise) => <p key={exercise.id} className="mt-1 text-sm text-zinc-300">• {exercise.name} {exercise.completedAt ? "✓" : ""}</p>)}{item.session.scheduledForDate && <p className="mt-3 text-xs text-zinc-600">Agendado para {formatDate(item.session.scheduledForDate)}</p>}<textarea disabled={mutationBusy} value={draft} onChange={(event) => setHistoryNoteDraft((current) => ({ ...current, [item.session.id]: event.target.value.slice(0, 2000) }))} rows={4} className="mt-4 w-full rounded-xl border border-white/[0.08] bg-black/20 p-3 text-sm" placeholder="Nota da sessão" /><button type="button" disabled={mutationBusy} onClick={() => void saveHistoryNote(item)} className="mt-2 min-h-10 w-full rounded-lg bg-violet-600 text-xs font-black disabled:opacity-40">Salvar nota</button></div>}</article>; })}{snapshot?.legacyHistory.map((item) => <article key={`legacy-${item.id}`} className="rounded-2xl border border-white/[0.07] p-4"><p className="font-black">{item.currentWorkoutTitle ?? "Treino legado"}</p><p className="mt-1 text-xs text-zinc-600">{formatDate(item.workoutDate)}</p>{item.currentWorkoutTitle && <p className="mt-2 text-[11px] text-zinc-700">Título atual do treino; não é snapshot histórico.</p>}</article>)}{!snapshot?.durableHistory.length && !snapshot?.legacyHistory.length && <p className="py-8 text-center text-sm text-zinc-500">Nenhum treino concluído.</p>}</div></Modal>}
    </div>
  );
}
