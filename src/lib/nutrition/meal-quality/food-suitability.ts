import type { NutritionFoodCatalogEntry } from "../food-catalog/domain";
import type { MealRole } from "../meal-plan/domain";
import type { CulinaryRole, FoodForm, FoodQualityClass, FoodSuitabilityProfile } from "./domain";

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const SWEET = /\b(acucar|achocolatado|chocolate|doce|goiabada|marmelada|rapadura|mel|melado|geleia|pacoca|pe-de-moleque|sorvete|pudim|bala|caramelo|glicose|xarope|calda|cocada|quindim|maria mole|leite,? condensado|chantilly)\b/;
const POWDER = /\b(po|farinha|fecula|amido|mistura|fermento|gelatina)\b/;
const CONDIMENT = /\b(molho|vinagre|sal,|maionese|mostarda|catchup|ketchup)\b/;
const BEVERAGE = /\b(suco|refrigerante|cerveja|vinho|cha,|cafe,|bebida)\b/;
const HIGHLY_PROCESSED = /(rechead|instantane|salgadinho|refresco em po|mistura para|barra de cereal|embutid|mortadela|salsicha|linguica|apresuntado|presunto|bacon|toucinho|torresmo|hamburguer|nugget|caldo de (carne|galinha), tablete|cream cracker|bolo, pronto|chips, industrializada|cereal matinal|mingau, milho, infantil)/;
const PREPARED_STATES = new Set(["cooked", "grilled", "roasted", "sauteed"]);
const PREPARED_NAME = /\b(cozid|grelhad|assad|refogad|ensopad|preparad)/;
const ANIMAL_GROUPS = new Set(["meats", "poultry", "fish"]);
const RAW_READY_GROUPS = new Set(["fruits", "vegetables", "nuts_seeds"]);
const BRAZIL_NUT_IDENTITY = { sourceVersion: "4_edicao_2011", sourceFoodId: "589" } as const;
const PREPARED_COMPOSITE = /\b(bologn|bolonhesa|cuscuz,? paulista|lasanha|pizza|sanduiche|salpicao|feijoada|dobradinha|estrogonofe|risoto)/;

function isSweetName(name: string): boolean {
  return SWEET.test(name) && !/\b(batata,? doce|erva-doce)\b/.test(name);
}

function formFor(entry: NutritionFoodCatalogEntry, name: string): FoodForm {
  const group = normalized(entry.foodGroup);
  if (/\bisotonic/.test(name)) return "SPORTS_FUEL";
  if (PREPARED_COMPOSITE.test(name)) return "PREPARED_COMPOSITE";
  if (POWDER.test(name)) return "POWDER_OR_MIX";
  if (group === "oils_fats") return "CULINARY_INGREDIENT";
  if (/desidratad|creme de leite|leite,? de coco/.test(name)) return "CULINARY_INGREDIENT";
  if (isSweetName(name) || group === "taco:produtos_acucarados") return "SWEET";
  if ((CONDIMENT.test(name) && !/^macarrao, molho/.test(name) && !/^mostarda, folha/.test(name))
    || /\b(shoyu|tempero a base de sal)\b/.test(name)) return "CONDIMENT";
  if (BEVERAGE.test(name) || group === "taco:bebidas_alcoolicas_e_nao_alcoolicas") return "BEVERAGE";
  if (PREPARED_STATES.has(entry.preparationState) || PREPARED_NAME.test(name)) return "COOKED_COMPONENT";
  if (entry.preparationState === "raw" || /\bin natura\b/.test(name)) return "WHOLE_FOOD";
  return "READY_TO_EAT_FOOD";
}

