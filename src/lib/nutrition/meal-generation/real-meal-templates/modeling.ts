import type { ResolvedMeal } from "../domain";
import { realMealTemplateById } from "./registry";

export function modeledRealMealTemplate(meal: ResolvedMeal) {
  const template = realMealTemplateById(meal.templateId);
  const variant = template?.variants.find((value) => value.id === meal.variantId);
  if (!template || !variant || !template.mealRoles.includes(meal.role)) return null;
  const selectedComponents = new Set(meal.items.map((item) => item.componentId));
  if (template.components.some((component) => component.required && !selectedComponents.has(component.id))) return null;
  const validItems = meal.items.every((item) => {
    const component = template.components.find((value) => value.id === item.componentId);
    if (!component || component.slot !== item.slot) return false;
    const allowedSourceFoodIds = variant.componentSourceFoodIds[component.id] ?? component.allowedSourceFoodIds;
    return allowedSourceFoodIds.includes(item.food.sourceFoodId)
      && item.quantityGrams >= component.minimumGrams && item.quantityGrams <= component.maximumGrams;
  });
  return validItems ? template : null;
}

export function isModeledMainMeal(meal: ResolvedMeal): boolean {
  const template = modeledRealMealTemplate(meal);
  return template?.mealStyle === "MAIN";
}
