import type { SupabaseClient } from "@supabase/supabase-js";

export type ActiveNutritionTarget = {
  version: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
};

type NutritionTargetRow = {
  version: unknown;
  calories: unknown;
  protein_g: unknown;
  carbs_g: unknown;
  fat_g: unknown;
  fiber_g: unknown;
};

function positiveNumber(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid active nutrition target field: ${field}`);
  }
  return parsed;
}

export function parseActiveNutritionTarget(row: NutritionTargetRow | null): ActiveNutritionTarget | null {
  if (!row) return null;
  return {
    version: positiveNumber(row.version, "version"),
    calories: positiveNumber(row.calories, "calories"),
    proteinG: positiveNumber(row.protein_g, "protein_g"),
    carbsG: positiveNumber(row.carbs_g, "carbs_g"),
    fatG: positiveNumber(row.fat_g, "fat_g"),
    fiberG: positiveNumber(row.fiber_g, "fiber_g"),
  };
}

export async function loadActiveNutritionTarget(client: SupabaseClient, userId: string): Promise<ActiveNutritionTarget | null> {
  const { data, error } = await client
    .from("nutrition_target_snapshots")
    .select("version,calories,protein_g,carbs_g,fat_g,fiber_g")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return parseActiveNutritionTarget(data);
}

export function formatNutritionTarget(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}
