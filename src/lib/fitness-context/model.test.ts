import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLegacyFitnessContext,
  buildV2FitnessContext,
  calculateAge,
  FitnessContextError,
  type LegacyProfileRow,
  type V2ContextRows,
} from "./model.ts";
import {
  buildChatFitnessPrompt,
  buildWorkoutFitnessPrompt,
} from "./prompt.ts";

const legacyProfile: LegacyProfileRow = {
  nome: "Pessoa V1",
  onboarding_version: null,
  objetivo: "massa",
  nivel_experiencia: "iniciante",
  dias_treino: 3,
  idade: 29,
  sexo: "F",
  peso: 67,
  altura: 168,
};

function completeV2Rows(goal = "hypertrophy"): V2ContextRows {
  return {
    health: {
      birth_date: "2000-09-23",
      biological_sex: "not_specified",
      height_cm: 175,
      weight_kg: 70,
      target_weight_kg: null,
      primary_goal: goal,
    },
    training: {
      primary_goal: goal,
      priority_muscles: [],
      training_experience: "under_6_months",
      exercise_confidence: "needs_guidance",
      recent_training_break: "under_1_month",
      initial_training_level: "beginner",
      training_days_per_week: 3,
      available_weekdays: [1, 3, 5],
      session_duration_min: 60,
      session_duration_is_plus: false,
      training_location: "full_gym",
      other_location_label: null,
      available_equipment: [],
      other_equipment_label: null,
      pain_or_limitation: false,
      affected_body_areas: [],
    },
    nutrition: {
      meals_per_day: null,
      meal_schedule_flexibility: "moderate",
      food_preparation_style: "cook_some",
      food_budget_style: "balanced",
      dietary_pattern: "omnivore",
      dietary_pattern_other_label: null,
      has_food_restrictions: false,
      uses_supplements: false,
      accepts_eggs: null,
      accepts_dairy: null,
    },
    activities: [],
    restrictions: [],
    dislikedFoods: [],
    preferredFoods: [],
    supplements: [],
  };
}

test("preserva o comportamento V1 sem exigir linhas V2", () => {
  const context = buildLegacyFitnessContext(legacyProfile);
  assert.equal(context.source, "v1");
  assert.equal(context.health.weightKg, 67);
  assert.equal(context.training.trainingExperience, "iniciante");
  assert.equal(context.nutrition.mealsPerDay, null);
  assert.equal(context.nutrition.restrictions, null);
});

test("normaliza um V2 completo e preserva arrays vazios e nulls V2.1", () => {
  const context = buildV2FitnessContext(
    { ...legacyProfile, onboarding_version: 2 },
    completeV2Rows(),
    new Date("2026-09-22T12:00:00Z")
  );

  assert.equal(context.source, "v2");
  assert.equal(context.health.age, 25);
  assert.deepEqual(context.training.priorityMuscles, []);
  assert.deepEqual(context.training.activities, []);
  assert.equal(context.nutrition.mealsPerDay, null);
  assert.equal(context.nutrition.acceptsEggs, null);
  assert.equal(context.nutrition.acceptsDairy, null);
});

for (const missingDomain of ["health", "training", "nutrition"] as const) {
  test(`detecta V2 sem ${missingDomain} e não usa fallback legado`, () => {
    const rows = completeV2Rows();
    rows[missingDomain] = null;

    assert.throws(
      () =>
        buildV2FitnessContext(
          { ...legacyProfile, onboarding_version: 2 },
          rows
        ),
      (error) =>
        error instanceof FitnessContextError &&
        error.code === "V2_INCOMPLETE" &&
        error.missingDomains.includes(missingDomain)
    );
  });
}

test("calcula idade por calendário a partir de birth_date", () => {
  assert.equal(calculateAge("2000-09-22", new Date("2026-09-22T00:00:00Z")), 26);
  assert.equal(calculateAge("2000-09-23", new Date("2026-09-22T23:59:59Z")), 25);
});

