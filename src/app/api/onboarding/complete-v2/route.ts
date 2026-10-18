import { NextResponse } from 'next/server';
import {
  assertOnboardingV2SubmissionPreflight,
  OnboardingV2PreflightError,
} from '@/app/onboarding/lib/onboarding-v2-contract';
import type { CompleteOnboardingV2Payload } from '@/app/onboarding/lib/onboarding-v2-types';
import { completeOnboardingWithNutritionTarget } from '@/lib/nutrition/target-writer-server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  let payload: CompleteOnboardingV2Payload;
  try {
    const submitted = await request.json() as CompleteOnboardingV2Payload;
    payload = {
      ...submitted,
      nutrition: {
        ...submitted.nutrition,
        // Keep older/future clients compatible while the schema-4/schema-5 RPC still expects the key.
        preferred_meals_per_day: submitted.nutrition?.preferred_meals_per_day ?? null,
      },
    };
    assertOnboardingV2SubmissionPreflight(payload);
  } catch (error) {
    const reasons = error instanceof OnboardingV2PreflightError ? error.reasons : undefined;
    return NextResponse.json(
      { error: 'Payload de onboarding inválido', reasons },
      { status: 400 },
    );
  }

  try {
    const result = await completeOnboardingWithNutritionTarget(user.id, payload);
    return NextResponse.json(result);
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
    console.error('[PRAXE] Atomic schema-4/schema-5 onboarding writer failed.', { code });
    return NextResponse.json(
      { error: 'Não foi possível concluir o onboarding.', code },
      { status: 409 },
    );
  }
}
