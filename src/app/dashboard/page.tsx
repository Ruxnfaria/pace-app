'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Zap, 
  Flame, 
  Apple, 
  Scale, 
  Play, 
  MessageSquare, 
  ArrowRight,
  ClipboardList
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const supabase = createClient();
  const [userName, setUserName] = useState('Atleta');
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Estados para controlar se o usuário já possui planos gerados (começa como falso para o "Fresh Start")
  const [hasWorkout, setHasWorkout] = useState(false);
  const [hasMissions, setHasMissions] = useState(false);

  useEffect(() => {
    async function getProfileData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
        
        if (data) {
          setProfile(data);
          if (data.name) {
            setUserName(data.name.split(' ')[0]);
          }
          // Aqui você pode mudar para true futuramente quando integrar as tabelas de treinos reais
          // setHasWorkout(!!data.has_active_workout); 
        }
      }
      setLoading(false);
    }
    getProfileData();
  }, [supabase]);

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

      {/* GRID DE CARDS DE ESTATÍSTICAS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* CARD: XP */}
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between h-32 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">XP Hoje</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-[#7c3aed] border border-purple-500/20">
              <Zap className="w-4 h-4 fill-[#7c3aed]" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black">0 <span className="text-xs font-bold text-zinc-500">XP</span></h3>
            <p className="text-[10px] text-zinc-500 mt-1">Conclua missões para pontuar</p>
          </div>
        </div>

        {/* CARD: SEQUÊNCIA */}
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between h-32 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Sequência</span>
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20">
              <Flame className="w-4 h-4 fill-orange-500" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black">0 <span className="text-xs font-bold text-zinc-500">Dias</span></h3>
            <p className="text-[10px] text-zinc-500 mt-1">Inicie sua jornada hoje! 🔥</p>
          </div>
        </div>

        {/* CARD: CALORIAS */}
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between h-32 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Calorias Meta</span>
            <div className="p-2 rounded-xl bg-green-500/10 text-[#22c55e] border border-green-500/20">
              <Apple className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-black md:text-2xl">0 <span className="text-xs font-bold text-zinc-500">kcal</span></h3>
            <p className="text-[10px] text-zinc-500 mt-1">Aguardando plano nutricional</p>
          </div>
        </div>

        {/* CARD: PESO DINÂMICO */}
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between h-32 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Peso Atual</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black">
              {profile?.weight ? `${profile.weight}` : '---'} <span className="text-xs font-bold text-zinc-500">kg</span>
            </h3>
            <p className="text-[10px] text-zinc-500 mt-1 truncate">
              Foco: {profile?.goal || 'Não definido'}
            </p>
          </div>
        </div>

      </div>

      {/* BLOCO CENTRAL: TREINO + MISSÕES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* PRÓXIMO TREINO (DINÂMICO / EMPTY STATE) */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between min-h-[180px]">
          {hasWorkout ? (
            <>
              <div className="space-y-2">
                <span className="px-2.5 py-1 rounded-full bg-[#7c3aed]/10 text-[#7c3aed] text-[10px] font-black uppercase tracking-wider border border-[#7c3aed]/20">
                  Próximo Treino
                </span>
                <h2 className="text-xl font-bold tracking-tight">Peito e Tríceps — Força Geral</h2>
                <p className="text-xs text-zinc-400 max-w-md">Divisão focada em quebra de platô estruturada pelo Coach Zanetti.</p>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-[#1f1f1f] mt-4">
                <span className="text-xs text-zinc-500 font-medium">⏱️ Estimativa: 50 min</span>
                <Link href="/dashboard/workouts" className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-white text-black text-xs font-black hover:opacity-90 transition-all shadow-lg">
                  <Play className="w-3.5 h-3.5 fill-black" /> Iniciar Treino
                </Link>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-6 my-auto space-y-3">
              <div className="p-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-500">
                <ClipboardList className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-200">Nenhum treino montado</h3>
                <p className="text-xs text-zinc-500 max-w-xs mt-0.5">Acesse a mentoria para receber o seu primeiro cronograma do Coach Lucas Zanetti.</p>
              </div>
              <Link href="/dashboard/aria" className="text-xs font-bold text-[#7c3aed] hover:underline flex items-center gap-1 pt-1">
                Chamar Treinador <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>

        {/* MISSÃO DO DIA (DINÂMICO / EMPTY STATE) */}
        <div className="p-6 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between min-h-[180px]">
          {hasMissions ? (
            <>
              <div className="space-y-3">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Missão do Dia</span>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-4 h-4 rounded-full border border-zinc-700 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold">Bater Meta de Água</h4>
                      <p className="text-[10px] text-zinc-500 mt-0.5">+50 XP</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-[#1f1f1f] mt-4">
                <div className="flex justify-between text-[11px] text-zinc-500 mb-1.5 font-medium">
                  <span>Progresso</span>
                  <span>0%</span>
                </div>
                <div className="w-full bg-[#1f1f1f] h-1.5 rounded-full overflow-hidden">
                  <div className="bg-[#7c3aed] h-full rounded-full" style={{ width: '0%' }} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-6 my-auto space-y-2">
              <h3 className="text-sm font-bold text-zinc-400">Sem missões ativas</h3>
              <p className="text-[11px] text-zinc-500 max-w-[180px]">Seus desafios diários aparecem aqui assim que seu plano começar.</p>
            </div>
          )}
        </div>

      </div>

      {/* CALL TO ACTION — MENTORIA PREMIUM (HUMANIZADO) */}
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