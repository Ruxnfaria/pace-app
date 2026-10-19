import "server-only";
import type OpenAI from "openai";
import type { AiMealPlanCandidate, MealPlanCatalogPromptContext, MealPlanGenerationContext, MealPlanValidationIssue } from "./domain";
import type { MealPlanCandidateGenerator } from "./generator";

const RESPONSE_SCHEMA = {
  name: "praxe_meal_plan_candidate_v1",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["meals"],
    properties: {
      meals: { type: "array", items: { type: "object", additionalProperties: false, required: ["role", "label", "items"], properties: {
        role: { type: "string", enum: ["BREAKFAST", "MAIN_MEAL", "PRE_WORKOUT", "POST_WORKOUT", "SNACK", "EVENING_MEAL"] },
        label: { type: "string" },
        items: {
          type: "array", minItems: 1,
          items: {
            type: "object", additionalProperties: false,
            required: ["foodQuery", "quantityValue", "quantityUnit", "preparationNote", "catalogHint"],
            properties: {
              foodQuery: { type: "string" }, quantityValue: { type: "number" },
              quantityUnit: { type: "string", enum: ["g", "kg", "ml", "known_portion"] },
              preparationNote: { type: ["string", "null"] }, catalogHint: { type: ["string", "null"] },
            },
          },
        },
      } } },
    },
  },
} as const;

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
  return "Você compõe refeições práticas usando somente nomes exatos do catálogo fornecido. Não calcule nem retorne nutrientes. Não altere meta, quantidade de refeições, ordem ou papéis. Use g ou kg; ml/known_portion somente se o catálogo indicar conversão. Retorne somente o JSON do schema.";
}

function parseCandidate(content: string): AiMealPlanCandidate {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== "object" || !Array.isArray((value as { meals?: unknown }).meals)) throw new Error("INVALID_AI_MEAL_PLAN_OUTPUT");
  return value as AiMealPlanCandidate;
}

export class OpenAiMealPlanCandidateGenerator implements MealPlanCandidateGenerator {
  constructor(private readonly client: OpenAI, private readonly model = "gpt-4o") {}

  private async invoke(payload: object): Promise<AiMealPlanCandidate> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      messages: [{ role: "system", content: systemInstruction() }, { role: "user", content: JSON.stringify(payload) }],
      response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("EMPTY_AI_MEAL_PLAN_OUTPUT");
    return parseCandidate(content);
  }

  generate(context: MealPlanGenerationContext, catalog: MealPlanCatalogPromptContext): Promise<AiMealPlanCandidate> {
    return this.invoke({ task: "generate", context: safeContext(context), catalog });
  }

  repair(context: MealPlanGenerationContext, previous: AiMealPlanCandidate, issues: MealPlanValidationIssue[], catalogFeedback: string[]): Promise<AiMealPlanCandidate> {
    return this.invoke({ task: "repair_once", immutableContext: safeContext(context), previous,
      issueCodes: issues.filter((issue) => issue.severity === "HARD_FAILURE").map((issue) => issue.code),
      controlledCatalogSuggestions: catalogFeedback });
  }
}
