'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { TrendingUp, Plus, Scale, Ruler, Activity, Camera, X } from 'lucide-react';

interface Measurement {
  id: string;
  weight: number;
  waist: number;
  hip: number;
  chest: number;
  measured_at: string;
}

export default function ProgressPage() {
  const supabase = createClient();
  const [history, setHistory] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Campos do formulário
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [hip, setHip] = useState('');
  const [chest, setChest] = useState('');

  async function loadProgressLogs() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('body_measurements')
        .select('*')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: true });

      if (data) {
        setHistory(data.map(m => ({
          id: m.id,
          weight: Number(m.weight) || 0,
          waist: Number(m.waist) || 0,
          hip: Number(m.hip) || 0,
          chest: Number(m.chest) || 0,
          measured_at: new Date(m.measured_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        })));
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    loadProgressLogs();
  }, []);

  async function handleSaveMeasurements(e: React.FormEvent) {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Salva na tabela de medidas
    await supabase.from('body_measurements').insert({
      user_id: user.id,
      weight: parseFloat(weight) || null,
      waist: parseFloat(waist) || null,
      hip: parseFloat(hip) || null,
      chest: parseFloat(chest) || null,
    });

    // 2. Atualiza o peso atual também no perfil principal do usuário
    if (weight) {
      await supabase
        .from('profiles')
        .update({ weight: parseFloat(weight) })
        .eq('user_id', user.id);
    }

    setWeight('');
    setWaist('');
    setHip('');
    setChest('');
    setModalOpen(false);
    loadProgressLogs();
  }

  // Pega o último registro para exibir nos cards de destaque
  const ultimoRegistro = history[history.length - 1] || { weight: '--', waist: '--', hip: '--', chest: '--' };

  return (
    <div className="p-6 lg:p-10 space-y-8">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">EVOLUÇÃO CORPORAL</h1>
          <p className="text-xs lg:text-sm text-zinc-500">Acompanhe seus gráficos de peso, histórico de composição e fotos de progresso.</p>
        </div>
        
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#7c3aed] text-white text-xs font-black hover:bg-[#6d28d9] transition-all shadow-lg"
        >
          <Plus className="w-4 h-4" /> Registrar Métricas
        </button>
      </div>

      {/* GRÁFICO PRINCIPAL */}
      <div className="p-6 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#7c3aed]" />
          <h2 className="text-xs font-black uppercase tracking-wider text-zinc-400">Histórico de Peso (kg)</h2>
        </div>
        <div className="h-64 w-full pt-4">
          {loading ? (
            <div className="h-full w-full bg-[#0a0a0a] animate-pulse rounded-xl" />
          ) : history.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-zinc-500">Nenhum dado registrado para gerar o gráfico.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <XAxis dataKey="measured_at" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip contentStyle={{ backgroundColor: '#111111', borderColor: '#1f1f1f', borderRadius: '12px', fontSize: '12px' }} />
                <Line type="monotone" dataKey="weight" stroke="#7c3aed" strokeWidth={3} dot={{ fill: '#7c3aed' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* GRID DE MEDIDAS COMPACTAS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-2">
          <Scale className="w-4 h-4 text-purple-400" />
          <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Peso Atual</p>
          <h3 className="text-xl font-black text-white">{ultimoRegistro.weight} <span className="text-xs font-bold text-zinc-500">kg</span></h3>
        </div>
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-2">
          <Ruler className="w-4 h-4 text-orange-400" />
          <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Cintura</p>
          <h3 className="text-xl font-black text-white">{ultimoRegistro.waist} <span className="text-xs font-bold text-zinc-500">cm</span></h3>
        </div>
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-2">
          <Ruler className="w-4 h-4 text-blue-400" />
          <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Quadril</p>
          <h3 className="text-xl font-black text-white">{ultimoRegistro.hip} <span className="text-xs font-bold text-zinc-500">cm</span></h3>
        </div>
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-2">
          <Ruler className="w-4 h-4 text-green-400" />
          <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Peitoral</p>
          <h3 className="text-xl font-black text-white">{ultimoRegistro.chest} <span className="text-xs font-bold text-zinc-500">cm</span></h3>
        </div>
      </div>

      {/* SEÇÃO INFERIOR: HISTÓRICO DE TREINOS + COMPARTIMENTO FOTOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#7c3aed]" />
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Histórico de Performance</h3>
          </div>
          <p className="text-xs text-zinc-500">Os treinos concluídos com sucesso aparecerão listados aqui automaticamente em breve.</p>
        </div>

        <div className="p-6 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-3">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#7c3aed]" />
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Galeria do Shape</h3>
          </div>
          <div className="border border-dashed border-zinc-800 p-8 rounded-xl text-center text-xs text-zinc-600 hover:border-zinc-700 cursor-pointer transition-colors">
            + Adicionar foto de progresso (Supabase Storage)
          </div>
        </div>
      </div>

      {/* MODAL REGISTRAR MEDIDAS */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveMeasurements} className="bg-[#111111] border border-[#1f1f1f] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            
            <div className="flex justify-between items-center border-b border-[#1f1f1f] pb-3">
              <h2 className="text-sm font-black tracking-wider uppercase text-white">Registrar Métricas</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Peso (kg)</label>
                <input type="number" step="0.1" required placeholder="0.0" value={weight} onChange={(e) => setWeight(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Cintura (cm)</label>
                <input type="number" placeholder="0" value={waist} onChange={(e) => setWaist(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Quadril (cm)</label>
                <input type="number" placeholder="0" value={hip} onChange={(e) => setHip(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Peitoral (cm)</label>
                <input type="number" placeholder="0" value={chest} onChange={(e) => setChest(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs" />
              </div>
            </div>

            <button type="submit" className="w-full py-3 rounded-xl bg-white text-black font-black text-xs hover:opacity-95 transition-all mt-2">
              Salvar Registro
            </button>
          </form>
        </div>
      )}

    </div>
  );
}