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

    if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      const formData = await req.formData();

      formData.forEach((value, key) => {
        body[key] = value;
      });
    }

    // Formato oficial do webhook da Perfect Pay
    const customerEmail =
      body?.customer?.email ||
      body?.email ||
      body?.client_email;

    const saleStatus = Number(
      body?.sale_status_enum ??
      body?.sale_status ??
      body?.status
    );

    const saleCode = body?.code || null;
    const productCode = body?.product?.code || null;

    console.log(
      `[Perfect Pay] Venda: ${saleCode} | Cliente: ${customerEmail} | Status: ${saleStatus}`
    );

    if (!customerEmail) {
      return NextResponse.json(
        { error: "E-mail do cliente não encontrado" },
        { status: 400 }
      );
    }

    // 2 = approved
    if (saleStatus === 2) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update({
          status_assinatura: "ativo",
        })
        .eq("email", customerEmail)
        .select("id");

      if (error) {
        throw error;
      }

      console.log(
        `[Perfect Pay] Usuário ${customerEmail} ativado. Perfis atualizados: ${data?.length ?? 0}`
      );
    }

    // 6 = cancelled
    // 7 = refunded
    // 9 = charged_back
    else if ([6, 7, 9].includes(saleStatus)) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          status_assinatura: "inativo",
        })
        .eq("email", customerEmail);

      if (error) {
        throw error;
      }

      console.log(
        `[Perfect Pay] Usuário ${customerEmail} desativado.`
      );
    }

    return NextResponse.json(
      {
        received: true,
        saleCode,
        productCode,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error(
      "[Perfect Pay] Erro no webhook:",
      error
    );

    return NextResponse.json(
      {
        error: error?.message || "Erro interno",
      },
      { status: 500 }
    );
  }
}