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
  if (!catalog.recipeSlots || catalog.recipeSlots.some((slot) => slot.options.length === 0)) {
    throw new Error("CULINARY_RECIPE_SLOTS_REQUIRED");
  }
  const mealSchemas = catalog.recipeSlots.map((mealSlot) => ({
    anyOf: mealSlot.options.map((option) => {
      const requiredComponentCount = option.components.filter((component) => component.required).length;
      const optionalComponentCount = option.components.length - requiredComponentCount;
      const allowedOptionalComponentCount = Math.min(option.maximumOptionalComponents, optionalComponentCount);
      const maximumComponentCount = requiredComponentCount + allowedOptionalComponentCount;
      return {
      type: "object" as const,
      additionalProperties: false,
      required: ["role", "templateId", "variantId", "recipeId", "recipeVersion", "recipeFamilyId",
        "recipeVariantId", "label", "components"],
      properties: {
        role: { type: "string" as const, const: mealSlot.role },
        templateId: { type: "string" as const, const: option.templateId },
        variantId: { type: "string" as const, const: option.templateVariantId },
        recipeId: { type: "string" as const, const: option.recipeId },
        recipeVersion: { type: "string" as const, const: option.recipeVersion },
        recipeFamilyId: { type: "string" as const, const: option.recipeFamilyId },
        recipeVariantId: { type: "string" as const, const: option.recipeVariantId },
        label: { type: "string" as const, const: option.recipeDisplayName },
        components: {
          type: "array" as const,
          minItems: requiredComponentCount,
          maxItems: maximumComponentCount,
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
      };
    }),
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
  return "Você escolhe somente uma recipeId/recipeVersion/recipeFamilyId/recipeVariantId explicitamente oferecida pelo servidor para o RealMealTemplate e MealIntent já definidos. Inclua todos os ingredientes required da receita. Ingredientes opcionais são realmente opcionais: respeite maximumOptionalComponents e não inclua um opcional apenas para preencher macronutrientes. Use somente componentId e catalogEntryId presentes na receita escolhida. Não altere blueprint, MealIntent, papel ou template; não componha refeições do zero, não use pools globais, não crie receita, ingrediente ou ID, não substitua componentes por equivalência de macronutrientes e não use um alimento em dois componentes. Ajuste somente quantityGrams dentro dos limites oferecidos. Prefira uma receita que alcance as metas sem proporções desumanizadas entre ingredientes nem gordura culinária usada como compensador. Entre opções igualmente seguras e numericamente viáveis, prefira famílias culinárias, proteínas, frutas e fontes de carboidratos diferentes ao longo do dia; repetição continua permitida quando as opções autorizadas forem limitadas. Não calcule nutrientes. Um repair pode escolher outra receita, mas somente dentre as opções server-defined recebidas. Retorne somente o JSON do schema.";
}

function parseCandidate(content: string, catalog: MealPlanCatalogPromptContext): AiMealPlanCandidate {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== "object" || !Array.isArray((value as { meals?: unknown }).meals)) throw new Error("INVALID_AI_MEAL_PLAN_OUTPUT");
  const meals = (value as { meals: Array<{ role: AiMealPlanCandidate["meals"][number]["role"]; templateId: string;
    variantId: string; recipeId: string; recipeVersion: string; recipeFamilyId: string; recipeVariantId: string;
    label: string; components: Array<{ componentId: string; catalogEntryId: string;
      quantityGrams: number; preparationNote?: string | null }> }> }).meals;
  return { meals: meals.map((meal, index) => {
    const option = catalog.recipeSlots[index]?.options.find((candidate) =>
      candidate.templateId === meal.templateId && candidate.templateVariantId === meal.variantId
      && candidate.recipeId === meal.recipeId && candidate.recipeVersion === meal.recipeVersion
      && candidate.recipeFamilyId === meal.recipeFamilyId && candidate.recipeVariantId === meal.recipeVariantId);
    if (!option) throw new Error("INVALID_AI_RECIPE_SELECTION");
    return {
      role: meal.role, templateId: meal.templateId, variantId: meal.variantId,
      recipeId: meal.recipeId, recipeVersion: meal.recipeVersion, recipeFamilyId: meal.recipeFamilyId,
      recipeVariantId: meal.recipeVariantId, label: meal.label,
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
