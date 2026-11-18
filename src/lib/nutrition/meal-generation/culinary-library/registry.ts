import { hasCompleteEffectiveNutrients } from "../../food-catalog/effective-nutrients";
import type { NutritionFoodCatalogEntry } from "../../food-catalog/domain";
import { TACO_SOURCE_VERSION } from "../../food-catalog/taco/constants";
import type { CulinaryRole } from "../../meal-quality/domain";
import type { MealRole } from "../../meal-plan/domain";
import type { MealIntent, MealStyle } from "../daily-blueprint/domain";
import type { MealPlanFoodPool } from "../domain";
import { CULINARY_LIBRARY_VERSION, type CulinaryLibrary, type LiquidMeasurementAuthority, type NutritionAuthorityType,
  type CountableMeasurementAuthority, type RecipeIngredientTemplate, type RecipePreparationState, type RecipeStatus,
  type RecipeTemplate } from "./domain";

interface IngredientDefinition {
  componentId: string;
  displayName: string;
  culinaryRole: CulinaryRole;
  slot: MealPlanFoodPool;
  sourceFoodIds: string[];
  minimumQuantity: number;
  maximumQuantity: number;
  increment: number;
  referenceQuantity: number;
  referenceIncluded?: boolean;
  preparationState: RecipePreparationState;
  presentationOrder: number;
  required?: boolean;
  displayUnit?: "g" | "ml";
  nutritionAuthority?: NutritionAuthorityType;
}

interface RecipeDefinition {
  id: string;
  variantId: string;
  displayName: string;
  familyId: string;
  mealStyles: MealStyle[];
  allowedMealRoles: MealRole[];
  allowedMealIntents: MealIntent[];
  compatibleRealMealTemplateIds: string[];
  preparationDescription?: string;
  ingredients: IngredientDefinition[];
  status?: RecipeStatus;
}

const ingredient = (componentId: string, culinaryRole: CulinaryRole, slot: MealPlanFoodPool,
  sourceFoodId: string, minimumQuantity: number, maximumQuantity: number, increment: number,
  referenceQuantity: number, preparationState: RecipePreparationState, presentationOrder: number,
  extra: Partial<IngredientDefinition> = {}): IngredientDefinition => ({
  componentId, displayName: componentId, culinaryRole, slot, sourceFoodIds: [sourceFoodId], minimumQuantity, maximumQuantity,
  increment, referenceQuantity, referenceIncluded: true, preparationState, presentationOrder, required: true, displayUnit: "g",
  nutritionAuthority: "TACO", ...extra,
});

const bread = () => ingredient("BREAD", "STARCH", "CARB_ANCHOR", "53", 40, 150, 10, 70,
  "NOT_APPLICABLE", 1, { displayName: "Pão francês" });
const eggs = (order = 2) => ingredient("EGGS", "PROTEIN", "PROTEIN_ANCHOR", "488", 50, 150, 50, 100,
  "BOILED", order, { displayName: "Ovos cozidos" });
const banana = (order = 3) => ingredient("FRUIT", "FRUIT", "PRODUCE_FIBER", "182", 60, 200, 10, 100,
  "RAW", order, { displayName: "Banana" });
const papaya = (order = 3) => ingredient("FRUIT", "FRUIT", "PRODUCE_FIBER", "225", 60, 200, 10, 100,
  "RAW", order, { displayName: "Mamão" });
const apple = (order = 3) => ingredient("FRUIT", "FRUIT", "PRODUCE_FIBER", "221", 60, 200, 10, 100,
  "RAW", order, { displayName: "Maçã" });
const cheese = (order = 2) => ingredient("CHEESE", "DAIRY", "PROTEIN_ANCHOR", "461", 70, 100, 10, 70,
  "NOT_APPLICABLE", order, { displayName: "Queijo minas frescal" });
const couscous = () => ingredient("CUSCUZ", "STARCH", "CARB_ANCHOR", "533", 70, 250, 10, 120,
  "COOKED", 1, { displayName: "Cuscuz de milho cozido" });
const yogurt = () => ingredient("YOGURT", "DAIRY", "PROTEIN_ANCHOR", "448", 100, 250, 10, 170,
  "NOT_APPLICABLE", 1, { displayName: "Iogurte natural" });
const oats = () => ingredient("OATS", "WHOLE_GRAIN", "CARB_ANCHOR", "7", 20, 100, 10, 40,
  "RAW", 2, { displayName: "Aveia em flocos" });
