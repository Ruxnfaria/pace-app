'use client';

import { Sidebar } from '@/components/sidebar';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Dumbbell, 
  Target, 
  User 
} from 'lucide-react';
import { cn } from '@/lib/utils';

const mobileItems = [
  { icon: LayoutDashboard, href: '/dashboard' },
  { icon: MessageSquare, href: '/dashboard/aria' },
  { icon: Dumbbell, href: '/dashboard/workouts' },
  { icon: Target, href: '/dashboard/missions' },
  { icon: User, href: '/dashboard/profile' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Sidebar para Desktop */}
      <Sidebar />

      {/* Conteúdo Principal */}
      <main className="lg:pl-64 pb-24 lg:pb-0">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Navegação Mobile (Bottom Bar) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-20 bg-[#111111]/80 backdrop-blur-xl border-t border-[#1f1f1f] px-6 flex items-center justify-between z-50">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "p-3 rounded-2xl transition-all",
                isActive ? "bg-[#7c3aed] text-white" : "text-zinc-500"
              )}
            >
              <Icon className="w-6 h-6" />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}