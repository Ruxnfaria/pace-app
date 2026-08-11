import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let body: any = {};

    // Perfect Pay pode enviar JSON ou Form URL Encoded
    if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      const formData = await req.formData();

      formData.forEach((value, key) => {
        body[key] = value;
      });
    }

    // =====================================================
    // 1. SEGURANÇA DO WEBHOOK
    // =====================================================

    const expectedToken = process.env.PERFECTPAY_WEBHOOK_SECRET;

    if (!expectedToken) {
      console.error(
        "[Perfect Pay] PERFECTPAY_WEBHOOK_SECRET não configurado."
      );

      return NextResponse.json(
        { error: "Configuração de segurança ausente" },
        { status: 500 }
      );
    }

    const receivedToken = String(body.token || "").trim();

    if (!receivedToken || receivedToken !== expectedToken) {
      console.warn("[Perfect Pay] Tentativa com token inválido.");

      return NextResponse.json(
        { error: "Token inválido" },
        { status: 401 }
      );
    }

    // =====================================================
    // 2. DADOS DO COMPRADOR
    // =====================================================

    // Payload real da Perfect Pay:
    // body.customer.email
    //
    // Mantemos os outros formatos como fallback.
    const customerEmail = String(
      body?.customer?.email ||
        body.email ||
        body.client_email ||
        ""
    )
      .trim()
      .toLowerCase();

    // Payload real da Perfect Pay:
    // sale_status_enum
    //
    // Mantemos status/sale_status para compatibilidade.
    const saleStatus = String(
      body.sale_status_enum ??
        body.status ??
        body.sale_status ??
        ""
    )
      .trim()
      .toLowerCase();

    console.log(
      `[Perfect Pay] Email: ${customerEmail} | Status: ${saleStatus}`
    );

    if (!customerEmail) {
      return NextResponse.json(
        { error: "E-mail não enviado pela Perfect Pay" },
        { status: 400 }
      );
    }

    // =====================================================
    // 3. LOCALIZAR USUÁRIO NO SUPABASE AUTH
    // =====================================================

    const {
      data: { users },
      error: usersError,
    } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (usersError) {
      throw usersError;
    }

    const authUser = users.find(
      (user) =>
        user.email?.trim().toLowerCase() === customerEmail
    );

    // Comprou, mas ainda não criou conta no PACE
    if (!authUser) {
      console.log(
        `[Perfect Pay] Usuário ainda não cadastrado: ${customerEmail}`
      );

      return NextResponse.json(
        {
          received: true,
          userFound: false,
          message:
            "Compra recebida, mas usuário ainda não possui conta no PACE.",
        },
        { status: 200 }
      );
    }

    // =====================================================
    // 4. PAGAMENTO APROVADO
    // =====================================================

    if (
      saleStatus === "2" ||
      saleStatus === "approved" ||
      saleStatus === "aprovado"
    ) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update({
          status_assinatura: "ativo",
        })
        .eq("user_id", authUser.id)
        .select("id, user_id, status_assinatura");

      if (error) {
        throw error;
      }

      console.log(
        `[Perfect Pay] ${customerEmail} ATIVADO. Perfis atualizados: ${
          data?.length ?? 0
        }`
      );

      return NextResponse.json(
        {
          received: true,
          userFound: true,
          subscriptionStatus: "ativo",
          updatedProfiles: data?.length ?? 0,
        },
        { status: 200 }
      );
    }

    // =====================================================
    // 5. REEMBOLSO / CHARGEBACK
    // =====================================================

    if (
      [
        "7",
        "9",
        "refunded",
        "devolvido",
        "chargeback",
        "charged_back",
      ].includes(saleStatus)
    ) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update({
          status_assinatura: "inativo",
        })
        .eq("user_id", authUser.id)
        .select("id, user_id, status_assinatura");

      if (error) {
        throw error;
      }

      console.log(
        `[Perfect Pay] ${customerEmail} BLOQUEADO. Perfis atualizados: ${
          data?.length ?? 0
        }`
      );

      return NextResponse.json(
        {
          received: true,
          userFound: true,
          subscriptionStatus: "inativo",
          updatedProfiles: data?.length ?? 0,
        },
        { status: 200 }
      );
    }

    // =====================================================
    // 6. OUTROS EVENTOS
    // =====================================================

    console.log(
      `[Perfect Pay] Status ${saleStatus} recebido sem alteração da assinatura.`
    );

    return NextResponse.json(
      {
        received: true,
        userFound: true,
        subscriptionChanged: false,
        saleStatus,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Perfect Pay] Erro no webhook:", error);

    return NextResponse.json(
      {
        error: error?.message || "Erro interno no webhook",
      },
      { status: 500 }
    );
  }
}