for (const goal of ["fat_loss", "hypertrophy", "conditioning"]) {
  test(`preserva o objetivo V2 ${goal} sem remapeamento semântico`, () => {
    const context = buildV2FitnessContext(
      { ...legacyProfile, onboarding_version: 2 },
      completeV2Rows(goal)
    );
    assert.equal(context.health.primaryGoal, goal);
    assert.equal(context.training.primaryGoal, goal);
  });
}

test("V2 nunca recebe valores legados conflitantes", () => {
  const context = buildV2FitnessContext(
    { ...legacyProfile, onboarding_version: 2, peso: 999, objetivo: "massa" },
    completeV2Rows("conditioning")
  );
  assert.equal(context.health.weightKg, 70);
  assert.equal(context.health.primaryGoal, "conditioning");
});

test("prompts V2 preservam vazios reais sem imprimir null nem inventar respostas removidas", () => {
  const context = buildV2FitnessContext(
    { ...legacyProfile, onboarding_version: 2 },
    completeV2Rows(),
    new Date("2026-09-22T12:00:00Z")
  );

  const workoutPrompt = buildWorkoutFitnessPrompt(context);
  const chatPrompt = buildChatFitnessPrompt(context);

  for (const prompt of [workoutPrompt, chatPrompt]) {
    assert.doesNotMatch(prompt, /\bnull\b/i);
    assert.match(prompt, /Objetivo (?:Principal|de treino): hipertrofia/);
    assert.match(prompt, /Músculos prioritários: Nenhum/);
    assert.match(prompt, /Outras atividades: Nenhuma/);
    assert.match(prompt, /Equipamentos: Academia completa/);
    assert.match(prompt, /Dor ou limitação: Nenhuma declarada/);
  }

  assert.match(workoutPrompt, /Idade: 25/);
  assert.match(chatPrompt, /Idade: 25/);
  assert.doesNotMatch(chatPrompt, /Refeições por dia|Aceita ovos|Aceita laticínios/i);
});

test("prompts V2 incluem limitações e agendas de atividades sem perder labels livres", () => {
  const rows = completeV2Rows();
  rows.training = {
    ...rows.training!,
    training_location: "other",
    other_location_label: "Academia do condomínio",
    available_equipment: ["dumbbells", "other"],
    other_equipment_label: "TRX",
    pain_or_limitation: true,
    affected_body_areas: ["knee"],
    priority_muscles: ["back"],
  };
  rows.activities = [
    {
      activity_code: "running",
      other_activity_label: null,
      schedule_type: "variable",
      available_weekdays: null,
      sessions_per_week: 2,
    },
  ];

  const context = buildV2FitnessContext(
    { ...legacyProfile, onboarding_version: 2 },
    rows
  );
  const prompt = buildChatFitnessPrompt(context);

  assert.match(prompt, /Local de treino: Academia do condomínio/);
  assert.match(prompt, /Equipamentos: dumbbells, TRX/);
  assert.match(prompt, /Dor ou limitação: Sim — áreas afetadas: knee/);
  assert.match(prompt, /Músculos prioritários: back/);
  assert.match(prompt, /Outras atividades: running \(2x\/semana\)/);
});

test("prompt V1 continua limitado aos campos legados conhecidos", () => {
  const context = buildLegacyFitnessContext(legacyProfile);
  const workoutPrompt = buildWorkoutFitnessPrompt(context);
  const chatPrompt = buildChatFitnessPrompt(context);

  assert.match(workoutPrompt, /Objetivo Principal: massa/);
  assert.match(chatPrompt, /fonte V1/);
  assert.doesNotMatch(workoutPrompt, /Músculos prioritários/);
  assert.doesNotMatch(chatPrompt, /Padrão alimentar/);
  assert.doesNotMatch(chatPrompt, /\bnull\b/i);
});
