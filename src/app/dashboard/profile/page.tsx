"use client";

import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  Award,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Dumbbell,
  Flame,
  Loader2,
  Lock,
  Mail,
  Medal,
  Pencil,
  Ruler,
  Save,
  Scale,
  Settings,
  Target,
  Trophy,
  User,
  X,
  Zap,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type ProfileData = {
  nome?: string | null;
  status_assinatura?: string | null;
  peso?: number | null;
  altura?: number | null;
  objetivo?: string | null;
  total_xp?: number | null;
  level?: number | null;
  streak?: number | null;
  last_activity_date?: string | null;
};

type RankingProfile = {
  user_id: string;
  total_xp?: number | null;
};

type Achievement = {
  name: string;
  description: string;
  icon: ReactNode;
  unlocked: boolean;
};

type LeagueData = {
  name: string;
  next: string;
  minimum: number;
  maximum: number;
  icon: ReactNode;
  badgeClass: string;
};

export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("inativo");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [goal, setGoal] = useState("hipertrofia");

  const [totalXP, setTotalXP] = useState(0);
  const [level, setLevel] = useState(1);
  const [streak, setStreak] = useState(0);

  const [weeklyLeague, setWeeklyLeague] = useState("Bronze");
const [weeklyXP, setWeeklyXP] = useState(0);

  const [completedMissions, setCompletedMissions] = useState(0);
  const [completedWorkouts, setCompletedWorkouts] = useState(0);
  const [rankingPosition, setRankingPosition] = useState<number | null>(
    null
  );

  useEffect(() => {
    async function loadProfileData() {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("Erro ao buscar usuário:", userError);
      }

      if (!user) {
        setLoading(false);
        return;
      }

      setEmail(user.email || "");

      const [
        profileResponse,
        missionsResponse,
        workoutsResponse,
        rankingResponse,
        leaderboardResponse,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            `
              nome,
              status_assinatura,
              peso,
              altura,
              objetivo,
              total_xp,
              level,
              streak,
              last_activity_date
            `
          )
          .eq("user_id", user.id)
          .maybeSingle(),
      
        supabase
          .from("daily_missions")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("user_id", user.id)
          .eq("completed", true),
      
        supabase
          .from("workouts")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("user_id", user.id),
      
        supabase
          .from("profiles")
          .select("user_id, total_xp")
          .order("total_xp", {
            ascending: false,
          }),
      
        supabase
          .from("leaderboard")
          .select("user_id, weekly_xp, league")
          .order("weekly_xp", {
            ascending: false,
          }),
      ]);

      if (profileResponse.error) {
        console.error(
          "Erro ao carregar perfil:",
          profileResponse.error
        );
      }

      if (missionsResponse.error) {
        console.error(
          "Erro ao carregar missões:",
          missionsResponse.error
        );
      }

      if (workoutsResponse.error) {
        console.error(
          "Erro ao carregar treinos:",
          workoutsResponse.error
        );
      }

      if (rankingResponse.error) {
        console.error(
          "Erro ao carregar ranking:",
          rankingResponse.error
        );
      }
      if (leaderboardResponse.error) {
        console.error(
          "Erro ao carregar leaderboard:",
          leaderboardResponse.error
        );
      }
      
      
      leaderboardResponse.data
        ?.filter((item) => item.user_id === user.id)
        .slice(0, 1)
        .forEach((item) => {
          setWeeklyLeague(item.league || "Bronze");
          setWeeklyXP(item.weekly_xp || 0);
        });
      
      const profile =
        profileResponse.data as ProfileData | null;
      
      if (profile) {
        setName(profile.nome || "");
        setStatus(
          profile.status_assinatura || "inativo"
        );
        setWeight(profile.peso?.toString() || "");
        setHeight(profile.altura?.toString() || "");
        setGoal(profile.objetivo || "hipertrofia");
        setTotalXP(profile.total_xp || 0);
        setLevel(profile.level || 1);
        setStreak(profile.streak || 0);
      }
      
      setCompletedMissions(
        missionsResponse.count || 0
      );
      
      setCompletedWorkouts(
        workoutsResponse.count || 0
      );
      
      const ranking =
        (rankingResponse.data || []) as RankingProfile[];
      
      const position =
        ranking.findIndex(
          (item) => item.user_id === user.id
        ) + 1;
      
      setRankingPosition(
        position > 0 ? position : null
      );
      
      setLoading(false);
    }

    loadProfileData();
  }, [supabase]);

  async function handleSaveProfile(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setSaving(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("Erro ao buscar usuário:", userError);
    }

    if (!user) {
      setSaving(false);
      return;
    }

    const parsedWeight =
      weight.trim() === ""
        ? null
        : Number.parseFloat(weight);

    const parsedHeight =
      height.trim() === ""
        ? null
        : Number.parseFloat(height);

    const { error } = await supabase
      .from("profiles")
      .update({
        nome: name.trim(),
        peso:
          parsedWeight !== null &&
          Number.isFinite(parsedWeight)
            ? parsedWeight
            : null,
        altura:
          parsedHeight !== null &&
          Number.isFinite(parsedHeight)
            ? parsedHeight
            : null,
        objetivo: goal,
      })
      .eq("user_id", user.id);

    setSaving(false);

    if (error) {
      console.error(
        "Erro ao salvar perfil:",
        error
      );

      alert(
        `Erro ao salvar perfil: ${error.message}`
      );

      return;
    }

    setEditing(false);
    alert("Perfil atualizado com sucesso!");
  }

  const levelTitles: Record<number, string> = {
    1: "Iniciante",
    2: "Disciplinado",
    3: "Atleta",
    4: "Competidor",
    5: "Elite",
    6: "Lenda",
    7: "Imparável",
    8: "Mestre Pace",
    9: "Titã",
    10: "GOAT",
  };

  const levelTitle =
    levelTitles[level] || "Lenda";

  const league = useMemo<LeagueData>(() => {
    if (totalXP >= 5000) {
      return {
        name: "Lenda",
        next: "Liga máxima",
        minimum: 5000,
        maximum: 5000,
        icon: <Trophy className="h-5 w-5" />,
        badgeClass:
          "border-yellow-400/30 bg-yellow-400/10 text-yellow-300",
      };
    }

    if (totalXP >= 3500) {
      return {
        name: "Diamante",
        next: "Lenda",
        minimum: 3500,
        maximum: 5000,
        icon: <Award className="h-5 w-5" />,
        badgeClass:
          "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
      };
    }

    if (totalXP >= 2000) {
      return {
        name: "Platina",
        next: "Diamante",
        minimum: 2000,
        maximum: 3500,
        icon: <Medal className="h-5 w-5" />,
        badgeClass:
          "border-blue-400/30 bg-blue-400/10 text-blue-300",
      };
    }

    if (totalXP >= 1000) {
      return {
        name: "Ouro",
        next: "Platina",
        minimum: 1000,
        maximum: 2000,
        icon: <Trophy className="h-5 w-5" />,
        badgeClass:
          "border-yellow-400/30 bg-yellow-400/10 text-yellow-300",
      };
    }

    if (totalXP >= 500) {
      return {
        name: "Prata",
        next: "Ouro",
        minimum: 500,
        maximum: 1000,
        icon: <Medal className="h-5 w-5" />,
        badgeClass:
          "border-slate-300/30 bg-slate-300/10 text-slate-200",
      };
    }

    return {
      name: "Bronze",
      next: "Prata",
      minimum: 0,
      maximum: 500,
      icon: <Medal className="h-5 w-5" />,
      badgeClass:
        "border-orange-400/30 bg-orange-400/10 text-orange-300",
    };
  }, [totalXP]);

  const leagueProgress =
    league.maximum === league.minimum
      ? 100
      : Math.min(
          Math.max(
            ((totalXP - league.minimum) /
              (league.maximum - league.minimum)) *
              100,
            0
          ),
          100
        );

  const xpUntilNextLeague =
    league.maximum === league.minimum
      ? 0
      : Math.max(
          league.maximum - totalXP,
          0
        );

  const firstName =
    name.trim().split(" ")[0] || "Atleta";

  const initials =
    name
      .trim()
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || "PA";

  const username = name
    ? `@${name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "")}`
    : "@atletapace";

  const goalLabels: Record<string, string> = {
    hipertrofia: "Hipertrofia",
    definicao: "Definição muscular",
    emagrecimento: "Emagrecimento",
    performance: "Performance",
  };

  const achievements: Achievement[] = [
    {
      name: "Primeiro Passo",
      description: "Primeira missão concluída",
      icon: <CheckCircle2 className="h-6 w-6" />,
      unlocked: completedMissions >= 1,
    },
    {
      name: "Início da Jornada",
      description: "Alcançou 100 XP",
      icon: <Zap className="h-6 w-6" />,
      unlocked: totalXP >= 100,
    },
    {
      name: "Atleta Disciplinado",
      description: "Alcançou 500 XP",
      icon: <Dumbbell className="h-6 w-6" />,
      unlocked: totalXP >= 500,
    },
    {
      name: "Consistência",
      description: "Sequência de 7 dias",
      icon: <Flame className="h-6 w-6" />,
      unlocked: streak >= 7,
    },
  ];

  const unlockedAchievements =
    achievements.filter(
      (achievement) => achievement.unlocked
    ).length;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-10">
      {/* PERFIL PRINCIPAL */}
      <section className="relative overflow-hidden rounded-3xl border border-[#7c3aed]/30 bg-gradient-to-br from-[#7c3aed]/25 via-[#111111] to-[#0a0a0a]">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#7c3aed]/20 blur-[100px]" />

        <div className="relative p-6 lg:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#a855f7]">
                Perfil do atleta
              </p>

              <h1 className="mt-2 text-2xl font-black text-white lg:text-3xl">
                {firstName}
              </h1>
            </div>

            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Editar perfil"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-300 transition-all hover:border-[#7c3aed]/40 hover:text-white"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="relative">
                <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-[#7c3aed]/50 bg-gradient-to-br from-[#7c3aed] to-purple-400 text-3xl font-black text-white shadow-xl shadow-purple-950/30">
                  {initials}
                </div>

                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label="Alterar informações do perfil"
                  className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-4 border-[#111111] bg-white text-black"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>

              <div>
                <h2 className="text-3xl font-black text-white">
                  {name || "Atleta Pace"}
                </h2>

                <p className="mt-1 text-sm font-bold text-zinc-500">
                  {username}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-wider ${league.badgeClass}`}
                  >
                    {league.icon}
                    Liga {league.name}
                  </span>

                  <span className="inline-flex items-center gap-2 rounded-full border border-[#7c3aed]/30 bg-[#7c3aed]/10 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[#c084fc]">
                    <Zap className="h-4 w-4" />
                    Nível {level}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 md:min-w-60">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Título atual
              </p>

              <p className="mt-1 text-lg font-black text-white">
                {levelTitle}
              </p>

              <p className="mt-1 text-xs text-zinc-500">
                Objetivo:{" "}
                {goalLabels[goal] || goal}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* VISÃO GERAL */}
      <section>
        <div className="mb-4">
          <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
            Visão geral
          </p>

          <h2 className="mt-1 text-xl font-black text-white">
            Sua evolução no Pace
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#1f1f1f] bg-[#111111] p-5">
            <Flame className="h-6 w-6 text-orange-400" />

            <p className="mt-4 text-3xl font-black text-white">
              {streak}
            </p>

            <p className="text-xs font-bold text-zinc-500">
              dias de sequência
            </p>
          </div>

          <div className="rounded-2xl border border-[#1f1f1f] bg-[#111111] p-5">
            <Zap className="h-6 w-6 text-[#a855f7]" />

            <p className="mt-4 text-3xl font-black text-white">
              {totalXP}
            </p>

            <p className="text-xs font-bold text-zinc-500">
            Energia acumulada
            </p>
          </div>

          <div className="rounded-2xl border border-[#1f1f1f] bg-[#111111] p-5">
            <Trophy className="h-6 w-6 text-yellow-400" />

            <p className="mt-4 text-3xl font-black text-white">
              #{rankingPosition || "-"}
            </p>

            <p className="text-xs font-bold text-zinc-500">
              posição no ranking
            </p>
          </div>

          <div className="rounded-2xl border border-[#1f1f1f] bg-[#111111] p-5">
            <Award className="h-6 w-6 text-green-400" />

            <p className="mt-4 text-3xl font-black text-white">
              {unlockedAchievements}
            </p>

            <p className="text-xs font-bold text-zinc-500">
              conquistas
            </p>
          </div>
        </div>
      </section>

      {/* PROGRESSO DA LIGA */}
      <section className="rounded-3xl border border-[#7c3aed]/30 bg-[#111111] p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
              Divisão atual
            </p>

            <div className="mt-2 flex items-center gap-3">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${league.badgeClass}`}
              >
                {league.icon}
              </div>

              <div>
                <h2 className="text-2xl font-black text-white">
                  Liga {league.name}
                </h2>

                <p className="text-sm text-zinc-500">
                  Próxima divisão: {league.next}
                </p>
              </div>
            </div>
          </div>

          <Link
            href="/dashboard/ranking"
            className="inline-flex items-center gap-2 text-sm font-black text-[#a855f7]"
          >
            Ver ranking
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between gap-4 text-xs">
            <span className="font-bold text-zinc-500">
              Progresso da divisão
            </span>

            <span className="text-right font-black text-[#a855f7]">
              {xpUntilNextLeague > 0
                ? `${xpUntilNextLeague} Energia restante`
                : "Divisão máxima"}
            </span>
          </div>

          <div className="h-3 overflow-hidden rounded-full bg-[#1f1f1f]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-purple-400 transition-all duration-700"
              style={{
                width: `${leagueProgress}%`,
              }}
            />
          </div>
        </div>
      </section>

      {/* MEDALHAS E CONQUISTAS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
              Medalhas
            </p>

            <h2 className="mt-1 text-xl font-black text-white">
              Marcos conquistados
            </h2>
          </div>

          <Link
            href="/dashboard/badges"
            className="flex items-center gap-1 text-xs font-black text-[#a855f7]"
          >
            Ver todas
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {achievements.map((achievement) => (
            <div
              key={achievement.name}
              className={`rounded-3xl border p-5 ${
                achievement.unlocked
                  ? "border-[#7c3aed]/40 bg-[#7c3aed]/10"
                  : "border-[#1f1f1f] bg-[#111111]"
              }`}
            >
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-full border ${
                  achievement.unlocked
                    ? "border-[#7c3aed]/40 bg-[#7c3aed]/20 text-[#c084fc]"
                    : "border-[#1f1f1f] bg-[#0a0a0a] text-zinc-700"
                }`}
              >
                {achievement.unlocked ? (
                  achievement.icon
                ) : (
                  <Lock className="h-5 w-5" />
                )}
              </div>

              <h3
                className={`mt-4 text-sm font-black ${
                  achievement.unlocked
                    ? "text-white"
                    : "text-zinc-600"
                }`}
              >
                {achievement.name}
              </h3>

              <p className="mt-1 text-xs text-zinc-600">
                {achievement.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ESTATÍSTICAS */}
      <section className="rounded-3xl border border-[#1f1f1f] bg-[#111111] p-6">
        <div className="mb-5">
          <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
            Estatísticas
          </p>

          <h2 className="mt-1 text-xl font-black text-white">
            Histórico de atividade
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl bg-[#0a0a0a] p-4">
            <Dumbbell className="h-5 w-5 text-[#a855f7]" />

            <p className="mt-3 text-2xl font-black text-white">
              {completedWorkouts}
            </p>

            <p className="text-xs text-zinc-500">
              treinos cadastrados
            </p>
          </div>

          <div className="rounded-2xl bg-[#0a0a0a] p-4">
            <CheckCircle2 className="h-5 w-5 text-green-400" />

            <p className="mt-3 text-2xl font-black text-white">
              {completedMissions}
            </p>

            <p className="text-xs text-zinc-500">
              missões concluídas
            </p>
          </div>

          <div className="rounded-2xl bg-[#0a0a0a] p-4">
            <Scale className="h-5 w-5 text-blue-400" />

            <p className="mt-3 text-2xl font-black text-white">
              {weight || "-"}

              {weight && (
                <span className="ml-1 text-xs text-zinc-500">
                  kg
                </span>
              )}
            </p>

            <p className="text-xs text-zinc-500">
              peso atual
            </p>
          </div>

          <div className="rounded-2xl bg-[#0a0a0a] p-4">
            <Target className="h-5 w-5 text-orange-400" />

            <p className="mt-3 text-sm font-black text-white">
              {goalLabels[goal] || goal}
            </p>

            <p className="text-xs text-zinc-500">
              objetivo principal
            </p>
          </div>
        </div>
      </section>

      {/* ASSINATURA */}
      <section className="flex flex-col gap-4 rounded-3xl border border-[#1f1f1f] bg-[#111111] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#7c3aed]/30 bg-[#7c3aed]/10 text-[#a855f7]">
            <CreditCard className="h-5 w-5" />
          </div>

          <div>
            <p className="font-black text-white">
              Plano Pace Premium
            </p>

            <p className="mt-1 text-xs text-zinc-500">
              Acesso aos recursos da plataforma
            </p>
          </div>
        </div>

        <span
          className={`w-fit rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${
            status === "ativo"
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
          }`}
        >
          {status === "ativo"
            ? "Acesso ativo"
            : "Acesso pendente"}
        </span>
      </section>

      {/* MODAL DE EDIÇÃO */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveProfile}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#1f1f1f] bg-[#111111] p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[#a855f7]">
                  Configurações
                </p>

                <h2 className="mt-1 text-2xl font-black text-white">
                  Editar perfil
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setEditing(false)}
                aria-label="Fechar edição do perfil"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#1f1f1f] text-zinc-500 transition-colors hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Nome completo
                </label>

                <div className="relative mt-2">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />

                  <input
                    type="text"
                    value={name}
                    placeholder="Seu nome"
                    onChange={(event) =>
                      setName(event.target.value)
                    }
                    className="w-full rounded-xl border border-[#1f1f1f] bg-[#0a0a0a] py-3 pl-10 pr-3 text-sm text-white outline-none transition-colors focus:border-[#7c3aed]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  E-mail
                </label>

                <div className="relative mt-2">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />

                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full cursor-not-allowed rounded-xl border border-[#1f1f1f] bg-[#0a0a0a]/50 py-3 pl-10 pr-3 text-sm text-zinc-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                    Peso atual em kg
                  </label>

                  <div className="relative mt-2">
                    <Scale className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />

                    <input
                      type="number"
                      step="0.1"
                      value={weight}
                      placeholder="Exemplo: 66"
                      onChange={(event) =>
                        setWeight(event.target.value)
                      }
                      className="w-full rounded-xl border border-[#1f1f1f] bg-[#0a0a0a] py-3 pl-10 pr-3 text-sm text-white outline-none transition-colors focus:border-[#7c3aed]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                    Altura em cm
                  </label>

                  <div className="relative mt-2">
                    <Ruler className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />

                    <input
                      type="number"
                      value={height}
                      placeholder="Exemplo: 175"
                      onChange={(event) =>
                        setHeight(event.target.value)
                      }
                      className="w-full rounded-xl border border-[#1f1f1f] bg-[#0a0a0a] py-3 pl-10 pr-3 text-sm text-white outline-none transition-colors focus:border-[#7c3aed]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Objetivo principal
                </label>

                <select
                  value={goal}
                  onChange={(event) =>
                    setGoal(event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-[#1f1f1f] bg-[#0a0a0a] px-3 py-3 text-sm text-white outline-none transition-colors focus:border-[#7c3aed]"
                >
                  <option value="hipertrofia">
                    Hipertrofia
                  </option>

                  <option value="definicao">
                    Definição muscular
                  </option>

                  <option value="emagrecimento">
                    Emagrecimento
                  </option>

                  <option value="performance">
                    Performance
                  </option>
                </select>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#7c3aed] py-3.5 text-xs font-black uppercase tracking-wider text-white transition-all hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}

                Salvar alterações
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}