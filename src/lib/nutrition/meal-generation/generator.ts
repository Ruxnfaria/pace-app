import { assessTrustedNutritionCatalog } from "../food-catalog/capabilities";
import { resolveMealPlanGenerationEligibility } from "../food-catalog/eligibility";
import { PRAXE_TACO_CATALOG_VERSION, TACO_SOURCE_VERSION } from "../food-catalog/taco/constants";
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
import { MEAL_VALIDATION_POLICY } from "./policy";
import type { NutritionFoodCatalogRepository } from "./repository";
import { validateMealPlanCandidate } from "./validator";
import { buildRealMealTemplateSlots, buildTemplateConstrainedCandidates } from "./real-meal-templates/catalog";
import { validateRealMealTemplates } from "./real-meal-templates/validator";
import { resolveDailyMealBlueprint } from "./daily-blueprint/resolver";

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
    plan: null, preferenceScore: 0, diagnostics: null, coherence: null, issues: [{ code, severity: "HARD_FAILURE", message }] };
}

function repairCatalog(catalog: MealPlanCatalogPromptContext): MealPlanCatalogPromptContext {
  return catalog;
}

function cloneCandidate(candidate: AiMealPlanCandidate): AiMealPlanCandidate {
  return {
    meals: candidate.meals.map((meal) => ({
      ...meal,
      items: meal.items.map((item) => ({ ...item })),
    })),
  };
}

function tryCatalogConstrainedFatAnchorRepair(
  context: MealPlanGenerationContext,
  candidate: AiMealPlanCandidate,
  report: MealPlanValidationReport,
  catalog: CatalogSnapshot,
  prompt: MealPlanCatalogPromptContext,
): { candidate: AiMealPlanCandidate; report: MealPlanValidationReport } | null {
  const hardFailures = report.issues.filter((issue) => issue.severity === "HARD_FAILURE");
  const fatMinimum = context.target.fatG * (1 - MEAL_VALIDATION_POLICY.daily.fat.toleranceRatio);
  if (hardFailures.length !== 1 || hardFailures[0].code !== "FAT_OUT_OF_RANGE"
    || !report.diagnostics || report.diagnostics.actualFatG >= fatMinimum) return null;

  const offeredIds = new Set(prompt.candidates.map((value) => value.catalogEntryId));
  for (let mealIndex = 0; mealIndex < candidate.meals.length; mealIndex += 1) {
    const meal = candidate.meals[mealIndex];
    const option = prompt.templateSlots[mealIndex]?.options.find((value) =>
      value.templateId === meal.templateId && value.variantId === meal.variantId);
    if (!option) continue;
    const optionalIds = new Set(option.components.filter((value) => !value.required).map((value) => value.componentId));
    const selectedOptionalCount = meal.items.filter((item) => optionalIds.has(item.componentId)).length;
    if (selectedOptionalCount >= option.maximumOptionalComponents) continue;
    const missingFatComponents = option.components.filter((component) => !component.required
      && component.slot === "FAT_ANCHOR"
      && !meal.items.some((item) => item.componentId === component.componentId));
    for (const component of missingFatComponents) {
      for (const catalogEntryId of component.catalogEntryIds.filter((id) => offeredIds.has(id))) {
        const repaired = cloneCandidate(candidate);
        repaired.meals[mealIndex].items.push({
          componentId: component.componentId,
          slot: component.slot,
          catalogEntryId,
          quantityGrams: Math.round((component.minimumGrams + component.maximumGrams) / 2),
          ...(component.preparationNote ? { preparationNote: component.preparationNote } : {}),
        });
        const calibration = calibrateMealPlanPortions(context, repaired, catalog, prompt.candidates);
        let repairedReport = validateMealPlanCandidate(
          context, calibration.candidate, catalog, prompt.candidates, prompt.templateSlots,
        );
        if (repairedReport.diagnostics && calibration.diagnostics.feedback) {
          repairedReport = { ...repairedReport, diagnostics: {
            ...repairedReport.diagnostics,
            portionCalibration: calibration.diagnostics.feedback,
          } };
        }
        if (repairedReport.valid) return { candidate: calibration.candidate, report: repairedReport };
      }
    }
  }
  return null;
}