const chicken = (order: number) => ingredient("PROTEIN", "LEAN_PROTEIN", "PROTEIN_ANCHOR", "410", 70, 220,
  10, 130, "GRILLED", order, { displayName: "Peito de frango grelhado" });
const beef = (order: number) => ingredient("PROTEIN", "PROTEIN", "PROTEIN_ANCHOR", "377", 70, 220,
  10, 130, "GRILLED", order, { displayName: "Patinho grelhado" });
const rice = () => ingredient("RICE", "STARCH", "CARB_ANCHOR", "3", 70, 300, 10, 180, "COOKED", 1,
  { displayName: "Arroz branco cozido" });
const beans = () => ingredient("BEANS", "LEGUME", "LEGUME_ANCHOR", "561", 60, 200, 10, 100, "COOKED", 2,
  { displayName: "Feijão carioca cozido" });
const broccoli = (order: number) => ingredient("VEGETABLES", "VEGETABLE", "PRODUCE_FIBER", "100", 50, 250,
  10, 100, "COOKED", order, { displayName: "Brócolis cozido" });
const carrot = (order: number) => ingredient("VEGETABLES", "VEGETABLE", "PRODUCE_FIBER", "109", 50, 250,
  10, 100, "COOKED", order, { displayName: "Cenoura cozida" });
const sweetPotato = () => ingredient("POTATO", "STARCH", "CARB_ANCHOR", "88", 70, 300, 10, 180,
  "COOKED", 1, { displayName: "Batata-doce cozida" });
const cassava = () => ingredient("CASSAVA", "STARCH", "CARB_ANCHOR", "129", 70, 300, 10, 180,
  "COOKED", 1, { displayName: "Mandioca cozida" });

const sandwichChicken = () => ({ ...chicken(2), referenceQuantity: 90 });
const sandwichSpread = () => ingredient("SPREAD", "FAT", "FAT_ANCHOR", "468", 10, 30, 5, 20,
  "NOT_APPLICABLE", 3, { displayName: "Requeijão cremoso", required: false, referenceIncluded: true });
const cookingFat = (order = 5) => ingredient("COOKING_FAT", "FAT", "FAT_ANCHOR", "260", 5, 20, 5, 10,
  "NOT_APPLICABLE", order, { displayName: "Azeite de oliva", required: false, referenceIncluded: false });

export const PRODUCTION_LIQUID_MEASUREMENT_AUTHORITIES_V1: readonly LiquidMeasurementAuthority[] = [];
export const PRODUCTION_COUNTABLE_MEASUREMENT_AUTHORITIES_V1: readonly CountableMeasurementAuthority[] = [];

function definition(value: RecipeDefinition): RecipeDefinition {
  return value;
}

