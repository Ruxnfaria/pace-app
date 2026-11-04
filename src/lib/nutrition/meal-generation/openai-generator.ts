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
  const mealSchemas = catalog.templateSlots.map((mealSlot) => ({
    anyOf: mealSlot.options.map((option) => ({
      type: "object" as const,
      additionalProperties: false,
      required: ["role", "templateId", "variantId", "label", "components"],
      properties: {
        role: { type: "string" as const, const: mealSlot.role },
        templateId: { type: "string" as const, const: option.templateId },
        variantId: { type: "string" as const, const: option.variantId },
        label: { type: "string" as const, const: option.displayName },
        components: {
          type: "array" as const,
          minItems: option.components.filter((component) => component.required).length,
          maxItems: option.components.length,
          items: { anyOf: option.components.map((component) => ({
            type: "object" as const,
            additionalProperties: false,
            required: ["componentId", "catalogEntryId", "quantityGrams", "preparationNote"],
            properties: {
              componentId: { type: "string" as const, const: component.componentId },
              catalogEntryId: { type: "string" as const, enum: component.catalogEntryIds },
              quantityGrams: { type: "number" as const, minimum: component.minimumGrams, maximum: component.maximumGrams },
              preparationNote: { type: ["string", "null"] as const },
            },
          })) },
        },
      },
    })),
  }));
  return {
  name: "praxe_real_meal_plan_candidate_v1",
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
  return "Você escolhe somente templateId e variantId de refeições reais oferecidos pelo servidor para o MealIntent já definido no Daily Blueprint. Preencha cada componentId com um catalogEntryId permitido naquele componente. Não altere MealIntent, exigência de refeição principal ou blueprint; não componha refeições do zero, não use pools globais, não crie IDs, não substitua componentes por equivalência de macronutrientes e não use um alimento em dois componentes. Ajuste somente quantityGrams dentro dos limites. Não calcule nutrientes nem altere ordem ou papéis. Retorne somente o JSON do schema.";
}

function parseCandidate(content: string, catalog: MealPlanCatalogPromptContext): AiMealPlanCandidate {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== "object" || !Array.isArray((value as { meals?: unknown }).meals)) throw new Error("INVALID_AI_MEAL_PLAN_OUTPUT");
  const meals = (value as { meals: Array<{ role: AiMealPlanCandidate["meals"][number]["role"]; templateId: string;
    variantId: string; label: string; components: Array<{ componentId: string; catalogEntryId: string;
      quantityGrams: number; preparationNote?: string | null }> }> }).meals;
  return { meals: meals.map((meal, index) => {
    const option = catalog.templateSlots[index]?.options.find((candidate) =>
      candidate.templateId === meal.templateId && candidate.variantId === meal.variantId);
    if (!option) throw new Error("INVALID_AI_MEAL_TEMPLATE_SELECTION");
    return {
      role: meal.role, templateId: meal.templateId, variantId: meal.variantId, label: meal.label,
      items: meal.components.map((item) => {
        const component = option.components.find((candidate) => candidate.componentId === item.componentId);
        if (!component) throw new Error("INVALID_AI_MEAL_COMPONENT");
        return { componentId: item.componentId, catalogEntryId: item.catalogEntryId, slot: component.slot,
          quantityGrams: item.quantityGrams, ...(item.preparationNote ? { preparationNote: item.preparationNote } : {}) };
      }),
    };
  }) };
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
    return parseCandidate(content, catalog);
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