function rolesFor(entry: NutritionFoodCatalogEntry, name: string): CulinaryRole[] {
  const group = normalized(entry.foodGroup);
  const roles = new Set<CulinaryRole>();
  if (/frango|peru|peixe|atum|tilapia|patinho|lombo/.test(name)) roles.add("LEAN_PROTEIN");
  if (/carne|frango|peru|peixe|ovo|queijo|leite|iogurte|soja|tofu/.test(name)
    || /^(meats|poultry|fish|eggs|dairy|legumes)$/.test(group)) roles.add("PROTEIN");
  if (/arroz|batata|mandioca|inhame|macarrao|massa|pao|aveia|milho|cuscuz|tapioca/.test(name) || /cereal|root|pasta|bread/.test(group)) roles.add("STARCH");
  if (/\b(feijao|lentilha|grao-de-bico|ervilha)\b/.test(name) || group === "legumes") roles.add("LEGUME");
  if (/\b(banana|maca|laranja|mamao|manga|abacaxi|uva|morango|goiaba)\b/.test(name) || group === "fruits") roles.add("FRUIT");
  if (/\b(brocol|couve|alface|tomate|cenoura|abobrinha|berinjela|repolho|espinafre)\b/.test(name) || group === "vegetables") roles.add("VEGETABLE");
  if (/leite|iogurte|queijo|coalhada/.test(name) || /dairy|leite/.test(group)) roles.add("DAIRY");
  if (/aveia/.test(name) || (/integral/.test(name) && /cereal|bread|pasta/.test(group))) roles.add("WHOLE_GRAIN");
  if (/castanha|noz|amendoim|semente|abacate/.test(name) || group === "nuts_seeds") roles.add("FAT");
  if (group === "oils_fats") roles.add("CULINARY_FAT");
  if (/acucar|mel|rapadura/.test(name)) roles.add("SWEETENER");
  if (BEVERAGE.test(name) || /leite/.test(name) || group === "taco:bebidas_alcoolicas_e_nao_alcoolicas") roles.add("BEVERAGE");
  if (CONDIMENT.test(name) && !/^macarrao, molho/.test(name) && !/^mostarda, folha/.test(name)) roles.add("CONDIMENT");
  if (roles.size === 0) roles.add("OTHER");
  return [...roles];
}

function qualityFor(entry: NutritionFoodCatalogEntry, form: FoodForm, name: string): FoodQualityClass {
  if (HIGHLY_PROCESSED.test(name)) return "EXCLUDE_FROM_AUTOGENERATION";
  if (entry.preparationState === "fried") return "OCCASIONAL";
  if (form === "PREPARED_COMPOSITE") return "SUPPORTING";
  if (form === "POWDER_OR_MIX" || form === "CULINARY_INGREDIENT" || form === "CONDIMENT") return "INGREDIENT_ONLY";
  if (form === "SWEET") return "OCCASIONAL";
  if (/\b(refrigerante|cerveja|vinho)\b/.test(name)) return "EXCLUDE_FROM_AUTOGENERATION";
  if (form === "SPORTS_FUEL" || form === "BEVERAGE") return "SUPPORTING";
  if (/\bpipoca\b/.test(name) || entry.preparationState === "preserved") return "SUPPORTING";
  if (/\b(queijo|leite|iogurte|ovo|castanha|noz|amendoim)\b/.test(name)) return "SUPPORTING";
  return "CORE";
}

function mealRolesFor(entry: NutritionFoodCatalogEntry, roles: CulinaryRole[], quality: FoodQualityClass): MealRole[] {
  if (quality === "INGREDIENT_ONLY" || quality === "EXCLUDE_FROM_AUTOGENERATION" || quality === "OCCASIONAL") return [];
  const result = new Set<MealRole>();
  const group = normalized(entry.foodGroup);
  const name = normalized(entry.canonicalName);
  const breakfastProtein = (group === "eggs" || group === "dairy") && roles.includes("PROTEIN");
  const breakfastCarb = roles.includes("FRUIT") || roles.includes("WHOLE_GRAIN")
    || (/\b(pao|cuscuz|tapioca|aveia)\b/.test(name) && roles.includes("STARCH"));
  if (/\bpipoca\b/.test(name)) {
    result.add("SNACK");
    return [...result];
  }
  if (breakfastProtein || breakfastCarb || (group === "nuts_seeds" && roles.includes("FAT"))) {
    result.add("BREAKFAST"); result.add("SNACK");
  }
  if (roles.some((role) => ["LEAN_PROTEIN", "PROTEIN", "STARCH", "LEGUME", "VEGETABLE"].includes(role))) {
    result.add("MAIN_MEAL"); result.add("EVENING_MEAL");
  }
  if (roles.some((role) => ["LEAN_PROTEIN", "PROTEIN", "DAIRY", "FRUIT", "STARCH", "WHOLE_GRAIN"].includes(role))) {
    result.add("PRE_WORKOUT"); result.add("POST_WORKOUT");
  }
  if (roles.includes("VEGETABLE")) result.add("POST_WORKOUT");
  if (formFor(entry, name) === "SPORTS_FUEL") {
    result.add("PRE_WORKOUT"); result.add("POST_WORKOUT");
  }
  return [...result];
}

