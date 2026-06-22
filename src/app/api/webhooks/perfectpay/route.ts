import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Inicializa o Supabase com a Service Role Key (bypassa RLS para atualizar o status do cliente)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let body: any = {};
    
    // Tratamento de segurança: a Perfect Pay pode enviar os dados como JSON ou Form URL Encoded
    if (contentType.includes('application/json')) {
      body = await req.json();
    } else {
      const formData = await req.formData();
      formData.forEach((value, key) => {
        body[key] = value;
      });
    }

    // Captura os dados enviados pela Perfect Pay
    const customerEmail = body.email || body.client_email;
    const saleStatus = String(body.status || body.sale_status);

    console.log(`[Perfect Pay Webhook] Processando venda para: ${customerEmail} | Status: ${saleStatus}`);

    if (!customerEmail) {
      return NextResponse.json({ error: 'E-mail não enviado' }, { status: 400 });
    }

    /* Status comuns da Perfect Pay:
      - "2" ou "approved" ou "aprovado": Pago / Aprovado
      - "4" ou "chargeback": Contestação
      - "5" ou "refunded" ou "devolvido": Reembolsado
    */
    if (saleStatus === 'approved' || saleStatus === 'aprovado' || saleStatus === '2') {
      
      // Ativa o cliente no banco de dados procurando pelo e-mail da compra
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ status_assinatura: 'ativo' })
        .eq('email', customerEmail);

      if (profileError) throw profileError;

      console.log(`[Perfect Pay Webhook] Usuário ${customerEmail} ATIVADO com sucesso!`);

    } else if (['4', '5', 'chargeback', 'refunded', 'devolvido'].includes(saleStatus)) {
      
      // Se houver reembolso ou chargeback, bloqueia o safado na hora
      await supabaseAdmin
        .from('profiles')
        .update({ status_assinatura: 'inativo' })
        .eq('email', customerEmail);

      console.log(`[Perfect Pay Webhook] Usuário ${customerEmail} BLOQUEADO.`);
    }

    // Retorna status 200 obrigatório para a Perfect Pay saber que recebemos o aviso
    return NextResponse.json({ received: true }, { status: 200 });

  } catch (error: any) {
    console.error('Erro no Webhook da Perfect Pay:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}