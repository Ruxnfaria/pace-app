'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';
import { Apple, Plus, Loader2, X, Sparkles, Utensils, Check, CheckCircle2, Clock3, ChevronRight, Target } from 'lucide-react';
import { useRewardQueue } from '@/components/gamification/RewardQueueProvider';
import { GamificationActions } from '@/lib/gamification/actions';
import { queueCoreEnergy } from "@/lib/gamification/coreEnergyPulse";

interface MealLog {
  id: string;
  meal_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  logged_at: string;
}
interface MealScheduleItem {
  icon: string;
  title: string;
  time: string;
  short: string;
  foods: string[];
  protein: string;
  carbs: string;
  fat: string;
}
interface NutritionPlan {
  goal?: string | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  meals?: unknown;
}

function isMealScheduleItem(value: unknown): value is MealScheduleItem {
  if (!value || typeof value !== 'object') return false;
  const meal = value as Record<string, unknown>;
  return typeof meal.title === 'string' && typeof meal.time === 'string' &&
    typeof meal.short === 'string' && typeof meal.icon === 'string' &&
    Array.isArray(meal.foods) && meal.foods.every((food) => typeof food === 'string') &&
    typeof meal.protein === 'string' && typeof meal.carbs === 'string' &&
    typeof meal.fat === 'string';
}

function progressPercent(value: number, target: number) {
  if (!target || target < 0) return 0;
  return Math.min(Math.max((value / target) * 100, 0), 100);
}

function MacroProgress({ label, value, target }: { label: string; value: number; target: number }) {
  const available = target > 0;
  return <div className="space-y-2.5">
    <div className="flex items-center justify-between gap-3 text-[11px]"><span className="font-medium text-zinc-300">{label}</span><span className="tabular-nums text-zinc-500">{available ? `${Math.round(value)}g / ${target}g` : 'Meta não informada'}</span></div>
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.055]"><div className="h-full rounded-full bg-gradient-to-r from-[#a83d00] via-[#ff6a00] to-[#ff9b44] transition-[width] duration-500" style={{ width: `${available ? progressPercent(value, target) : 0}%` }} /></div>
  </div>;
}

export default function NutritionPage() {
  const supabase = useMemo(() => createClient(), []);
  const { enqueueActions } = useRewardQueue();
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [nutritionPlan, setNutritionPlan] = useState<NutritionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<MealScheduleItem | null>(null);

  // Campos do formulário de refeição
  const [mealDescription, setMealDescription] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  const metaCalorias = Number(nutritionPlan?.calories) || 0;
  const metaProteina = Number(nutritionPlan?.protein) || 0;
  const metaCarbo = Number(nutritionPlan?.carbs) || 0;
  const metaGordura = Number(nutritionPlan?.fat) || 0;

  const loadNutritionLogs = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('nutrition_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false });
        const { data: planData } = await supabase
        .from("nutrition_plans")
        .select("*")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (planData) {
        setNutritionPlan(planData as NutritionPlan);
      }
      if (data) {
        setMeals(data.map(m => ({
          id: m.id,
          meal_name: m.meal_name,
          calories: m.calories || 0,
          protein: Number(m.protein) || 0,
          carbs: Number(m.carbs) || 0,
          fat: Number(m.fat) || 0,
          logged_at: m.logged_at
        })));
      }
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadNutritionLogs(), 0);
    return () => window.clearTimeout(timer);
  }, [loadNutritionLogs]);

