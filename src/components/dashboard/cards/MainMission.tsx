import { CheckCircle2, Play } from "lucide-react";
import Link from "next/link";

interface Mission {
  id: string;
  title: string;
  description?: string;
  xp_reward?: number;
  completed: boolean;
}

interface MainMissionProps {
  mission: Mission;
  progressPercent: number;
  onToggle: (id: string, completed: boolean) => void;
}

export function MainMission({
  mission,
  progressPercent,
  onToggle,
}: MainMissionProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-[#7c3aed]/40 bg-[#0d0d14] p-6 lg:p-8">
      <div className="pointer-events-none absolute right-0 top-0 h-full w-2/5 bg-gradient-to-l from-[#7c3aed]/10 to-transparent" />

      <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_220px] lg:items-center">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#a855f7]">
              Missão principal do dia
            </p>

            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${
                mission.completed
                  ? "border-green-500/30 bg-green-500/10 text-green-400"
                  : "border-[#7c3aed]/30 bg-[#7c3aed]/10 text-[#c084fc]"
              }`}
            >
              {mission.completed ? "Concluída" : "Em andamento"}
            </span>
          </div>

          <h2 className="max-w-2xl text-3xl font-black tracking-tight text-white lg:text-4xl">
            {mission.title}
          </h2>

          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            {mission.description ||
              "Conclua esta missão para continuar sua evolução hoje."}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="rounded-xl border border-[#272638] bg-[#111118] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
                Recompensa
              </p>

              <p className="mt-1 text-lg font-black text-[#a855f7]">
                +{mission.xp_reward || 50} XP
              </p>
            </div>

            <div className="rounded-xl border border-[#272638] bg-[#111118] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
                Progresso diário
              </p>

              <p className="mt-1 text-lg font-black text-white">
                {progressPercent}%
              </p>
            </div>
          </div>

          {mission.completed ? (
  <button
    type="button"
    onClick={() => onToggle(mission.id, mission.completed)}
    className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-6 text-sm font-black uppercase tracking-wide text-green-400 transition-all hover:bg-green-500/15 lg:w-auto"
  >
    <CheckCircle2 className="h-5 w-5" />
    Missão concluída
  </button>
) : (
  <Link
    href="/dashboard/workouts"
    className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6d28d9] to-[#9333ea] px-6 text-sm font-black uppercase tracking-wide text-white shadow-[0_12px_35px_rgba(109,40,217,0.3)] transition-all hover:scale-[1.02] lg:w-auto"
  >
    <Play className="h-4 w-4 fill-current" />
    Começar treino
  </Link>
)}
        </div>

        <div className="flex justify-center">
          <div className="relative flex h-44 w-44 items-center justify-center rounded-full bg-[#111118]">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(#8b5cf6 ${progressPercent}%, #272638 ${progressPercent}% 100%)`,
              }}
            />

            <div className="absolute inset-[10px] rounded-full border border-[#292938] bg-[#0b0b11]" />

            <div className="relative text-center">
              <p className="text-3xl font-black text-white">
                {progressPercent}%
              </p>

              <p className="mt-1 text-xs font-bold text-zinc-500">
                Progresso
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}