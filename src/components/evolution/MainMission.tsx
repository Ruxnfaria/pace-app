import {
    CheckCircle2,
    Dumbbell,
    Droplets,
    Flame,
    Moon,
    Scale,
    Trophy,
    Utensils,
  } from "lucide-react";
  
  import { Card } from "@/components/ui/Card";
  
  interface MainMissionProps {
    title: string;
    xpReward?: number;
    completed?: boolean;
    loading?: boolean;
    onToggle: () => void;
  }
  
  function getMissionVisual(title: string) {
    const normalizedTitle = title.toLowerCase();
  
    if (
      normalizedTitle.includes("água") ||
      normalizedTitle.includes("agua") ||
      normalizedTitle.includes("hidratação")
    ) {
      return {
        Icon: Droplets,
        label: "Hidratação",
      };
    }
  
    if (
      normalizedTitle.includes("proteína") ||
      normalizedTitle.includes("proteina") ||
      normalizedTitle.includes("alimentação") ||
      normalizedTitle.includes("alimentacao") ||
      normalizedTitle.includes("refeição") ||
      normalizedTitle.includes("refeicao") ||
      normalizedTitle.includes("nutrição") ||
      normalizedTitle.includes("nutricao")
    ) {
      return {
        Icon: Utensils,
        label: "Nutrição",
      };
    }
  
    if (
      normalizedTitle.includes("cardio") ||
      normalizedTitle.includes("corrida") ||
      normalizedTitle.includes("correr") ||
      normalizedTitle.includes("caminhada")
    ) {
      return {
        Icon: Flame,
        label: "Cardio",
      };
    }
  
    if (
      normalizedTitle.includes("sono") ||
      normalizedTitle.includes("dormir") ||
      normalizedTitle.includes("descanso")
    ) {
      return {
        Icon: Moon,
        label: "Recuperação",
      };
    }
  
    if (
      normalizedTitle.includes("peso") ||
      normalizedTitle.includes("pesar")
    ) {
      return {
        Icon: Scale,
        label: "Progresso",
      };
    }
  
    if (
      normalizedTitle.includes("desafio") ||
      normalizedTitle.includes("meta")
    ) {
      return {
        Icon: Trophy,
        label: "Desafio",
      };
    }
  
    return {
      Icon: Dumbbell,
      label: "Treino",
    };
  }
  
  export function MainMission({
    title,
    xpReward = 50,
    completed = false,
    loading = false,
    onToggle,
  }: MainMissionProps) {
    const { Icon, label } = getMissionVisual(title);
  
    return (
      <Card
        variant={completed ? "success" : "mission"}
        padding="lg"
        className="group min-h-[330px]"
      >
        {/* Elementos visuais do fundo */}
        <div className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-[#7c3aed]/20 blur-3xl" />
  
        <div className="pointer-events-none absolute -bottom-28 left-20 h-52 w-80 rounded-full bg-[#a855f7]/10 blur-3xl" />
  
        <div className="pointer-events-none absolute -right-10 bottom-[-40px] rotate-[-12deg] opacity-[0.07] transition duration-500 group-hover:scale-105 group-hover:opacity-[0.11]">
          <Icon className="h-72 w-72 text-[#d8b4fe]" strokeWidth={1.2} />
        </div>
  
        {/* Linhas de energia */}
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute -right-28 top-14 h-72 w-72 rounded-full border border-[#a855f7]/15" />
          <div className="absolute -right-12 top-28 h-52 w-52 rounded-full border border-[#7c3aed]/15" />
        </div>
  
        <div className="relative z-10 flex min-h-[270px] flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-[#7c3aed]/40 bg-[#7c3aed]/15 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#d8b4fe]">
                  Seu desafio de hoje
                </span>
  
                <span className="text-xs font-bold text-zinc-500">
                  {label}
                </span>
              </div>
  
              <div className="rounded-full border border-[#a855f7]/30 bg-[#a855f7]/10 px-4 py-2 text-sm font-black text-[#d8b4fe] shadow-[0_0_25px_rgba(168,85,247,0.12)]">
                +{xpReward} XP
              </div>
            </div>
  
            <h2 className="mt-8 max-w-3xl text-3xl font-black leading-tight tracking-[-0.03em] text-white sm:text-4xl lg:text-5xl">
              {title}
            </h2>
  
            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
              {completed
                ? "Missão concluída. Seu progresso de hoje já está registrado."
                : "Concluir esta missão aproxima você do próximo nível e mantém sua evolução em movimento."}
            </p>
          </div>
  
          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onToggle}
              disabled={loading}
              className={[
                "inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl px-7 text-sm font-black",
                "transition duration-300 disabled:cursor-not-allowed disabled:opacity-60",
                completed
                  ? "border border-emerald-400/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20"
                  : "bg-gradient-to-r from-[#7c3aed] via-[#8b5cf6] to-[#a855f7] text-white shadow-[0_12px_35px_rgba(124,58,237,0.35)] hover:-translate-y-0.5 hover:shadow-[0_16px_45px_rgba(124,58,237,0.5)]",
              ].join(" ")}
            >
              <CheckCircle2 className="h-5 w-5" />
  
              {loading
                ? "Atualizando..."
                : completed
                  ? "Missão concluída"
                  : "Concluir missão"}
            </button>
  
            {!completed && (
              <span className="text-xs font-bold text-zinc-500">
                A recompensa será adicionada ao seu XP.
              </span>
            )}
          </div>
        </div>
      </Card>
    );
  }