"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function UpdatePasswordPage() {
  const supabase = createClient();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();

    setError("");

    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      console.error("[PACE] Erro ao redefinir senha:", error);
      setError("Não foi possível redefinir sua senha.");
      setLoading(false);
      return;
    }

    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#1f1f1f] bg-[#111111] p-6">
        <h1 className="text-2xl font-black text-white">
          Criar nova senha
        </h1>

        <p className="mt-2 text-sm text-zinc-400">
          Digite uma nova senha para sua conta PACE.
        </p>

        <form onSubmit={handleUpdatePassword} className="mt-6 space-y-4">
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nova senha"
            className="w-full px-4 py-3 rounded-xl bg-black border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed]"
          />

          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirmar nova senha"
            className="w-full px-4 py-3 rounded-xl bg-black border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed]"
          />

          {error && (
            <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[#7c3aed] text-white font-black hover:bg-[#6d28d9] disabled:opacity-50"
          >
            {loading ? "Salvando..." : "Atualizar senha"}
          </button>
        </form>
      </div>
    </div>
  );
}