import assert from "node:assert/strict";
import test from "node:test";

import { resolveWorkoutDisplayName } from "./display-name.ts";

test("preserva título autoritativo já descritivo", () => {
  assert.equal(resolveWorkoutDisplayName({
    title: "Força de pernas",
    muscleGroup: "Peito",
    exerciseNames: ["Supino reto"],
  }), "Força de pernas");
});

test("usa metadata muscular de planos novos antes de inferir exercícios", () => {
  for (const [muscleGroup, expected] of [
    ["Peito e tríceps", "Peito + Tríceps"],
    ["Costas / bíceps", "Costas + Bíceps"],
    ["Pernas + glúteos", "Pernas + Glúteos"],
    ["Upper body", "Superiores"],
    ["Lower body", "Inferiores"],
    ["Full body", "Full Body"],
  ] as const) {
    assert.equal(resolveWorkoutDisplayName({ title: "Treino A", muscleGroup }), expected);
  }
});

test("deriva fallback de plano antigo a partir dos exercícios reais", () => {
  assert.equal(resolveWorkoutDisplayName({
    title: "Treino A",
    exerciseNames: ["Supino reto", "Crucifixo inclinado", "Tríceps testa"],
  }), "Peito + Tríceps");
  assert.equal(resolveWorkoutDisplayName({
    title: "workout_b",
    exerciseNames: ["Puxada alta", "Remada baixa", "Rosca direta"],
  }), "Costas + Bíceps");
  assert.equal(resolveWorkoutDisplayName({
    title: "C",
    exerciseNames: ["Agachamento", "Hip thrust", "Abdutora"],
  }), "Pernas + Glúteos");
  assert.equal(resolveWorkoutDisplayName({
    title: "Treino D",
    exerciseNames: ["Desenvolvimento", "Elevação lateral", "Prancha abdominal"],
  }), "Ombros + Abdômen");
});

test("mantém fallback técnico quando não há evidência muscular suficiente", () => {
  assert.equal(resolveWorkoutDisplayName({
    title: "Treino A",
    exerciseNames: ["Movimento personalizado"],
  }), "Treino A");
});
