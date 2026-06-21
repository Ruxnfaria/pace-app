'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Zap, 
  Flame, 
  Apple, 
  Scale, 
  Play, 
  CheckCircle2, 
  MessageSquare, 
  ArrowRight 
} from 'lucide-react';
import Link from 'next/link';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

// Dados fictícios para o gráfico de evolução de peso
const pesoData = [
  { data: '20/05', peso: 80.5 },
  { data: '25/05', peso: 79.8 },
  { data: '30/05', peso: 79.2 },
  { data: '05/06', peso: 79.5 },
  { data: '10/06', peso: 78.9 },
  { data: '15/06', peso: 78.2 },
  { data: '20/06', peso: 78.0 },
];

export default function DashboardPage() {
  const supabase = createClient();
  const [userName, setUserName] = useState('Atleta');
  const [loading, setLoading] = useState(true);

  // Busca o primeiro nome do usuário logado direto do Supabase
  useEffect(() => {
    async function getProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('name')
          .eq('user_id', user.id)
          .single();
        
        if (data?.name) {
          setUserName(data.name.split(' ')[0]);
        }
      }
      setLoading(false);
    }
    getProfile();
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
            <h3 className="text-2xl font-black">150 <span className="text-xs font-bold text-zinc-500">XP</span></h3>
            <p className="text-[10px] text-zinc-500 mt-1">Faltam 50 XP para a meta</p>
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
            <h3 className="text-2xl font-black">7 <span className="text-xs font-bold text-zinc-500">Dias</span></h3>
            <p className="text-[10px] text-orange-500 font-semibold mt-1">Você está focado! 🔥</p>
          </div>
        </div>

        {/* CARD: CALORIAS */}
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between h-32 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Calorias</span>
            <div className="p-2 rounded-xl bg-green-500/10 text-[#22c55e] border border-green-500/20">
              <Apple className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black">1.840 <span className="text-xs font-bold text-zinc-500">/ 2.200 kcal</span></h3>
            <div className="w-full bg-[#1f1f1f] h-1 rounded-full mt-2 overflow-hidden">
              <div className="bg-[#22c55e] h-full rounded-full" style={{ width: '83%' }} />
            </div>
          </div>
        </div>

        {/* CARD: PESO */}
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between h-32 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Peso Atual</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black">78.0 <span className="text-xs font-bold text-zinc-500">kg</span></h3>
            <p className="text-[10px] text-zinc-500 mt-1">Meta: 75.0 kg</p>
          </div>
        </div>

      </div>

      {/* BLOCO CENTRAL: TREINO + MISSÕES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* PRÓXIMO TREINO */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between min-h-[180px]">
          <div className="space-y-2">
            <span className="px-2.5 py-1 rounded-full bg-[#7c3aed]/10 text-[#7c3aed] text-[10px] font-black uppercase tracking-wider border border-[#7c3aed]/20">
              Próximo Treino
            </span>
            <h2 className="text-xl font-bold tracking-tight">Peito e Tríceps — Força Geral</h2>
            <p className="text-xs text-zinc-400 max-w-md">Divisão focada em quebra de platô estruturada pela inteligência adaptativa.</p>
          </div>
          <div className="flex justify-between items-center pt-4 border-t border-[#1f1f1f] mt-4">
            <span className="text-xs text-zinc-500 font-medium">⏱️ Estimativa: 50 min</span>
            <Link href="/dashboard/workouts" className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-white text-black text-xs font-black hover:opacity-90 transition-all shadow-lg">
              <Play className="w-3.5 h-3.5 fill-black" /> Iniciar Treino
            </Link>
          </div>
        </div>

        {/* MISSAO DO DIA */}
        <div className="p-6 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex flex-col justify-between">
          <div className="space-y-3">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Missão do Dia</span>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#7c3aed] mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold">Bater 3L de Água</h4>
                  <p className="text-[10px] text-zinc-500 mt-0.5">+50 XP</p>
                </div>
              </div>
              <div className="flex items-start gap-3 opacity-40">
                <div className="w-4 h-4 rounded-full border border-zinc-700 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold">Bater Meta de Proteína</h4>
                  <p className="text-[10px] text-zinc-500 mt-0.5">+50 XP</p>
                </div>
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-[#1f1f1f] mt-4">
            <div className="flex justify-between text-[11px] text-zinc-500 mb-1.5 font-medium">
              <span>Progresso</span>
              <span>50%</span>
            </div>
            <div className="w-full bg-[#1f1f1f] h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#7c3aed] h-full rounded-full" style={{ width: '50%' }} />
            </div>
          </div>
        </div>

      </div>

      {/* GRÁFICO DE EVOLUÇÃO DE PESO */}
      <div className="p-6 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Evolução de Peso</h3>
          <p className="text-xs text-zinc-400">Análise de oscilação dos últimos 30 dias</p>
        </div>
        <div className="h-64 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pesoData}>
              <XAxis dataKey="data" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} domain={['dataMin - 1', 'dataMax + 1']} />
              <Tooltip contentStyle={{ backgroundColor: '#111111', borderColor: '#1f1f1f', borderRadius: '12px', fontSize: '12px', color: '#fff' }} itemStyle={{ color: '#7c3aed' }} />
              <Line type="monotone" dataKey="peso" stroke="#7c3aed" strokeWidth={3} dot={{ fill: '#7c3aed', strokeWidth: 2 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CALL TO ACTION — ARIA */}
      <Link href="/dashboard/aria" className="block p-6 rounded-2xl bg-gradient-to-r from-[#7c3aed]/10 via-purple-500/5 to-transparent border border-[#7c3aed]/20 hover:border-[#7c3aed]/40 transition-all group">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-[#7c3aed] text-white shadow-lg">
              <MessageSquare className="w-5 h-5 fill-white" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white group-hover:text-[#7c3aed] transition-colors flex items-center gap-1.5">
                Central de Inteligência ARIA <Zap className="w-3.5 h-3.5 text-[#7c3aed] fill-[#7c3aed]" />
              </h3>
              <p className="text-xs text-zinc-400 max-w-xl">Acesse o chat integrado com IA para recalcular metas, substituir alimentos da dieta ou estruturar treinos avançados instantaneamente.</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs font-bold text-[#7c3aed] group-hover:translate-x-1 transition-transform">
            Abrir Chat <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </Link>

    </div>
  );
}