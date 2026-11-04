import type { SupportedNutritionGoal } from "../../meal-plan/domain";
import { REAL_MEAL_TEMPLATE_VERSION, type RealMealComponentDefinition, type RealMealTemplate,
  type RealMealTemplateVariant } from "./domain";
import type { MealIntent, MealStyle, ProteinFamily, StapleFamily } from "../daily-blueprint/domain";

const ALL_GOALS: SupportedNutritionGoal[] = [
  "fat_loss", "hypertrophy", "conditioning",
];

type ComponentArgs = Omit<RealMealComponentDefinition, "allowedSourceFoodIds" | "minimumGrams" | "maximumGrams" | "presentationGroup">
  & Partial<Pick<RealMealComponentDefinition, "allowedSourceFoodIds" | "minimumGrams" | "maximumGrams" | "presentationGroup">>;

function component(args: ComponentArgs): RealMealComponentDefinition {
  return {
    allowedSourceFoodIds: [], minimumGrams: 10, maximumGrams: 350,
    presentationGroup: args.id, ...args,
  };
}

function variant(id: string, displayName: string, componentSourceFoodIds: Record<string, string[]>,
  energyProfile: RealMealTemplateVariant["energyProfile"] = "STANDARD"): RealMealTemplateVariant {
  return { id, displayName, componentSourceFoodIds, energyProfile };
}

function template(value: Omit<RealMealTemplate, "version" | "culture" | "goalCompatibility" | "maximumOptionalComponents"
  | "pairingRules" | "portionRules" | "familyId" | "mealStyle" | "allowedIntents" | "stapleFamily" | "proteinFamily">
  & Partial<Pick<RealMealTemplate, "goalCompatibility" | "maximumOptionalComponents" | "familyId" | "mealStyle"
    | "allowedIntents" | "stapleFamily" | "proteinFamily"
    | "pairingRules" | "portionRules">>): RealMealTemplate {
  const familyId = value.id.includes("BREAD") ? "BREAD_BASED" : value.id.includes("YOGURT") || value.id.includes("OATS")
    ? "YOGURT_OATS_FRUIT" : value.id.includes("RICE_BEANS") ? "RICE_BEANS_PROTEIN"
      : value.id.includes("RICE_LENTILS") ? "RICE_LENTILS_PROTEIN" : value.id.includes("RICE") ? "RICE_PROTEIN"
        : value.id.includes("POTATO") || value.id.includes("MANDIOCA") ? "TUBER_PROTEIN"
          : value.id.includes("PASTA") ? "PASTA_PROTEIN"
            : value.id.replace(/^(BREAKFAST|PRE|POST|EVENING|MAIN)_/, "").replace(/_FRUIT$/, "");
  const mealStyle: MealStyle = value.mealType === "MAIN_MEAL" || value.mealType === "PRE_WORKOUT_MEAL"
    || value.mealType === "POST_WORKOUT_MEAL" ? "MAIN"
    : value.mealType === "BREAKFAST" ? "BREAKFAST" : "SNACK";
  const allowedIntents: MealIntent[] = mealStyle === "MAIN"
    ? ["MAIN_MEAL", "PRE_WORKOUT_MEAL", "POST_WORKOUT_MAIN", "EVENING_MAIN", "LIGHT_MEAL"]
    : mealStyle === "BREAKFAST"
      ? ["BREAKFAST", "SNACK", "PRE_WORKOUT_SNACK", "EVENING_SNACK"]
      : ["SNACK", "PRE_WORKOUT_SNACK", "POST_WORKOUT_SNACK", "EVENING_SNACK"];
  const stapleFamily: StapleFamily = value.id.includes("RICE") ? "RICE" : value.id.includes("BREAD") ? "BREAD"
    : value.id.includes("OATS") || value.id.includes("YOGURT") ? "OATS" : value.id.includes("CUSCUZ") ? "CORN"
      : value.id.includes("POTATO") || value.id.includes("MANDIOCA") ? "TUBER"
        : value.id.includes("PASTA") ? "PASTA" : "OTHER";
  const proteinFamily: ProteinFamily = value.id.includes("EGGS") ? "EGGS" : value.id.includes("CHEESE")
    || value.id.includes("YOGURT") ? "DAIRY" : value.id.includes("CHICKEN") ? "POULTRY"
      : value.id.includes("BEEF") || value.id.includes("MEAT") ? "BEEF" : value.id.includes("FISH") ? "FISH"
        : value.id.includes("PROTEIN") ? "MIXED" : "OTHER";
  return {
    version: REAL_MEAL_TEMPLATE_VERSION, culture: "BRAZILIAN", goalCompatibility: ALL_GOALS,
    familyId, mealStyle, allowedIntents, stapleFamily, proteinFamily,
    maximumOptionalComponents: 1,
    pairingRules: ["Every selected food belongs to exactly one culinary component."],
    portionRules: ["Adjust quantities inside the template before switching to another compatible template."],
    ...value,
  };
}