function hasValidRepairStructure(
  context: MealPlanGenerationContext,
  previous: AiMealPlanCandidate,
  repaired: AiMealPlanCandidate,
  catalog: MealPlanCatalogPromptContext,
): boolean {
  const byId = new Map(catalog.candidates.map((candidate) => [candidate.catalogEntryId, candidate]));
  return repaired.meals.length === previous.meals.length
    && validateRealMealTemplates(context, repaired, catalog.templateSlots).valid
    && repaired.meals.every((meal, mealIndex) => meal.role === context.mealRoles[mealIndex]
      && meal.items.every((item) => byId.get(item.catalogEntryId)?.pools.includes(item.slot) ?? false));
}

export function buildMealPlanPromptContext(context: MealPlanGenerationContext, catalog: CatalogSnapshot): MealPlanCatalogPromptContext {
  const status = assessTrustedNutritionCatalog(catalog.entries);
  const templateSlots = buildRealMealTemplateSlots(context, catalog);
  const candidates = buildTemplateConstrainedCandidates(context, catalog, templateSlots);
  const candidateById = new Map(candidates.map((candidate) => [candidate.catalogEntryId, candidate]));
  return {
    dailyBlueprint: resolveDailyMealBlueprint(context),
    readiness: catalog.readiness,
    authority: { source: "TACO", sourceVersion: TACO_SOURCE_VERSION, catalogVersion: PRAXE_TACO_CATALOG_VERSION },
    capabilities: {
      catalogEntryIdSelectionOnly: true,
      supportedQuantityUnit: "g",
      restrictionMetadataComplete: status.restrictionMetadataComplete,
      dietaryPatternMetadataComplete: status.restrictionMetadataComplete,
    },
    candidates,
    templateSlots,
    mealSlots: templateSlots.map((slot) => ({
      position: slot.position, role: slot.role,
      archetypeId: slot.options.map((option) => option.templateId).join("|"),
      fuelLevel: "MODERATE",
      slots: [...new Map(slot.options.flatMap((option) => option.components).map((component) => [component.slot, component])).values()]
        .map((component) => ({
          pool: component.slot,
          required: slot.options.every((option) => option.components.some((value) => value.slot === component.slot && value.required)),
          catalogEntryIds: [...new Set(slot.options.flatMap((option) => option.components
            .filter((value) => value.slot === component.slot).flatMap((value) => value.catalogEntryIds)))]
            .filter((id) => candidateById.has(id)),
          minimumGrams: component.minimumGrams, maximumGrams: component.maximumGrams,
        })),
    })),
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
  const constrainedCatalog = buildMealPlanPromptContext(generationContext, catalog);
  if (constrainedCatalog.templateSlots.some((meal) => meal.options.length === 0)) {
    return { status: "CATALOG_NOT_READY", repaired: false, report: rejected("CATALOG_NOT_READY", "No complete real-meal template is available for a prescribed meal role") };
  }
  await args.jobRepository?.begin(args.context, idempotencyKey);
  try {
    const candidate = await args.candidateGenerator.generate(generationContext, constrainedCatalog);
    const initialCalibration = calibrateMealPlanPortions(
      generationContext, candidate, catalog, constrainedCatalog.candidates,
    );
    let calibratedCandidate = initialCalibration.candidate;
    let report = validateMealPlanCandidate(generationContext, calibratedCandidate, catalog, constrainedCatalog.candidates,
      constrainedCatalog.templateSlots);
    if (report.diagnostics && initialCalibration.diagnostics.feedback) {
      report = { ...report, diagnostics: { ...report.diagnostics, portionCalibration: initialCalibration.diagnostics.feedback } };
    }
    let repaired = false;
    if (!report.valid) {
      const constrainedFatRepair = tryCatalogConstrainedFatAnchorRepair(
        generationContext, calibratedCandidate, report, catalog, constrainedCatalog,
      );
      if (constrainedFatRepair) {
        repaired = true;
        calibratedCandidate = constrainedFatRepair.candidate;
        report = constrainedFatRepair.report;
      }
    }
    if (!report.valid) {
      repaired = true;
      const constrainedRepairCatalog = repairCatalog(constrainedCatalog);
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
      report = validateMealPlanCandidate(generationContext, calibratedCandidate, catalog, constrainedRepairCatalog.candidates,
        constrainedRepairCatalog.templateSlots);
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
