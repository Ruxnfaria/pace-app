import Link from "next/link";
import { ArrowRight } from "lucide-react";

type Props = {
  missions: number;
  totalXP: number;
};

export default function MissionOverviewCard({
  missions,
  totalXP,
}: Props) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#111116] p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-zinc-500 font-black">
            MISSÕES
          </p>

          <h2 className="mt-2 text-2xl font-black text-white">
            {missions} disponíveis hoje
          </h2>

          <p className="mt-2 text-sm text-zinc-400">
            Continue evoluindo seu Núcleo completando as missões do dia.
          </p>
        </div>

        <div className="rounded-2xl bg-violet-500/10 px-5 py-3">
          <p className="text-xs uppercase tracking-widest text-violet-300">
            XP TOTAL
          </p>

          <p className="mt-1 text-xl font-black text-white">
            +{totalXP} XP
          </p>
        </div>
      </div>

      <Link
        href="/dashboard/missions"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 font-bold text-white hover:bg-violet-500 transition"
      >
        Ver Missões

        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}