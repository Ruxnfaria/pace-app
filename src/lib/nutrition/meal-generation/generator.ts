import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import { resolveMealPlanGenerationEligibility } from "../food-catalog/eligibility";
import { normalizeFoodQuery } from "../food-catalog/normalization";
import { PRAXE_TACO_CATALOG_VERSION, TACO_SOURCE_VERSION } from "../food-catalog/taco/constants";
import {
  MEAL_PLAN_GENERATOR_VERSION,
  MEAL_PLAN_VALIDATOR_VERSION,
  MEAL_VALIDATION_POLICY_VERSION,
  type AiMealPlanCandidate,
  type CatalogSnapshot,
  type MealPlanGenerationContext,
  type MealPlanCatalogPromptContext,
  type MealPlanValidationIssue,
  type MealPlanValidationReport,
  type ResolvedMealPlan,
} from "./domain";
import type { NutritionFoodCatalogRepository } from "./repository";
import { validateMealPlanCandidate } from "./validator";
import type { NutritionFoodCatalogEntry } from "../food-catalog/domain";

export interface MealPlanCandidateGenerator {
  generate(context: MealPlanGenerationContext, catalog: MealPlanCatalogPromptContext): Promise<AiMealPlanCandidate>;
  repair(context: MealPlanGenerationContext, previous: AiMealPlanCandidate, issues: MealPlanValidationIssue[], catalogFeedback: string[]): Promise<AiMealPlanCandidate>;
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
    plan: null, preferenceScore: 0, issues: [{ code, severity: "HARD_FAILURE", message }] };
}

export function isMealPlanGenerationCandidate(entry: NutritionFoodCatalogEntry): boolean {
  return entry.isActive
    && entry.source === "TACO"
    && entry.nutrientCompleteness === "COMPLETE"
    && Object.values(entry.nutrientsPer100g).every((value) => typeof value === "number" && Number.isFinite(value));
}

function catalogPromptContext(catalog: CatalogSnapshot): MealPlanCatalogPromptContext {
  const status = assessTrustedNutritionCatalog(catalog.entries);
  return {
    readiness: catalog.readiness,
    authority: { source: "TACO", sourceVersion: TACO_SOURCE_VERSION, catalogVersion: PRAXE_TACO_CATALOG_VERSION },
    capabilities: {
      exactOrAliasResolutionOnly: true,
      supportedQuantityUnits: ["g", "kg", "ml", "known_portion"],
      restrictionMetadataComplete: status.restrictionMetadataComplete,
      dietaryPatternMetadataComplete: status.restrictionMetadataComplete,
    },
    allowedCatalogNames: catalog.entries.filter(isMealPlanGenerationCandidate)
      .slice(0, 120).map((entry) => entry.canonicalName),
  };
}

function repairFeedback(catalog: CatalogSnapshot, issues: MealPlanValidationIssue[]): string[] {
  const unknowns = issues.filter((value) => value.code === "UNKNOWN_FOOD").flatMap((value) => {
    const query = normalizeFoodQuery(value.message.replace(/^Unknown food:\s*/i, ""));
    const tokens = new Set(query.split(" ").filter((token) => token.length > 2));
    if (tokens.size === 0) return [];
    return catalog.entries.filter((entry) => isMealPlanGenerationCandidate(entry)
      && [...tokens].some((token) => entry.normalizedName.includes(token)))
      .slice(0, 3).map((entry) => entry.canonicalName);
  });
  return [...new Set(unknowns)].slice(0, 8);
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
  await args.jobRepository?.begin(args.context, idempotencyKey);
  try {
    const candidate = await args.candidateGenerator.generate(generationContext, catalogPromptContext(catalog));
    let report = validateMealPlanCandidate(generationContext, candidate, catalog);
    let repaired = false;
    if (!report.valid) {
      repaired = true;
      const repairedCandidate = await args.candidateGenerator.repair(generationContext, candidate, report.issues, repairFeedback(catalog, report.issues));
      report = validateMealPlanCandidate(generationContext, repairedCandidate, catalog);
    }
    if (!report.valid || !report.plan) {
      await args.jobRepository?.finish(idempotencyKey, "requires_review", report.issues.find((value) => value.severity === "HARD_FAILURE")?.code ?? "VALIDATION_FAILED");
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
