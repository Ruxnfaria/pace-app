export class MealPlanGenerationBlockedError extends Error {
  readonly code: 'TARGET_REQUIRES_REVIEW';

  constructor() {
    super('TARGET_REQUIRES_REVIEW');
    this.name = 'MealPlanGenerationBlockedError';
    this.code = 'TARGET_REQUIRES_REVIEW';
  }
}

export function assertMealPlanTargetIsActive(
  target: { status?: unknown } | null,
): asserts target is { status: 'active' } {
  if (target?.status === 'requires_review') throw new MealPlanGenerationBlockedError();
  if (target?.status !== 'active') throw new Error('MEAL_CONTEXT_INCOMPLETE');
}
