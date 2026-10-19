import { NextResponse } from "next/server";
import { AccessError, requireActiveSubscription } from "@/lib/auth/require-active-subscription";
import { generateMealPlanForUser } from "@/lib/nutrition/meal-generation/server";

export async function POST() {
  try {
    const { supabase, user } = await requireActiveSubscription();
    const result = await generateMealPlanForUser(supabase, user.id);
    const status = result.status === "ACTIVE" ? 200 : result.status === "CATALOG_NOT_READY" ? 503 : 409;
    return NextResponse.json({ status: result.status, repaired: result.repaired,
      ...(result.status === "ACTIVE" ? { planId: result.planId, reused: result.reused } : { issues: result.report.issues.map((issue) => issue.code) }) },
    { status, headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    console.error("meal_plan_generation_failed");
    return NextResponse.json({ error: "MEAL_PLAN_GENERATION_FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
