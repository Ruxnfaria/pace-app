import type { MealPlanGenerationContext, ResolvedMealPlan } from "../meal-generation/domain";
import type { NutritionQualityGoal, MealCoherenceIssue, MealCoherenceReport } from "./domain";
import { MEAL_COHERENCE_VALIDATOR_VERSION } from "./domain";
import { validateDailyMealQuality } from "./daily-quality";
import { classifyFoodSuitability } from "./food-suitability";
import { archetypeAcceptsRoles, mealArchetypeFor } from "./meal-archetypes";
import { validatePortionRealism } from "./portion-realism";

function issue(code: MealCoherenceIssue["code"], severity: MealCoherenceIssue["severity"], message: string,
  mealPosition?: number, itemPosition?: number): MealCoherenceIssue {
  return { code, severity, message, ...(mealPosition ? { mealPosition } : {}), ...(itemPosition ? { itemPosition } : {}) };
}

export function plausiblePortionRange(profile: ReturnType<typeof classifyFoodSuitability>): { minimum: number; maximum: number } {
  // Product autogeneration guardrail. It is intentionally not a clinical serving recommendation.
  if (profile.specialPortionGuard === "HIGH_MICRONUTRIENT_DENSITY") return { minimum: 0, maximum: 0 };
  if (profile.form === "CULINARY_INGREDIENT" || profile.form === "CONDIMENT") return { minimum: 1, maximum: 25 };
  if (profile.form === "POWDER_OR_MIX") return { minimum: 2, maximum: 40 };
  if (profile.form === "PREPARED_COMPOSITE") return { minimum: 10, maximum: 500 };
  if (profile.culinaryRoles.includes("FAT")) return { minimum: 5, maximum: 60 };
  if (profile.culinaryRoles.includes("FRUIT")) return { minimum: 10, maximum: 300 };
  return { minimum: 5, maximum: 1000 };
}

function isSubstantialTrainingMeal(plan: ResolvedMealPlan, mealIndex: number): boolean {
  const meal = plan.meals[mealIndex];
  return meal.target.calories >= plan.totals.calories / Math.max(plan.meals.length, 1) * 0.75;
}

function hasRole(roles: string[], ...expected: string[]): boolean {
  return expected.some((role) => roles.includes(role));
}

