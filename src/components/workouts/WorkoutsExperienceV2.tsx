"use client";

import {
  ArrowLeft, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight,
  Clock3, Dumbbell, History, List, LoaderCircle, NotebookPen, Play,
  RotateCcw, X,
} from "lucide-react";
import Image from "next/image";
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

type Panel = "switch" | "schedule" | "history" | "next" | null;
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

const addDays = (date: string, days: number) => {
  const next = new Date(`${date}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
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
      <section className="relative z-10 max-h-[90vh] w-full overflow-hidden rounded-t-[30px] border border-white/[0.07] bg-[#0d0d0d] shadow-[0_-20px_70px_rgba(0,0,0,.65)] sm:max-w-xl sm:rounded-[30px] sm:shadow-[0_28px_90px_rgba(0,0,0,.7)]">
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] bg-gradient-to-b from-orange-500/[0.035] to-transparent px-5 py-5 sm:px-6">
          <div><p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#d96818]">{eyebrow}</p><h2 className="mt-2 text-xl font-semibold tracking-[-.025em] text-white">{title}</h2></div>
          <button type="button" onClick={close} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.035] text-zinc-500 transition hover:border-orange-400/20 hover:text-orange-200"><X className="h-4 w-4" /></button>
        </header>
        <div className="max-h-[calc(90vh-88px)] overflow-y-auto p-5 sm:p-6">{children}</div>
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
  const homeWorkout = activeWorkout ?? primaryWorkout;
  const homeExerciseCount = activeSession
    ? snapshot?.activeExercises.length ?? 0
    : primaryWorkout?.exercises.length ?? 0;
  const homeStatus = activeSession
    ? "Em andamento"
    : temporaryWorkout
      ? "Escolhido para hoje"
      : pending
        ? "Pendente"
        : scheduledWorkout
          ? "Não iniciado"
          : "Disponível";
  const nextScheduledWorkout = (() => {
    if (!snapshot) return null;
    for (let offset = 1; offset <= 7; offset += 1) {
      const weekday = (((todayWeekday - 1 + offset) % 7) + 1) as (typeof WEEKDAYS)[number]["value"];
      const date = addDays(today, offset);
      const row = snapshot.schedule.find((item) => item.isoWeekday === weekday);
      const workout = workouts.find((item) => item.id === row?.workoutId);
      if (row && row.effectiveFromDate <= date && workout) {
        return { date, weekday, workout };
      }
    }
    return null;
  })();
  const weekDates = Object.fromEntries(
    WEEKDAYS.map((day) => [day.value, addDays(today, day.value - todayWeekday)])
  ) as Record<(typeof WEEKDAYS)[number]["value"], string>;
  const completedScheduleDates = new Set(
    (snapshot?.durableHistory ?? [])
      .map((item) => item.session.scheduledForDate)
      .filter((date): date is string => Boolean(date))
  );

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
      <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#070707] text-white">
        <div className="mx-auto flex min-h-full w-full max-w-[460px] flex-col px-4 pb-8 pt-4 min-[375px]:px-5 sm:px-6">
          <header className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5">
            <button type="button" onClick={() => setSessionOpen(false)} className="flex h-11 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 text-xs font-semibold text-zinc-400 transition active:scale-[.98]"><ArrowLeft className="h-4 w-4" />Sair</button>
            <div className="min-w-0 text-center"><p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-[#d96818]">{activeSession.workoutTitle}</p><p className="mt-1 text-[10px] tabular-nums text-zinc-600">{completedCount}/{snapshot?.activeExercises.length ?? 0} exercícios</p></div>
            <div className="flex gap-1.5"><button type="button" onClick={() => setListOpen(true)} aria-label="Ver exercícios" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.03] text-zinc-400"><List className="h-4 w-4" /></button><button type="button" onClick={() => setNotesOpen(true)} aria-label="Abrir notas" className="flex h-11 items-center gap-2 rounded-full border border-orange-400/15 bg-orange-500/[0.07] px-3 text-xs font-semibold text-orange-200"><NotebookPen className="h-4 w-4" /><span className="hidden min-[390px]:inline">Notas</span></button></div>
          </header>
          <div className="mt-4"><div className="mb-1.5 flex justify-between text-[9px] text-zinc-600"><span>Progresso do treino</span><span className="tabular-nums text-zinc-400">{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-[#b74700] via-[#ef5b00] to-[#ff8a2a] transition-[width] duration-300" style={{ width: `${progress}%` }} /></div></div>
          {activeExercise ? <main className="mt-5 flex flex-1 flex-col">
            <div className="overflow-hidden rounded-[26px] border border-white/[0.07] bg-[#0d0d0d] shadow-[0_20px_60px_rgba(0,0,0,.35)]"><ExerciseMedia exerciseId={activeExercise.exerciseKey ?? activeExercise.id} exerciseName={activeExercise.name} /></div>
            <section className="mt-5"><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#d96818]">Exercício {activeIndex + 1}</p><h1 className="mt-2 text-[1.65rem] font-semibold leading-tight tracking-[-.035em] text-white">{activeExercise.name}</h1><div className="mt-4 grid grid-cols-3 gap-2">{[["Séries", activeExercise.sets], ["Repetições", activeExercise.reps], ["Descanso", activeExercise.rest ?? "—"]].map(([label, value]) => <div key={label} className="min-w-0 rounded-[18px] border border-white/[0.055] bg-white/[0.025] px-2 py-3 text-center"><p className="truncate text-[8px] font-bold uppercase tracking-[.08em] text-zinc-600">{label}</p><p className="mt-1.5 truncate text-[15px] font-semibold text-zinc-100">{value}</p></div>)}</div>{activeExercise.tip && <div className="mt-4 rounded-[18px] border border-orange-400/10 bg-orange-500/[0.035] p-4"><p className="text-[8px] font-bold uppercase tracking-[.18em] text-[#b95716]">Orientação</p><p className="mt-2 text-[12px] leading-5 text-zinc-400">{activeExercise.tip}</p></div>}
              <button type="button" disabled={mutationBusy} onClick={() => void toggleExercise()} className={`mt-5 flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl text-[13px] font-bold transition active:scale-[.99] ${activeExercise.completedAt ? "border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300" : "bg-[#ff6a00] text-white shadow-[0_12px_30px_rgba(255,106,0,.2)]"}`}>{exerciseSavingId ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}{activeExercise.completedAt ? "Exercício concluído" : "Marcar como concluído"}</button>
              <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={activeIndex === 0} onClick={() => setActiveIndex((index) => index - 1)} aria-label="Exercício anterior" className="min-h-12 rounded-2xl border border-white/[0.07] bg-white/[0.02] text-zinc-400 disabled:opacity-25"><ChevronLeft className="mx-auto h-4 w-4" /></button><button type="button" disabled={activeIndex === (snapshot?.activeExercises.length ?? 1) - 1} onClick={() => setActiveIndex((index) => index + 1)} aria-label="Próximo exercício" className="min-h-12 rounded-2xl border border-white/[0.07] bg-white/[0.02] text-zinc-400 disabled:opacity-25"><ChevronRight className="mx-auto h-4 w-4" /></button></div>
              {error && <p className="mt-4 rounded-xl border border-red-400/10 bg-red-400/[0.07] p-3 text-xs text-red-300">{error}</p>}
              <button type="button" disabled={!allDone || mutationBusy} onClick={() => void completeSession()} className="mt-4 min-h-14 w-full rounded-2xl border border-orange-400/15 bg-orange-500/[0.09] text-[13px] font-bold text-orange-200 transition enabled:hover:bg-orange-500/[0.14] disabled:border-white/[0.04] disabled:bg-white/[0.025] disabled:text-zinc-700">{operation === "complete" ? "Finalizando..." : allDone ? "Finalizar treino" : "Conclua todos os exercícios"}</button>
              <button type="button" disabled={mutationBusy} onClick={() => void abandonSession()} className="mt-2 min-h-11 w-full text-[10px] font-semibold text-red-300/75 disabled:opacity-40">Abandonar sessão</button>
            </section>
          </main> : <p className="mt-12 text-center text-sm text-zinc-500">Carregando snapshot da sessão...</p>}
        </div>
        {notesOpen && <Modal eyebrow="Nota privada da sessão" title="Notas do treino" close={() => setNotesOpen(false)}><p className="mb-4 text-[11px] leading-5 text-zinc-500">Esta anotação acompanha a sessão inteira e permanece disponível durante todo o treino.</p><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value.slice(0, 2000))} rows={7} className="w-full resize-none rounded-[18px] border border-white/[0.08] bg-black/35 p-4 text-sm text-white outline-none transition placeholder:text-zinc-700 focus:border-orange-400/25" placeholder="Cargas, sensações e observações..." /><div className="mt-2 flex justify-between text-[9px] text-zinc-600"><span>Salvamento explícito</span><span>{noteDraft.length}/2000</span></div>{previousNote && <div className="mt-5 rounded-[18px] border border-white/[0.06] bg-white/[0.02] p-4"><p className="text-[8px] font-bold uppercase tracking-[.18em] text-zinc-600">Última vez</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-400">{previousNote}</p></div>}<button type="button" disabled={mutationBusy} onClick={() => void saveCurrentNote()} className="mt-5 min-h-12 w-full rounded-xl bg-[#ff6a00] text-xs font-bold text-white shadow-[0_10px_24px_rgba(255,106,0,.18)] disabled:opacity-40">Salvar nota</button></Modal>}
        {listOpen && <Modal eyebrow={`${completedCount} de ${snapshot?.activeExercises.length ?? 0} concluídos`} title="Exercícios" close={() => setListOpen(false)}><div className="space-y-2">{snapshot?.activeExercises.map((item, index) => <button type="button" key={item.id} onClick={() => { setActiveIndex(index); setListOpen(false); }} className={`flex w-full items-center gap-3 rounded-[18px] border p-4 text-left transition ${index === activeIndex ? "border-orange-400/20 bg-orange-500/[0.06]" : "border-white/[0.06] bg-white/[0.015]"}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${item.completedAt ? "bg-emerald-400/[0.1] text-emerald-300" : "bg-white/[0.04] text-zinc-500"}`}>{item.completedAt ? <Check className="h-3.5 w-3.5" /> : index + 1}</span><span className="text-sm font-semibold text-zinc-200">{item.name}</span></button>)}</div></Modal>}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[430px] overflow-hidden px-4 pb-28 pt-5 text-white min-[375px]:px-5 sm:px-6">
      <header className="flex items-center justify-between">
        <Image src="/brand/praxe-logo.svg" alt="PRAXE" width={520} height={110} preload unoptimized className="h-auto w-[116px]" />
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-orange-400/10 bg-orange-500/[0.06] text-[#ff6a00]" aria-hidden="true"><Dumbbell className="h-[18px] w-[18px]" /></span>
      </header>

      <section className="mt-6">
        <h1 className="text-[1.7rem] font-semibold tracking-[-.045em]">Treinos</h1>
        <p className="mt-1 max-w-[360px] text-[12px] leading-5 text-zinc-500">Siga seu plano, evolua com consistência e fortaleça seu Núcleo.</p>
      </section>

      {success && <div className="mt-4 flex justify-between rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.07] p-3 text-xs text-emerald-200"><span>{success}</span><button type="button" onClick={() => setSuccess("")}><X className="h-4 w-4" /></button></div>}
      {error && <div className="mt-4 rounded-2xl border border-red-400/15 bg-red-400/[0.07] p-3 text-xs text-red-200">{error}</div>}

      {operation === "bootstrap" ? <div className="mt-5 h-72 animate-pulse rounded-[28px] bg-white/[0.04]" /> : <>
        {homeWorkout ? <section className="relative mt-5 overflow-hidden rounded-[28px] border border-orange-400/20 bg-gradient-to-br from-[#1d160f] via-[#110e0b] to-[#080808] p-5 shadow-[0_24px_76px_rgba(255,106,0,.15),inset_0_1px_0_rgba(255,255,255,.025)] min-[390px]:p-6">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-orange-500/[0.15] blur-[80px]" />
          <Dumbbell className="pointer-events-none absolute -bottom-5 -right-4 h-32 w-32 rotate-[-12deg] text-orange-100/[0.035]" strokeWidth={1.2} />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <span className={`rounded-full border px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.16em] ${activeSession || pending ? "border-orange-300/20 bg-orange-400/[0.09] text-orange-200" : "border-white/[0.07] bg-white/[0.035] text-zinc-400"}`}>{homeStatus}</span>
              {pending && !activeSession && <span className="text-[9px] font-medium text-zinc-600">desde {formatDate(pending.scheduledForDate)}</span>}
            </div>
            <p className="mt-5 text-[9px] font-bold uppercase tracking-[.2em] text-[#d96818]">Treino de hoje</p>
            <h2 className="mt-2 max-w-[300px] break-words text-[26px] font-bold leading-[1.08] tracking-[-.035em]">{homeWorkout.title}</h2>
            <p className="mt-2 max-w-[300px] text-[11px] leading-5 text-zinc-500">{activeSession ? "Seu progresso está salvo. Continue de onde parou." : pending ? "Este treino permanece como próximo até ser concluído ou pulado." : temporaryWorkout ? "Esta troca vale somente para agora e não altera sua semana." : "Hora de começar seu treino de hoje."}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-black/20 px-3 py-1.5 text-[10px] font-semibold text-zinc-300"><Dumbbell className="h-3.5 w-3.5 text-[#d96818]" />{homeExerciseCount || "—"} {homeExerciseCount === 1 ? "exercício" : "exercícios"}</span>
              {activeSession && <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-black/20 px-3 py-1.5 text-[10px] font-semibold text-zinc-300"><Clock3 className="h-3.5 w-3.5 text-[#d96818]" />{completedCount} de {snapshot?.activeExercises.length ?? 0} concluídos</span>}
            </div>

            {activeSession && <div className="mt-4"><div className="mb-1.5 flex justify-between text-[9px] text-zinc-500"><span>Progresso da sessão</span><span className="font-semibold tabular-nums text-zinc-300">{completedCount}/{snapshot?.activeExercises.length ?? 0}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-[#b74700] to-[#ff7a1a]" style={{ width: `${snapshot?.activeExercises.length ? completedCount / snapshot.activeExercises.length * 100 : 0}%` }} /></div></div>}

            <button type="button" disabled={!activeSession && mutationBusy} onClick={() => activeSession ? setSessionOpen(true) : void startPrimary()} className="mt-5 flex min-h-13 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#ff6a00] px-5 text-[13px] font-bold text-white shadow-[0_12px_30px_rgba(255,106,0,.22)] transition active:scale-[.99] disabled:bg-white/[0.06] disabled:text-zinc-600">{operation === "start" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}{activeSession ? "Continuar treino" : "Iniciar treino"}</button>

            {!activeSession && <button type="button" disabled={mutationBusy} onClick={() => setPanel("switch")} className="mt-2.5 min-h-11 w-full rounded-xl border border-white/[0.07] bg-white/[0.02] text-[11px] font-semibold text-zinc-400 disabled:opacity-40">Trocar somente agora</button>}
            {pending && !activeSession && <button type="button" disabled={mutationBusy} onClick={() => void skipPending()} className="mt-1.5 min-h-9 w-full text-[10px] font-medium text-zinc-600 disabled:opacity-40">Pular treino pendente</button>}
          </div>
        </section> : <section className="mt-5 rounded-[28px] border border-white/[0.07] bg-gradient-to-br from-[#141414] to-[#0a0a0a] p-6 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-400/10 bg-orange-500/[0.06]"><Dumbbell className="h-6 w-6 text-[#ff6a00]" /></span><p className="mt-4 text-sm font-semibold">Nenhum treino disponível.</p><p className="mt-1 text-[11px] text-zinc-600">Gere seu plano para começar.</p><button type="button" disabled={generating || Boolean(activeSession) || mutationBusy} onClick={() => void generateFirstWorkout()} className="mt-5 min-h-12 w-full rounded-xl bg-[#ff6a00] px-5 text-xs font-bold disabled:opacity-50">{generating ? "Gerando treino..." : "Gerar meu primeiro treino"}</button></section>}

        <section className="mt-6">
          <div className="flex items-end justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#d96818]">Sua semana</p><h2 className="mt-1 text-[17px] font-semibold tracking-[-.02em]">Plano de treino</h2></div><button type="button" disabled={mutationBusy} onClick={openSchedule} className="flex items-center gap-1.5 pb-0.5 text-[10px] font-medium text-zinc-500 disabled:opacity-40"><CalendarDays className="h-3.5 w-3.5" />Ver calendário</button></div>
          <div className="mt-3 grid grid-cols-7 gap-1 rounded-[22px] border border-white/[0.055] bg-white/[0.02] p-2.5 min-[375px]:gap-1.5 min-[375px]:p-3">
            {WEEKDAYS.map((day) => { const row = snapshot?.schedule.find((item) => item.isoWeekday === day.value); const workout = workouts.find((item) => item.id === row?.workoutId); const current = day.value === todayWeekday; const completed = completedScheduleDates.has(weekDates[day.value]); const pendingDay = pending?.scheduledForDate === weekDates[day.value]; return <div key={day.value} className="min-w-0 text-center" title={workout?.title ?? "Pausa"}><p className={`text-[8px] font-bold uppercase ${current ? "text-[#ff7a1a]" : "text-zinc-600"}`}>{day.short}</p><span className={`mx-auto mt-1.5 flex h-9 w-full max-w-10 items-center justify-center rounded-xl border ${current ? "border-orange-400/30 bg-orange-500/[0.12] text-[#ff7a1a] shadow-[0_6px_18px_rgba(255,106,0,.09)]" : completed ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300" : pendingDay ? "border-amber-300/20 bg-amber-300/[0.07] text-amber-200" : workout ? "border-white/[0.08] bg-white/[0.035] text-zinc-400" : "border-white/[0.04] text-zinc-700"}`}>{completed ? <Check className="h-3.5 w-3.5" /> : workout ? <Dumbbell className="h-3.5 w-3.5" /> : <span className="text-[9px]">—</span>}</span><p className={`mt-1 truncate text-[7px] font-medium ${current ? "text-orange-300/70" : "text-zinc-700"}`}>{completed ? "Feito" : pendingDay ? "Pendente" : workout ? "Treino" : "Pausa"}</p></div>; })}
          </div>
        </section>

        <section className="mt-5">
          <p className="text-[9px] font-bold uppercase tracking-[.2em] text-zinc-600">Próximo treino</p>
          {nextScheduledWorkout ? <button type="button" onClick={() => setPanel("next")} className="mt-2.5 flex w-full items-center gap-3 rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-[#151310] to-[#0c0c0c] p-3.5 text-left transition hover:border-orange-400/15 hover:bg-orange-500/[0.025] active:scale-[.99]"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-400/10 bg-orange-500/[0.06] text-[#ff6a00]"><Dumbbell className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{nextScheduledWorkout.workout.title}</span><span className="mt-1 block text-[10px] text-zinc-600">{getWeekdayLabel(nextScheduledWorkout.weekday)} · {formatDate(nextScheduledWorkout.date)} · {nextScheduledWorkout.workout.exercises.length || "—"} exercícios</span></span><ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" /></button> : <div className="mt-2.5 rounded-[18px] border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-center text-[10px] text-zinc-600">Nenhum próximo treino agendado.</div>}
        </section>

        <section className="mt-5">
          <div className="flex items-end justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-zinc-600">Última anotação</p><h2 className="mt-1 text-[17px] font-semibold tracking-[-.02em]">Evolução registrada</h2></div><button type="button" onClick={() => setPanel("history")} className="pb-0.5 text-[10px] font-medium text-zinc-500">Ver todas</button></div>
          <button type="button" onClick={() => setPanel("history")} className="mt-2.5 flex w-full items-center gap-3 rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-3.5 text-left"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.025] text-[#d96818]"><NotebookPen className="h-[18px] w-[18px]" /></span><span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold text-zinc-300">{previousNote ? "Sua última nota" : "Registre suas anotações"}</span><span className="mt-1 line-clamp-2 block text-[10px] leading-4 text-zinc-600">{previousNote ?? "Anote cargas, sensações e observações da sua evolução."}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-zinc-700" /></button>
        </section>
      </>}

      {panel === "next" && nextScheduledWorkout && <Modal eyebrow="Prévia · nenhuma alteração será feita" title="Próximo treino" close={() => setPanel(null)}><div className="overflow-hidden rounded-[22px] border border-orange-400/12 bg-gradient-to-br from-orange-500/[0.07] to-white/[0.015] p-5"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-400/15 bg-orange-500/[0.08] text-[#ff6a00]"><Dumbbell className="h-5 w-5" /></span><div><p className="text-[9px] font-bold uppercase tracking-[.18em] text-[#c65b16]">{getWeekdayLabel(nextScheduledWorkout.weekday)} · {formatDate(nextScheduledWorkout.date)}</p><h3 className="mt-2 text-xl font-semibold tracking-[-.025em] text-white">{nextScheduledWorkout.workout.title}</h3><p className="mt-1 text-[11px] text-zinc-500">{nextScheduledWorkout.workout.exercises.length || "—"} exercícios planejados</p></div></div></div>{nextScheduledWorkout.workout.exercises.length ? <div className="mt-4 space-y-2">{nextScheduledWorkout.workout.exercises.map((exercise, index) => <div key={exercise.id} className="flex items-center gap-3 rounded-[16px] border border-white/[0.055] bg-white/[0.018] p-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-[9px] font-bold text-zinc-500">{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-300">{exercise.name}</span><span className="text-[9px] text-zinc-600">{exercise.sets} × {exercise.reps}</span></div>)}</div> : <p className="py-6 text-center text-xs text-zinc-600">Os exercícios serão carregados ao iniciar.</p>}<p className="mt-5 text-center text-[9px] leading-4 text-zinc-700">Esta visualização não inicia sessão nem altera sua agenda.</p></Modal>}
      {panel === "switch" && <Modal eyebrow="Ação pontual · não altera sua semana" title="Trocar somente agora" close={() => setPanel(null)}><p className="mb-4 text-[11px] leading-5 text-zinc-500">Escolha outro treino apenas para esta sessão. Sua agenda permanente e o treino pendente continuam intactos.</p><div className="space-y-2">{workouts.map((workout) => <button type="button" key={workout.id} onClick={() => { setTemporaryWorkout(workout); setPanel(null); }} className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-white/[0.06] bg-white/[0.015] p-4 text-left transition hover:border-orange-400/15 hover:bg-orange-500/[0.035]"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-zinc-200">{workout.title}</span><span className="mt-1 block text-[10px] text-zinc-600">{workout.exercises.length || "—"} exercícios · somente agora</span></span><ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" /></button>)}</div>{temporaryWorkout && <button type="button" onClick={() => { setTemporaryWorkout(null); setPanel(null); }} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.06] text-[10px] font-semibold text-zinc-500"><RotateCcw className="h-4 w-4" />Cancelar troca pontual</button>}</Modal>}
      {panel === "schedule" && <Modal eyebrow="Agenda permanente · vigência amanhã" title="Editar agenda" close={() => setPanel(null)}><p className="mb-4 text-[11px] leading-5 text-zinc-500">Defina treino ou pausa para cada dia. Esta mudança atualiza permanentemente seu plano semanal a partir de amanhã.</p><div className="space-y-2">{WEEKDAYS.map((day) => <label key={day.value} className="grid grid-cols-[minmax(0,1fr)_minmax(140px,1.45fr)] items-center gap-3 rounded-[18px] border border-white/[0.055] bg-white/[0.015] p-3"><span><span className="block text-xs font-semibold text-zinc-200">{getWeekdayLabel(day.value)}</span><span className="mt-0.5 block text-[9px] text-zinc-700">{day.value === todayWeekday ? "Hoje" : "Plano semanal"}</span></span><select disabled={mutationBusy} value={scheduleDraft[day.value] ?? ""} onChange={(event) => setScheduleDraft((current) => ({ ...current, [day.value]: event.target.value || null }))} className="min-w-0 rounded-xl border border-white/[0.07] bg-[#171717] px-3 py-2.5 text-[11px] text-zinc-300 outline-none focus:border-orange-400/25"><option value="">Pausa</option>{workouts.map((workout) => <option key={workout.id} value={workout.id}>{workout.title}</option>)}</select></label>)}</div><button type="button" disabled={mutationBusy} onClick={() => void saveSchedule()} className="mt-5 min-h-12 w-full rounded-xl bg-[#ff6a00] text-xs font-bold text-white shadow-[0_10px_24px_rgba(255,106,0,.18)] disabled:opacity-40">Salvar agenda permanente</button><button type="button" disabled={mutationBusy} onClick={() => void restoreSchedule()} className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] text-[10px] font-semibold text-zinc-500 disabled:opacity-40"><RotateCcw className="h-4 w-4" />Restaurar agenda original</button></Modal>}
      {panel === "history" && <Modal eyebrow="Sessões e notas persistidas" title="Histórico" close={() => setPanel(null)}><div className="space-y-2.5">{snapshot?.durableHistory.map((item) => { const expanded = expandedHistoryId === item.session.id; const draft = historyNoteDraft[item.session.id] ?? item.session.note ?? ""; return <article key={item.session.id} className={`overflow-hidden rounded-[19px] border bg-white/[0.015] ${expanded ? "border-orange-400/15" : "border-white/[0.055]"}`}><button type="button" onClick={() => setExpandedHistoryId(expanded ? null : item.session.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-zinc-200">{item.session.workoutTitle}</span><span className="mt-1 flex items-center gap-2 text-[10px] text-zinc-600"><span>{formatDate(item.session.completedAt.slice(0, 10))}</span><span>·</span><span>{formatDuration(item.durationSeconds)}</span><span>·</span><span>{item.exercises.length} exercícios</span></span></span><span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2 py-1 text-[8px] font-bold uppercase tracking-[.08em] text-emerald-300"><Check className="h-3 w-3" />Feito</span></button>{expanded && <div className="border-t border-white/[0.05] px-4 pb-4 pt-3">{item.exercises.map((exercise) => <p key={exercise.id} className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-400"><Check className={`h-3 w-3 ${exercise.completedAt ? "text-emerald-400" : "text-zinc-700"}`} />{exercise.name}</p>)}{item.session.scheduledForDate && <p className="mt-3 text-[9px] text-zinc-700">Agendado para {formatDate(item.session.scheduledForDate)}</p>}<textarea disabled={mutationBusy} value={draft} onChange={(event) => setHistoryNoteDraft((current) => ({ ...current, [item.session.id]: event.target.value.slice(0, 2000) }))} rows={4} className="mt-4 w-full resize-none rounded-[16px] border border-white/[0.07] bg-black/30 p-3 text-xs text-white outline-none focus:border-orange-400/20" placeholder="Nota da sessão" /><button type="button" disabled={mutationBusy} onClick={() => void saveHistoryNote(item)} className="mt-2 min-h-10 w-full rounded-xl bg-[#ff6a00] text-[10px] font-bold text-white disabled:opacity-40">Salvar nota</button></div>}</article>; })}{snapshot?.legacyHistory.map((item) => <article key={`legacy-${item.id}`} className="rounded-[19px] border border-white/[0.055] bg-white/[0.015] p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-zinc-300">{item.currentWorkoutTitle ?? "Treino legado"}</p><p className="mt-1 text-[10px] text-zinc-600">{formatDate(item.workoutDate)}</p></div><span className="rounded-full border border-white/[0.06] px-2 py-1 text-[8px] uppercase text-zinc-600">Legado</span></div>{item.currentWorkoutTitle && <p className="mt-2 text-[9px] text-zinc-700">Título atual do treino; não é snapshot histórico.</p>}</article>)}{!snapshot?.durableHistory.length && !snapshot?.legacyHistory.length && <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.015] px-4 py-8 text-center"><History className="mx-auto h-5 w-5 text-zinc-700" /><p className="mt-3 text-xs text-zinc-600">Nenhum treino concluído.</p></div>}</div></Modal>}
    </div>
  );
}
