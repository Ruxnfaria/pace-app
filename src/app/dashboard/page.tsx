import { XPCard } from "@/components/dashboard/cards/XPCard";
import { StreakCard } from "@/components/dashboard/cards/StreakCard";
import { CaloriesCard } from "@/components/dashboard/cards/CaloriesCard";
import { WeightCard } from "@/components/dashboard/cards/WeightCard";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Zap,
  Play,
  MessageSquare,
  ArrowRight,
  ClipboardList,
  CheckCircle2,
  Circle,
} from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const supabase = createClient();
  const [userName, setUserName] = useState('Atleta');
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Estados reais para armazenar os dados vindo do Supabase
  const [latestWorkout, setLatestWorkout] = useState<any>(null);
  const [latestNutrition, setLatestNutrition] = useState<any>(null);
  const [missions, setMissions] = useState<any[]>([]);

  useEffect(() => {
    async function loadDashboardData() {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // 1. Puxa os dados cadastrais do Perfil
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
        
        if (profileData) {
          setProfile(profileData);
          if (profileData.nome) {
            setUserName(profileData.nome.split(' ')[0]);
          }
        }

        // 2. BUSCA EM TEMPO REAL: Último Treino injetado pela IA
        const { data: workoutData } = await supabase
          .from('workouts')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (workoutData) setLatestWorkout(workoutData);

        // 3. BUSCA EM TEMPO REAL: Último Plano Nutricional injetado pela IA
        const { data: nutritionData } = await supabase
          .from('nutrition')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (nutritionData) setLatestNutrition(nutritionData);

        // 4. BUSCA EM TEMPO REAL: Missões do dia de hoje
        const todayStr = new Date().toISOString().split('T')[0];
        const { data: missionsData } = await supabase
          .from('daily_missions')
          .select('*')
          .eq('user_id', user.id)
          .eq('for_date', todayStr)
          .order('created_at', { ascending: true });
        
        if (missionsData) setMissions(missionsData);
      }
      setLoading(false);
    }
    
    loadDashboardData();
  }, [supabase]);

  // Função interativa para marcar/desmarcar missões direto no painel
  async function handleToggleMission(id: string, currentStatus: boolean) {
    const { error } = await supabase
      .from('daily_missions')
      .update({ completed: !currentStatus })
      .eq('id', id);

    if (!error) {
      setMissions(prev => 
        prev.map(m => m.id === id ? { ...m, completed: !currentStatus } : m)
      );
    }
  }

  // Cálculos matemáticos de progresso dinâmico
  const totalMissions = missions.length;
  const completedMissions = missions.filter(m => m.completed).length;
  const progressPercent = totalMissions > 0 ? Math.round((completedMissions / totalMissions) * 100) : 0;
  const currentXP = completedMissions * 50; // Cada missão concluída concede 50 XP

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  if (loading) {
    return (
      <div className="p-6 lg:p-10 space-y-6 animate-pulse">
        <div className="h-8 bg-[#111111] w-48 rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-[#111111] rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 space-y-8">
      
      {/* HEADER */}
      <div className="space-y-1">
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">
          {saudacao}, {userName} 👋
        </h1>
        <p className="text-xs lg:text-sm text-zinc-500">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <XPCard
  currentXP={currentXP}
  completedMissions={completedMissions}
  totalMissions={totalMissions}
/>

<StreakCard
  streak={profile?.streak || 1}
/>

<CaloriesCard
  calories={latestNutrition?.calories}
  proteins={latestNutrition?.proteins}
  carbs={latestNutrition?.carbs}
  fats={latestNutrition?.fats}
/>

<WeightCard
  weight={profile?.peso}
  goal={profile?.objetivo}
/>

      {/* CALL TO ACTION — MENTORIA PREMIUM */}
      <Link href="/dashboard/aria" className="block p-6 rounded-2xl bg-gradient-to-r from-[#7c3aed]/10 via-purple-500/5 to-transparent border border-[#7c3aed]/20 hover:border-[#7c3aed]/40 transition-all group">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-[#7c3aed] text-white shadow-lg">
              <MessageSquare className="w-5 h-5 fill-white" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white group-hover:text-[#7c3aed] transition-colors flex items-center gap-1.5">
                Falar com os Especialistas Pace <Zap className="w-3.5 h-3.5 text-[#7c3aed] fill-[#7c3aed]" />
              </h3>
              <p className="text-xs text-zinc-400 max-w-xl">
                Acesse o canal direto da sua assessoria privada. Fale agora com o **Coach Lucas Zanetti** (Treino) ou com o **Dr. Gabriel Fontes** (Nutrição) para montar ou ajustar o seu protocolo.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs font-bold text-[#7c3aed] group-hover:translate-x-1 transition-transform">
            Abrir Mentoria <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </Link>

    </div>
  );
}