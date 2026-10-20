import type { UserFitnessContext } from "./model.ts";
import { buildWorkoutFitnessPrompt } from "./prompt.ts";
import { resolveWorkoutDisplayName } from "../workouts/display-name.ts";
import {
  WorkoutPrescriptionError,
  type ResolvedWorkoutPrescription,
} from "../workouts/prescription/domain.ts";
import {
  resolveWorkoutPrescription,
} from "../workouts/prescription/engine.ts";
import {
  WORKOUT_VALIDATOR_VERSION,
  type GeneratedCardioSelection,
  type GeneratedExerciseSelection,
  type GeneratedSessionSelection,
  type GeneratedWorkoutSelectionPlan,
  type WorkoutValidationAudit,
} from "../workouts/validation/domain.ts";
import { runControlledWorkoutRepair } from "../workouts/validation/repair.ts";
import { validateWorkoutPrescription } from "../workouts/validation/validator.ts";

export type FitnessRouteServiceErrorCode =
  | "AI_UNAVAILABLE"
  | "INVALID_AI_RESPONSE"
  | "PRESCRIPTION_UNAVAILABLE"
  | "PRESCRIPTION_UNSATISFIABLE"
  | "WORKOUT_VALIDATION_FAILED"
  | "PERSISTENCE_FAILED";

export class FitnessRouteServiceError extends Error {
  readonly code: FitnessRouteServiceErrorCode;
  readonly status: 409 | 422 | 502 | 503;

  constructor(code: FitnessRouteServiceErrorCode, status: 409 | 422 | 502 | 503, cause?: unknown) {
    super(code, { cause });
    this.name = "FitnessRouteServiceError";
    this.code = code;
    this.status = status;
  }
}

export type FitnessRouteAccess<TClient> = {
  client: TClient;
  userId: string;
};

type FitnessRoutePipelineOptions<TClient, TValidated, TResult> = {
  requireActiveSubscription: () => Promise<FitnessRouteAccess<TClient>>;
  loadFitnessContext: (
    client: TClient,
    userId: string
  ) => Promise<UserFitnessContext>;
  validate: (context: UserFitnessContext) => Promise<TValidated> | TValidated;
  invokeOpenAI: (
    validated: TValidated,
    access: FitnessRouteAccess<TClient>
  ) => Promise<TResult>;
};

/**
 * Shared fail-closed ordering for routes that send normalized fitness context
 * to OpenAI. A rejected gate prevents every subsequent callback from running.
 */
export async function runFitnessRoutePipeline<TClient, TValidated, TResult>(
  options: FitnessRoutePipelineOptions<TClient, TValidated, TResult>
): Promise<TResult> {
  const access = await options.requireActiveSubscription();
  const context = await options.loadFitnessContext(
    access.client,
    access.userId
  );
  const validated = await options.validate(context);
  return options.invokeOpenAI(validated, access);
}

export type GeneratedExercise = {
  name: string;
  sets: string;
  reps: string;
  rest: string;
  tip: string;
};

export type GeneratedWorkout = {
  name: string;
  muscle_group: string;
  exercises: GeneratedExercise[];
  scheduled_iso_weekday?: number;
};

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function parseGeneratedExercise(value: unknown): GeneratedExercise | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const allowedKeys = new Set(["name", "sets", "reps", "rest", "tip"]);
  if (Object.keys(item).some((key) => !allowedKeys.has(key))) return null;
  const name = boundedString(item.name, 160);
  const sets = boundedString(item.sets, 40);
  const reps = boundedString(item.reps, 80);
  const rest = boundedString(item.rest, 80);
  const tip = boundedString(item.tip, 500);
  if (!name || !sets || !reps || !rest || !tip) return null;
  return { name, sets, reps, rest, tip };
}

