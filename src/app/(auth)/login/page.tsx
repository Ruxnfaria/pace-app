'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const supabase = createClient();
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError('Credenciais inválidas ou usuário não encontrado.');
      setLoading(false);
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Boas-vindas de volta</h1>
        <p className="text-sm text-zinc-400">Insira suas credenciais para acessar a plataforma</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="w-full px-4 py-3 rounded-xl bg-[#111111] border border-[#1f1f1f] text-white placeholder-zinc-700 focus:outline-none focus:border-[#7c3aed] transition-colors text-sm"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Senha</label>
            <Link href="#" className="text-xs text-[#7c3aed] hover:underline font-medium">Esqueci a senha</Link>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-3 rounded-xl bg-[#111111] border border-[#1f1f1f] text-white placeholder-zinc-700 focus:outline-none focus:border-[#7c3aed] transition-colors text-sm"
          />
        </div>

        {error && <p className="text-xs text-red-500 font-medium bg-red-500/10 p-3 rounded-lg border border-red-500/20">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-[#7c3aed] text-white font-bold hover:bg-[#6d28d9] transition-colors disabled:opacity-50 text-sm shadow-lg shadow-purple-500/10"
        >
          {loading ? 'Verificando...' : 'Entrar'}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-400">
        Não tem uma conta?{' '}
        <Link href="/register" className="text-[#7c3aed] font-bold hover:underline">
          Cadastre-se
        </Link>
      </p>
    </div>
  );
}