// Aciona o sistema do Dr. Gabriel Fontes para analisar os macros do prato
async function analyzeMealWithAI() {
  if (!mealDescription.trim()) return;

  setAnalyzing(true);

  try {
    const response = await fetch("/api/nutrition/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: mealDescription }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      setCalories(data.data.calories.toString());
      setProtein(data.data.protein.toString());
      setCarbs(data.data.carbs.toString());
      setFat(data.data.fat.toString());
    } else {
      alert(
        "O sistema do Dr. Fontes não conseguiu processar. Digite os macros manualmente."
      );
    }
  } catch (err) {
    console.error(err);
  } finally {
    setAnalyzing(false);
  }
}
async function updateNutritionMissions(userId: string) {
  const now = new Date();

const today = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
].join("-");

  // Busca a meta real de proteína diretamente do plano ativo
  const { data: activePlan, error: planError } = await supabase
    .from("nutrition_plans")
    .select("protein")
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planError) {
    console.error("[PRAXE] Erro ao buscar meta de proteína:", planError);
  }

  const proteinGoal = Number(activePlan?.protein) || 180;

  const { data: allLogs, error: logsError } = await supabase
    .from("nutrition_logs")
    .select("protein, logged_at")
    .eq("user_id", userId);

  if (logsError) {
    console.error("Erro ao buscar refeições para missões:", logsError);
    return;
  }

  const todayLogs = (allLogs || []).filter((log) => {
    if (!log.logged_at) return false;
  
    const logDate = new Date(log.logged_at);
  
    const logDay = [
      logDate.getFullYear(),
      String(logDate.getMonth() + 1).padStart(2, "0"),
      String(logDate.getDate()).padStart(2, "0"),
    ].join("-");
  
    return logDay === today;
  });

  const mealCount = todayLogs.length;

  const proteinTotal = todayLogs.reduce(
    (sum, log) => sum + (Number(log.protein) || 0),
    0
  );

  async function completeMissionWithXp(
    category: "nutrition" | "protein",
    currentValue: number,
    completed: boolean
  ) {
    const { data: mission, error: missionError } = await supabase
      .from("daily_missions")
      .select("id, title, completed, target_value, xp_reward")
      .eq("user_id", userId)
      .eq("for_date", today)
      .eq("category", category)
      .maybeSingle();

    if (missionError) {
      console.error(
        `[PRAXE] Erro ao buscar missão ${category}:`,
        missionError
      );
      return;
    }

    if (!mission) return;

    if (!completed) {
      const { error } = await supabase
        .from("daily_missions")
        .update({
          current_value: currentValue,
        })
        .eq("id", mission.id)
        .eq("completed", false);

      if (error) {
        console.error(
          `[PRAXE] Erro ao atualizar progresso ${category}:`,
          error
        );
      }

      return;
    }

    if (mission.completed) {
      return;
    }

    const { data: completedMission, error: completeError } =
      await supabase
        .from("daily_missions")
        .update({
          current_value: mission.target_value || currentValue,
          completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq("id", mission.id)
        .eq("completed", false)
        .select("id")
        .maybeSingle();

    if (completeError) {
      console.error(
        `[PRAXE] Erro ao concluir missão ${category}:`,
        completeError
      );
      return;
    }

    if (!completedMission) {
      return;
    }

    const xpReward = mission.xp_reward || 50;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("total_xp")
      .eq("user_id", userId)
      .single();

    if (profileError) {
      console.error("[PRAXE] Erro ao buscar XP:", profileError);
      return;
    }

    const newTotalXp = (profile?.total_xp || 0) + xpReward;

    const { error: xpError } = await supabase
      .from("profiles")
      .update({
        total_xp: newTotalXp,
      })
      .eq("user_id", userId);

      if (xpError) {
        console.error("[PRAXE] Erro ao entregar Energia:", xpError);
        return;
      }
      
      queueCoreEnergy(xpReward);
      
      enqueueActions([
        GamificationActions.showMissionCompleted(
          mission.id,
          mission.title,
          xpReward
        ),
      ]);
  }

  await completeMissionWithXp(
    "nutrition",
    Math.min(mealCount, 3),
    mealCount >= 3
  );

  await completeMissionWithXp(
    "protein",
    proteinTotal >= proteinGoal ? 1 : 0,
    proteinTotal >= proteinGoal
  );
}
// Salva uma refeição registrada manualmente
async function handleSaveMeal(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("Você precisa estar logado para registrar uma refeição.");
      return;
    }

    const caloriesValue = Number(calories) || 0;
    const proteinValue = Number(protein) || 0;
    const carbsValue = Number(carbs) || 0;
    const fatValue = Number(fat) || 0;

    const mealName =
      nextPendingMeal?.title ||
      mealDescription.trim() ||
      "Refeição";

    const { error } = await supabase
      .from("nutrition_logs")
      .insert({
        user_id: user.id,
        meal_name: mealName,
        calories: caloriesValue,
        protein: proteinValue,
        carbs: carbsValue,
        fat: fatValue,
        logged_at: new Date().toISOString(),
      });

      if (error) {
        console.error("Erro ao salvar refeição:", error);
        alert("Não foi possível registrar a refeição.");
        return;
      }
      
      await updateNutritionMissions(user.id);
      
      await loadNutritionLogs();

    setMealDescription("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFat("");

    setModalOpen(false);
  } catch (error) {
    console.error("Erro inesperado ao salvar refeição:", error);
    alert("Ocorreu um erro ao registrar a refeição.");
  }
}

