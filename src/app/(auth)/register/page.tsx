'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const supabase = createClient();
  const router = useRouter();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
        },
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      alert('Cadastro realizado! Se o Supabase exigir confirmação, verifique sua caixa de entrada.');
      router.push('/login');
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Criar sua conta</h1>
        <p className="text-sm text-zinc-400">Comece sua jornada fitness de alta performance</p>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Nome Completo</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu Nome"
            className="w-full px-4 py-3 rounded-xl bg-[#111111] border border-[#1f1f1f] text-white placeholder-zinc-700 focus:outline-none focus:border-[#7c3aed] transition-colors text-sm"
          />
        </div>

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
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Senha</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-3 rounded-xl bg-[#111111] border border-[#1f1f1f] text-white placeholder-zinc-700 focus:outline-none focus:border-[#7c3aed] transition-colors text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Confirmar Senha</label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
          {loading ? 'Criando perfil...' : 'Cadastrar'}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-400">
        Já tem uma conta?{' '}
        <Link href="/login" className="text-[#7c3aed] font-bold hover:underline">
          Faça login
        </Link>
      </p>
    </div>
  );
}