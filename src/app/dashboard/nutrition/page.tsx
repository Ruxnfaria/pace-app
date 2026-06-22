'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Apple, Plus, Loader2, X, Sparkles, Utensils, Check, ShoppingCart, CheckSquare, Square } from 'lucide-react';

interface MealLog {
  id: string;
  meal_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  logged_at: string;
}

export default function NutritionPage() {
  const supabase = createClient();
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [shopListOpen, setShopListOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Estado para os itens checados da lista de compras
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // Campos do formulário de refeição
  const [mealDescription, setMealDescription] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  // Metas de alta performance estruturadas pelo Dr. Gabriel Fontes
  const metaCalorias = 2200;
  const metaProteina = 160; 
  const metaCarbo = 240; 
  const metaGordura = 70; 

  async function loadNutritionLogs() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('nutrition_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false });

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
      const response = await fetch('/api/nutrition/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: mealDescription }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setCalories(data.data.calories.toString());
        setProtein(data.data.protein.toString());
        setCarbs(data.data.carbs.toString());
        setFat(data.data.fat.toString());
      } else {
        alert('O sistema do Dr. Fontes não conseguiu processar. Digite os macros manualmente.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  }

  // Salva a refeição no Supabase
  async function handleSaveMeal(e: React.FormEvent) {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('nutrition_logs').insert({
      user_id: user.id,
      meal_name: mealDescription,
      calories: parseInt(calories) || 0,
      protein: parseFloat(protein) || 0,
      carbs: parseFloat(carbs) || 0,
      fat: parseFloat(fat) || 0,
    });

    setMealDescription('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setModalOpen(false);
    loadNutritionLogs();
  }

  const toggleCheckItem = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Cálculos de totais consumidos hoje
  const totalCalorias = meals.reduce((sum, m) => sum + m.calories, 0);
  const totalProteina = meals.reduce((sum, m) => sum + m.protein, 0);
  const totalCarbo = meals.reduce((sum, m) => sum + m.carbs, 0);
  const totalGordura = meals.reduce((sum, m) => sum + m.fat, 0);

  // MÁGICA: Cálculos matemáticos de conversão para a lista de compras da semana inteira (7 dias)
  const kgFrangoSemana = ((metaProteina * 0.5 * 7) / 30 * 100 / 1000).toFixed(1); // 50% das proteinas vindas de fontes como frango
  const kgPatinhoSemana = ((metaProteina * 0.3 * 7) / 26 * 100 / 1000).toFixed(1); // 30% vindo de carne vermelha magra
  const duziaOvosSemana = Math.ceil((metaProteina * 0.2 * 7) / 6 / 12); // 20% vindo de ovos inteiros
  const kgArrozSemana = ((metaCarbo * 0.6 * 7) / 28 * 100 / 1000).toFixed(1); // 60% dos carbos vindos de arroz integral/branco
  const kgBatataSemana = ((metaCarbo * 0.4 * 7) / 20 * 100 / 1000).toFixed(1); // 40% vindo de batata doce

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

      {/* MODAL REGISTRAR REFEIÇÃO (HUMANIZADO DR. FONTES) */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit