'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Dumbbell, Target, Heart, ChevronRight, ChevronLeft, Zap } from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  // Estados do Formulário
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  // Dados do Usuário
  const [goal, setGoal] = useState('');
  const [level, setLevel] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [days, setDays] = useState(3);

  // Verifica se o usuário está logado ao carregar a página
  useEffect(() => {
    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
      } else {
        setUserId(user.id);
      }
    }
    checkUser();
  }, [router, supabase]);

  // Avançar e Voltar etapas
  const nextStep = () => setStep((p) => Math.min(p + 1, 4));
  const prevStep = () => setStep((p) => Math.max(p - 1, 1));

  // Salvar no Banco e Concluir
  async function handleFinish() {
    if (!userId) return;
    setLoading(true);
    setError('');

    const { error } = await supabase
      .from('profiles')
      .update({
        goal,
        fitness_level: level,
        weight: parseFloat(weight),
        height: parseFloat(height),
        age: parseInt(age),
        gender,
        available_days: days,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      setError('Erro ao salvar seu perfil. Tente novamente.');
      setLoading(false);
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  }

  // Animações das Etapas
  const variants = {
    enter: (direction: number) => ({ x: direction > 0 ? 50 : -50, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({ x: direction < 0 ? 50 : -50, opacity: 0 }),
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] text-white p-4">
      <div className="w-full max-w-md space-y-6">
        
        {/* Indicador de Progresso Premium */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            <span>Configurando Perfil</span>
            <span>Etapa {step} de 4</span>
          </div>
          <div className="h-1.5 w-full bg-[#1f1f1f] rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#7c3aed] transition-all duration-300 ease-out rounded-full shadow-lg shadow-purple-500/40"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* Card Principal */}
        <div className="p-8 rounded-2xl bg-[#111111] border border-[#1f1f1f] shadow-2xl min-h-[420px] flex flex-col justify-between overflow-hidden relative">
          <AnimatePresence mode="wait" custom={step}>
            
            {/* ETAPA 1: OBJETIVO */}
            {step === 1 && (
              <motion.div key="step1" custom={step} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} className="space-y-4 flex-1">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">Qual é o seu objetivo?</h2>
                  <p className="text-xs text-zinc-400">A ARIA vai alinhar seus treinos e dieta com base nisso.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {[
                    { id: 'emagrecer', label: 'Emagrecer', icon: Flame },
                    { id: 'massa', label: 'Ganhar Massa', icon: Dumbbell },
                    { id: 'definir', label: 'Definir', icon: Target },
                    { id: 'saude', label: 'Saúde Geral', icon: Heart },
                  ].map((item) => {
                    const Icon = item.icon;
                    const isSelected = goal === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setGoal(item.id)}
                        className={`flex flex-col items-center justify-center p-5 rounded-xl border text-center transition-all ${
                          isSelected 
                            ? 'bg-[#7c3aed]/10 border-[#7c3aed] text-white shadow-lg shadow-purple-500/5' 
                            : 'bg-[#111111] border-[#1f1f1f] text-zinc-400 hover:border-zinc-800'
                        }`}
                      >
                        <Icon className={`w-6 h-6 mb-2 ${isSelected ? 'text-[#7c3aed]' : 'text-zinc-500'}`} />
                        <span className="text-xs font-bold">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ETAPA 2: NÍVEL */}
            {step === 2 && (
              <motion.div key="step2" custom={step} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} className="space-y-4 flex-1">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">Qual seu nível de experiência?</h2>
                  <p className="text-xs text-zinc-400">Para ajustar a intensidade dos exercícios.</p>
                </div>
                <div className="space-y-2 pt-2">
                  {[
                    { id: 'iniciante', title: 'Iniciante 🌱', desc: 'Nunca treinei ou estou voltando do zero.' },
                    { id: 'intermediario', title: 'Intermediário ⚡', desc: 'Já treino há alguns meses com consistência.' },
                    { id: 'avancado', title: 'Avançado 🏆', desc: 'Treino pesado há anos e busco performance.' },
                  ].map((item) => {
                    const isSelected = level === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setLevel(item.id)}
                        className={`w-full p-4 rounded-xl border text-left transition-all ${
                          isSelected 
                            ? 'bg-[#7c3aed]/10 border-[#7c3aed] shadow-lg shadow-purple-500/5' 
                            : 'bg-[#111111] border-[#1f1f1f] hover:border-zinc-800'
                        }`}
                      >
                        <h3 className={`text-xs font-bold ${isSelected ? 'text-[#7c3aed]' : 'text-white'}`}>{item.title}</h3>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{item.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ETAPA 3: DADOS FÍSICOS */}
            {step === 3 && (
              <motion.div key="step3" custom={step} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} className="space-y-4 flex-1">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">Suas métricas corporais</h2>
                  <p className="text-xs text-zinc-400">Usado para calcular taxas metabólicas e macros precisos.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Peso (kg)</label>
                    <input type="number" placeholder="ex: 75" value={weight} onChange={(e) => setWeight(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#111111] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Altura (cm)</label>
                    <input type="number" placeholder="ex: 175" value={height} onChange={(e) => setHeight(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#111111] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Idade</label>
                    <input type="number" placeholder="ex: 24" value={age} onChange={(e) => setAge(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#111111] border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Biotipo / Sexo</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setGender('M')} className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${gender === 'M' ? 'bg-[#7c3aed] border-[#7c3aed]' : 'bg-[#111111] border-[#1f1f1f]'}`}>M</button>
                      <button onClick={() => setGender('F')} className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${gender === 'F' ? 'bg-[#7c3aed] border-[#7c3aed]' : 'bg-[#111111] border-[#1f1f1f]'}`}>F</button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ETAPA 4: DISPONIBILIDADE E CONFIRMAÇÃO */}
            {step === 4 && (
              <motion.div key="step4" custom={step} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} className="space-y-4 flex-1">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">Quantos dias quer treinar?</h2>
                  <p className="text-xs text-zinc-400">Ajuste sua divisão semanal perfeita.</p>
                </div>
                <div className="flex flex-col items-center justify-center py-4 space-y-4">
                  <div className="text-4xl font-black text-[#7c3aed]">{days} <span className="text-lg text-white">dias</span></div>
                  <div className="flex gap-1.5 w-full justify-between">
                    {[2, 3, 4, 5, 6].map((num) => (
                      <button
                        key={num}
                        onClick={() => setDays(num)}
                        className={`w-12 h-12 rounded-xl border font-bold text-xs transition-all ${
                          days === num 
                            ? 'bg-[#7c3aed] border-[#7c3aed]' 
                            : 'bg-[#111111] border-[#1f1f1f] hover:border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                  <div className="bg-[#7c3aed]/5 p-3 rounded-xl border border-[#7c3aed]/10 flex items-start gap-2.5 mt-2">
                    <Zap className="w-4 h-4 text-[#7c3aed] mt-0.5 shrink-0" />
                    <p className="text-[11px] text-zinc-400 leading-relaxed">"O sucesso é a soma de pequenos esforços repetidos dia após dia. Configuração pronta para esmagar as metas!"</p>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>

          {/* Erro de feedback */}
          {error && <p className="text-[11px] text-red-500 font-medium mb-2">{error}</p>}

          {/* Navegação Inferior do Card */}
          <div className="flex justify-between items-center pt-4 border-t border-[#1f1f1f] mt-4">
            <button
              onClick={prevStep}
              disabled={step === 1}
              className="flex items-center gap-1 py-2 px-3 text-xs font-semibold text-zinc-500 hover:text-white disabled:opacity-0 transition-all"
            >
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>

            {step < 4 ? (
              <button
                onClick={nextStep}
                disabled={(step === 1 && !goal) || (step === 2 && !level) || (step === 3 && (!weight || !height || !age || !gender))}
                className="flex items-center gap-1 py-2.5 px-4 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-xs font-bold disabled:opacity-30 disabled:hover:bg-[#7c3aed] transition-all"
              >
                Avançar <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={loading}
                className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-[#7c3aed] to-purple-500 hover:opacity-90 text-xs font-black tracking-wide uppercase transition-all shadow-lg shadow-purple-500/20"
              >
                {loading ? 'Montando Ecossistema...' : 'Concluir Perfil'}
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}