export function parseGeneratedWorkouts(content: string): GeneratedWorkout[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502, error);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
  }
  const rawWorkouts = (parsed as Record<string, unknown>).workouts;
  if (!Array.isArray(rawWorkouts) || rawWorkouts.length === 0 || rawWorkouts.length > 14) {
    throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
  }

  const workouts = rawWorkouts.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    const name = boundedString(item.name, 160);
    const muscleGroup = boundedString(item.muscle_group, 160);
    if (!name || !muscleGroup || !Array.isArray(item.exercises) || item.exercises.length === 0 || item.exercises.length > 40) {
      return null;
    }
    const exercises = item.exercises.map(parseGeneratedExercise);
    if (exercises.some((exercise) => exercise === null)) return null;
    const validatedExercises = exercises as GeneratedExercise[];
    return {
      name: resolveWorkoutDisplayName({
        title: name,
        muscleGroup,
        exerciseNames: validatedExercises.map((exercise) => exercise.name),
      }),
      muscle_group: muscleGroup,
      exercises: validatedExercises,
    };
  });

  if (workouts.some((workout) => workout === null)) {
    throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
  }
  return workouts as GeneratedWorkout[];
}

function parseInteger(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function parseExerciseSelection(value: unknown): GeneratedExerciseSelection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const allowedKeys = new Set(["slot_id", "name", "sets", "rep_min", "rep_max", "rest_seconds", "tip"]);
  if (Object.keys(item).some((key) => !allowedKeys.has(key))) return null;
  const slotId = boundedString(item.slot_id, 200);
  const name = boundedString(item.name, 160);
  const sets = parseInteger(item.sets, 0, 20);
  const repMin = parseInteger(item.rep_min, 1, 100);
  const repMax = parseInteger(item.rep_max, 1, 100);
  const restSeconds = parseInteger(item.rest_seconds, 0, 900);
  const tip = boundedString(item.tip, 500);
  if (!slotId || !name || sets === null || repMin === null || repMax === null || restSeconds === null || !tip) {
    return null;
  }
  return { slot_id: slotId, name, sets, rep_min: repMin, rep_max: repMax, rest_seconds: restSeconds, tip };
}

function parseNullableInteger(value: unknown, minimum: number, maximum: number): number | null | undefined {
  if (value === null) return null;
  return parseInteger(value, minimum, maximum) ?? undefined;
}

function parseCardioSelection(value: unknown): GeneratedCardioSelection | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "kind", "duration_minutes", "effort_method", "target_rpe_min", "target_rpe_max",
    "talk_test", "interval_work_seconds", "interval_recovery_seconds", "rounds",
  ]);
  if (Object.keys(item).some((key) => !allowedKeys.has(key))) return undefined;
  const kind = item.kind === "AEROBIC_BASE" || item.kind === "INTERVAL" ? item.kind : null;
  const effortMethod = item.effort_method === "talk_test" || item.effort_method === "rpe"
    ? item.effort_method
    : null;
  const talkTest = item.talk_test === "comfortable_conversation" || item.talk_test === "short_phrases"
    ? item.talk_test
    : null;
  const durationMinutes = parseInteger(item.duration_minutes, 1, 300);
  const targetRpeMin = parseInteger(item.target_rpe_min, 1, 10);
  const targetRpeMax = parseInteger(item.target_rpe_max, 1, 10);
  const intervalWorkSeconds = parseNullableInteger(item.interval_work_seconds, 1, 3600);
  const intervalRecoverySeconds = parseNullableInteger(item.interval_recovery_seconds, 1, 3600);
  const rounds = parseNullableInteger(item.rounds, 1, 100);
  if (!kind || !effortMethod || !talkTest || durationMinutes === null
      || targetRpeMin === null || targetRpeMax === null
      || intervalWorkSeconds === undefined || intervalRecoverySeconds === undefined || rounds === undefined) {
    return undefined;
  }
  return {
    kind,
    duration_minutes: durationMinutes,
    effort_method: effortMethod,
    target_rpe_min: targetRpeMin,
    target_rpe_max: targetRpeMax,
    talk_test: talkTest,
    interval_work_seconds: intervalWorkSeconds,
    interval_recovery_seconds: intervalRecoverySeconds,
    rounds,
  };
}

