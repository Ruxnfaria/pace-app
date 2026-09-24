import type { UserFitnessContext } from "./model";

const GOAL_LABELS: Readonly<Record<string, string>> = {
  fat_loss: "perda de gordura",
  hypertrophy: "hipertrofia",
  conditioning: "condicionamento",
  body_recomposition: "recomposição corporal",
  strength: "força",
  health: "saúde",
};

function present(value: unknown, suffix = ""): string {
  if (value === null || value === undefined || value === "") {
    return "Não informado";
  }
  return `${String(value)}${suffix}`;
}

function list(values: readonly string[] | readonly number[] | null): string {
  return values === null ? "Não informado" : values.length === 0 ? "Nenhum" : values.join(", ");
}

function trainingLocation(context: UserFitnessContext): string {
  const { training } = context;
  if (training.trainingLocation === "other" && training.otherLocationLabel) {
    return training.otherLocationLabel;
  }
  return present(training.trainingLocation);
}

function availableEquipment(context: UserFitnessContext): string {
  const { training } = context;
  if (training.trainingLocation === "full_gym") {
    return "Academia completa";
  }

  if (training.availableEquipment === null) return "Não informado";
  if (training.availableEquipment.length === 0) return "Nenhum";

  return training.availableEquipment
    .map((equipment) =>
      equipment === "other" && training.otherEquipmentLabel
        ? training.otherEquipmentLabel
        : equipment
    )
    .join(", ");
}

function activities(context: UserFitnessContext): string {
  const values = context.training.activities;
  if (values === null) return "Não informado";
  if (values.length === 0) return "Nenhuma";

  return values
    .map((activity) => {
      const label = activity.otherActivityLabel ?? activity.activityCode;
      if (activity.scheduleType === "fixed_weekdays") {
        return `${label} (dias ${list(activity.availableWeekdays)})`;
      }
      if (activity.scheduleType === "variable") {
        return `${label} (${present(activity.sessionsPerWeek)}x/semana)`;
      }
      return label;
    })
    .join(", ");
}

function limitation(context: UserFitnessContext): string {
  const { training } = context;
  if (training.painOrLimitation === null) return "Não informado";
  if (!training.painOrLimitation) return "Nenhuma declarada";
  return `Sim — áreas afetadas: ${list(training.affectedBodyAreas)}`;
}

export function goalLabel(goal: string | null): string {
  if (!goal) return "Não informado";
  return GOAL_LABELS[goal] ?? goal;
}

export function buildWorkoutFitnessPrompt(context: UserFitnessContext): string {
  const { health, training } = context;
  const common = `- Nome do Atleta: ${present(context.identity.name)}
- Objetivo Principal: ${goalLabel(training.primaryGoal ?? health.primaryGoal)}
- Nível de Experiência: ${present(training.trainingExperience)}
- Nível Inicial: ${present(training.initialTrainingLevel)}
- Dias disponíveis por semana: ${present(training.trainingDaysPerWeek)}
- Idade: ${present(health.age)}
- Sexo biológico: ${present(health.biologicalSex)}
- Peso: ${present(health.weightKg, health.weightKg === null ? "" : " kg")}
- Altura: ${present(health.heightCm, health.heightCm === null ? "" : " cm")}`;

  if (context.source === "v1") return common;

  return `${common}
- Confiança nos exercícios: ${present(training.exerciseConfidence)}
- Pausa recente: ${present(training.recentTrainingBreak)}
- Dias disponíveis: ${list(training.availableWeekdays)}
- Duração da sessão: ${present(training.sessionDurationMin, training.sessionDurationIsPlus ? "+ min" : " min")}
- Local de treino: ${trainingLocation(context)}
- Equipamentos: ${availableEquipment(context)}
- Dor ou limitação: ${limitation(context)}
- Músculos prioritários: ${list(training.priorityMuscles)}
- Outras atividades: ${activities(context)}`;
}

export function buildChatFitnessPrompt(context: UserFitnessContext): string {
  const { health, training, nutrition } = context;
  const lines = [
    `[CONTEXTO FITNESS DO ALUNO — fonte ${context.source.toUpperCase()}]`,
    `- Nome: ${present(context.identity.name)}`,
    `- Peso atual: ${present(health.weightKg, health.weightKg === null ? "" : " kg")}`,
    `- Altura: ${present(health.heightCm, health.heightCm === null ? "" : " cm")}`,
    `- Objetivo de saúde: ${goalLabel(health.primaryGoal)}`,
    `- Objetivo de treino: ${goalLabel(training.primaryGoal)}`,
  ];

  if (context.source === "v2") {
    lines.push(
      `- Idade: ${present(health.age)}`,
      `- Sexo biológico: ${present(health.biologicalSex)}`,
      `- Peso-alvo: ${present(health.targetWeightKg, health.targetWeightKg === null ? "" : " kg")}`,
      `- Experiência de treino: ${present(training.trainingExperience)}`,
      `- Confiança nos exercícios: ${present(training.exerciseConfidence)}`,
      `- Pausa recente: ${present(training.recentTrainingBreak)}`,
      `- Nível inicial: ${present(training.initialTrainingLevel)}`,
      `- Frequência de treino: ${present(training.trainingDaysPerWeek, training.trainingDaysPerWeek === null ? "" : "x/semana")}`,
      `- Dias disponíveis: ${list(training.availableWeekdays)}`,
      `- Duração da sessão: ${present(training.sessionDurationMin, training.sessionDurationIsPlus ? "+ min" : " min")}`,
      `- Local de treino: ${trainingLocation(context)}`,
      `- Equipamentos: ${availableEquipment(context)}`,
      `- Dor ou limitação: ${limitation(context)}`,
      `- Músculos prioritários: ${list(training.priorityMuscles)}`,
      `- Outras atividades: ${activities(context)}`,
      `- Padrão alimentar: ${present(nutrition.dietaryPattern)}`,
      `- Restrições: ${nutrition.restrictions?.length === 0 ? "Nenhuma" : nutrition.restrictions?.map((item) => item.declaredLabel).join(", ") ?? "Não informado"}`,
      `- Alimentos evitados: ${nutrition.dislikedFoods?.length === 0 ? "Nenhum" : nutrition.dislikedFoods?.map((item) => item.declaredLabel).join(", ") ?? "Não informado"}`,
      `- Alimentos preferidos: ${nutrition.preferredFoods?.length === 0 ? "Nenhum" : nutrition.preferredFoods?.map((item) => item.declaredLabel).join(", ") ?? "Não informado"}`,
      `- Suplementos: ${nutrition.supplements?.length === 0 ? "Nenhum" : nutrition.supplements?.map((item) => item.declaredLabel).join(", ") ?? "Não informado"}`,
      `- Flexibilidade de horários: ${present(nutrition.mealScheduleFlexibility)}`,
      `- Estilo de preparo: ${present(nutrition.foodPreparationStyle)}`,
      `- Estilo de orçamento: ${present(nutrition.foodBudgetStyle)}`
    );
  }

  return lines.join("\n");
}