// Salva a refeição manual no Supabase
async function completeMeal() {
  if (!nextPendingMeal) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const alreadyCompleted = meals.some(
    (meal) => meal.meal_name === nextPendingMeal.title
  );

  if (alreadyCompleted) {
    alert("Essa refeição já foi concluída.");
    return;
  }

  const mealCalories =
    parseInt(nextPendingMeal.protein) * 4 +
    parseInt(nextPendingMeal.carbs) * 4 +
    parseInt(nextPendingMeal.fat) * 9;

  const { data, error } = await supabase
    .from("nutrition_logs")
    .insert({
      user_id: user.id,
      meal_name: nextPendingMeal.title,
      calories: mealCalories,
      protein: parseInt(nextPendingMeal.protein),
      carbs: parseInt(nextPendingMeal.carbs),
      fat: parseInt(nextPendingMeal.fat),
    })
    .select()
    .single();

  if (error) {
    console.error("Erro ao concluir refeição:", error);
    alert(error.message);
    return;
  }

  setMeals((prev) => [
    {
      id: data.id,
      meal_name: data.meal_name,
      calories: data.calories || 0,
      protein: Number(data.protein) || 0,
      carbs: Number(data.carbs) || 0,
      fat: Number(data.fat) || 0,
      logged_at: data.logged_at,
    },
    ...prev,
  ]);

  await updateNutritionMissions(user.id);

alert(`${nextPendingMeal.title} concluída!`);
}
  const totalCalorias = meals.reduce((sum, meal) => sum + meal.calories, 0);
  const totalProteina = meals.reduce((sum, meal) => sum + meal.protein, 0);
  const totalCarbo = meals.reduce((sum, meal) => sum + meal.carbs, 0);
  const totalGordura = meals.reduce((sum, meal) => sum + meal.fat, 0);
  const mealSchedule = Array.isArray(nutritionPlan?.meals)
    ? nutritionPlan.meals.filter(isMealScheduleItem)
    : [];
  const nextPendingMeal = mealSchedule.find((meal) =>
    !meals.some((loggedMeal) => loggedMeal.meal_name === meal.title)
  ) ?? null;
  const calorieProgress = progressPercent(totalCalorias, metaCalorias);
  const planTitle = nutritionPlan?.goal?.trim() || 'Plano nutricional ativo';

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] overflow-hidden px-4 pb-28 pt-5 min-[375px]:px-5 sm:px-6">
      <header className="flex items-center justify-between">
        <Image src="/brand/praxe-logo.svg" alt="PRAXE" width={520} height={110} preload unoptimized className="h-auto w-[116px]" />
      </header>

      <section className="mt-6">
        <h1 className="text-[1.7rem] font-semibold tracking-[-.045em] text-white">Nutrição</h1>
        <p className="mt-1 max-w-[350px] text-[12px] leading-5 text-zinc-500">Alimente sua disciplina. Resultados também se constroem no prato.</p>
      </section>

      <section className="relative mt-5 overflow-hidden rounded-[26px] border border-orange-400/[0.1] bg-gradient-to-br from-[#17130f] via-[#10100f] to-[#090909] p-4 shadow-[0_18px_50px_rgba(0,0,0,.28)] min-[375px]:p-5">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-orange-500/[0.07] blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#d96818]">Meta diária</p>
            <div className="mt-3 flex items-end gap-2"><strong className="text-[32px] font-semibold leading-none tracking-[-.05em] text-white">{Math.round(totalCalorias)}</strong><span className="pb-0.5 text-[11px] text-zinc-500">{metaCalorias > 0 ? `de ${metaCalorias} kcal` : 'kcal registradas'}</span></div>
            <p className="mt-2 text-[10px] text-zinc-600">{metaCalorias > 0 ? `${Math.round(calorieProgress)}% da meta` : 'Adicione um plano para acompanhar a meta.'}</p>
          </div>
          <div className="relative flex h-[82px] w-[82px] shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#ff6a00 ${calorieProgress * 3.6}deg, rgba(255,255,255,.055) 0deg)` }}>
            <div className="flex h-[68px] w-[68px] flex-col items-center justify-center rounded-full bg-[#0c0c0c] shadow-[inset_0_0_20px_rgba(255,106,0,.04)]"><span className="text-[17px] font-semibold tabular-nums text-white">{Math.round(calorieProgress)}%</span><span className="text-[8px] uppercase tracking-[.14em] text-zinc-600">consumo</span></div>
          </div>
        </div>
        <div className="relative mt-5 space-y-4 border-t border-white/[0.055] pt-4">
          <MacroProgress label="Proteínas" value={totalProteina} target={metaProteina} />
          <MacroProgress label="Carboidratos" value={totalCarbo} target={metaCarbo} />
          <MacroProgress label="Gorduras" value={totalGordura} target={metaGordura} />
          <MacroProgress label="Fibras" value={0} target={0} />
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-end justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#d96818]">Plano alimentar</p><h2 className="mt-1 text-[17px] font-semibold tracking-[-.02em] text-white">Sua estratégia nutricional</h2></div></div>
        {nutritionPlan ? <button type="button" onClick={() => setPlanOpen(true)} className="mt-3 flex w-full items-center gap-3.5 rounded-[22px] border border-white/[0.065] bg-gradient-to-br from-[#141414] to-[#0b0b0b] p-4 text-left transition hover:border-orange-400/15 active:scale-[.99]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-400/15 bg-orange-500/[0.07] text-[#ff6a00]"><Apple className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold text-zinc-100">{planTitle}</span><span className="mt-1 block text-[10px] text-zinc-600">{mealSchedule.length ? `${mealSchedule.length} refeições planejadas` : 'Metas nutricionais disponíveis'}</span></span>
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
        </button> : <div className="mt-3 rounded-[18px] border border-white/[0.05] bg-white/[0.018] px-4 py-4"><p className="text-[11px] font-medium text-zinc-400">Nenhum plano alimentar ativo.</p><p className="mt-1 text-[9px] leading-4 text-zinc-700">Quando um plano estiver disponível, metas e refeições aparecerão aqui.</p></div>}
      </section>

      <section className="mt-6">
        <div className="flex items-end justify-between gap-4"><div><h2 className="text-[17px] font-semibold tracking-[-.02em] text-white">Refeições de hoje</h2><p className="mt-0.5 text-[10px] text-zinc-600">Planejamento e registros disponíveis</p></div><button type="button" onClick={() => setModalOpen(true)} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#ff6a00] px-3 text-[9px] font-bold text-white shadow-[0_8px_20px_rgba(255,106,0,.16)]"><Plus className="h-3.5 w-3.5" />Registrar</button></div>

        {nextPendingMeal && <article className="relative mt-3 overflow-hidden rounded-[22px] border border-orange-400/[0.12] bg-gradient-to-br from-orange-500/[0.075] to-white/[0.015] p-4">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[8px] font-bold uppercase tracking-[.18em] text-[#d96818]">Próxima planejada</p><h3 className="mt-1.5 truncate text-[15px] font-semibold text-white">{nextPendingMeal.title}</h3><p className="mt-1 text-[10px] text-zinc-500">{nextPendingMeal.time} · {nextPendingMeal.short}</p></div><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-400/10 bg-black/20 text-base">{nextPendingMeal.icon}</span></div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-zinc-500"><span>{nextPendingMeal.protein} proteína</span><span>{nextPendingMeal.carbs} carbo</span><span>{nextPendingMeal.fat} gordura</span></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => setSelectedMeal(nextPendingMeal)} className="min-h-10 rounded-xl border border-white/[0.07] text-[9px] font-semibold text-zinc-400 transition hover:border-orange-400/15">Ver detalhes</button><button type="button" onClick={() => void completeMeal()} className="min-h-10 rounded-xl bg-[#ff6a00] text-[9px] font-bold text-white transition hover:bg-[#f06400]">Concluir refeição</button></div>
        </article>}

        {mealSchedule.length > 0 && <div className="mt-2.5 space-y-2">{mealSchedule.map((meal) => { const completed = meals.some((loggedMeal) => loggedMeal.meal_name === meal.title); return <button type="button" key={`${meal.title}-${meal.time}`} onClick={() => setSelectedMeal(meal)} className="flex w-full items-center gap-3 rounded-[18px] border border-white/[0.055] bg-white/[0.018] p-3.5 text-left transition hover:border-orange-400/12"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${completed ? 'border-emerald-400/15 bg-emerald-400/[0.06]' : 'border-white/[0.06] bg-white/[0.025]'}`}>{completed ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Clock3 className="h-4 w-4 text-zinc-600" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold text-zinc-200">{meal.title}</span><span className="mt-0.5 block truncate text-[9px] text-zinc-600">{meal.time} · {meal.short}</span></span><span className={`shrink-0 text-[8px] font-bold uppercase tracking-[.08em] ${completed ? 'text-emerald-400/80' : 'text-zinc-600'}`}>{completed ? 'Registrada' : 'Planejada'}</span></button>; })}</div>}

        {loading ? <div className="mt-3 space-y-2 animate-pulse">{[1, 2].map((item) => <div key={item} className="h-16 rounded-[18px] bg-white/[0.035]" />)}</div> : meals.length > 0 ? <div className="mt-5"><p className="mb-2 text-[9px] font-bold uppercase tracking-[.18em] text-zinc-600">Registros</p><div className="space-y-2">{meals.map((meal) => <article key={meal.id} className="flex items-center gap-3 rounded-[18px] border border-white/[0.055] bg-white/[0.018] p-3.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06]"><Check className="h-4 w-4 text-emerald-400" /></span><div className="min-w-0 flex-1"><h3 className="truncate text-[12px] font-semibold text-zinc-200">{meal.meal_name}</h3><p className="mt-0.5 truncate text-[9px] text-zinc-600">P {meal.protein}g · C {meal.carbs}g · G {meal.fat}g</p></div><span className="shrink-0 text-[10px] font-semibold tabular-nums text-zinc-400">{meal.calories} kcal</span></article>)}</div></div> : mealSchedule.length === 0 ? <div className="mt-3 rounded-[16px] border border-white/[0.05] bg-white/[0.018] px-4 py-3 text-center"><Utensils className="mx-auto h-4 w-4 text-zinc-700" /><p className="mt-2 text-[10.5px] font-medium text-zinc-500">Nenhuma refeição disponível hoje.</p><p className="mt-0.5 text-[8.5px] text-zinc-700">Você ainda pode registrar o que consumiu.</p></div> : null}
      </section>

      <section className="mt-6"><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#d96818]">Ferramentas</p><div className="mt-3 grid grid-cols-2 gap-2.5"><button type="button" onClick={() => setModalOpen(true)} className="rounded-[18px] border border-white/[0.06] bg-white/[0.02] p-4 text-left transition hover:border-orange-400/15"><Plus className="h-4 w-4 text-[#ff6a00]" /><span className="mt-3 block text-[11px] font-semibold text-zinc-200">Registrar refeição</span><span className="mt-1 block text-[8.5px] leading-4 text-zinc-700">Adicionar consumo real</span></button>{nutritionPlan && <button type="button" onClick={() => setPlanOpen(true)} className="rounded-[18px] border border-white/[0.06] bg-white/[0.02] p-4 text-left transition hover:border-orange-400/15"><Target className="h-4 w-4 text-[#ff6a00]" /><span className="mt-3 block text-[11px] font-semibold text-zinc-200">Detalhes do plano</span><span className="mt-1 block text-[8.5px] leading-4 text-zinc-700">Metas e refeições</span></button>}</div></section>

      {modalOpen && <div className="fixed inset-0 z-[90] flex items-end bg-black/80 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"><button type="button" aria-label="Fechar registro" onClick={() => setModalOpen(false)} className="absolute inset-0" /><form onSubmit={handleSaveMeal} className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-[30px] border border-white/[0.07] bg-[#0d0d0d] p-5 shadow-[0_-20px_70px_rgba(0,0,0,.65)] sm:max-w-md sm:rounded-[30px] sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#d96818]">Registro nutricional</p><h2 className="mt-1.5 text-xl font-semibold tracking-[-.025em] text-white">Registrar refeição</h2></div><button type="button" onClick={() => setModalOpen(false)} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03] text-zinc-500"><X className="h-4 w-4" /></button></div><div className="mt-5 space-y-2"><label className="text-[9px] font-semibold uppercase tracking-[.14em] text-zinc-600">O que foi consumido?</label><input type="text" required placeholder="Ex.: peito de frango e arroz" value={mealDescription} onChange={(event) => setMealDescription(event.target.value)} className="min-h-12 w-full rounded-xl border border-white/[0.07] bg-black/30 px-3 text-xs text-white outline-none placeholder:text-zinc-700 focus:border-orange-400/25" /><button type="button" disabled={analyzing || !mealDescription.trim()} onClick={analyzeMealWithAI} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-orange-400/15 bg-orange-500/[0.06] text-[10px] font-semibold text-orange-200 disabled:opacity-30">{analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Analisar descrição</button></div><div className="mt-4 grid grid-cols-2 gap-3">{[["Calorias (kcal)", calories, setCalories], ["Proteínas (g)", protein, setProtein], ["Carboidratos (g)", carbs, setCarbs], ["Gorduras (g)", fat, setFat]].map(([label, value, setter]) => <label key={String(label)} className="space-y-1.5"><span className="text-[8.5px] font-semibold uppercase tracking-[.1em] text-zinc-600">{String(label)}</span><input type="number" required placeholder="0" value={String(value)} onChange={(event) => (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/[0.07] bg-black/30 px-3 text-xs text-white outline-none focus:border-orange-400/25" /></label>)}</div><button type="submit" className="mt-5 min-h-12 w-full rounded-xl bg-[#ff6a00] text-xs font-bold text-white shadow-[0_10px_24px_rgba(255,106,0,.18)]">Salvar refeição</button></form></div>}

      {planOpen && nutritionPlan && <div className="fixed inset-0 z-[90] flex items-end bg-black/80 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"><button type="button" aria-label="Fechar plano" onClick={() => setPlanOpen(false)} className="absolute inset-0" /><section className="relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-[30px] border border-white/[0.07] bg-[#0d0d0d] p-5 sm:max-w-md sm:rounded-[30px] sm:p-6"><div className="flex items-start justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#d96818]">Plano alimentar</p><h2 className="mt-1.5 text-xl font-semibold text-white">{planTitle}</h2></div><button type="button" aria-label="Fechar" onClick={() => setPlanOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.06] text-zinc-500"><X className="h-4 w-4" /></button></div><div className="mt-5 grid grid-cols-2 gap-2">{[["Calorias", metaCalorias ? `${metaCalorias} kcal` : 'Não informada'], ["Proteínas", metaProteina ? `${metaProteina}g` : 'Não informada'], ["Carboidratos", metaCarbo ? `${metaCarbo}g` : 'Não informada'], ["Gorduras", metaGordura ? `${metaGordura}g` : 'Não informada']].map(([label, value]) => <div key={label} className="rounded-[16px] border border-white/[0.055] bg-white/[0.02] p-3"><p className="text-[8px] uppercase tracking-[.12em] text-zinc-700">{label}</p><p className="mt-1 text-[11px] font-semibold text-zinc-300">{value}</p></div>)}</div>{mealSchedule.length > 0 ? <div className="mt-5 space-y-2"><p className="text-[9px] font-bold uppercase tracking-[.15em] text-zinc-600">Refeições planejadas</p>{mealSchedule.map((meal) => <button type="button" key={`${meal.title}-${meal.time}-plan`} onClick={() => { setPlanOpen(false); setSelectedMeal(meal); }} className="flex w-full items-center justify-between rounded-[16px] border border-white/[0.055] px-3 py-3 text-left"><span className="text-[11px] font-medium text-zinc-300">{meal.title}</span><span className="text-[9px] text-zinc-600">{meal.time}</span></button>)}</div> : <p className="mt-5 rounded-[15px] border border-white/[0.05] px-3 py-3 text-[10px] text-zinc-600">Este plano não possui refeições detalhadas.</p>}</section></div>}

      {selectedMeal && <div className="fixed inset-0 z-[90] flex items-end bg-black/80 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"><button type="button" aria-label="Fechar refeição" onClick={() => setSelectedMeal(null)} className="absolute inset-0" /><section className="relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-[30px] border border-white/[0.07] bg-[#0d0d0d] p-5 sm:max-w-md sm:rounded-[30px] sm:p-6"><div className="flex items-start justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#d96818]">Refeição planejada · {selectedMeal.time}</p><h2 className="mt-1.5 text-xl font-semibold text-white">{selectedMeal.title}</h2><p className="mt-1 text-[10px] text-zinc-600">{selectedMeal.short}</p></div><button type="button" aria-label="Fechar" onClick={() => setSelectedMeal(null)} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.06] text-zinc-500"><X className="h-4 w-4" /></button></div><div className="mt-5 space-y-2">{selectedMeal.foods.map((food, index) => <div key={`${food}-${index}`} className="flex items-center gap-2.5 rounded-[14px] border border-white/[0.05] bg-white/[0.018] px-3 py-2.5"><span className="h-1.5 w-1.5 rounded-full bg-[#ff6a00]" /><span className="text-[11px] text-zinc-300">{food}</span></div>)}</div><div className="mt-4 grid grid-cols-3 gap-2">{[["Proteína", selectedMeal.protein], ["Carbo", selectedMeal.carbs], ["Gordura", selectedMeal.fat]].map(([label, value]) => <div key={label} className="rounded-[14px] border border-white/[0.05] p-2.5 text-center"><p className="text-[8px] text-zinc-700">{label}</p><p className="mt-1 text-[10px] font-semibold text-zinc-300">{value}</p></div>)}</div></section></div>}
    </main>
  );
}