const bread = component({ id: "BREAD", slot: "CARB_ANCHOR", required: true, minimumGrams: 40, maximumGrams: 200 });
const eggs = component({ id: "EGGS", slot: "PROTEIN_ANCHOR", required: true, minimumGrams: 50, maximumGrams: 150,
  presentationGroup: "BREAD_WITH_EGGS" });
const fruit = component({ id: "FRUIT", slot: "PRODUCE_FIBER", required: true, minimumGrams: 60, maximumGrams: 200 });
const coffee = component({ id: "COFFEE", slot: "PRODUCE_FIBER", required: false, minimumGrams: 50, maximumGrams: 200,
  allowedSourceFoodIds: ["471"], presentationGroup: "COFFEE_BEVERAGE",
  preparationNote: "servir sem açúcar; nutrientes vêm somente do café TACO" });
const spread = component({ id: "SPREAD", slot: "FAT_ANCHOR", required: false, minimumGrams: 10, maximumGrams: 30,
  allowedSourceFoodIds: ["468"], presentationGroup: "BREAD_SPREAD" });
const yogurt = component({ id: "YOGURT", slot: "PROTEIN_ANCHOR", required: true, minimumGrams: 100, maximumGrams: 300,
  presentationGroup: "YOGURT_OATS_FRUIT" });
const oats = component({ id: "OATS", slot: "CARB_ANCHOR", required: true, minimumGrams: 20, maximumGrams: 100,
  presentationGroup: "YOGURT_OATS_FRUIT" });
const cheese = component({ id: "CHEESE", slot: "PROTEIN_ANCHOR", required: true, minimumGrams: 30, maximumGrams: 100,
  presentationGroup: "BREAD_WITH_CHEESE" });
const rice = component({ id: "RICE", slot: "CARB_ANCHOR", required: true, minimumGrams: 70, maximumGrams: 350 });
const beans = component({ id: "BEANS", slot: "LEGUME_ANCHOR", required: true, minimumGrams: 60, maximumGrams: 250 });
const lentils = component({ id: "LENTILS", slot: "LEGUME_ANCHOR", required: true, minimumGrams: 60, maximumGrams: 250 });
const protein = component({ id: "PROTEIN", slot: "PROTEIN_ANCHOR", required: true, minimumGrams: 70, maximumGrams: 250 });
const vegetables = component({ id: "VEGETABLES", slot: "PRODUCE_FIBER", required: true, minimumGrams: 50, maximumGrams: 300 });
const addedFat = component({ id: "COOKING_FAT", slot: "FAT_ANCHOR", required: false, minimumGrams: 5, maximumGrams: 20,
  presentationGroup: "COOKING_METHOD", preparationNote: "usar no preparo" });
const avocadoSide = component({ id: "AVOCADO_SIDE", slot: "FAT_ANCHOR", required: false, minimumGrams: 50,
  maximumGrams: 100, allowedSourceFoodIds: ["163"], presentationGroup: "MAIN_MEAL_SIDE" });
const potato = component({ id: "POTATO", slot: "CARB_ANCHOR", required: true, minimumGrams: 70, maximumGrams: 350 });
const cassava = component({ id: "CASSAVA", slot: "CARB_ANCHOR", required: true, minimumGrams: 70, maximumGrams: 350 });

