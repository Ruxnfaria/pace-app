import "server-only";
import type OpenAI from "openai";
import type {
  AiMealPlanCandidate,
  MealPlanCatalogPromptContext,
  MealPlanGenerationContext,
  MealPlanNumericValidationDiagnostics,
  MealPlanValidationIssue,
} from "./domain";
import type { MealPlanCandidateGenerator } from "./generator";

export function buildMealPlanResponseSchema(catalog: MealPlanCatalogPromptContext) {
  const mealSchemas = catalog.mealSlots.map((mealSlot) => ({
    type: "object" as const,
    additionalProperties: false,
    required: ["role", "label", "items"],
    properties: {
      role: { type: "string" as const, const: mealSlot.role },
      label: { type: "string" as const },
      items: {
        type: "array" as const,
        minItems: mealSlot.slots.filter((slot) => slot.required).length,
        maxItems: mealSlot.slots.filter((slot) => slot.catalogEntryIds.length > 0).length,
        items: { anyOf: mealSlot.slots.filter((slot) => slot.catalogEntryIds.length > 0).map((slot) => ({
          type: "object" as const,
          additionalProperties: false,
          required: ["catalogEntryId", "slot", "quantityGrams", "preparationNote"],
          properties: {
            catalogEntryId: { type: "string" as const, enum: slot.catalogEntryIds },
            slot: { type: "string" as const, const: slot.pool },
            quantityGrams: { type: "number" as const, minimum: slot.minimumGrams, maximum: slot.maximumGrams },
            preparationNote: { type: ["string", "null"] as const },
          },
        })) },
      },
    },
  }));
  return {
  name: "praxe_meal_plan_candidate_v1",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["meals"],
    properties: {
      meals: { type: "array", minItems: mealSchemas.length, maxItems: mealSchemas.length, items: { anyOf: mealSchemas } },
    },
  },
  } as const;
}

function safeContext(context: MealPlanGenerationContext) {
  return {
    goal: context.goal, target: context.target, mealCount: context.mealCount, mealRoles: context.mealRoles,
    mealWindows: context.mealWindows, mealMacroTargets: context.mealMacroTargets,
    catalogReadiness: context.catalogReadiness,
    dietaryPattern: context.dietaryPattern, allergenRestrictions: context.allergenRestrictions,
    hasFoodRestriction: context.hasFoodRestriction, restrictionSafetyKnown: context.restrictionSafetyKnown,
    preferredFoods: context.preferredFoods, dislikedFoods: context.dislikedFoods,
    preparationStyle: context.preparationStyle, budget: context.budget,
    routinePredictability: context.routinePredictability, mealBreakAvailability: context.mealBreakAvailability,
    trainingPeriod: context.trainingPeriod, supplements: context.supplements,
  };
}

function systemInstruction(): string {
  return "Você compõe refeições brasileiras reconhecíveis preenchendo os slots server-side específicos de cada refeição e arquétipo. Escolha somente catalogEntryId permitido para o pool daquele slot e posição. Respeite fuelLevel sem trocar qualidade alimentar: ajuste porções de carboidratos aprovados. Nunca crie IDs, use nomes como identidade, ingredientes culinários isolados, açúcares, doces ou pós como componente principal. Informe slot, quantityGrams e nota de preparo opcional. Não calcule nutrientes nem altere meta, quantidade, ordem, papéis, arquétipos ou slots. Retorne somente o JSON do schema.";
}

function parseCandidate(content: string): AiMealPlanCandidate {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== "object" || !Array.isArray((value as { meals?: unknown }).meals)) throw new Error("INVALID_AI_MEAL_PLAN_OUTPUT");
  return value as AiMealPlanCandidate;
}

export class OpenAiMealPlanCandidateGenerator implements MealPlanCandidateGenerator {
  constructor(private readonly client: OpenAI, private readonly model = "gpt-4o") {}

  private async invoke(payload: object, catalog: MealPlanCatalogPromptContext): Promise<AiMealPlanCandidate> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      messages: [{ role: "system", content: systemInstruction() }, { role: "user", content: JSON.stringify(payload) }],
      response_format: { type: "json_schema", json_schema: buildMealPlanResponseSchema(catalog) },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("EMPTY_AI_MEAL_PLAN_OUTPUT");
    return parseCandidate(content);
  }

  generate(context: MealPlanGenerationContext, catalog: MealPlanCatalogPromptContext): Promise<AiMealPlanCandidate> {
    return this.invoke({ task: "generate", context: safeContext(context), catalog }, catalog);
  }

  repair(context: MealPlanGenerationContext, previous: AiMealPlanCandidate, issues: MealPlanValidationIssue[],
    diagnostics: MealPlanNumericValidationDiagnostics | null,
    catalog: MealPlanCatalogPromptContext): Promise<AiMealPlanCandidate> {
    return this.invoke({ task: "repair_once", immutableContext: safeContext(context), previous,
      issueCodes: issues.filter((issue) => issue.severity === "HARD_FAILURE").map((issue) => issue.code),
      numericDiagnostics: diagnostics,
      catalog }, catalog);
  }
}
