import { Apple, CalendarDays } from "lucide-react";

import { formatMealRole, formatMealWindow, type ActiveMealPlan as ActiveMealPlanModel } from "@/lib/nutrition/meal-plan/active-plan";

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(value);
}

function SummaryMetric({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div>
      <p className="text-[8px] font-semibold uppercase tracking-[.14em] text-zinc-600">{label}</p>
      <p className="mt-1 text-[13px] font-semibold tabular-nums text-zinc-200">{formatNumber(value)} {unit}</p>
    </div>
  );
}

export default function ActiveMealPlan({ plan }: { plan: ActiveMealPlanModel }) {
  return (
    <div className="mt-3 space-y-3" data-testid="active-meal-plan">
      <div className="overflow-hidden rounded-[24px] border border-orange-400/[0.1] bg-gradient-to-br from-[#17130f] via-[#10100f] to-[#0a0a0a] p-4 shadow-[0_16px_44px_rgba(0,0,0,.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#d96818]">Seu plano alimentar</p>
            <h3 className="mt-1.5 text-[17px] font-semibold tracking-[-.025em] text-white">Plano diário</h3>
            <p className="mt-1 text-[10px] text-zinc-500">{plan.recommendedMealsPerDay} refeições organizadas para sua rotina</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-orange-400/[0.12] bg-orange-500/[0.06] text-[#ff7a00]"><Apple className="h-4 w-4" /></span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.055] pt-4 min-[390px]:grid-cols-3">
          <SummaryMetric label="Calorias" value={plan.actualTotals.calories} unit="kcal" />
          <SummaryMetric label="Proteína" value={plan.actualTotals.proteinG} unit="g" />
          <SummaryMetric label="Carboidratos" value={plan.actualTotals.carbsG} unit="g" />
          <SummaryMetric label="Gorduras" value={plan.actualTotals.fatG} unit="g" />
          <SummaryMetric label="Fibra" value={plan.actualTotals.fiberG} unit="g" />
        </div>
        <p className="mt-4 text-[8.5px] leading-4 text-zinc-700">Valores do plano gerado. O consumo diário é registrado separadamente.</p>
      </div>

      {plan.meals.map((meal) => (
        <article key={meal.id} className="rounded-[22px] border border-white/[0.055] bg-white/[0.018] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[13px] font-semibold tracking-[-.015em] text-zinc-100">{formatMealRole(meal.role)}</h3>
              <p className="mt-1 flex items-center gap-1.5 text-[9px] text-zinc-600">
                <CalendarDays className="h-3 w-3 text-zinc-700" />
                {formatMealWindow(meal.windowStart, meal.windowEnd, meal.windowStartDayOffset, meal.windowEndDayOffset)}
              </p>
            </div>
            <p className="shrink-0 text-right text-[9px] leading-4 text-zinc-500">
              <span className="block font-semibold tabular-nums text-zinc-300">{formatNumber(meal.actualCalories, 0)} kcal</span>
              {formatNumber(meal.actualProteinG)} g proteína
            </p>
          </div>
          <ul className="mt-3 divide-y divide-white/[0.045] border-t border-white/[0.05]">
            {meal.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 py-2.5 text-[10px]">
                <span className="min-w-0 truncate text-zinc-400">{item.foodName}</span>
                <span className="shrink-0 tabular-nums text-zinc-600">{formatNumber(item.quantityGrams)} g</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
