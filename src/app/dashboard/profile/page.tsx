'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User, Mail, CreditCard, Scale, Ruler, Award, Loader2, Save } from 'lucide-react';

export default function ProfilePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Estados do formulário
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('inativo');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [goal, setGoal] = useState('hipertrofia');

  useEffect(() => {
    async function loadProfileData() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        setEmail(user.email || '');
        
        // Busca os dados da tabela profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (profile) {
          setName(profile.nome || '');
          setStatus(profile.status_assinatura || 'inativo');
          setWeight(profile.peso?.toString() || '');
          setHeight(profile.altura?.toString() || '');
          setGoal(profile.objetivo || 'hipertrofia');
        }
      }
      setLoading(false);
    }

    loadProfileData();
  }, [supabase]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update({
        nome: name,
        peso: parseFloat(weight) || null,
        altura: parseFloat(height) || null,
        objetivo: goal
      })
      .eq('user_id', user.id);

    setSaving(false);
    if (!error) {
      alert('Perfil atualizado com sucesso!');
    } else {
      alert('Erro ao atualizar perfil.');
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="w-8 h-8 text-[#7c3aed] animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-2xl mx-auto space-y-8">
      
      {/* HEADER */}
      <div className="space-y-1 border-b border-[#1f1f1f] pb-5">
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">MEU PERFIL</h1>
        <p className="text-xs lg:text-sm text-zinc-500">Gerencie suas informações cadastrais e métricas corporais.</p>
      </div>

      <form onSubmit={handleSaveProfile} className="space-y-6">
        
        {/* SEÇÃO: DADOS DA CONTA */}
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <User className="w-4 h-4 text-[#7c3aed]" /> Informações de Cadastro
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Nome Completo</label>
              <input
                type="text"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-3 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">E-mail</label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3 w-4 h-4 text-zinc-600" />
                <input
                  type="email"
                  disabled
                  value={email}
                  className="w-full pl-10 pr-3 py-3 rounded-xl bg-[#0a0a0a]/50 border border-[#1f1f1f] text-zinc-500 text-xs cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SEÇÃO: METRICAS CORPORAIS */}
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] space-y-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <Scale className="w-4 h-4 text-[#7c3aed]" /> Avaliação Antropométrica
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Peso Atual (kg)</label>
              <div className="relative flex items-center">
                <Scale className="absolute left-3 w-4 h-4 text-zinc-600" />
                <input
                  type="number"
                  step="0.1"
                  placeholder="ex: 80.5"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full pl-10 pr-3 py-3 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Altura (cm)</label>
              <div className="relative flex items-center">
                <Ruler className="absolute left-3 w-4 h-4 text-zinc-600" />
                <input
                  type="number"
                  placeholder="ex: 180"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="w-full pl-10 pr-3 py-3 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Objetivo Principal</label>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full px-3 py-3 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs transition-colors appearance-none"
              >
                <option value="hipertrofia">Hipertrofia</option>
                <option value="definicao">Definição Muscular</option>
                <option value="emagrecimento">Emagrecimento</option>
                <option value="performance">Performance Pura</option>
              </select>
            </div>
          </div>
        </div>

        {/* SEÇÃO: STATUS DA ASSINATURA */}
        <div className="p-5 rounded-2xl bg-[#111111] border border-[#1f1f1f] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wide">Plano Pace Premium</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Gerenciado via Perfect Pay</p>
            </div>
          </div>

          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
            status === 'ativo' 
              ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>
            {status === 'ativo' ? 'Acesso Ativo' : 'Acesso Pendente'}
          </span>
        </div>

        {/* BOTÃO SALVAR */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3.5 rounded-xl bg-[#7c3aed] text-white text-xs font-black hover:bg-[#6d28d9] transition-all shadow-lg shadow-purple-500/10 uppercase tracking-wider flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Alterações
        </button>

      </form>
    </div>
  );
}