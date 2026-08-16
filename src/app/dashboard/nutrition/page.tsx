'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Apple, Plus, Loader2, X, Sparkles, Utensils, Check, ShoppingCart, CheckSquare, Square } from 'lucide-react';
import { useRewardQueue } from '@/components/gamification/RewardQueueProvider';
import { GamificationActions } from '@/lib/gamification/actions';

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
export default function NutritionPage() {
  const supabase = createClient();
  const { enqueueActions } = useRewardQueue();
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [nutritionPlan, setNutritionPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [shopListOpen, setShopListOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [checkedMeals, setCheckedMeals] = useState<string[]>([]);

  // Estado para os itens checados da lista de compras
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // Campos do formulário de refeição
  const [mealDescription, setMealDescription] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  // Metas de alta performance estruturadas pelo Dr. Gabriel Fontes
  const metaCalorias = nutritionPlan?.calories || 3000;
const metaProteina = nutritionPlan?.protein || 180;
const metaCarbo = nutritionPlan?.carbs || 400;
const metaGordura = nutritionPlan?.fat || 70;

  async function loadNutritionLogs() {
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
        setNutritionPlan(planData);
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
  }

  useEffect(() => {
    loadNutritionLogs();
  }, []);

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
  const today = new Date().toISOString().split("T")[0];

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
    console.error("[PACE] Erro ao buscar meta de proteína:", planError);
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

    return (
      new Date(log.logged_at).toISOString().split("T")[0] === today
    );
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
        `[PACE] Erro ao buscar missão ${category}:`,
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
          `[PACE] Erro ao atualizar progresso ${category}:`,
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
        `[PACE] Erro ao concluir missão ${category}:`,
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
      console.error("[PACE] Erro ao buscar XP:", profileError);
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
      console.error("[PACE] Erro ao entregar XP:", xpError);
      return;
    }

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

  setCheckedMeals((prev) => [...prev, nextPendingMeal.title]);

  await updateNutritionMissions(user.id);

alert(`${nextPendingMeal.title} concluída!`);
}
const toggleCheckItem = (id: string) => {
  setCheckedItems((prev) => ({
    ...prev,
    [id]: !prev[id],
  }));
};
  // Cálculos de totais consumidos hoje
  const totalCalorias = meals.reduce((sum, m) => sum + m.calories, 0);
  const totalProteina = meals.reduce((sum, m) => sum + m.protein, 0);
  const totalCarbo = meals.reduce((sum, m) => sum + m.carbs, 0);
  const totalGordura = meals.reduce((sum, m) => sum + m.fat, 0);

  // Cálculos matemáticos de conversão para a lista de compras da semana inteira (7 dias)
  const kgFrangoSemana = ((metaProteina * 0.5 * 7) / 30 * 100 / 1000).toFixed(1); 
  const kgPatinhoSemana = ((metaProteina * 0.3 * 7) / 26 * 100 / 1000).toFixed(1); 
  const duziaOvosSemana = Math.ceil((metaProteina * 0.2 * 7) / 6 / 12); 
  const kgArrozSemana = ((metaCarbo * 0.6 * 7) / 28 * 100 / 1000).toFixed(1); 
  const kgBatataSemana = ((metaCarbo * 0.4 * 7) / 20 * 100 / 1000).toFixed(1); 

  const shoppingListCategories = [
    
    {
      title: "🍗 Fontes de Proteína (Semanal)",
      items: [
        { id: 'p1', name: `Peito de Frango Filé`, qty: `${kgFrangoSemana} kg` },
        { id: 'p2', name: `Carne Moída (Patinho/Coxão Mole)`, qty: `${kgPatinhoSemana} kg` },
        { id: 'p3', name: `Ovos Inteiros Grandes`, qty: `${duziaOvosSemana} Dúzia(s)` },
      ]
    },
    {
      title: "🍠 Fontes de Carboidratos (Semanal)",
      items: [
        { id: 'c1', name: `Arroz (Integral ou Branco)`, qty: `${kgArrozSemana} kg` },
        { id: 'c2', name: `Batata Doce ou Mandioca`, qty: `${kgBatataSemana} kg` },
        { id: 'c3', name: `Aveia em Flocos`, qty: `1 Pacote (400g)` },
      ]
    },
    {
      title: "🥦 Micronutrientes e Fibras",
      items: [
        { id: 'v1', name: `Folhas Verdes (Alface/Rúcula)`, qty: `3 Maços` },
        { id: 'v2', name: `Brócolis ou Couve-Flor`, qty: `1.5 kg` },
        { id: 'v3', name: `Limão ou Banana`, qty: `1 KG` },
      ]
    }
  ];

  const defaultMealSchedule: MealScheduleItem[] = [
    {
      icon: "☀️",
      title: "Café da Manhã",
      time: "07:00",
      short: "Ovos + Pão + Whey",
      foods: ["4 ovos inteiros", "2 fatias de pão integral", "1 banana", "30g de whey"],
      protein: "35g",
      carbs: "60g",
      fat: "15g",
    },
    {
      icon: "🍛",
      title: "Almoço",
      time: "12:30",
      short: "Frango + Arroz",
      foods: ["200g arroz", "150g frango", "salada", "legumes"],
      protein: "45g",
      carbs: "80g",
      fat: "10g",
    },
    {
      icon: "🥤",
      title: "Lanche",
      time: "16:00",
      short: "Shake + Banana",
      foods: ["1 banana", "40g aveia", "30g whey"],
      protein: "30g",
      carbs: "50g",
      fat: "5g",
    },
    {
      icon: "🍽️",
      title: "Jantar",
      time: "20:00",
      short: "Carne + Arroz",
      foods: ["200g arroz", "150g carne", "salada"],
      protein: "40g",
      carbs: "70g",
      fat: "15g",
    },
    {
      icon: "🌙",
      title: "Ceia",
      time: "22:30",
      short: "Iogurte + Whey",
      foods: ["1 iogurte natural", "30g whey", "1 fruta"],
      protein: "30g",
      carbs: "30g",
      fat: "5g",
    },
  ];
  const mealSchedule: MealScheduleItem[] =
  Array.isArray(nutritionPlan?.meals) && nutritionPlan.meals.length > 0
    ? nutritionPlan.meals
    : defaultMealSchedule;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  function timeToMinutes(time: string) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }
  
  const currentMeal =
    [...mealSchedule]
      .reverse()
      .find((meal) => currentMinutes >= timeToMinutes(meal.time)) ||
    mealSchedule[0];
    const nextPendingMeal =
    mealSchedule.find(
      (meal) =>
        !meals.some(
          (loggedMeal) => loggedMeal.meal_name === meal.title
        )
    ) || mealSchedule[0];
  const nextMeal =
    mealSchedule.find((meal) => timeToMinutes(meal.time) > currentMinutes) ||
    mealSchedule[0];
  
  const nextMealMinutes = timeToMinutes(nextMeal.time);
  const diffMinutes =
    nextMealMinutes > currentMinutes
      ? nextMealMinutes - currentMinutes
      : 24 * 60 - currentMinutes + nextMealMinutes;
  
  const nextMealCountdown = `${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}m`;
  const isCurrentMealCompleted = meals.some(
    (meal) => meal.meal_name === currentMeal.title
  );
  const alreadyCompleted = meals.some(
    (meal) => meal.meal_name === currentMeal.title
  );
  return (
    <div className="p-6 lg:p-10 space-y-8">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">MÓDULO DE NUTRIÇÃO</h1>
          <p className="text-xs lg:text-sm text-zinc-500">Planejamento e controle metabólico supervisionado pelo Dr. Gabriel Fontes.</p>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShopListOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-black hover:bg-zinc-800 transition-all shadow-lg"
          >
            <ShoppingCart className="w-4 h-4 text-[#7c3aed]" /> Lista de Compras
          </button>

          <button
            onClick={() => setModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#7c3aed] text-white text-xs font-black hover:bg-[#6d28d9] transition-all shadow-lg"
          >
            <Plus className="w-4 h-4" /> Registrar Refeição
          </button>
        </div>
      </div>
      <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f]">
  <div className="flex items-center justify-between mb-4">
    <div>
      <p className="text-xs uppercase tracking-wider text-zinc-500 font-black">
        Plano Atual
      </p>

      <h2 className="text-xl font-black text-white mt-1">
        Hipertrofia
      </h2>
    </div>

    <Apple className="w-6 h-6 text-[#7c3aed]" />
  </div>

  <div className="grid grid-cols-5 gap-4">
    <div>
      <p className="text-[10px] text-zinc-500 uppercase">Calorias</p>
      <p className="text-base font-black">{metaCalorias}</p>
    </div>

    <div>
      <p className="text-[10px] text-zinc-500 uppercase">Proteína</p>
      <p className="text-base font-black">{metaProteina}g</p>
    </div>

    <div>
      <p className="text-[10px] text-zinc-500 uppercase">Carbo</p>
      <p className="text-base font-black">{metaCarbo}g</p>
    </div>

    <div>
      <p className="text-[10px] text-zinc-500 uppercase">Gordura</p>
      <p className="text-base font-black">{metaGordura}g</p>
    </div>

    <div>
      <p className="text-[10px] text-zinc-500 uppercase">Coach</p>
      <p className="text-sm font-black text-[#7c3aed]">
        Dr. Gabriel Fontes
      </p>
    </div>
  </div>
</div>
{/* REFEIÇÃO ATUAL */}
<div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f]">
  <div className="flex items-center justify-between mb-4">
    <div>
    <div className="flex items-center gap-2">
  <p className="text-xs uppercase tracking-wider text-zinc-500 font-black">
    Refeição Atual
  </p>

  <span className="px-2 py-1 rounded-full bg-green-500/10 text-green-400 text-[10px] font-bold">
    EM HORÁRIO
  </span>