export function classifyFoodSuitability(entry: NutritionFoodCatalogEntry): FoodSuitabilityProfile {
  const name = normalized(entry.canonicalName);
  const group = normalized(entry.foodGroup);
  const form = formFor(entry, name);
  const culinaryRoles = rolesFor(entry, name);
  const qualityClass = qualityFor(entry, form, name);
  const suitableMealRoles = mealRolesFor(entry, culinaryRoles, qualityClass);
  const rawRequiresCooking = entry.preparationState === "raw"
    && (ANIMAL_GROUPS.has(group) || culinaryRoles.includes("STARCH") || culinaryRoles.includes("LEGUME") || group === "eggs");
  const preparedState = PREPARED_STATES.has(entry.preparationState) || PREPARED_NAME.test(name) ? "PREPARED"
    : entry.preparationState === "raw"
      ? rawRequiresCooking ? "REQUIRES_PREPARATION" : RAW_READY_GROUPS.has(group) ? "RAW_READY" : "REQUIRES_PREPARATION"
      : form === "CULINARY_INGREDIENT" || form === "POWDER_OR_MIX" ? "REQUIRES_PREPARATION"
        : form === "READY_TO_EAT_FOOD" || form === "WHOLE_FOOD" || form === "BEVERAGE" ? "RAW_READY" : "AS_DESCRIBED";
  const specialPortionGuard = entry.source === "TACO"
    && entry.sourceVersion === BRAZIL_NUT_IDENTITY.sourceVersion
    && entry.sourceFoodId === BRAZIL_NUT_IDENTITY.sourceFoodId
    ? "HIGH_MICRONUTRIENT_DENSITY" as const : null;
  const autoGenerationApproved = (qualityClass === "CORE" || qualityClass === "SUPPORTING")
    && form !== "UNKNOWN" && form !== "PREPARED_COMPOSITE"
    && preparedState !== "REQUIRES_PREPARATION" && suitableMealRoles.length > 0
    && specialPortionGuard === null;
  return {
    identity: { source: "TACO", sourceVersion: entry.sourceVersion, sourceFoodId: entry.sourceFoodId },
    form, qualityClass, culinaryRoles, preparedState, suitableMealRoles,
    trainingSuitability: culinaryRoles.includes("FAT") || culinaryRoles.includes("CULINARY_FAT") ? "LIMITED"
      : suitableMealRoles.some((role) => role === "PRE_WORKOUT" || role === "POST_WORKOUT") ? "SUITABLE" : "UNSUITABLE",
    standaloneSuitability: qualityClass === "INGREDIENT_ONLY" ? "NOT_STANDALONE"
      : qualityClass === "OCCASIONAL" ? "WITH_MEAL_ONLY" : "SUITABLE",
    autoGenerationApproved, specialPortionGuard,
    rationaleCodes: [`FORM_${form}`, `QUALITY_${qualityClass}`, ...culinaryRoles.map((role) => `ROLE_${role}`),
      ...(specialPortionGuard ? [`SPECIAL_PORTION_GUARD_${specialPortionGuard}`] : [])],
  };
}

export function isSuitableForMealRole(entry: NutritionFoodCatalogEntry, role: MealRole): boolean {
  const profile = classifyFoodSuitability(entry);
  return profile.autoGenerationApproved && profile.suitableMealRoles.includes(role);
}

export function stableFoodIdentityKey(entry: NutritionFoodCatalogEntry): string {
  return `${entry.source}:${entry.sourceVersion}:${entry.sourceFoodId}`;
}
