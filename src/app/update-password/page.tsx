"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function UpdatePasswordPage() {
  const supabase = createClient();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function checkRecoverySession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (mounted && session) {
        setRecoveryReady(true);
      }

      setCheckingSession(false);
    }

    checkRecoverySession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "PASSWORD_RECOVERY" && session) {
        setRecoveryReady(true);
        setCheckingSession(false);
        setError("");
      }

      if (event === "SIGNED_IN" && session) {
        setRecoveryReady(true);
        setCheckingSession(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!recoveryReady) {
      setError(
        "O link de recuperação não criou uma sessão válida. Solicite um novo link."
      );
      return;
    }

    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      console.error("[PACE] Erro ao redefinir senha:", updateError);
      setError(updateError.message || "Não foi possível redefinir sua senha.");
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();

    router.push("/login");
    router.refresh();
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black px-4">
        <div className="text-sm text-zinc-400">
          Validando link de recuperação...
        </div>
      </div>
    );
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

        {!recoveryReady && (
          <p className="mt-4 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            Este link de recuperação não está mais válido. Volte ao login e
            solicite um novo e-mail.
          </p>
        )}

        <form onSubmit={handleUpdatePassword} className="mt-6 space-y-4">
          <input
            type="password"
            required
            disabled={!recoveryReady}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nova senha"
            className="w-full px-4 py-3 rounded-xl bg-black border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] disabled:opacity-50"
          />

          <input
            type="password"
            required
            disabled={!recoveryReady}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirmar nova senha"
            className="w-full px-4 py-3 rounded-xl bg-black border border-[#1f1f1f] text-white focus:outline-none focus:border-[#7c3aed] disabled:opacity-50"
          />

          {error && (
            <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !recoveryReady}
            className="w-full py-3 rounded-xl bg-[#7c3aed] text-white font-black hover:bg-[#6d28d9] disabled:opacity-50"
          >
            {loading ? "Salvando..." : "Atualizar senha"}
          </button>
        </form>
      </div>
    </div>
  );
}