import type { CompleteOnboardingV2Payload } from '@/app/onboarding/lib/onboarding-v2-types';
import { calculateNutritionTarget, type NutritionTargetCalculation } from './target-calculator.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AtomicNutritionOnboardingRpcArgs {
  p_user_id: string;
  p_payload: CompleteOnboardingV2Payload;
  p_target: NutritionTargetCalculation;
  p_effective_date: string;
}

export function buildOnboardingNutritionTarget(
  payload: CompleteOnboardingV2Payload,
  effectiveDate: string,
): NutritionTargetCalculation {
  return calculateNutritionTarget({
    effectiveDate,
    birthDate: payload.health.birth_date,
    weightKg: payload.health.weight_kg,
    heightCm: payload.health.height_cm,
    biologicalSex: payload.health.biological_sex,
    activityLevel: payload.health.activity_level,
    goal: payload.health.primary_goal,
    // Schema 4/5 does not collect these clinical states. The calculator routes
    // a female metabolic basis to review until both are explicitly known.
    pregnant: undefined,
    lactating: undefined,
    requiresClinicalReview: false,
  });
}

export function buildAtomicNutritionOnboardingRpcArgs(
  userId: string,
  payload: CompleteOnboardingV2Payload,
  effectiveDate: string,
): AtomicNutritionOnboardingRpcArgs {
  if (!UUID_PATTERN.test(userId)) throw new Error('Authenticated user id must be a UUID.');
  if (!UUID_PATTERN.test(payload.idempotency_key)) {
    throw new Error('Onboarding idempotency key must be a UUID.');
  }

  return {
    p_user_id: userId,
    p_payload: payload,
    p_target: buildOnboardingNutritionTarget(payload, effectiveDate),
    p_effective_date: effectiveDate,
  };
}
