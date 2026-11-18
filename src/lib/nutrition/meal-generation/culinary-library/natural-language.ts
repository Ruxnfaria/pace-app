import type { RecipePresentationIngredient, RecipePresentationLine } from "./domain";

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value);
}

function lowerInitial(value: string): string {
  return value.length === 0 ? value : value[0].toLocaleLowerCase("pt-BR") + value.slice(1);
}

function ingredientPhrase(ingredient: RecipePresentationIngredient): string {
  if (ingredient.displayUnit === "count" || ingredient.displayUnit === "slice") {
    return `${formatQuantity(ingredient.displayQuantity)} ${ingredient.displayName}`;
  }
  const unit = ingredient.displayUnit === "ml" ? "mL" : "g";
  return `${formatQuantity(ingredient.displayQuantity)} ${unit} de ${lowerInitial(ingredient.displayName)}`;
}

const COMBINED_PREPARATION_COMPONENTS = [["BREAD", "EGGS"], ["BREAD", "CHEESE"], ["BREAD", "PROTEIN"]] as const;

export function buildNaturalRecipeLines(ingredients: readonly RecipePresentationIngredient[]): RecipePresentationLine[] {
  const ordered = [...ingredients].sort((left, right) => left.presentationOrder - right.presentationOrder);
  const consumed = new Set<string>();
  const lines: RecipePresentationLine[] = [];
  for (const [firstId, secondId] of COMBINED_PREPARATION_COMPONENTS) {
    const first = ordered.find((ingredient) => ingredient.componentId === firstId);
    const second = ordered.find((ingredient) => ingredient.componentId === secondId);
    if (!first || !second) continue;
    consumed.add(first.componentId);
    consumed.add(second.componentId);
    lines.push({ text: `${ingredientPhrase(first)} com ${ingredientPhrase(second)}`,
      componentIds: [first.componentId, second.componentId],
      nutritionQuantityGrams: first.nutritionQuantityGrams + second.nutritionQuantityGrams });
    break;
  }
  ordered.filter((ingredient) => !consumed.has(ingredient.componentId)).forEach((ingredient) => {
    lines.push({ text: ingredientPhrase(ingredient), componentIds: [ingredient.componentId],
      nutritionQuantityGrams: ingredient.nutritionQuantityGrams });
  });
  return lines;
}