const breadFruitVariants = (prefix: string, proteinId: string, proteinLabel: string, proteinFoods: string[]) => [
  variant(`${prefix}_FRENCH_BANANA`, `Pão francês, ${proteinLabel} e banana`, { BREAD: ["53"], [proteinId]: proteinFoods, FRUIT: ["182"] }, "SCALABLE"),
  variant(`${prefix}_WHOLE_BANANA`, `Pão integral, ${proteinLabel} e banana`, { BREAD: ["52"], [proteinId]: proteinFoods, FRUIT: ["182"] }, "STANDARD"),
  variant(`${prefix}_FRENCH_PAPAYA`, `Pão francês, ${proteinLabel} e mamão`, { BREAD: ["53"], [proteinId]: proteinFoods, FRUIT: ["225", "226"] }, "SCALABLE"),
  variant(`${prefix}_WHOLE_APPLE`, `Pão integral, ${proteinLabel} e maçã`, { BREAD: ["52"], [proteinId]: proteinFoods, FRUIT: ["221"] }, "LIGHT"),
];

export const REAL_MEAL_TEMPLATES_V1: readonly RealMealTemplate[] = [
  template({ id: "BREAKFAST_BREAD_EGGS_COFFEE_FRUIT", displayName: "Pão com ovos, café e fruta", mealType: "BREAKFAST",
    mealRoles: ["BREAKFAST", "SNACK"], components: [bread, eggs, fruit, coffee, spread],
    variants: breadFruitVariants("BREAD_EGGS", "EGGS", "ovos", ["488"]),
    preparationDescription: "Servir pão com ovos; café e fruta ficam como acompanhamentos reconhecíveis." }),
  template({ id: "BREAKFAST_CUSCUZ_EGGS_FRUIT", displayName: "Cuscuz com ovos e fruta", mealType: "BREAKFAST",
    mealRoles: ["BREAKFAST", "SNACK"], components: [{ ...bread, id: "CUSCUZ", presentationGroup: "CUSCUZ_WITH_EGGS" }, eggs, fruit],
    variants: [
      variant("CUSCUZ_EGGS_BANANA", "Cuscuz com ovos e banana", { CUSCUZ: ["533"], EGGS: ["488"], FRUIT: ["182"] }, "STANDARD"),
      variant("CUSCUZ_EGGS_PAPAYA", "Cuscuz com ovos e mamão", { CUSCUZ: ["533"], EGGS: ["488"], FRUIT: ["225", "226"] }, "STANDARD"),
    ], preparationDescription: "Servir cuscuz e ovos juntos, com fruta separada." }),
  template({ id: "BREAKFAST_YOGURT_OATS_FRUIT", displayName: "Iogurte com aveia e fruta", mealType: "BREAKFAST",
    mealRoles: ["BREAKFAST", "SNACK"], components: [yogurt, oats, fruit], variants: [
      variant("YOGURT_OATS_BANANA", "Iogurte natural com aveia e banana", { YOGURT: ["448"], OATS: ["7"], FRUIT: ["182"] }),
      variant("SKIM_YOGURT_OATS_BANANA", "Iogurte desnatado com aveia e banana", { YOGURT: ["449"], OATS: ["7"], FRUIT: ["182"] }, "LIGHT"),
      variant("YOGURT_OATS_PAPAYA", "Iogurte natural com aveia e mamão", { YOGURT: ["448"], OATS: ["7"], FRUIT: ["225", "226"] }),
      variant("SKIM_YOGURT_OATS_APPLE", "Iogurte desnatado com aveia e maçã", { YOGURT: ["449"], OATS: ["7"], FRUIT: ["221"] }, "LIGHT"),
    ], preparationDescription: "Misturar iogurte e aveia; adicionar a fruta em pedaços." }),
  template({ id: "BREAKFAST_BREAD_CHEESE_FRUIT", displayName: "Pão com queijo e fruta", mealType: "BREAKFAST",
    mealRoles: ["BREAKFAST", "SNACK"], components: [bread, cheese, fruit, coffee],
    variants: breadFruitVariants("BREAD_CHEESE", "CHEESE", "queijo", ["461", "468"]),
    preparationDescription: "Servir o queijo no pão, acompanhado de fruta e café opcional." }),
  template({ id: "BREAKFAST_OVERNIGHT_OATS_STYLE", displayName: "Iogurte, aveia e fruta preparados juntos", mealType: "BREAKFAST",
    mealRoles: ["BREAKFAST", "SNACK"], components: [yogurt, oats, fruit], variants: [
      variant("OVERNIGHT_BANANA", "Iogurte, aveia e banana", { YOGURT: ["448", "449"], OATS: ["7"], FRUIT: ["182"] }),
      variant("OVERNIGHT_PAPAYA", "Iogurte, aveia e mamão", { YOGURT: ["448", "449"], OATS: ["7"], FRUIT: ["225", "226"] }),
    ], preparationDescription: "Hidratar a aveia no iogurte e servir com fruta; nenhuma receita nutricional é inventada." }),
  template({ id: "BREAKFAST_TAPIOCA_EGGS_FRUIT", displayName: "Tapioca com ovos e fruta", mealType: "BREAKFAST",
    mealRoles: ["BREAKFAST"], components: [{ ...bread, id: "TAPIOCA" }, eggs, fruit], variants: [
      variant("TAPIOCA_EGGS_BANANA", "Tapioca com ovos e banana", { TAPIOCA: ["551"], EGGS: ["488"], FRUIT: ["182"] }),
    ], preparationDescription: "Template somente fica disponível quando todos os nutrientes TACO forem calculáveis." }),
  template({ id: "BREAKFAST_BREAD_EGGS_MILK_COFFEE", displayName: "Pão com ovos e café com leite", mealType: "BREAKFAST",
    mealRoles: ["BREAKFAST"], components: [bread, eggs,
      component({ id: "MILK", slot: "PROTEIN_ANCHOR", required: true, minimumGrams: 100, maximumGrams: 250, presentationGroup: "MILK_COFFEE" }), coffee],
    variants: [variant("BREAD_EGGS_MILK_COFFEE", "Pão com ovos e café com leite", { BREAD: ["53"], EGGS: ["488"], MILK: ["458"], COFFEE: ["471"] })],
    preparationDescription: "Café e leite são componentes separados; o template bloqueia se o leite não tiver nutrientes completos." }),
  template({ id: "PRE_BREAD_EGGS_FRUIT", displayName: "Pão com ovos e fruta", mealType: "PRE_WORKOUT_SNACK",
    mealRoles: ["PRE_WORKOUT"], components: [bread, eggs, fruit], variants: breadFruitVariants("PRE_BREAD_EGGS", "EGGS", "ovos", ["488"]),
    preparationDescription: "Lanche pré-treino de pão com ovos e fruta." }),
  template({ id: "PRE_BREAD_CHEESE_FRUIT", displayName: "Pão com queijo e fruta", mealType: "PRE_WORKOUT_SNACK",
    mealRoles: ["PRE_WORKOUT"], components: [bread, cheese, fruit], variants: breadFruitVariants("PRE_BREAD_CHEESE", "CHEESE", "queijo", ["461", "468"]),
    preparationDescription: "Lanche pré-treino de pão com queijo e fruta." }),
  template({ id: "PRE_BREAD_CHICKEN_FRUIT", displayName: "Pão com frango e fruta", mealType: "PRE_WORKOUT_SNACK",
    mealRoles: ["PRE_WORKOUT"], components: [bread, protein, fruit], variants: [
      variant("PRE_FRENCH_BREAD_CHICKEN_BANANA", "Pão francês com frango e banana", { BREAD: ["53"], PROTEIN: ["410"], FRUIT: ["182"] }, "SCALABLE"),
      variant("PRE_WHOLE_BREAD_CHICKEN_PAPAYA", "Pão integral com frango e mamão", { BREAD: ["52"], PROTEIN: ["410"], FRUIT: ["225", "226"] }),
    ], preparationDescription: "Servir o frango no pão, acompanhado de fruta." }),
  template({ id: "PRE_YOGURT_OATS_BANANA", displayName: "Iogurte com aveia e banana", mealType: "PRE_WORKOUT_SNACK",
    mealRoles: ["PRE_WORKOUT"], components: [yogurt, oats, fruit], variants: [
      variant("PRE_YOGURT_BANANA", "Iogurte natural com aveia e banana", { YOGURT: ["448"], OATS: ["7"], FRUIT: ["182"] }),
      variant("PRE_SKIM_YOGURT_BANANA", "Iogurte desnatado com aveia e banana", { YOGURT: ["449"], OATS: ["7"], FRUIT: ["182"] }, "LIGHT"),
    ], preparationDescription: "Misturar iogurte, aveia e banana." }),
  template({ id: "PRE_RICE_CHICKEN", displayName: "Arroz com frango", mealType: "PRE_WORKOUT_MEAL",
    mealRoles: ["PRE_WORKOUT"], components: [rice, protein], variants: [
      variant("PRE_WHITE_RICE_CHICKEN", "Arroz branco com frango", { RICE: ["3"], PROTEIN: ["410"] }, "SCALABLE"),
      variant("PRE_BROWN_RICE_CHICKEN", "Arroz integral com frango", { RICE: ["1"], PROTEIN: ["410"] }),
    ], preparationDescription: "Servir arroz e frango como refeição pré-treino." }),
  template({ id: "PRE_POTATO_CHICKEN", displayName: "Batata-doce com frango", mealType: "PRE_WORKOUT_MEAL",
    mealRoles: ["PRE_WORKOUT"], components: [potato, protein], variants: [
      variant("PRE_SWEET_POTATO_CHICKEN", "Batata-doce com frango", { POTATO: ["88"], PROTEIN: ["410"] }),
    ], preparationDescription: "Servir batata-doce e frango." }),
  template({ id: "MAIN_RICE_BEANS_CHICKEN_VEGETABLES", displayName: "Arroz, feijão, frango e legumes", mealType: "MAIN_MEAL",
    mealRoles: ["MAIN_MEAL", "POST_WORKOUT", "EVENING_MEAL"], components: [rice, beans, protein, vegetables, addedFat, avocadoSide], variants: [
      variant("WHITE_CARIOCA_CHICKEN_BROCCOLI", "Arroz, feijão carioca, frango e brócolis", { RICE: ["3"], BEANS: ["561"], PROTEIN: ["410"], VEGETABLES: ["100"], COOKING_FAT: ["260"] }, "SCALABLE"),
      variant("WHITE_BLACK_CHICKEN_CARROT", "Arroz, feijão preto, frango e cenoura", { RICE: ["3"], BEANS: ["567"], PROTEIN: ["410"], VEGETABLES: ["109"], COOKING_FAT: ["260"] }, "SCALABLE"),
      variant("BROWN_CARIOCA_CHICKEN_ZUCCHINI", "Arroz integral, feijão carioca, frango e abobrinha", { RICE: ["1"], BEANS: ["561"], PROTEIN: ["410"], VEGETABLES: ["70"], COOKING_FAT: ["260"] }),
      variant("BROWN_BLACK_CHICKEN_BROCCOLI", "Arroz integral, feijão preto, frango e brócolis", { RICE: ["1"], BEANS: ["567"], PROTEIN: ["410"], VEGETABLES: ["100"], COOKING_FAT: ["260"] }),
    ], preparationDescription: "Montar prato com arroz, feijão, frango e legume; azeite apenas no preparo." }),
  template({ id: "POST_RICE_CHICKEN_VEGETABLES", displayName: "Arroz, frango e legumes", mealType: "POST_WORKOUT_MEAL",
    mealRoles: ["POST_WORKOUT"], components: [rice, protein, vegetables, addedFat, avocadoSide], variants: [
      variant("POST_WHITE_RICE_CHICKEN_BROCCOLI", "Arroz, frango e brócolis", { RICE: ["3"], PROTEIN: ["410"], VEGETABLES: ["100"], COOKING_FAT: ["260"] }, "SCALABLE"),
      variant("POST_BROWN_RICE_CHICKEN_CARROT", "Arroz integral, frango e cenoura", { RICE: ["1"], PROTEIN: ["410"], VEGETABLES: ["109"], COOKING_FAT: ["260"] }),
    ], preparationDescription: "Servir arroz, frango e legumes como refeição pós-treino." }),
  template({ id: "MAIN_RICE_BEANS_BEEF_VEGETABLES", displayName: "Arroz, feijão, carne e legumes", mealType: "MAIN_MEAL",
    mealRoles: ["MAIN_MEAL", "POST_WORKOUT", "EVENING_MEAL"], components: [rice, beans, protein, vegetables, addedFat, avocadoSide], variants: [
      variant("WHITE_CARIOCA_BEEF_BROCCOLI", "Arroz, feijão carioca, patinho e brócolis", { RICE: ["3"], BEANS: ["561"], PROTEIN: ["377"], VEGETABLES: ["100"], COOKING_FAT: ["260"] }, "SCALABLE"),
      variant("WHITE_BLACK_BEEF_CARROT", "Arroz, feijão preto, patinho e cenoura", { RICE: ["3"], BEANS: ["567"], PROTEIN: ["377"], VEGETABLES: ["109"], COOKING_FAT: ["260"] }, "SCALABLE"),
      variant("BROWN_CARIOCA_BEEF_ZUCCHINI", "Arroz integral, feijão carioca, patinho e abobrinha", { RICE: ["1"], BEANS: ["561"], PROTEIN: ["377"], VEGETABLES: ["70"], COOKING_FAT: ["260"] }),
      variant("BROWN_BLACK_BEEF_BROCCOLI", "Arroz integral, feijão preto, patinho e brócolis", { RICE: ["1"], BEANS: ["567"], PROTEIN: ["377"], VEGETABLES: ["100"], COOKING_FAT: ["260"] }),
    ], preparationDescription: "Montar prato com arroz, feijão, carne bovina magra e legume." }),
  template({ id: "MAIN_RICE_BEANS_FISH_VEGETABLES", displayName: "Arroz, feijão, peixe e legumes", mealType: "MAIN_MEAL",
    mealRoles: ["MAIN_MEAL", "POST_WORKOUT", "EVENING_MEAL"], components: [rice, beans, protein, vegetables, addedFat, avocadoSide], variants: [
      variant("RICE_BEANS_CORIMBATA_BROCCOLI", "Arroz, feijão, corimbatá e brócolis", { RICE: ["3"], BEANS: ["561"], PROTEIN: ["289", "290"], VEGETABLES: ["100"], COOKING_FAT: ["260"] }),
      variant("RICE_BEANS_PINTADO_CARROT", "Arroz, feijão, pintado e cenoura", { RICE: ["3"], BEANS: ["567"], PROTEIN: ["311", "313"], VEGETABLES: ["109"], COOKING_FAT: ["260"] }),
      variant("BROWN_RICE_BEANS_SARDINE_ZUCCHINI", "Arroz integral, feijão, sardinha e abobrinha", { RICE: ["1"], BEANS: ["561"], PROTEIN: ["318"], VEGETABLES: ["70"], COOKING_FAT: ["260"] }),
    ], preparationDescription: "Montar prato com arroz, feijão, peixe preparado e legume." }),
  template({ id: "MAIN_POTATO_CHICKEN_VEGETABLES", displayName: "Batata-doce, frango e legumes", mealType: "MAIN_MEAL",
    mealRoles: ["MAIN_MEAL", "POST_WORKOUT", "EVENING_MEAL"], components: [potato, protein, vegetables, addedFat, avocadoSide], variants: [
      variant("POTATO_CHICKEN_BROCCOLI", "Batata-doce, frango e brócolis", { POTATO: ["88"], PROTEIN: ["410"], VEGETABLES: ["100"], COOKING_FAT: ["260"] }),
      variant("POTATO_CHICKEN_CARROT", "Batata-doce, frango e cenoura", { POTATO: ["88"], PROTEIN: ["410"], VEGETABLES: ["109"], COOKING_FAT: ["260"] }),
    ], preparationDescription: "Servir batata-doce com frango e legumes." }),
  template({ id: "MAIN_RICE_LENTILS_PROTEIN_VEGETABLES", displayName: "Arroz, lentilha, proteína e legumes", mealType: "MAIN_MEAL",
    mealRoles: ["MAIN_MEAL", "POST_WORKOUT", "EVENING_MEAL"], components: [rice, lentils, protein, vegetables, addedFat, avocadoSide], variants: [
      variant("RICE_LENTILS_CHICKEN_BROCCOLI", "Arroz, lentilha, frango e brócolis", { RICE: ["3"], LENTILS: ["577"], PROTEIN: ["410"], VEGETABLES: ["100"], COOKING_FAT: ["260"] }),
      variant("RICE_LENTILS_BEEF_CARROT", "Arroz, lentilha, patinho e cenoura", { RICE: ["3"], LENTILS: ["577"], PROTEIN: ["377"], VEGETABLES: ["109"], COOKING_FAT: ["260"] }),
      variant("BROWN_RICE_LENTILS_CHICKEN_ZUCCHINI", "Arroz integral, lentilha, frango e abobrinha", { RICE: ["1"], LENTILS: ["577"], PROTEIN: ["410"], VEGETABLES: ["70"], COOKING_FAT: ["260"] }),
      variant("BROWN_RICE_LENTILS_BEEF_BROCCOLI", "Arroz integral, lentilha, patinho e brócolis", { RICE: ["1"], LENTILS: ["577"], PROTEIN: ["377"], VEGETABLES: ["100"], COOKING_FAT: ["260"] }),
    ], preparationDescription: "Montar prato com arroz, lentilha, proteína e legume." }),
  template({ id: "MAIN_MANDIOCA_PROTEIN_VEGETABLES", displayName: "Mandioca, proteína e legumes", mealType: "MAIN_MEAL",
    mealRoles: ["MAIN_MEAL", "POST_WORKOUT", "EVENING_MEAL"], components: [cassava, protein, vegetables, addedFat, avocadoSide], variants: [
      variant("CASSAVA_CHICKEN_BROCCOLI", "Mandioca, frango e brócolis", { CASSAVA: ["129"], PROTEIN: ["410"], VEGETABLES: ["100"], COOKING_FAT: ["260"] }),
      variant("CASSAVA_BEEF_CARROT", "Mandioca, patinho e cenoura", { CASSAVA: ["129"], PROTEIN: ["377"], VEGETABLES: ["109"], COOKING_FAT: ["260"] }),
    ], preparationDescription: "Servir mandioca cozida com proteína e legumes." }),
  template({ id: "MAIN_PASTA_MEAT_VEGETABLES", displayName: "Macarrão, carne e legumes", mealType: "MAIN_MEAL",
    mealRoles: ["MAIN_MEAL", "EVENING_MEAL"], components: [component({ id: "PASTA", slot: "CARB_ANCHOR", required: true }), protein, vegetables],
    variants: [variant("PLAIN_PASTA_BEEF_VEGETABLES", "Macarrão, patinho e legumes", { PASTA: ["PLAIN_COOKED_PASTA_REQUIRED"], PROTEIN: ["377"], VEGETABLES: ["100", "109", "70"] })],
    preparationDescription: "Bloqueado até existir macarrão simples cozido com nutrientes completos; molho bolonhesa não é usado como massa simples." }),
  template({ id: "POST_YOGURT_FRUIT_OATS", displayName: "Iogurte com fruta e aveia", mealType: "POST_WORKOUT_SNACK",
    mealRoles: ["POST_WORKOUT", "EVENING_MEAL"], components: [yogurt, oats, fruit], variants: [
      variant("POST_YOGURT_BANANA_OATS", "Iogurte natural com banana e aveia", { YOGURT: ["448"], OATS: ["7"], FRUIT: ["182"] }),
      variant("POST_SKIM_YOGURT_PAPAYA_OATS", "Iogurte desnatado com mamão e aveia", { YOGURT: ["449"], OATS: ["7"], FRUIT: ["225", "226"] }, "LIGHT"),
    ], preparationDescription: "Misturar iogurte, aveia e fruta como lanche pós-treino." }),
  template({ id: "EVENING_BREAD_EGGS_FRUIT", displayName: "Pão com ovos e fruta", mealType: "EVENING_MEAL",
    mealRoles: ["EVENING_MEAL"], components: [bread, eggs, fruit], variants: [
      variant("EVENING_FRENCH_BREAD_EGGS", "Pão francês com ovos e banana", { BREAD: ["53"], EGGS: ["488"], FRUIT: ["182"] }),
      variant("EVENING_WHOLE_BREAD_EGGS", "Pão integral com ovos e mamão", { BREAD: ["52"], EGGS: ["488"], FRUIT: ["225", "226"] }, "LIGHT"),
    ], preparationDescription: "Ceia reconhecível de pão com ovos e fruta." }),
] as const;

export function allRealMealTemplates(): readonly RealMealTemplate[] {
  return REAL_MEAL_TEMPLATES_V1;
}

export function realMealTemplateById(id: string): RealMealTemplate | undefined {
  return REAL_MEAL_TEMPLATES_V1.find((value) => value.id === id);
}