function cardioExercise(
  selection: GeneratedExerciseSelection,
  session: ResolvedWorkoutPrescription["sessions"][number],
): GeneratedExercise {
  const cardio = session.cardio;
  if (!cardio) throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
  const intervalDescription = cardio.kind === "INTERVAL"
    ? `${cardio.rounds} rounds de ${cardio.intervalWorkSeconds}s / ${cardio.intervalRecoverySeconds}s`
    : cardio.talkTest === "comfortable_conversation" ? "ritmo de conversa confortável" : "frases curtas";
  return {
    name: selection.name,
    sets: "1",
    reps: `${cardio.durationMinutes} min · ${intervalDescription}`,
    rest: cardio.kind === "INTERVAL" ? `${cardio.intervalRecoverySeconds}s entre esforços` : "contínuo",
    tip: selection.tip,
  };
}

export function parseGeneratedWorkoutSelection(content: string): GeneratedWorkoutSelectionPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502, error);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
  }
  const root = parsed as Record<string, unknown>;
  if (root.error && typeof root.error === "object" && !Array.isArray(root.error)
      && (root.error as Record<string, unknown>).code === "PRESCRIPTION_UNSATISFIABLE") {
    throw new FitnessRouteServiceError("PRESCRIPTION_UNSATISFIABLE", 422);
  }
  if (Object.keys(root).some((key) => key !== "sessions") || !Array.isArray(root.sessions)
      || root.sessions.length === 0 || root.sessions.length > 14) {
    throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
  }
  const sessions: GeneratedSessionSelection[] = [];
  for (const raw of root.sessions) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
    }
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some((key) =>
      !["session_id", "session_kind", "iso_weekday", "title", "exercises", "cardio"].includes(key)
    )) {
      throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
    }
    const sessionId = boundedString(item.session_id, 80);
    const sessionKind = ["RESISTANCE", "AEROBIC_BASE", "INTERVAL", "STRENGTH_SUPPORT"].includes(String(item.session_kind))
      ? item.session_kind as GeneratedSessionSelection["session_kind"]
      : null;
    const isoWeekday = parseInteger(item.iso_weekday, 1, 7);
    const title = boundedString(item.title, 160);
    const cardio = parseCardioSelection(item.cardio);
    if (!sessionId || !sessionKind || isoWeekday === null || !title || cardio === undefined
        || !Array.isArray(item.exercises) || item.exercises.length === 0 || item.exercises.length > 40) {
      throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
    }
    const exercises = item.exercises.map(parseExerciseSelection);
    if (exercises.some((selection) => selection === null)) {
      throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
    }
    sessions.push({
      session_id: sessionId,
      session_kind: sessionKind,
      iso_weekday: isoWeekday,
      title,
      exercises: exercises as GeneratedExerciseSelection[],
      cardio,
    });
  }
  return { sessions };
}

function generatedWorkoutsFromSelection(
  generated: GeneratedWorkoutSelectionPlan,
  prescription: ResolvedWorkoutPrescription,
): GeneratedWorkout[] {
  const generatedById = new Map(generated.sessions.map((session) => [session.session_id, session]));
  return prescription.sessions.map((session) => {
    const raw = generatedById.get(session.id)!;
    const title = raw.title;
    const selections = raw.exercises;
    const requiredBySlot = new Map(session.requiredSlots.map((requiredSlot) => [requiredSlot.id, requiredSlot]));
    const exercises = selections.map((selection) => {
      const requiredSlot = requiredBySlot.get(selection.slot_id)!;
      if (requiredSlot.role === "cardio") return cardioExercise(selection, session);
      return {
        name: selection.name,
        sets: String(selection.sets),
        reps: selection.rep_min === selection.rep_max
          ? String(selection.rep_min)
          : `${selection.rep_min} a ${selection.rep_max}`,
        rest: `${selection.rest_seconds}s`,
        tip: selection.tip,
      };
    });
    return {
      name: title,
      muscle_group: session.displayFocus,
      exercises,
      scheduled_iso_weekday: session.isoWeekday,
    };
  });
}

export function parseGeneratedWorkoutPrescription(
  content: string,
  prescription: ResolvedWorkoutPrescription,
): GeneratedWorkout[] {
  const generated = parseGeneratedWorkoutSelection(content);
  const report = validateWorkoutPrescription(prescription, generated);
  if (!report.valid) {
    throw new FitnessRouteServiceError("WORKOUT_VALIDATION_FAILED", 422, report);
  }
  return generatedWorkoutsFromSelection(generated, prescription);
}

