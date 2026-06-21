'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Dumbbell, 
  Apple, 
  TrendingUp, 
  Target, 
  User, 
  LogOut,
  Zap
} from 'lucide-react';

const menuItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'ARIA — Chat', href: '/dashboard/aria', icon: MessageSquare },
  { name: 'Treinos', href: '/dashboard/workouts', icon: Dumbbell },
  { name: 'Nutrição', href: '/dashboard/nutrition', icon: Apple },
  { name: 'Evolução', href: '/dashboard/progress', icon: TrendingUp },
  { name: 'Missões', href: '/dashboard/missions', icon: Target },
  { name: 'Perfil', href: '/dashboard/profile', icon: User },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="hidden lg:flex h-screen w-64 flex-col bg-[#111111] border-r border-[#1f1f1f] fixed left-0 top-0 z-50">
      {/* Logo */}
      <div className="p-6 flex items-center gap-2">
        <Zap className="w-6 h-6 text-[#7c3aed] fill-[#7c3aed]" />
        <span className="text-xl font-black tracking-tight text-white">PACE</span>
      </div>

      {/* Navegação */}
      <nav className="flex-1 px-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all group",
                isActive 
                  ? "bg-[#7c3aed] text-white shadow-lg shadow-purple-500/20" 
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive ? "text-white" : "text-zinc-500 group-hover:text-zinc-300")} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer / Logout */}
      <div className="p-4 border-t border-[#1f1f1f]">
        <button 
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-semibold text-zinc-500 hover:text-red-400 hover:bg-red-400/5 transition-all group"
        >
          <LogOut className="w-5 h-5 text-zinc-500 group-hover:text-red-400" />
          Sair da conta
        </button>
      </div>
    </aside>
  );
}