</div>

      <h3 className="text-xl font-black text-white">
      {nextPendingMeal.icon} {nextPendingMeal.title}
      </h3>
      <p className="text-sm text-[#7c3aed] font-bold mt-2">
      Próxima refeição em {nextMealCountdown}
</p>
    </div>

    <Sparkles className="w-5 h-5 text-[#7c3aed]" />
  </div>

  <div className="space-y-3 text-sm text-zinc-300 mt-4">
  {nextPendingMeal.foods.map((food, index) => (
    <div key={index} className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-[#7c3aed]" />
      <p>{food}</p>
    </div>
  ))}
</div>

<div className="flex gap-6 mt-4 text-xs font-bold">
  <span className="text-[#7c3aed]">{nextPendingMeal.protein} proteína</span>
  <span className="text-orange-400">{nextPendingMeal.carbs} carbo</span>
  <span className="text-yellow-400">{nextPendingMeal.fat} gordura</span>
</div>

<button
  type="button"
  disabled={meals.some((meal) => meal.meal_name === nextPendingMeal.title)}
  onClick={() => completeMeal()}
  className={`w-full mt-5 py-3 rounded-xl text-sm font-black transition-all ${
    alreadyCompleted
      ? "bg-green-600 text-white cursor-not-allowed"
      : "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
  }`}
>
{meals.some((meal) => meal.meal_name === nextPendingMeal.title)
  ? "✓ Refeição Concluída"
  : "Concluir Refeição"}
</button>
</div>


 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
  {mealSchedule
    
    .map((meal) => {
      const isNext = meal.title === nextPendingMeal.title;
      const isCompleted = meals.some(
        (loggedMeal) => loggedMeal.meal_name === meal.title
      );
      return (
        <div
          key={meal.title}
          className={`p-4 rounded-xl bg-[#111111] border transition-all ${
            isNext
              ? "border-[#7c3aed] shadow-lg shadow-purple-950/20"
              : "border-[#1f1f1f]"
          }`}
        >
          <p className="text-xs text-zinc-500">
            {meal.icon} {meal.title}
          </p>

          <p className="font-bold text-white mt-1">{meal.time}</p>

          <p className="text-[10px] text-zinc-500 mt-1">
            {meal.short}
          </p>

          {isNext && (
            <p className="text-[10px] text-[#7c3aed] font-black mt-2">
              PRÓXIMA REFEIÇÃO
            </p>
          )}
        </div>
      );
    })}
</div>
      {/* METAS E RESUMO DE MACROS */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        
        {/* CARD PRINCIPAL: CALORIAS */}
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between h-40">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Balanço Calórico</span>
          <div>
            <h3 className="text-3xl font-black">{totalCalorias} <span className="text-xs font-bold text-zinc-500">/ {metaCalorias} kcal</span></h3>
            <div className="w-full bg-[#1f1f1f] h-2 rounded-full mt-3 overflow-hidden">
              <div className="bg-[#22c55e] h-full rounded-full transition-all" style={{ width: `${Math.min((totalCalorias / metaCalorias) * 100, 100)}%` }} />
            </div>
          </div>
        </div>

        {/* COMPONENTES DE MACROS COMPACTOS */}
        <div className="lg:col-span-3 p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] grid grid-cols-3 gap-6 items-center">
          
          {/* PROTEÍNA */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-bold text-zinc-400">Proteína</span>
              <span className="text-zinc-500 font-medium">{Math.round(totalProteina)}g / {metaProteina}g</span>
            </div>
            <div className="w-full bg-[#1f1f1f] h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#7c3aed] h-full rounded-full" style={{ width: `${Math.min((totalProteina / metaProteina) * 100, 100)}%` }} />
            </div>
          </div>

          {/* CARBOIDRATO */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-bold text-zinc-400">Carboidrato</span>
              <span className="text-zinc-500 font-medium">{Math.round(totalCarbo)}g / {metaCarbo}g</span>
            </div>
            <div className="w-full bg-[#1f1f1f] h-1.5 rounded-full overflow-hidden">
              <div className="bg-orange-500 h-full rounded-full" style={{ width: `${Math.min((totalCarbo / metaCarbo) * 100, 100)}%` }} />
            </div>
          </div>

          {/* GORDURA */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-bold text-zinc-400">Gordura</span>
              <span className="text-zinc-500 font-medium">{Math.round(totalGordura)}g / {metaGordura}g</span>
            </div>
            <div className="w-full bg-[#1f1f1f] h-1.5 rounded-full overflow-hidden">
              <div className="bg-yellow-500 h-full rounded-full" style={{ width: `${Math.min((totalGordura / metaGordura) * 100, 100)}%` }} />
            </div>
          </div>

        </div>

      </div>

      {/* HISTÓRICO DE REFEIÇÕES */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Refeições de Hoje</h2>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2].map(i => <div key={i} className="h-16 bg-[#111111] rounded-xl border border-[#1f1f1f]" />)}
          </div>
        ) : meals.length === 0 ? (
          <div className="p-10 text-center rounded-xl border border-[#1f1f1f] bg-[#111111]/20 max-w-md mx-auto">
            <p className="text-xs text-zinc-500">Nenhuma refeição registrada para o dia de hoje.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {meals.map((meal) => (
              <div key={meal.id} className="p-4 rounded-xl bg-[#111111] border border-[#1f1f1f] flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#1f1f1f] text-zinc-400">
                    <Utensils className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">{meal.meal_name}</h4>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      P: {meal.protein}g  •  C: {meal.carbs}g  •  G: {meal.fat}g
                    </p>
                  </div>
                </div>
                <span className="text-xs font-black text-zinc-300">{meal.calories} kcal</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL REGISTRAR REFEIÇÃO */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveMeal} className="bg-[#111111] border border-[#1f1f1f] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            
            <div className="flex justify-between items-center border-b border-[#1f1f1f] pb-3">
              <h2 className="text-sm font-black tracking-wider uppercase text-white">Análise do Dr. Fontes</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">O que foi consumido?</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="ex: 200g de peito de frango e 150g de arroz"
                  value={mealDescription}
                  onChange={(e) => setMealDescription(e.target.value)}
                  className="w-full pl-3 pr-32 py-3 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white placeholder-zinc-700 focus:outline-none focus:border-[#7c3aed] text-xs"
                />
                <button
                  type="button"
                  disabled={analyzing || !mealDescription.trim()}
                  onClick={analyzeMealWithAI}
                  className="absolute right-1.5 top-1.5 px-2.5 py-1.5 rounded-lg bg-[#7c3aed] text-white text-[10px] font-bold hover:bg-[#6d28d9] transition-all disabled:opacity-30 flex items-center gap-1"
                >
                  {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 fill-white" />} Consultar Dr. Fontes
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Calorias (kcal)</label>
                <input type="number" required placeholder="0" value={calories} onChange={(e) => setCalories(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Proteínas (g)</label>
                <input type="number" required placeholder="0" value={protein} onChange={(e) => setProtein(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Carbos (g)</label>
                <input type="number" required placeholder="0" value={carbs} onChange={(e) => setCarbs(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Gorduras (g)</label>
                <input type="number" required placeholder="0" value={fat} onChange={(e) => setFat(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs" />
              </div>
            </div>

            <button type="submit" className="w-full py-3 rounded-xl bg-white text-black font-black text-xs hover:opacity-95 transition-all mt-2">
              Salvar na Dieta
            </button>
          </form>
        </div>
      )}

      {/* PANEL DA LISTA DE COMPRAS INTELIGENTE */}
      {shopListOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#111111] border border-[#1f1f1f] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
            
            <div className="p-5 border-b border-[#1f1f1f] flex justify-between items-center bg-[#0d0d0d]">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-[#7c3aed]" />
                <h2 className="text-sm font-black tracking-wider uppercase text-white">Lista de Mercado do Dr. Fontes</h2>
              </div>
              <button onClick={() => setShopListOpen(false)} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-6 custom-scrollbar bg-[#070707] flex-1">
              <p className="text-[11px] text-zinc-500 leading-relaxed bg-[#111111] p-3 rounded-xl border border-zinc-900">
                📌 Esta lista foi calculada automaticamente somando as quantidades ideais para suprir as suas metas de <strong>{metaProteina}g de Proteína</strong> e <strong>{metaCarbo}g de Carboidrato</strong> pelos próximos 7 dias.
              </p>

              {shoppingListCategories.map((cat, idx) => (
                <div key={idx} className="space-y-2">
                  <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wide px-1">{cat.title}</h3>
                  <div className="space-y-1">
                    {cat.items.map((item) => {
                      const isChecked = !!checkedItems[item.id];
                      return (
                        <div 
                          key={item.id} 
                          onClick={() => toggleCheckItem(item.id)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                            isChecked 
                              ? 'border-zinc-800/50 bg-zinc-950/40 opacity-40 line-through text-zinc-600' 
                              : 'border-[#1f1f1f] bg-[#111111] text-zinc-200 hover:border-zinc-800'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-[#7c3aed]" />
                            ) : (
                              <Square className="w-4 h-4 text-zinc-700" />
                            )}
                            <span className="text-xs font-medium">{item.name}</span>
                          </div>
                          <span className={`text-xs font-black px-2 py-0.5 rounded ${isChecked ? 'bg-zinc-900 text-zinc-700' : 'bg-zinc-900 text-purple-400'}`}>
                            {item.qty}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-[#1f1f1f] bg-[#0d0d0d] text-center">
              <button 
                onClick={() => setShopListOpen(false)}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#7c3aed] to-purple-600 text-white text-xs font-black hover:opacity-90 transition-all"
              >
                Voltar ao Painel
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}