type WorkoutRouteOptions<TClient> = {
  requireActiveSubscription: () => Promise<FitnessRouteAccess<TClient>>;
  loadFitnessContext: (client: TClient, userId: string) => Promise<UserFitnessContext>;
  invokeOpenAI: (fitnessPrompt: string) => Promise<string>;
  onValidationAudit?: (audit: WorkoutValidationAudit) => void;
  persistWorkouts: (
    access: FitnessRouteAccess<TClient>,
    workouts: readonly GeneratedWorkout[],
    context: UserFitnessContext,
    prescription: ResolvedWorkoutPrescription,
  ) => Promise<void>;
};

export async function runWorkoutGenerationRoute<TClient>(
  options: WorkoutRouteOptions<TClient>
): Promise<void> {
  await runFitnessRoutePipeline({
    requireActiveSubscription: options.requireActiveSubscription,
    loadFitnessContext: options.loadFitnessContext,
    validate: (context) => {
      try {
        const prescription = resolveWorkoutPrescription(context);
        return {
          context,
          prescription,
          fitnessPrompt: buildWorkoutFitnessPrompt(context, prescription),
        };
      } catch (error) {
        if (error instanceof WorkoutPrescriptionError) {
          throw new FitnessRouteServiceError("PRESCRIPTION_UNAVAILABLE", 409, error);
        }
        throw error;
      }
    },
    invokeOpenAI: async ({ context, prescription, fitnessPrompt }, access) => {
      let content: string;
      try {
        content = await options.invokeOpenAI(fitnessPrompt);
      } catch (error) {
        if (error instanceof FitnessRouteServiceError) throw error;
        throw new FitnessRouteServiceError("AI_UNAVAILABLE", 503, error);
      }

      let generated = parseGeneratedWorkoutSelection(content);
      let report = validateWorkoutPrescription(prescription, generated);
      let repairAttempted = false;
      let repairSucceeded = false;
      if (!report.valid) {
        try {
          const repaired = await runControlledWorkoutRepair({
            prescription,
            generated,
            report,
            invokeRepair: async (repairPrompt) =>
              parseGeneratedWorkoutSelection(await options.invokeOpenAI(repairPrompt)),
          });
          generated = repaired.plan;
          report = repaired.report;
          repairAttempted = repaired.repairAttempted;
          repairSucceeded = repaired.repairSucceeded;
        } catch (error) {
          const audit: WorkoutValidationAudit = {
            strategyVersion: prescription.strategyVersion,
            validatorVersion: WORKOUT_VALIDATOR_VERSION,
            goal: prescription.goal,
            valid: false,
            hardFailures: report.hardFailures,
            warnings: report.warnings,
            issueCodes: report.issues.map((item) => item.code),
            repairAttempted: true,
            repairSucceeded: false,
          };
          options.onValidationAudit?.(audit);
          throw new FitnessRouteServiceError("WORKOUT_VALIDATION_FAILED", 422, error);
        }
      }
      const audit: WorkoutValidationAudit = {
        strategyVersion: prescription.strategyVersion,
        validatorVersion: WORKOUT_VALIDATOR_VERSION,
        goal: prescription.goal,
        valid: report.valid,
        hardFailures: report.hardFailures,
        warnings: report.warnings,
        issueCodes: report.issues.map((item) => item.code),
        repairAttempted,
        repairSucceeded,
      };
      options.onValidationAudit?.(audit);
      if (!report.valid) {
        throw new FitnessRouteServiceError("WORKOUT_VALIDATION_FAILED", 422, report);
      }
      const workouts = generatedWorkoutsFromSelection(generated, prescription);
      try {
        await options.persistWorkouts(access, workouts, context, prescription);
      } catch (error) {
        if (error instanceof FitnessRouteServiceError) throw error;
        throw new FitnessRouteServiceError("PERSISTENCE_FAILED", 503, error);
      }
    },
  });
}
