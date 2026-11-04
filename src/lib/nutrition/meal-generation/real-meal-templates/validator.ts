import type { AiMealPlanCandidate, MealPlanGenerationContext } from "../domain";
import { REAL_MEAL_TEMPLATE_VALIDATOR_VERSION, type RealMealTemplateIssue,
  type RealMealTemplateSlot, type RealMealTemplateValidationReport } from "./domain";
import { realMealTemplateById } from "./registry";

function issue(code: RealMealTemplateIssue["code"], message: string, mealPosition: number,
  itemPosition?: number): RealMealTemplateIssue {
  return { code, message, mealPosition, ...(itemPosition === undefined ? {} : { itemPosition }) };
}

export function validateRealMealTemplates(
  context: MealPlanGenerationContext,
  candidate: AiMealPlanCandidate,
  slots: RealMealTemplateSlot[],
): RealMealTemplateValidationReport {
  const issues: RealMealTemplateIssue[] = [];
  candidate.meals.forEach((meal, mealIndex) => {
    const position = mealIndex + 1;
    const template = realMealTemplateById(meal.templateId);
    const slot = slots[mealIndex];
    const option = slot?.options.find((value) => value.templateId === meal.templateId && value.variantId === meal.variantId);
    if (!template || !option) {
      issues.push(issue("VALID_TEMPLATE_ID", "Template and variant must be offered by the server", position));
      return;
    }
    if (!template.mealRoles.includes(meal.role) || slot.role !== meal.role) {
      issues.push(issue("TEMPLATE_ROLE_MATCH", "Template does not support the prescribed meal role", position));
    }
    if (!template.goalCompatibility.includes(context.goal)) {
      issues.push(issue("TEMPLATE_GOAL_COMPATIBLE", "Template does not support the nutrition goal", position));
    }
    if (!template.allowedIntents.includes(slot.intent)) {
      issues.push(issue("TEMPLATE_TIMING_COMPATIBLE", "Template does not support the server-prescribed meal intent", position));
    }
    const componentIds = meal.items.map((item) => item.componentId);
    if (new Set(componentIds).size !== componentIds.length) {
      issues.push(issue("NO_DUPLICATE_COMPONENT_ASSIGNMENT", "A component can be assigned at most once", position));
    }
    const foodIds = meal.items.map((item) => item.catalogEntryId);
    if (new Set(foodIds).size !== foodIds.length) {
      issues.push(issue("PAIRING_VALID", "One selected food cannot satisfy multiple culinary components", position));
    }
    const required = option.components.filter((value) => value.required).map((value) => value.componentId);
    if (required.some((componentId) => !componentIds.includes(componentId))) {
      issues.push(issue("REQUIRED_COMPONENTS_COMPLETE", "Every required culinary component must be present", position));
    }
    const optionalCount = meal.items.filter((item) => option.components.some((value) =>
      value.componentId === item.componentId && !value.required)).length;
    if (optionalCount > option.maximumOptionalComponents) {
      issues.push(issue("MAX_OPTIONAL_COMPONENTS", "Too many optional components were selected", position));
    }
    meal.items.forEach((item, itemIndex) => {
      const component = option.components.find((value) => value.componentId === item.componentId);
      if (!component) {
        issues.push(issue("OPTIONAL_COMPONENT_ALLOWED", "Component is not defined by the selected template", position, itemIndex + 1));
        return;
      }
      if (component.slot !== item.slot || !component.catalogEntryIds.includes(item.catalogEntryId)) {
        issues.push(issue("FOOD_ALLOWED_FOR_COMPONENT", "Food is not allowed for the selected culinary component", position, itemIndex + 1));
      }
      if (item.quantityGrams < component.minimumGrams || item.quantityGrams > component.maximumGrams) {
        issues.push(issue("COMPONENT_PORTION_RANGE", "Food quantity is outside the template component range", position, itemIndex + 1));
      }
    });
  });
  return { valid: issues.length === 0, validatorVersion: REAL_MEAL_TEMPLATE_VALIDATOR_VERSION, issues };
}
