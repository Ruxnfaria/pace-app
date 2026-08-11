export default function BlockedPage() {
    return (
      <main className="min-h-screen bg-[#09090b] text-white flex items-center justify-center px-6">
        <div className="w-full max-w-xl text-center">
          <div className="mb-8">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600 text-3xl font-bold shadow-lg shadow-violet-900/30">
              ⚡
            </div>
  
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-violet-400">
              PACE
            </p>
  
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Seu acesso está inativo
            </h1>
  
            <p className="mx-auto mt-4 max-w-md text-base leading-7 text-zinc-400">
              Ative sua assinatura para continuar seus treinos, nutrição,
              missões, ranking e toda a sua evolução dentro do PACE.
            </p>
          </div>
  
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
            <div className="space-y-4 text-left">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/15 text-violet-400">
                  ✓
                </span>
                <span className="text-zinc-200">
                  Treinos e acompanhamento de progresso
                </span>
              </div>
  
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/15 text-violet-400">
                  ✓
                </span>
                <span className="text-zinc-200">
                  Nutrição, missões e sistema de XP
                </span>
              </div>
  
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/15 text-violet-400">
                  ✓
                </span>
                <span className="text-zinc-200">
                  Aria, ranking, conquistas e muito mais
                </span>
              </div>
            </div>
  
            <a
              href="https://SEU-LINK-DA-PERFECT-PAY-AQUI"
              className="mt-7 block w-full rounded-2xl bg-violet-600 px-6 py-4 text-center font-bold text-white transition hover:bg-violet-500"
            >
              Ativar minha assinatura
            </a>
            <button
  type="button"
  disabled
  className="mt-7 block w-full cursor-not-allowed rounded-2xl bg-violet-600/60 px-6 py-4 text-center font-bold text-white opacity-70"
>
  Assinatura em breve
</button>
  
            <p className="mt-4 text-xs leading-5 text-zinc-500">
              Já realizou o pagamento? Aguarde alguns instantes e tente entrar
              novamente.
            </p>
          </div>
  
          <p className="mt-8 text-sm text-zinc-600">
            PACE — transforme consistência em evolução.
          </p>
        </div>
      </main>
    );
  }
  