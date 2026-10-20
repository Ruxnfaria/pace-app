import type { ResolvedWorkoutPrescription } from "../prescription/domain.ts";
import {
  MAX_WORKOUT_REPAIR_ATTEMPTS,
  type GeneratedWorkoutSelectionPlan,
  type WorkoutValidationReport,
} from "./domain.ts";
import { validateWorkoutPrescription } from "./validator.ts";

export type ControlledRepairResult = {
  plan: GeneratedWorkoutSelectionPlan;
  report: WorkoutValidationReport;
  repairAttempted: boolean;
  repairSucceeded: boolean;
};

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildWorkoutRepairPrompt(input: {
  prescription: ResolvedWorkoutPrescription;
  generated: GeneratedWorkoutSelectionPlan;
  report: WorkoutValidationReport;
}): string {
  return `CORREÇÃO CONTROLADA DE TREINO — UMA ÚNICA TENTATIVA.
Corrija somente os issues listados. Preserve exatamente goal, strategyVersion, split, frequência, dias, session ids, session kinds, cardio budget e volume prescrito.
Você pode trocar exercícios por opções do catálogo, corrigir slots, ajustar séries dentro da tolerância e corrigir ordem. Não adicione sessões.
Retorne somente o mesmo JSON estruturado de sessions.

BEGIN_AUTHORITATIVE_PRESCRIPTION
${safeJson(input.prescription)}
END_AUTHORITATIVE_PRESCRIPTION

BEGIN_INVALID_PLAN
${safeJson(input.generated)}
END_INVALID_PLAN

BEGIN_VALIDATION_ISSUES
${safeJson(input.report.issues.map((item) => ({
    code: item.code,
    severity: item.severity,
    sessionId: item.sessionId,
    exerciseIndex: item.exerciseIndex,
    muscleGroup: item.muscleGroup,
    expected: item.expected,
    observed: item.observed,
  })))}
END_VALIDATION_ISSUES`;
}

export async function runControlledWorkoutRepair(input: {
  prescription: ResolvedWorkoutPrescription;
  generated: GeneratedWorkoutSelectionPlan;
  report: WorkoutValidationReport;
  invokeRepair: (prompt: string) => Promise<GeneratedWorkoutSelectionPlan>;
}): Promise<ControlledRepairResult> {
  if (input.report.valid) {
    return {
      plan: input.generated,
      report: input.report,
      repairAttempted: false,
      repairSucceeded: false,
    };
  }

  let attempts = 0;
  attempts += 1;
  if (attempts > MAX_WORKOUT_REPAIR_ATTEMPTS) {
    return {
      plan: input.generated,
      report: input.report,
      repairAttempted: false,
      repairSucceeded: false,
    };
  }
  const repaired = await input.invokeRepair(buildWorkoutRepairPrompt(input));
  const report = validateWorkoutPrescription(input.prescription, repaired);
  return {
    plan: repaired,
    report,
    repairAttempted: true,
    repairSucceeded: report.valid,
  };
}
