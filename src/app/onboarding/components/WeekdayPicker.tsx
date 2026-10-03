'use client';

import { Check } from 'lucide-react';
import { WEEKDAYS, type Weekday } from '../lib/onboarding-v2-types';

const LABELS: Record<Weekday, { short: string; long: string }> = {
  1: { short: 'S', long: 'Segunda-feira' },
  2: { short: 'T', long: 'Terça-feira' },
  3: { short: 'Q', long: 'Quarta-feira' },
  4: { short: 'Q', long: 'Quinta-feira' },
  5: { short: 'S', long: 'Sexta-feira' },
  6: { short: 'S', long: 'Sábado' },
  7: { short: 'D', long: 'Domingo' },
};

interface WeekdayPickerProps {
  value: readonly Weekday[];
  onChange: (days: Weekday[]) => void;
  max?: number;
  ariaLabel?: string;
}

export function WeekdayPicker({
  value,
  onChange,
  max,
  ariaLabel = 'Dias da semana',
}: WeekdayPickerProps) {
  function toggle(day: Weekday) {
    if (value.includes(day)) {
      onChange(value.filter((selected) => selected !== day));
      return;
    }
    if (max !== undefined && value.length >= max) return;
    onChange([...value, day].sort((left, right) => left - right));
  }

  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="group" aria-label={ariaLabel}>
      {WEEKDAYS.map((day) => {
        const selected = value.includes(day);
        const disabled = !selected && max !== undefined && value.length >= max;
        return (
          <button
            key={day}
            type="button"
            aria-label={LABELS[day].long}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => toggle(day)}
            className={`flex aspect-square min-h-10 items-center justify-center rounded-xl border text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-35 ${
              selected
                ? 'border-violet-500 bg-violet-500 text-white shadow-lg shadow-violet-950/40'
                : 'border-white/10 bg-white/[0.035] text-zinc-400 hover:border-violet-400/50 hover:text-white'
            }`}
          >
            <span className="sr-only">{selected ? 'Selecionado: ' : ''}</span>
            {selected ? <Check aria-hidden="true" className="size-4 sm:hidden" /> : null}
            <span className={selected ? 'hidden sm:inline' : ''}>{LABELS[day].short}</span>
          </button>
        );
      })}
    </div>
  );
}
