"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Dumbbell,
  Target,
  Apple,
  TrendingUp,
  User,
  LogOut,
  Award,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Mentoria Praxe", href: "/dashboard/aria", icon: MessageSquare },
  { label: "Treinos", href: "/dashboard/workouts", icon: Dumbbell },
  { label: "Nutrição", href: "/dashboard/nutrition", icon: Apple },
  { label: "Evolução", href: "/dashboard/progress", icon: TrendingUp },
  { label: "Missões", href: "/dashboard/missions", icon: Target },
  { label: "Conquistas", href: "/dashboard/badges", icon: Award },
  { label: "Perfil", href: "/dashboard/profile", icon: User },
];

function PaceBolt() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M36.8 4.5L9.5 34.2C7.7 36.2 9.1 39.4 11.8 39.4H29.2L23.8 57.7C22.9 60.7 26.6 62.8 28.8 60.6L56.2 30.4C58 28.4 56.6 25.2 53.9 25.2H36.6L41.9 7.4C42.8 4.5 38.9 2.2 36.8 4.5Z"
        fill="#5B2DFF"
      />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("[PRAXE] Erro ao sair da conta:", error);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 bg-[#111111] border-r border-[#1f1f1f] flex-col justify-between p-5 z-40">
      <div>
        {/* aqui fica todo o conteúdo da sidebar */}
      </div>

      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-zinc-500 hover:text-white hover:bg-[#1a1a1a] transition-all"
      >
        <LogOut className="w-5 h-5" />
        Sair da conta
      </button>
    </aside>
  );
}