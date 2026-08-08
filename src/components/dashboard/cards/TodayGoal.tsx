import Link from "next/link";
import {
  ArrowRight,
  Check,
  Circle,
  Target,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";

interface TodayMission {
  id: string | number;
  title: string;
  completed: boolean;
  xp_reward?: number | null;
}

interface TodayGoalProps {
  missions: TodayMission[];
}

export function TodayGoal({ missions }: TodayGoalProps) {
  const totalMissions = missions.length;

  const completedMissions = missions.filter(
    (mission) => mission.completed
  ).length;

  const remainingMissions = totalMissions - completedMissions;

  const progress =
    totalMissions > 0
      ? Math.round((completedMissions / totalMissions) * 100)
      : 0;

  const availableXP = missions
    .filter((mission) => !mission.completed)
    .reduce(
      (total, mission) => total + (mission.xp_reward || 50),
      0
    );

  const visibleMissions = [
    ...missions.filter((mission) => !mission.completed),
    ...missions.filter((mission) => mission.completed),
  ].slice(0, 3);

  const dayCompleted =
    totalMissions > 0 && completedMissions === totalMissions;

  return (
    <Card
      padding="lg"
      className="group overflow-hidden border-[#7c3aed]/20"
    >
      {/* Glows decorativos */}
      <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[#7c3aed]/10 blur-3xl transition-all duration-500 group-hover:bg-[#7c3aed]/15" />

      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-44 w-72 rounded-full bg-[#a855f7]/5 blur-3xl" />

      <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        {/* Resumo */}
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#7c3aed]/25 bg-[#7c3aed]/10">
              <Target className="h-5 w-5 text-[#a855f7]" />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a855f7]">
                Plano de evolução
              </p>

              <h2 className="mt-1 text-2xl font-black text-white">
                Hoje
              </h2>
            </div>
          </div>

          <p className="mt-5 max-w-md text-sm leading-6 text-zinc-400">
            {totalMissions === 0
              ? "Suas missões de hoje ainda não foram carregadas."
              : dayCompleted
              ? "Você concluiu todas as missões de hoje."
              : `Complete mais ${remainingMissions} ${
                  remainingMissions === 1 ? "missão" : "missões"
                } para finalizar seu plano diário.`}
          </p>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-500">
                Progresso diário
              </span>

              <span className="text-sm font-black text-[#c084fc]">
                {progress}%
              </span>
            </div>

            <ProgressBar
              value={progress}
              max={100}
              height="lg"
              color={dayCompleted ? "green" : "purple"}
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-zinc-500">
                {completedMissions}/{totalMissions} concluídas
              </span>

              {dayCompleted ? (
                <Badge variant="success">
                  Dia concluído
                </Badge>
              ) : (
                <Badge variant="xp">
                  <Zap className="mr-1 h-3 w-3 fill-current" />
                  +{availableXP} XP disponíveis
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Lista resumida */}
        <div className="rounded-2xl border border-white/5 bg-black/20 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
              Próximos passos
            </p>

            <span className="text-[10px] font-bold text-zinc-600">
              {remainingMissions} restantes
            </span>
          </div>

          {visibleMissions.length > 0 ? (
            <div className="space-y-2">
              {visibleMissions.map((mission) => (
                <div
                  key={mission.id}
                  className={`flex items-center justify-between gap-4 rounded-xl border px-3 py-3 transition-colors ${
                    mission.completed
                      ? "border-green-500/10 bg-green-500/5"
                      : "border-white/5 bg-[#0c0c0c]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {mission.completed ? (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500/15">
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      </div>
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-zinc-600" />
                    )}

                    <p
                      className={`truncate text-sm font-bold ${
                        mission.completed
                          ? "text-zinc-600 line-through"
                          : "text-zinc-200"
                      }`}
                    >
                      {mission.title}
                    </p>
                  </div>

                  <span className="shrink-0 text-[10px] font-black text-[#a855f7]">
                    +{mission.xp_reward || 50} XP
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-white/10">
              <p className="text-sm text-zinc-600">
                Nenhuma missão disponível.
              </p>
            </div>
          )}

          <Link
            href="/dashboard/missions"
            className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-[#7c3aed]/20 bg-[#7c3aed]/10 px-4 py-3 text-xs font-black text-[#c084fc] transition-all hover:border-[#7c3aed]/40 hover:bg-[#7c3aed]/15"
          >
            Ver todas as missões
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </Card>
  );
}