export const GOLDEN_RECIPE_DEFINITIONS_V1: readonly RecipeDefinition[] = [
  definition({ id: "FRENCH_BREAD_BOILED_EGGS_BANANA", variantId: "FRENCH_BREAD_BOILED_EGGS_BANANA_V1",
    displayName: "Pão francês, ovos cozidos e banana", familyId: "BREAD_EGGS_FRUIT",
    mealStyles: ["BREAKFAST", "SNACK"], allowedMealRoles: ["BREAKFAST", "SNACK", "PRE_WORKOUT"],
    allowedMealIntents: ["BREAKFAST", "SNACK", "PRE_WORKOUT_SNACK"], compatibleRealMealTemplateIds: ["BREAKFAST_BREAD_EGGS_COFFEE_FRUIT", "PRE_BREAD_EGGS_FRUIT"],
    ingredients: [bread(), eggs(), banana()] }),
  definition({ id: "FRENCH_BREAD_MINAS_CHEESE_BANANA", variantId: "FRENCH_BREAD_MINAS_CHEESE_BANANA_V1",
    displayName: "Pão francês, queijo minas e banana", familyId: "BREAD_CHEESE_FRUIT",
    mealStyles: ["BREAKFAST", "SNACK"], allowedMealRoles: ["BREAKFAST", "SNACK", "PRE_WORKOUT", "EVENING_MEAL"],
    allowedMealIntents: ["BREAKFAST", "SNACK", "PRE_WORKOUT_SNACK", "EVENING_SNACK"], compatibleRealMealTemplateIds: ["BREAKFAST_BREAD_CHEESE_FRUIT", "PRE_BREAD_CHEESE_FRUIT"],
    ingredients: [bread(), cheese(), banana()] }),
  definition({ id: "COUSCOUS_BOILED_EGGS", variantId: "COUSCOUS_BOILED_EGGS_V1", displayName: "Cuscuz com ovos cozidos",
    familyId: "COUSCOUS_EGGS", mealStyles: ["BREAKFAST", "SNACK"],
    allowedMealRoles: ["BREAKFAST", "PRE_WORKOUT", "EVENING_MEAL"], allowedMealIntents: ["BREAKFAST", "PRE_WORKOUT_SNACK", "EVENING_SNACK"],
    compatibleRealMealTemplateIds: ["BREAKFAST_CUSCUZ_EGGS"], ingredients: [couscous(), eggs()] }),
  definition({ id: "YOGURT_OATS_BANANA", variantId: "YOGURT_OATS_BANANA_V1", displayName: "Iogurte com aveia e banana",
    familyId: "YOGURT_OATS_FRUIT", mealStyles: ["BREAKFAST", "SNACK"],
    allowedMealRoles: ["BREAKFAST", "SNACK", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"],
    allowedMealIntents: ["BREAKFAST", "SNACK", "PRE_WORKOUT_SNACK", "POST_WORKOUT_SNACK", "EVENING_SNACK"],
    compatibleRealMealTemplateIds: ["BREAKFAST_YOGURT_OATS_FRUIT", "PRE_YOGURT_OATS_BANANA", "POST_YOGURT_FRUIT_OATS"],
    preparationDescription: "Misture o iogurte e a aveia; adicione a banana em pedaços.", ingredients: [yogurt(), oats(), banana()] }),
  definition({ id: "YOGURT_OATS_PAPAYA", variantId: "YOGURT_OATS_PAPAYA_V1", displayName: "Iogurte com aveia e mamão",
    familyId: "YOGURT_OATS_FRUIT", mealStyles: ["BREAKFAST", "SNACK"],
    allowedMealRoles: ["BREAKFAST", "SNACK", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"],
    allowedMealIntents: ["BREAKFAST", "SNACK", "PRE_WORKOUT_SNACK", "POST_WORKOUT_SNACK", "EVENING_SNACK"], compatibleRealMealTemplateIds: ["BREAKFAST_YOGURT_OATS_FRUIT", "POST_YOGURT_FRUIT_OATS"],
    preparationDescription: "Misture o iogurte e a aveia; adicione o mamão em pedaços.", ingredients: [yogurt(), oats(), papaya()] }),
  definition({ id: "FRENCH_BREAD_GRILLED_CHICKEN", variantId: "FRENCH_BREAD_GRILLED_CHICKEN_V1",
    displayName: "Sanduíche de frango grelhado", familyId: "CHICKEN_SANDWICH", mealStyles: ["SNACK"],
    allowedMealRoles: ["SNACK", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"],
    allowedMealIntents: ["SNACK", "PRE_WORKOUT_SNACK", "POST_WORKOUT_SNACK", "EVENING_SNACK"],
    compatibleRealMealTemplateIds: ["PRE_BREAD_CHICKEN_SANDWICH"], preparationDescription: "Sirva o frango grelhado e o requeijão dentro do pão.",
    ingredients: [bread(), sandwichChicken(), sandwichSpread()] }),
  definition({ id: "FRENCH_BREAD_BOILED_EGGS_PAPAYA", variantId: "FRENCH_BREAD_BOILED_EGGS_PAPAYA_V1",
    displayName: "Pão francês, ovos cozidos e mamão", familyId: "BREAD_EGGS_FRUIT",
    mealStyles: ["BREAKFAST", "SNACK"], allowedMealRoles: ["BREAKFAST", "SNACK", "PRE_WORKOUT", "EVENING_MEAL"],
    allowedMealIntents: ["BREAKFAST", "SNACK", "PRE_WORKOUT_SNACK", "EVENING_SNACK"], compatibleRealMealTemplateIds: ["BREAKFAST_BREAD_EGGS_COFFEE_FRUIT", "PRE_BREAD_EGGS_FRUIT", "EVENING_BREAD_EGGS_FRUIT"],
    ingredients: [bread(), eggs(), papaya()] }),
  definition({ id: "FRENCH_BREAD_MINAS_CHEESE_APPLE", variantId: "FRENCH_BREAD_MINAS_CHEESE_APPLE_V1",
    displayName: "Pão francês, queijo minas e maçã", familyId: "BREAD_CHEESE_FRUIT",
    mealStyles: ["BREAKFAST", "SNACK"], allowedMealRoles: ["BREAKFAST", "SNACK", "PRE_WORKOUT", "EVENING_MEAL"],
    allowedMealIntents: ["BREAKFAST", "SNACK", "PRE_WORKOUT_SNACK", "EVENING_SNACK"], compatibleRealMealTemplateIds: ["BREAKFAST_BREAD_CHEESE_FRUIT", "PRE_BREAD_CHEESE_FRUIT"],
    ingredients: [bread(), cheese(), apple()] }),
  definition({ id: "RICE_BEANS_CHICKEN_BROCCOLI", variantId: "RICE_BEANS_CHICKEN_BROCCOLI_V1",
    displayName: "Arroz, feijão, frango e brócolis", familyId: "RICE_BEANS_PROTEIN_VEGETABLES",
    mealStyles: ["MAIN"], allowedMealRoles: ["MAIN_MEAL", "POST_WORKOUT", "EVENING_MEAL"],
    allowedMealIntents: ["MAIN_MEAL", "POST_WORKOUT_MAIN", "EVENING_MAIN"], compatibleRealMealTemplateIds: ["MAIN_RICE_BEANS_CHICKEN_VEGETABLES"],
    ingredients: [rice(), beans(), chicken(3), broccoli(4), cookingFat()] }),
  definition({ id: "RICE_BEANS_CHICKEN_CARROT", variantId: "RICE_BEANS_CHICKEN_CARROT_V1",
    displayName: "Arroz, feijão, frango e cenoura", familyId: "RICE_BEANS_PROTEIN_VEGETABLES",
    mealStyles: ["MAIN"], allowedMealRoles: ["MAIN_MEAL", "POST_WORKOUT", "EVENING_MEAL"], allowedMealIntents: ["MAIN_MEAL", "POST_WORKOUT_MAIN", "EVENING_MAIN"],
    compatibleRealMealTemplateIds: ["MAIN_RICE_BEANS_CHICKEN_VEGETABLES"], ingredients: [rice(), beans(), chicken(3), carrot(4), cookingFat()] }),
  definition({ id: "RICE_BEANS_BEEF_BROCCOLI", variantId: "RICE_BEANS_BEEF_BROCCOLI_V1",
    displayName: "Arroz, feijão, patinho e brócolis", familyId: "RICE_BEANS_PROTEIN_VEGETABLES",
    mealStyles: ["MAIN"], allowedMealRoles: ["MAIN_MEAL", "POST_WORKOUT", "EVENING_MEAL"], allowedMealIntents: ["MAIN_MEAL", "POST_WORKOUT_MAIN", "EVENING_MAIN"],
    compatibleRealMealTemplateIds: ["MAIN_RICE_BEANS_BEEF_VEGETABLES"], ingredients: [rice(), beans(), beef(3), broccoli(4), cookingFat()] }),
  definition({ id: "RICE_BEANS_BEEF_CARROT", variantId: "RICE_BEANS_BEEF_CARROT_V1",
    displayName: "Arroz, feijão, patinho e cenoura", familyId: "RICE_BEANS_PROTEIN_VEGETABLES",
    mealStyles: ["MAIN"], allowedMealRoles: ["MAIN_MEAL", "POST_WORKOUT", "EVENING_MEAL"], allowedMealIntents: ["MAIN_MEAL", "POST_WORKOUT_MAIN", "EVENING_MAIN"],
    compatibleRealMealTemplateIds: ["MAIN_RICE_BEANS_BEEF_VEGETABLES"], ingredients: [rice(), beans(), beef(3), carrot(4), cookingFat()] }),
  definition({ id: "RICE_CHICKEN_BROCCOLI", variantId: "RICE_CHICKEN_BROCCOLI_V1", displayName: "Arroz, frango e brócolis",
    familyId: "RICE_CHICKEN_VEGETABLES", mealStyles: ["MAIN"],
    allowedMealRoles: ["MAIN_MEAL", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"], allowedMealIntents: ["MAIN_MEAL", "PRE_WORKOUT_MEAL", "POST_WORKOUT_MAIN", "EVENING_MAIN"],
    compatibleRealMealTemplateIds: ["PRE_RICE_CHICKEN", "POST_RICE_CHICKEN_VEGETABLES"], ingredients: [rice(), chicken(2), broccoli(3), cookingFat(4)] }),
  definition({ id: "RICE_BEEF_BROCCOLI", variantId: "RICE_BEEF_BROCCOLI_V1", displayName: "Arroz, patinho e brócolis",
    familyId: "RICE_BEEF_VEGETABLES", mealStyles: ["MAIN"], allowedMealRoles: ["MAIN_MEAL", "POST_WORKOUT", "EVENING_MEAL"],
    allowedMealIntents: ["MAIN_MEAL", "POST_WORKOUT_MAIN", "EVENING_MAIN"], compatibleRealMealTemplateIds: ["MAIN_RICE_BEEF_VEGETABLES"], ingredients: [rice(), beef(2), broccoli(3), cookingFat(4)] }),
  definition({ id: "SWEET_POTATO_CHICKEN_BROCCOLI", variantId: "SWEET_POTATO_CHICKEN_BROCCOLI_V1",
    displayName: "Batata-doce, frango e brócolis", familyId: "POTATO_CHICKEN_VEGETABLES", mealStyles: ["MAIN"],
    allowedMealRoles: ["MAIN_MEAL", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"], allowedMealIntents: ["MAIN_MEAL", "PRE_WORKOUT_MEAL", "POST_WORKOUT_MAIN", "EVENING_MAIN"],
    compatibleRealMealTemplateIds: ["PRE_POTATO_CHICKEN", "MAIN_POTATO_CHICKEN_VEGETABLES"], ingredients: [sweetPotato(), chicken(2), broccoli(3), cookingFat(4)] }),
  definition({ id: "CASSAVA_CHICKEN_BROCCOLI", variantId: "CASSAVA_CHICKEN_BROCCOLI_V1",
    displayName: "Mandioca, frango e brócolis", familyId: "CASSAVA_CHICKEN_VEGETABLES", mealStyles: ["MAIN"],
    allowedMealRoles: ["MAIN_MEAL", "POST_WORKOUT", "EVENING_MEAL"], allowedMealIntents: ["MAIN_MEAL", "POST_WORKOUT_MAIN", "EVENING_MAIN"],
    compatibleRealMealTemplateIds: ["MAIN_MANDIOCA_PROTEIN_VEGETABLES"], ingredients: [cassava(), chicken(2), broccoli(3), cookingFat(4)] }),
  definition({ id: "RICE_CHICKEN_CARROT", variantId: "RICE_CHICKEN_CARROT_V1", displayName: "Arroz, frango e cenoura",
    familyId: "RICE_CHICKEN_VEGETABLES", mealStyles: ["MAIN"],
    allowedMealRoles: ["MAIN_MEAL", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"], allowedMealIntents: ["MAIN_MEAL", "PRE_WORKOUT_MEAL", "POST_WORKOUT_MAIN", "EVENING_MAIN"],
    compatibleRealMealTemplateIds: ["POST_RICE_CHICKEN_VEGETABLES"], ingredients: [rice(), chicken(2), carrot(3), cookingFat(4)] }),
  definition({ id: "PRE_WHITE_RICE_GRILLED_CHICKEN", variantId: "PRE_WHITE_RICE_GRILLED_CHICKEN_V1",
    displayName: "Arroz branco com frango grelhado", familyId: "RICE_CHICKEN_PRE_WORKOUT", mealStyles: ["MAIN"],
    allowedMealRoles: ["PRE_WORKOUT"], allowedMealIntents: ["PRE_WORKOUT_MEAL"],
    compatibleRealMealTemplateIds: ["PRE_RICE_CHICKEN"],
    preparationDescription: "Servir arroz branco cozido com peito de frango grelhado antes do treino.",
    ingredients: [rice(), chicken(2)] }),
  definition({ id: "PRE_SWEET_POTATO_GRILLED_CHICKEN", variantId: "PRE_SWEET_POTATO_GRILLED_CHICKEN_V1",
    displayName: "Batata-doce com frango grelhado", familyId: "POTATO_CHICKEN_PRE_WORKOUT", mealStyles: ["MAIN"],
    allowedMealRoles: ["PRE_WORKOUT"], allowedMealIntents: ["PRE_WORKOUT_MEAL"],
    compatibleRealMealTemplateIds: ["PRE_POTATO_CHICKEN"],
    preparationDescription: "Servir batata-doce cozida com peito de frango grelhado antes do treino.",
    ingredients: [sweetPotato(), chicken(2)] }),
  definition({ id: "SHAKE_WHEY_BANANA_OATS_MILK", variantId: "SHAKE_WHEY_BANANA_OATS_MILK_V1",
    displayName: "Shake de banana com whey e aveia", familyId: "PROTEIN_SHAKE", mealStyles: ["SNACK"],
    allowedMealRoles: ["SNACK", "PRE_WORKOUT", "POST_WORKOUT", "EVENING_MEAL"],
    allowedMealIntents: ["SNACK", "PRE_WORKOUT_SNACK", "POST_WORKOUT_SNACK", "EVENING_SNACK"],
    compatibleRealMealTemplateIds: ["PROTEIN_SHAKE"], preparationDescription: "Bata todos os ingredientes no liquidificador.",
    status: "BLOCKED_MISSING_SUPPLEMENT_AUTHORITY", ingredients: [
      ingredient("LIQUID_BASE", "DAIRY", "PROTEIN_ANCHOR", "458", 100, 250, 10, 250, "READY_TO_EAT", 1,
        { displayName: "Leite" }),
      ingredient("PROTEIN_SUPPLEMENT", "PROTEIN", "PROTEIN_ANCHOR", "SUPPLEMENT_LABEL:WHEY_REQUIRED", 20, 40, 5, 30,
        "READY_TO_EAT", 2, { displayName: "Whey protein", nutritionAuthority: "SUPPLEMENT_LABEL" }),
      banana(3), { ...oats(), componentId: "CARB_COMPLEMENT", referenceQuantity: 30, presentationOrder: 4 },
    ] }),
] as const;

function resolveIngredient(definition: IngredientDefinition, entries: NutritionFoodCatalogEntry[]): RecipeIngredientTemplate {
  const allowedEntries = entries.filter((entry) => definition.sourceFoodIds.includes(entry.sourceFoodId)
    && entry.source === "TACO" && entry.sourceVersion === TACO_SOURCE_VERSION
    && entry.isActive && entry.catalogScope === "PRODUCTION" && hasCompleteEffectiveNutrients(entry));
  const boundedReference = Math.min(definition.maximumQuantity,
    Math.max(definition.minimumQuantity, definition.referenceQuantity));
  const referenceQuantity = Number((definition.minimumQuantity
    + Math.round((boundedReference - definition.minimumQuantity) / definition.increment) * definition.increment).toFixed(1));
  return {
    componentId: definition.componentId, displayName: definition.displayName, culinaryRole: definition.culinaryRole,
    required: definition.required ?? true, slot: definition.slot,
    allowedCatalogEntryIds: allowedEntries.map((entry) => entry.id), nutritionQuantityUnit: "g",
    displayUnit: definition.displayUnit ?? "g", minimumQuantity: definition.minimumQuantity,
    maximumQuantity: definition.maximumQuantity, increment: definition.increment,
    referenceQuantity, referenceIncluded: definition.referenceIncluded ?? true,
    preparationState: definition.preparationState, presentationOrder: definition.presentationOrder,
    nutritionAuthority: definition.nutritionAuthority ?? "TACO",
  };
}

export function buildCulinaryLibrary(entries: NutritionFoodCatalogEntry[]): CulinaryLibrary {
  const recipes: RecipeTemplate[] = GOLDEN_RECIPE_DEFINITIONS_V1.map((recipe) => ({
    id: recipe.id, variantId: recipe.variantId, version: CULINARY_LIBRARY_VERSION,
    displayName: recipe.displayName, familyId: recipe.familyId, culture: "BRAZILIAN",
    mealStyles: [...recipe.mealStyles], allowedMealRoles: [...recipe.allowedMealRoles],
    allowedMealIntents: [...recipe.allowedMealIntents],
    compatibleRealMealTemplateIds: [...recipe.compatibleRealMealTemplateIds],
    preparationDescription: recipe.preparationDescription ?? null,
    ingredients: recipe.ingredients.map((value) => resolveIngredient(value, entries)),
    maximumOptionalComponents: recipe.ingredients.filter((value) => !(value.required ?? true)).length,
    status: recipe.status ?? "ACTIVE", humanRecognitionApproved: true,
  }));
  return { version: CULINARY_LIBRARY_VERSION, recipes, catalogEntries: entries };
}

export function recipeById(library: CulinaryLibrary, recipeId: string): RecipeTemplate | undefined {
  return library.recipes.find((recipe) => recipe.id === recipeId);
}

export function tacoContainsAuthorizedWhey(entries: NutritionFoodCatalogEntry[]): boolean {
  return entries.some((entry) => entry.source === "TACO" && entry.isActive
    && /\bwhey\b|prote[ií]na.*soro.*leite/i.test(entry.canonicalName));
}
