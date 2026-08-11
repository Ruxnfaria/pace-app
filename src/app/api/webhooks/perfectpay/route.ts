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

    // Dados enviados pela Perfect Pay
    const customerEmail = String(
      body.email ||
      body.client_email ||
      ""
    )
      .trim()
      .toLowerCase();

    const saleStatus = String(
      body.status ||
      body.sale_status ||
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

    // Procura o comprador no Supabase Auth
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

    // O comprador ainda não criou conta no PACE
    if (!authUser) {
      console.log(
        `[Perfect Pay] Usuário ainda não cadastrado: ${customerEmail}`
      );

      return NextResponse.json(
        {
          received: true,
          userFound: false,
          message: "Compra recebida, mas usuário ainda não possui conta no PACE.",
        },
        { status: 200 }
      );
    }

    // PAGAMENTO APROVADO
    if (
      saleStatus === "approved" ||
      saleStatus === "aprovado" ||
      saleStatus === "2"
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
        `[Perfect Pay] ${customerEmail} ATIVADO. Perfis atualizados: ${data?.length ?? 0}`
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

    // REEMBOLSO / CHARGEBACK
    if (
      ["4", "5", "chargeback", "refunded", "devolvido"].includes(
        saleStatus
      )
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
        `[Perfect Pay] ${customerEmail} BLOQUEADO. Perfis atualizados: ${data?.length ?? 0}`
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

    // Outros eventos são recebidos, mas não alteram assinatura
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