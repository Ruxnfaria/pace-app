'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

export interface ChoiceCardOption<T extends string | number> {
  value: T;
  title: string;
  description?: string;
  icon?: ReactNode;
}

interface ChoiceCardsProps<T extends string | number> {
  options: readonly ChoiceCardOption<T>[];
  value: T | readonly T[] | undefined;
  onChange: (value: T) => void;
  multiple?: boolean;
  disabledValues?: readonly T[];
  columns?: 1 | 2 | 3;
  ariaLabel: string;
}

export function ChoiceCards<T extends string | number>({
  options,
  value,
  onChange,
  multiple = false,
  disabledValues = [],
  columns = 2,
  ariaLabel,
}: ChoiceCardsProps<T>) {
  const selectedValues = Array.isArray(value) ? value : [value];
  const gridClass =
    columns === 1
      ? 'grid-cols-1'
      : columns === 3
        ? 'grid-cols-2 sm:grid-cols-3'
        : 'grid-cols-1 sm:grid-cols-2';

  return (
    <div className={`grid gap-3 ${gridClass}`} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = selectedValues.includes(option.value);
        const disabled = disabledValues.includes(option.value);

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`group relative min-h-20 rounded-2xl border p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] disabled:cursor-not-allowed disabled:opacity-40 ${
              selected
                ? 'border-violet-500 bg-violet-500/15 shadow-[0_12px_36px_rgba(124,58,237,0.16)]'
                : 'border-white/8 bg-white/[0.035] hover:-translate-y-0.5 hover:border-violet-400/40 hover:bg-white/[0.06]'
            }`}
          >
            <span className="flex items-start gap-3">
              {option.icon ? (
                <span className={`mt-0.5 ${selected ? 'text-violet-300' : 'text-zinc-500'}`}>
                  {option.icon}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-white">{option.title}</span>
                {option.description ? (
                  <span className="mt-1 block text-xs leading-5 text-zinc-400">
                    {option.description}
                  </span>
                ) : null}
              </span>
              {selected ? (
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet-500 text-white">
                  <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                </span>
              ) : multiple ? (
                <span aria-hidden="true" className="size-6 shrink-0 rounded-full border border-zinc-700" />
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
