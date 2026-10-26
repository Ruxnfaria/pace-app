import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import { resolveMealPlanGenerationEligibility } from "../food-catalog/eligibility";
import { PRAXE_TACO_CATALOG_VERSION, TACO_SOURCE_VERSION } from "../food-catalog/taco/constants";
import { buildMealPlanCandidateSet, buildMealPlanMealSlots } from "./candidate-set";
import {
  MEAL_PLAN_GENERATOR_VERSION,
  MEAL_PLAN_VALIDATOR_VERSION,
  MEAL_VALIDATION_POLICY_VERSION,
  type AiMealPlanCandidate,
  type CatalogSnapshot,
  type MealPlanGenerationContext,
  type MealPlanCatalogPromptContext,
  type MealPlanNumericValidationDiagnostics,
  type MealPlanValidationIssue,
  type MealPlanValidationReport,
  type ResolvedMealPlan,
} from "./domain";
import { calibrateMealPlanPortions } from "./portion-calibration";
import type { NutritionFoodCatalogRepository } from "./repository";
import { validateMealPlanCandidate } from "./validator";

export interface MealPlanCandidateGenerator {
  generate(context: MealPlanGenerationContext, catalog: MealPlanCatalogPromptContext): Promise<AiMealPlanCandidate>;
  repair(context: MealPlanGenerationContext, previous: AiMealPlanCandidate, issues: MealPlanValidationIssue[],
    diagnostics: MealPlanNumericValidationDiagnostics | null,
    catalog: MealPlanCatalogPromptContext): Promise<AiMealPlanCandidate>;
}

export interface MealPlanActivationRepository {
  activate(plan: ResolvedMealPlan, context: MealPlanGenerationContext, idempotencyKey: string): Promise<{ planId: string; reused: boolean }>;
}

export interface MealPlanJobRepository {
  begin(context: MealPlanGenerationContext, idempotencyKey: string): Promise<void>;
  finish(idempotencyKey: string, status: "failed_retryable" | "requires_review", safeErrorCode: string): Promise<void>;
}

export type MealPlanGenerationResult =
  | { status: "ACTIVE"; plan: ResolvedMealPlan; planId: string; repaired: boolean; reused: boolean; report: MealPlanValidationReport }
  | { status: "REQUIRES_REVIEW" | "CATALOG_NOT_READY" | "USER_NOT_ELIGIBLE"; repaired: boolean; report: MealPlanValidationReport };

export function buildMealPlanGenerationIdempotencyKey(context: MealPlanGenerationContext): string {
  return ["meal-plan", context.userId, context.targetSnapshotId, context.strategyVersion, MEAL_PLAN_GENERATOR_VERSION].map((value) => value.toLowerCase()).join(":");
}

function rejected(code: "CATALOG_NOT_READY" | "USER_NOT_ELIGIBLE", message: string): MealPlanValidationReport {
  return { valid: false, validatorVersion: MEAL_PLAN_VALIDATOR_VERSION, policyVersion: MEAL_VALIDATION_POLICY_VERSION,
    plan: null, preferenceScore: 0, diagnostics: null, issues: [{ code, severity: "HARD_FAILURE", message }] };
}

function repairCatalog(
  catalog: MealPlanCatalogPromptContext,
  candidate: AiMealPlanCandidate,
): MealPlanCatalogPromptContext {
  const usedPools = new Set(candidate.meals.flatMap((meal) => meal.items.map((item) => item.slot)));
  return {
    ...catalog,
    candidates: catalog.candidates.filter((candidateItem) => candidateItem.pools.some((pool) => usedPools.has(pool))),
    mealSlots: catalog.mealSlots.map((meal) => ({
      ...meal,
      slots: meal.slots
        .filter((slot) => usedPools.has(slot.pool))
        .map((slot) => ({ ...slot, catalogEntryIds: slot.catalogEntryIds.filter((id) =>
          catalog.candidates.some((candidateItem) => candidateItem.catalogEntryId === id
            && candidateItem.pools.includes(slot.pool))) })),
    })),
  };
}

function hasValidRepairStructure(
  context: MealPlanGenerationContext,
  previous: AiMealPlanCandidate,
  repaired: AiMealPlanCandidate,
  catalog: MealPlanCatalogPromptContext,
): boolean {
  const byId = new Map(catalog.candidates.map((candidate) => [candidate.catalogEntryId, candidate]));
  return repaired.meals.length === previous.meals.length
    && repaired.meals.every((meal, mealIndex) => {
      const previousMeal = previous.meals[mealIndex];
      return meal.role === context.mealRoles[mealIndex]
        && meal.items.length === previousMeal.items.length
        && meal.items.every((item, itemIndex) => {
          const previousItem = previousMeal.items[itemIndex];
          return item.slot === previousItem.slot
            && (byId.get(item.catalogEntryId)?.pools.includes(item.slot) ?? false);
        });
    });
}