export function validateMealCoherence(
  plan: ResolvedMealPlan,
  goal: NutritionQualityGoal,
  context?: Pick<MealPlanGenerationContext, "mealWindows" | "trainingPeriod">,
): MealCoherenceReport {
  void context;
  const issues: MealCoherenceIssue[] = [];
  const dailyNames: string[] = [];
  const proteinNames: string[] = [];
  for (const [mealIndex, meal] of plan.meals.entries()) {
    const profiles = meal.items.map((item) => classifyFoodSuitability(item.food));
    const allRoles = [...new Set(profiles.flatMap((profile) => profile.culinaryRoles))];
    const archetype = mealArchetypeFor(meal.role, goal);
    const incompatibleMealItem = profiles.some((profile, index) => !profile.suitableMealRoles.includes(meal.role)
      && !(profile.culinaryRoles.includes("CULINARY_FAT") && meal.items[index].slot === "FAT_ANCHOR"));
    if (incompatibleMealItem || !archetypeAcceptsRoles(archetype, allRoles) || meal.items.length > archetype.maximumItems) {
      issues.push(issue(meal.role === "BREAKFAST" ? "BREAKFAST_ROLE_MISMATCH" : "MEAL_ARCHETYPE_INVALID",
        "HARD_FAILURE", `Meal does not satisfy ${archetype.id}`, meal.position));
    }

    const substantialTrainingMeal = isSubstantialTrainingMeal(plan, mealIndex);
    const mainStyle = meal.role === "MAIN_MEAL" || meal.role === "EVENING_MEAL"
      || (meal.role === "POST_WORKOUT" && substantialTrainingMeal);
    const required: Array<[boolean, string]> = [];
    if (meal.role === "BREAKFAST") {
      required.push([hasRole(allRoles, "PROTEIN", "DAIRY"), "breakfast protein"]);
      required.push([hasRole(allRoles, "STARCH", "WHOLE_GRAIN"), "breakfast starch or grain"]);
      required.push([hasRole(allRoles, "FRUIT"), "fruit"]);
    }
    if (mainStyle) {
      required.push([hasRole(allRoles, "LEAN_PROTEIN", "PROTEIN"), "protein"]);
      required.push([hasRole(allRoles, "STARCH"), "starch"]);
      required.push([hasRole(allRoles, "VEGETABLE"), "vegetable produce"]);
    }
    if (meal.role === "PRE_WORKOUT" && substantialTrainingMeal) {
      required.push([hasRole(allRoles, "LEAN_PROTEIN", "PROTEIN", "DAIRY"), "lean protein"]);
      required.push([hasRole(allRoles, "STARCH", "WHOLE_GRAIN"), "starch or grain"]);
    }
    for (const [present, label] of required) {
      if (!present) issues.push(issue("MEAL_REQUIRED_SLOT_MISSING", "HARD_FAILURE", `Required ${label} slot is missing`, meal.position));
    }
    if (mainStyle && !hasRole(allRoles, "VEGETABLE")) {
      issues.push(issue("MAIN_MEAL_MISSING_PRODUCE", "HARD_FAILURE", "Main meal lacks a vegetable produce component", meal.position));
    }

    const compositeIndexes = profiles.flatMap((profile, index) => profile.form === "PREPARED_COMPOSITE" ? [index] : []);
    if (compositeIndexes.length > 0 && profiles.some((profile, index) => !compositeIndexes.includes(index)
      && hasRole(profile.culinaryRoles, "LEAN_PROTEIN", "PROTEIN"))) {
      issues.push(issue("COMPOSITE_DISH_SLOT_CONFLICT", "HARD_FAILURE",
        "Prepared composite cannot be treated as a plain starch beside another protein anchor", meal.position));
    }

    const primaryCalories = meal.items.flatMap((item, index) => profiles[index].qualityClass === "CORE"
      && item.slot !== "FAT_ANCHOR" ? [item.nutrients.calories] : []);
    const largestPrimary = Math.max(...primaryCalories, 0);
    meal.items.forEach((item, index) => {
      const profile = profiles[index];
      dailyNames.push(item.food.normalizedName);
      if (hasRole(profile.culinaryRoles, "LEAN_PROTEIN", "PROTEIN")) proteinNames.push(item.food.normalizedName);
      const modeledCulinarySupport = profile.qualityClass === "INGREDIENT_ONLY"
        && profile.culinaryRoles.includes("CULINARY_FAT") && item.slot === "FAT_ANCHOR";
      if (!profile.autoGenerationApproved && !modeledCulinarySupport) issues.push(issue("FOOD_NOT_AUTOGENERATION_APPROVED", "HARD_FAILURE",
        "Food is outside the curated automatic-generation set", meal.position, index + 1));
      if (profile.standaloneSuitability === "NOT_STANDALONE" && !modeledCulinarySupport) issues.push(issue("CULINARY_INGREDIENT_STANDALONE", "HARD_FAILURE",
        "Culinary ingredient cannot be a standalone meal item", meal.position, index + 1));
      if (profile.form === "POWDER_OR_MIX") issues.push(issue("POWDER_AS_MEAL_COMPONENT", "HARD_FAILURE",
        "Powder or mix cannot be an authoritative meal component", meal.position, index + 1));
      if (profile.form === "SWEET" && item.nutrients.carbsG >= Math.max(10, meal.totals.carbsG * 0.25)) {
        issues.push(issue("SWEET_AS_PRIMARY_CARB", "HARD_FAILURE", "Sweet cannot be the primary carbohydrate", meal.position, index + 1));
      }
      const range = plausiblePortionRange(profile);
      if (item.quantityGrams < range.minimum || item.quantityGrams > range.maximum) {
        issues.push(issue("FOOD_PORTION_IMPLAUSIBLE", "HARD_FAILURE",
          "Portion violates a food-form, role, energy or special-safety product guardrail", meal.position, index + 1));
      }
      if ((meal.role === "BREAKFAST" || mainStyle || meal.role === "PRE_WORKOUT")
        && (profile.qualityClass === "SUPPORTING" || item.slot === "FAT_ANCHOR") && largestPrimary > 0
        && item.nutrients.calories >= largestPrimary) {
        issues.push(issue("SUPPORTING_ITEM_DOMINATES_MEAL", "HARD_FAILURE",
          "Supporting item cannot be the meal's largest energy contributor", meal.position, index + 1));
      }
    });
    if (meal.role === "PRE_WORKOUT" && meal.totals.calories > 0 && meal.totals.fatG * 9 / meal.totals.calories > 0.35) {
      issues.push(issue("PRE_WORKOUT_TOO_FAT_DENSE", "HARD_FAILURE", "Pre-workout meal is too fat-dense", meal.position));
    }
  }
  const maximumOccurrences = Math.max(...new Set(dailyNames).values().map((name) => dailyNames.filter((value) => value === name).length), 0);
  if (maximumOccurrences > Math.max(2, Math.ceil(plan.meals.length * 0.6))) issues.push(issue("EXCESSIVE_REPETITION", "WARNING", "One food repeats excessively across the day"));
  if (new Set(dailyNames).size < Math.min(6, dailyNames.length)) issues.push(issue("LOW_DAILY_VARIETY", "WARNING", "Daily food variety is limited"));
  if (proteinNames.length >= 3 && new Set(proteinNames).size === 1) issues.push(issue("PROTEIN_SOURCE_REPETITION", "WARNING", "The same protein source is used throughout the day"));
  issues.push(...validateDailyMealQuality(plan).issues);
  issues.push(...validatePortionRealism(plan).issues);
  return { valid: !issues.some((value) => value.severity === "HARD_FAILURE"), validatorVersion: MEAL_COHERENCE_VALIDATOR_VERSION, issues };
}
