'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Clock3, Target } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import MealPlanPreparation from '@/components/post-onboarding/MealPlanPreparation';
import ActiveMealPlan from '@/components/nutrition/ActiveMealPlan';
import { formatNutritionTarget, loadActiveNutritionTarget, type ActiveNutritionTarget } from '@/lib/nutrition/active-target';
import { loadActiveMealPlan, type ActiveMealPlan as ActiveMealPlanModel } from '@/lib/nutrition/meal-plan/active-plan';

function progressPercent(value: number, target: number) {
  if (!target || target < 0) return 0;
  return Math.min(Math.max((value / target) * 100, 0), 100);
}

function MacroProgress({ label, target }: { label: string; target: number }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="font-medium text-zinc-300">{label}</span>
        <span className="tabular-nums text-zinc-500">0g consumidos · meta {formatNutritionTarget(target)}g</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.055]">
        <div className="h-full w-0 rounded-full bg-gradient-to-r from-[#a83d00] via-[#ff6a00] to-[#ff9b44]" />
      </div>
    </div>
  );
}

export default function NutritionPage() {
  const supabase = useMemo(() => createClient(), []);
  const [target, setTarget] = useState<ActiveNutritionTarget | null>(null);
  const [mealPlan, setMealPlan] = useState<ActiveMealPlanModel | null>(null);
  const [targetLoading, setTargetLoading] = useState(true);
  const [mealPlanLoading, setMealPlanLoading] = useState(true);
  const [targetLoadFailed, setTargetLoadFailed] = useState(false);
  const [mealPlanLoadFailed, setMealPlanLoadFailed] = useState(false);

  const loadTarget = useCallback(async () => {
    setTargetLoading(true);
    setTargetLoadFailed(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setTarget(user ? await loadActiveNutritionTarget(supabase, user.id) : null);
    } catch (error) {
      console.error('[PRAXE] Erro ao carregar target nutricional:', error);
      setTarget(null);
      setTargetLoadFailed(true);
    } finally {
      setTargetLoading(false);
    }
  }, [supabase]);

  const loadMealPlan = useCallback(async () => {
    setMealPlanLoading(true);
    setMealPlanLoadFailed(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setMealPlan(user ? await loadActiveMealPlan(supabase, user.id) : null);
    } catch (error) {
      console.error('[PRAXE] Erro ao carregar plano alimentar ativo:', error);
      setMealPlan(null);
      setMealPlanLoadFailed(true);
    } finally {
      setMealPlanLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTarget();
      void loadMealPlan();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMealPlan, loadTarget]);

  const calorieTarget = target?.calories ?? 0;
  const calorieProgress = progressPercent(0, calorieTarget);

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
        {targetLoading ? (
          <div className="relative h-52 animate-pulse rounded-2xl bg-white/[0.025]" aria-label="Carregando metas nutricionais" />
        ) : targetLoadFailed ? (
          <div className="relative py-8 text-center">
            <p className="text-sm font-medium text-zinc-300">Não foi possível carregar suas metas.</p>
            <button type="button" onClick={() => void loadTarget()} className="mt-3 text-[11px] font-semibold text-[#ff7a00]">Tentar novamente</button>
          </div>
        ) : target ? (
          <>
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#d96818]">Meta diária</p>
                <div className="mt-3 flex items-end gap-2">
                  <strong className="text-[32px] font-semibold leading-none tracking-[-.05em] text-white">0</strong>
                  <span className="pb-0.5 text-[11px] text-zinc-500">de {formatNutritionTarget(calorieTarget)} kcal</span>
                </div>
                <p className="mt-2 text-[10px] text-zinc-600">Meta calculada · consumo ainda não registrado</p>
              </div>
              <div className="relative flex h-[82px] w-[82px] shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#ff6a00 ${calorieProgress * 3.6}deg, rgba(255,255,255,.055) 0deg)` }}>
                <div className="flex h-[68px] w-[68px] flex-col items-center justify-center rounded-full bg-[#0c0c0c] shadow-[inset_0_0_20px_rgba(255,106,0,.04)]">
                  <span className="text-[17px] font-semibold tabular-nums text-white">0%</span>
                  <span className="text-[8px] uppercase tracking-[.14em] text-zinc-600">consumo</span>
                </div>
              </div>
            </div>
            <div className="relative mt-5 space-y-4 border-t border-white/[0.055] pt-4">
              <MacroProgress label="Proteínas" target={target.proteinG} />
              <MacroProgress label="Carboidratos" target={target.carbsG} />
              <MacroProgress label="Gorduras" target={target.fatG} />
              <MacroProgress label="Fibras" target={target.fiberG} />
            </div>
          </>
        ) : (
          <div className="relative py-8 text-center">
            <Target className="mx-auto h-5 w-5 text-zinc-700" />
            <p className="mt-3 text-sm font-medium text-zinc-300">Meta nutricional ainda não disponível.</p>
          </div>
        )}
      </section>

      <section className="mt-6">
        <p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#d96818]">Plano alimentar</p>
        <h2 className="mt-1 text-[17px] font-semibold tracking-[-.02em] text-white">Sua estratégia nutricional</h2>
        <MealPlanPreparation
          readyContent={mealPlan ? <ActiveMealPlan plan={mealPlan} /> : null}
          readyLoading={mealPlanLoading}
          readyLoadFailed={mealPlanLoadFailed}
          reloadReady={() => void loadMealPlan()}
        />
      </section>

      <section className="mt-6">
        <h2 className="text-[17px] font-semibold tracking-[-.02em] text-white">Consumo de hoje</h2>
        <div className="mt-3 rounded-[18px] border border-white/[0.05] bg-white/[0.018] px-4 py-5 text-center">
          <Clock3 className="mx-auto h-4 w-4 text-zinc-700" />
          <p className="mt-2 text-[10.5px] font-medium text-zinc-500">Nenhum consumo registrado.</p>
          <p className="mt-1 text-[9px] leading-4 text-zinc-700">O registro de consumo será habilitado quando o novo contrato estiver disponível.</p>
        </div>
      </section>
    </main>
  );
}