function catalogPromptContext(context: MealPlanGenerationContext, catalog: CatalogSnapshot): MealPlanCatalogPromptContext {
  const status = assessTrustedNutritionCatalog(catalog.entries);
  const candidates = buildMealPlanCandidateSet(context, catalog);
  return {
    readiness: catalog.readiness,
    authority: { source: "TACO", sourceVersion: TACO_SOURCE_VERSION, catalogVersion: PRAXE_TACO_CATALOG_VERSION },
    capabilities: {
      catalogEntryIdSelectionOnly: true,
      supportedQuantityUnit: "g",
      restrictionMetadataComplete: status.restrictionMetadataComplete,
      dietaryPatternMetadataComplete: status.restrictionMetadataComplete,
    },
    candidates,
    mealSlots: buildMealPlanMealSlots(context, candidates),
  };
}

export async function generateValidatedMealPlan(args: {
  context: MealPlanGenerationContext;
  catalogRepository: NutritionFoodCatalogRepository;
  candidateGenerator: MealPlanCandidateGenerator;
  activationRepository?: MealPlanActivationRepository;
  jobRepository?: MealPlanJobRepository;
}): Promise<MealPlanGenerationResult> {
  const catalog = await args.catalogRepository.loadSnapshot();
  if (catalog.readiness !== "CATALOG_BASE_NUTRITION_READY" && catalog.readiness !== "CATALOG_RESTRICTION_SAFE") {
    return { status: "CATALOG_NOT_READY", repaired: false, report: rejected("CATALOG_NOT_READY", "Authoritative catalog is not ready") };
  }
  const status = assessTrustedNutritionCatalog(catalog.entries);
  const eligibility = resolveMealPlanGenerationEligibility({
    isAdult: true, hasCriticalAllergy: args.context.allergenRestrictions.length > 0,
    hasFoodRestriction: args.context.hasFoodRestriction, dietaryPattern: args.context.dietaryPattern,
    restrictionSafetyKnown: args.context.restrictionSafetyKnown,
  }, status);
  if (eligibility.status !== "ELIGIBLE") {
    return { status: "USER_NOT_ELIGIBLE", repaired: false, report: rejected("USER_NOT_ELIGIBLE", eligibility.reasons.join(",")) };
  }
  const idempotencyKey = buildMealPlanGenerationIdempotencyKey(args.context);
  const generationContext = { ...args.context, catalogReadiness: catalog.readiness };
  const constrainedCatalog = catalogPromptContext(generationContext, catalog);
  if (constrainedCatalog.mealSlots.some((meal) => meal.slots.some((slot) => slot.required && slot.catalogEntryIds.length === 0))) {
    return { status: "CATALOG_NOT_READY", repaired: false, report: rejected("CATALOG_NOT_READY", "Required meal-plan food pool is unavailable") };
  }
  await args.jobRepository?.begin(args.context, idempotencyKey);
  try {
    const candidate = await args.candidateGenerator.generate(generationContext, constrainedCatalog);
    const initialCalibration = calibrateMealPlanPortions(
      generationContext, candidate, catalog, constrainedCatalog.candidates,
    );
    let calibratedCandidate = initialCalibration.candidate;
    let report = validateMealPlanCandidate(generationContext, calibratedCandidate, catalog, constrainedCatalog.candidates);
    if (report.diagnostics && initialCalibration.diagnostics.feedback) {
      report = { ...report, diagnostics: { ...report.diagnostics, portionCalibration: initialCalibration.diagnostics.feedback } };
    }
    let repaired = false;
    if (!report.valid) {
      repaired = true;
      const constrainedRepairCatalog = repairCatalog(constrainedCatalog, calibratedCandidate);
      const proposedRepair = await args.candidateGenerator.repair(
        generationContext, calibratedCandidate, report.issues, report.diagnostics, constrainedRepairCatalog,
      );
      const repairedCandidate = hasValidRepairStructure(generationContext, calibratedCandidate, proposedRepair, constrainedRepairCatalog)
        ? proposedRepair
        : calibratedCandidate;
      const repairedCalibration = calibrateMealPlanPortions(
        generationContext, repairedCandidate, catalog, constrainedRepairCatalog.candidates,
      );
      calibratedCandidate = repairedCalibration.candidate;
      report = validateMealPlanCandidate(generationContext, calibratedCandidate, catalog, constrainedRepairCatalog.candidates);
      if (report.diagnostics && repairedCalibration.diagnostics.feedback) {
        report = { ...report, diagnostics: { ...report.diagnostics, portionCalibration: repairedCalibration.diagnostics.feedback } };
      }
    }
    if (!report.valid || !report.plan) {
      await args.jobRepository?.finish(idempotencyKey, "failed_retryable", report.issues.find((value) => value.severity === "HARD_FAILURE")?.code ?? "VALIDATION_FAILED");
      return { status: "REQUIRES_REVIEW", repaired, report };
    }
    if (!args.activationRepository) return { status: "ACTIVE", plan: report.plan, planId: "not-persisted", repaired, reused: false, report };
    const activation = await args.activationRepository.activate(report.plan, args.context, idempotencyKey);
    return { status: "ACTIVE", plan: report.plan, repaired, report, ...activation };
  } catch (error) {
    await args.jobRepository?.finish(idempotencyKey, "failed_retryable", "GENERATION_FAILED");
    throw error;
  }
}
