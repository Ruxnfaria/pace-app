"use client";

import {
  Check,
  Dumbbell,
  Droplets,
  HeartPulse,
  Moon,
  Utensils,
  Plus,
} from "lucide-react";

type EnergyItem = {
  id: string;
  label: string;
  progress: number;
  completed: boolean;
  icon: React.ElementType;
};

type EnergyTodayProps = {
  workoutCompleted: boolean;
  proteinCompleted: boolean;
  waterConsumedMl?: number;
  waterGoalMl?: number;
  onAddWater?: (amount: number) => void;
  cardioCompleted?: boolean;
  sleepHours?: number;
  sleepGoalHours?: number;
  onSaveSleep?: (hours: number) => void | Promise<void>;
};

export default function EnergyToday({
  workoutCompleted,
  proteinCompleted,
  waterConsumedMl = 0,
  waterGoalMl = 2500,
  onAddWater,
  cardioCompleted = false,
  sleepHours = 0,
  sleepGoalHours = 8,
  onSaveSleep,
}: EnergyTodayProps) {
  const safeWaterGoal = Math.max(waterGoalMl, 1);

  const waterProgress = Math.min(
    Math.max((waterConsumedMl / safeWaterGoal) * 100, 0),
    100
  );

  const safeSleepGoal = Math.max(sleepGoalHours, 1);

const sleepProgress = Math.min(
  Math.max((sleepHours / safeSleepGoal) * 100, 0),
  100
);

const sleepCompleted = sleepHours >= safeSleepGoal;
  const items: EnergyItem[] = [
    {
      id: "workout",
      label: "Treino",
      progress: workoutCompleted ? 100 : 0,
      completed: workoutCompleted,
      icon: Dumbbell,
    },
    {
      id: "protein",
      label: "Proteína",
      progress: proteinCompleted ? 100 : 0,
      completed: proteinCompleted,
      icon: Utensils,
    },
    {
      id: "water",
      label: "Água",
      progress: waterProgress,
      completed: waterProgress >= 100,
      icon: Droplets,
    },
    {
      id: "cardio",
      label: "Cardio",
      progress: cardioCompleted ? 100 : 0,
      completed: cardioCompleted,
      icon: HeartPulse,
    },
    {
      id: "sleep",
      label: "Sono",
      progress: sleepProgress,
      completed: sleepCompleted,
      icon: Moon,
    },
  ];

  const completedItems = items.filter((item) => item.completed).length;

  const totalProgress = Math.round(
    items.reduce((total, item) => total + item.progress, 0) /
      items.length
  );

  return (
    <section className="relative overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#0d0d14] p-6">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-violet-600/10 blur-[100px]" />

      <div className="relative">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-400">
              Evolução de hoje
            </p>

            <h2 className="mt-2 text-2xl font-black text-white">
              {completedItems} de {items.length} pilares concluídos
            </h2>

            <p className="mt-2 text-sm text-zinc-400">
              Cada ação fortalece a energia diária do seu Núcleo.
            </p>
          </div>

          <p className="text-3xl font-black text-white">
            {totalProgress}
            <span className="ml-1 text-sm text-violet-400">%</span>
          </p>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-700 via-violet-500 to-fuchsia-400 transition-all duration-700"
            style={{ width: `${totalProgress}%` }}
          />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {items.map((item) => {
            const Icon = item.icon;
            const isWater = item.id === "water";
            const isSleep = item.id === "sleep";

            return (
              <div
                key={item.id}
                className={`rounded-2xl border p-4 transition-all ${
                  item.completed
                    ? "border-violet-400/30 bg-violet-500/10"
                    : "border-white/[0.07] bg-white/[0.025]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      item.completed
                        ? "bg-violet-500/20 text-violet-300"
                        : "bg-white/[0.04] text-zinc-500"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  {item.completed && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500 text-white">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </div>

                <p className="mt-4 text-sm font-black text-white">
                  {item.label}
                </p>

                {isWater ? (
  <>
    <p className="mt-1 text-xs text-zinc-500">
      {waterConsumedMl.toLocaleString("pt-BR")} /{" "}
      {waterGoalMl.toLocaleString("pt-BR")} ml
    </p>

    <p className="mt-1 text-xs font-bold text-violet-400">
      {Math.round(waterProgress)}%
    </p>

    {!item.completed && onAddWater && (
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onAddWater(250)}
          className="flex items-center justify-center gap-1 rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-2 text-[10px] font-black text-violet-300 transition hover:bg-violet-500/20"
        >
          <Plus className="h-3 w-3" />
          250 ml
        </button>

        <button
          type="button"
          onClick={() => onAddWater(500)}
          className="flex items-center justify-center gap-1 rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-2 text-[10px] font-black text-violet-300 transition hover:bg-violet-500/20"
        >
          <Plus className="h-3 w-3" />
          500 ml
        </button>
      </div>
    )}
  </>
) : isSleep ? (
  <>
    <p className="mt-1 text-xs text-zinc-500">
      {sleepHours.toLocaleString("pt-BR")}h /{" "}
      {sleepGoalHours.toLocaleString("pt-BR")}h
    </p>

    <p className="mt-1 text-xs font-bold text-violet-400">
      {Math.round(sleepProgress)}%
    </p>

    {onSaveSleep && (
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSaveSleep(7)}
          className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-2 text-[10px] font-black text-violet-300 transition hover:bg-violet-500/20"
        >
          7h
        </button>

        <button
          type="button"
          onClick={() => onSaveSleep(8)}
          className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-2 text-[10px] font-black text-violet-300 transition hover:bg-violet-500/20"
        >
          8h
        </button>

        <button
          type="button"
          onClick={() => onSaveSleep(9)}
          className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-2 text-[10px] font-black text-violet-300 transition hover:bg-violet-500/20"
        >
          9h
        </button>

        <button
          type="button"
          onClick={() => {
            const value = window.prompt(
              "Quantas horas você dormiu? Exemplo: 7.5"
            );

            if (!value) return;

            const hours = Number(value.replace(",", "."));

            if (!Number.isNaN(hours) && hours > 0 && hours <= 24) {
              onSaveSleep(hours);
            }
          }}
          className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-[10px] font-black text-zinc-300 transition hover:bg-white/[0.08]"
        >
          Outra
        </button>
      </div>
    )}
  </>
) : (
  <p className="mt-1 text-xs text-zinc-500">
    {item.completed
      ? "Concluído"
      : item.progress > 0
        ? `${Math.round(item.progress)}%`
        : "Pendente"}
  </p>
)}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}