'use client';

import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';

interface TagListInputProps {
  label: string;
  hint?: string;
  placeholder: string;
  values: readonly string[];
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
  maxLength?: number;
}

export function TagListInput({
  label,
  hint,
  placeholder,
  values,
  onAdd,
  onRemove,
  maxLength = 160,
}: TagListInputProps) {
  const inputId = useId();
  const messageId = useId();
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');

  function addValue() {
    const trimmed = value.trim();
    if (!trimmed) {
      setMessage('Digite um item antes de adicionar.');
      return;
    }
    if (trimmed.length > maxLength) {
      setMessage(`Use no máximo ${maxLength} caracteres.`);
      return;
    }
    if (values.some((item) => item.trim().toLocaleLowerCase('pt-BR') === trimmed.toLocaleLowerCase('pt-BR'))) {
      setMessage('Esse item já foi adicionado.');
      return;
    }

    onAdd(trimmed);
    setValue('');
    setMessage(`${trimmed} adicionado.`);
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={inputId} className="text-sm font-bold text-zinc-200">
          {label}
        </label>
        {hint ? <p className="mt-1 text-xs leading-5 text-zinc-500">{hint}</p> : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={inputId}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-describedby={messageId}
          onChange={(event) => {
            setValue(event.target.value);
            setMessage('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addValue();
            }
          }}
          className="min-h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/25 px-4 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
        />
        <button
          type="button"
          onClick={addValue}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-violet-400/30 bg-violet-500/10 px-5 text-sm font-black text-violet-200 transition hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <Plus aria-hidden="true" className="size-4" />
          Adicionar
        </button>
      </div>
      <p id={messageId} role="status" className="min-h-5 text-xs font-semibold text-violet-300">
        {message}
      </p>
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={`${label}: itens adicionados`}>
          {values.map((item, index) => (
            <li key={`${item}-${index}`} className="flex max-w-full items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/10 py-2 pl-3 pr-2 text-sm text-violet-100">
              <span className="break-all">{item}</span>
              <button
                type="button"
                onClick={() => {
                  onRemove(index);
                  setMessage(`${item} removido.`);
                }}
                aria-label={`Remover ${item}`}
                className="grid size-7 shrink-0 place-items-center rounded-full text-violet-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
