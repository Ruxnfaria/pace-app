'use client';

import { Sidebar } from "@/components/sidebar";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { RewardQueueProvider } from "@/components/gamification/RewardQueueProvider";
import { CelebrationManager } from "@/components/gamification/CelebrationManager";
import { CoreEnergyAbsorption } from "@/components/gamification/core/CoreEnergyAbsorption";
import { CoreEvolutionOverlay } from "@/components/evolution/CoreEvolutionOverlay";

import {
  LayoutDashboard,
  MessageSquare,
  Dumbbell,
  Target,
  Apple,
  User,
  TrendingUp,
  Award,
  MoreHorizontal,
  LogOut,
  X,
} from 'lucide-react';

import { createClient } from "@/lib/supabase/client";
import { cn } from '@/lib/utils';

const mobileItems = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: '/dashboard',
  },
  {
    label: 'Missões',
    icon: Target,
    href: '/dashboard/missions',
  },
  {
    label: 'Treinos',
    icon: Dumbbell,
    href: '/dashboard/workouts',
  },
  {
    label: 'Nutrição',
    icon: Apple,
    href: '/dashboard/nutrition',
  },
];

const moreItems = [
  {
    label: 'Mentoria Praxe',
    description: 'Converse com a Mentoria PRAXE',
    icon: MessageSquare,
    href: '/dashboard/aria',
  },
  {
    label: 'Perfil',
    description: 'Seus dados e preferências',
    icon: User,
    href: '/dashboard/profile',
  },
  {
    label: 'Evolução',
    description: 'Acompanhe sua progressão',
    icon: TrendingUp,
    href: '/dashboard/progress',
  },
  {
    label: 'Conquistas',
    description: 'Veja suas conquistas',
    icon: Award,
    href: '/dashboard/badges',
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const supabase = createClient();

  const moreIsActive = moreItems.some(
    (item) =>
      pathname === item.href ||
      pathname.startsWith(`${item.href}/`)
  );

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("[PRAXE] Erro ao sair da conta:", error);
        setLoggingOut(false);
        return;
      }

      window.location.href = "/login";
    } catch (error) {
      console.error("[PRAXE] Erro inesperado ao sair:", error);
      setLoggingOut(false);
    }
  }

  return (
    <RewardQueueProvider>
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        {/* Sidebar Desktop */}
        <Sidebar />

        {/* Conteúdo */}
        <main className="lg:pl-64 pb-24 lg:pb-0">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>

        {/* Fundo escuro do menu Mais */}
        {moreOpen && (
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMoreOpen(false)}
            className="lg:hidden fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm"
          />
        )}

        {/* Menu Mais */}
        <div
          className={cn(
            "lg:hidden fixed bottom-20 left-0 right-0 z-[60] px-3 transition-all duration-300",
            moreOpen
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-6 opacity-0"
          )}
        >
          <div className="overflow-hidden rounded-t-[28px] rounded-b-2xl border border-white/10 bg-[#111116]/95 shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-400">
                  PRAXE
                </p>

                <h2 className="mt-1 text-xl font-black text-white">
                  Mais
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-zinc-400 transition hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-2">
              {moreItems.map((item) => {
                const Icon = item.icon;

                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-4 rounded-2xl px-4 py-4 transition-all",
                      isActive
                        ? "bg-violet-500/15 text-white"
                        : "text-zinc-300 active:bg-white/[0.05]"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
                        isActive
                          ? "border-violet-400/30 bg-violet-500/15 text-violet-300"
                          : "border-white/[0.08] bg-white/[0.04] text-zinc-400"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="text-sm font-black">
                        {item.label}
                      </p>

                      <p className="mt-0.5 text-xs text-zinc-500">
                        {item.description}
                      </p>
                    </div>
                  </Link>
                );
              })}

              <div className="my-2 h-px bg-white/[0.08]" />

              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-zinc-400 transition-all active:bg-white/[0.05] disabled:opacity-50"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                  <LogOut className="h-5 w-5" />
                </div>

                <p className="text-sm font-black">
                  {loggingOut ? "Saindo..." : "Sair da conta"}
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Navegação Mobile */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-[70] h-20 border-t border-white/[0.08] bg-[#101014]/95 px-2 backdrop-blur-xl">
          <div className="grid h-full grid-cols-5">
            {mobileItems.map((item) => {
              const Icon = item.icon;

              const isActive =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center justify-center"
                >
                  <div
                    className={cn(
                      "flex h-14 w-14 items-center justify-center rounded-2xl transition-all",
                      isActive
                        ? "bg-[#7c3aed] text-white shadow-lg shadow-violet-950/40"
                        : "text-zinc-500"
                    )}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                </Link>
              );
            })}

            <button
              type="button"
              onClick={() => setMoreOpen((current) => !current)}
              className="flex items-center justify-center"
              aria-label="Abrir menu Mais"
            >
              <div
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-2xl transition-all",
                  moreOpen || moreIsActive
                    ? "bg-[#7c3aed] text-white shadow-lg shadow-violet-950/40"
                    : "text-zinc-500"
                )}
              >
                <MoreHorizontal className="h-7 w-7" />
              </div>
            </button>
          </div>
        </nav>
      </div>

      <CelebrationManager />
      <CoreEnergyAbsorption />
      <CoreEvolutionOverlay />
    </RewardQueueProvider>
  );
}