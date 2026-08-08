"use client";
import { Badge } from "@/components/ui/Badge";

interface Mission {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  xp_reward?: number;
}

interface MissionsListProps {
  missions: Mission[];
  completedMissions: number;
  totalMissions: number;
  onToggle: (id: string, completed: boolean) => void;
}

export function MissionsList({
  missions,
  completedMissions,
  totalMissions,
  onToggle,
}: MissionsListProps) {
  const progress =
    totalMissions > 0 ? (completedMissions / totalMissions) * 100 : 0;

  return (
    <div className="rounded-2xl bg-[#111111] border border-[#1f1f1f] p-5 space-y-5">

      {/* Cabeçalho */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-white">
              Missões do Dia
            </h2>

            <p className="text-xs text-zinc-500 mt-1">
              Complete suas missões para ganhar XP e evoluir.
            </p>
          </div>

          <span className="text-sm font-black text-[#7c3aed]">
            {completedMissions}/{totalMissions}
          </span>
        </div>

        {/* Barra de progresso */}
        <div className="mt-4">
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-purple-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="text-xs text-zinc-500 mt-2">
            {completedMissions} de {totalMissions} missões concluídas
          </p>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {missions.map((mission) => {
          const type =
            mission.title.includes("hoje") || mission.title.includes("dia")
              ? "DIÁRIA"
              : mission.title.includes("semana")
              ? "SEMANAL"
              : "MENSAL";

          return (
            <button
              key={mission.id}
              type="button"
              onClick={() => onToggle(mission.id, mission.completed)}
              className="w-full rounded-2xl border border-[#1f1f1f] bg-[#0b0b0b] hover:border-[#7c3aed]/50 hover:-translate-y-0.5 transition-all duration-300 p-4 text-left"
            >
              <div className="flex items-start justify-between gap-4">

                <div className="flex gap-3 flex-1">

                  <div
                    className={`mt-1 w-5 h-5 rounded-full border flex items-center justify-center ${
                      mission.completed
                        ? "bg-[#7c3aed] border-[#7c3aed]"
                        : "border-zinc-600"
                    }`}
                  >
                    {mission.completed && (
                      <span className="text-[10px] text-white">✓</span>
                    )}
                  </div>

                  <div className="flex-1">

                  <Badge
  variant={
    type === "DIÁRIA"
      ? "daily"
      : type === "SEMANAL"
      ? "weekly"
      : "monthly"
  }
>
  {type}
</Badge>

                    <p
                      className={`mt-2 font-semibold ${
                        mission.completed
                          ? "line-through text-zinc-500"
                          : "text-white"
                      }`}
                    >
                      {mission.title}
                    </p>

                    <p className="text-sm text-zinc-500 mt-1">
                      {mission.description}
                    </p>
                  </div>
                </div>

                <Badge variant="xp" className="shrink-0 px-3 py-2 text-xs">
  +{mission.xp_reward || 50} XP
</Badge>

              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}