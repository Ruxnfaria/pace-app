import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/request';
import { createClient } from '@/lib/supabase/server';

export async function middleware(request: NextRequest) {
  const supabase = await createClient();
  
  // 1. Verifica se o usuário tem uma sessão activa no Supabase
  const { data: { user } } = await supabase.auth.getUser();
  const url = request.nextUrl.clone();

  // 2. Proteção das rotas do painel (/dashboard)
  if (url.pathname.startsWith('/dashboard')) {
    if (!user) {
      // Se não estiver logado, joga para a tela de login
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    // 🌟 CHAVE MESTRA: Seu e-mail de administrador liberado para testes VIP
    const emailAdmin = 'ruangabrielfaria10@gmail.com';

    if (user.email === emailAdmin) {
      // Se for você logado, o acesso é totalmente liberado, ignorando o bloqueio de assinatura!
      return NextResponse.next();
    }

    // 3. Busca o status da assinatura do usuário comum no banco de dados
    const { data: profile } = await supabase
      .from('profiles')
      .select('status_assinatura')
      .eq('user_id', user.id)
      .single();

    // 4. Se for um usuário comum e estiver inativo, barra e joga para a página de vendas/bloqueio
    if (!profile || profile.status_assinatura !== 'ativo') {
      url.pathname = '/blocked'; 
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};