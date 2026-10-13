import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (
    typeof body !== "object"
    || body === null
    || Array.isArray(body)
    || !("chestId" in body)
    || typeof body.chestId !== "string"
    || !UUID_PATTERN.test(body.chestId)
  ) {
    return NextResponse.json(
      { error: "chestId deve ser um UUID válido" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("open_user_chest", {
    p_chest_id: body.chestId,
  });

  if (error) {
    const notFound = error.code === "P0002";
    return NextResponse.json(
      { error: notFound ? "Baú não encontrado" : "Não foi possível abrir o baú" },
      { status: notFound ? 404 : 409 },
    );
  }

  const reward = Array.isArray(data) ? data[0] : data;
  if (!reward) {
    return NextResponse.json(
      { error: "A abertura não retornou uma recompensa" },
      { status: 500 },
    );
  }

  const { data: wallet } = await supabase
    .from("user_wallets")
    .select("crystals")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    reward,
    walletCrystals:
      typeof wallet?.crystals === "number" ? wallet.crystals : null,
  });
}
