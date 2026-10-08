import type { UserFitnessContext } from "./model.ts";
import { buildWorkoutFitnessPrompt } from "./prompt.ts";

export type FitnessRouteServiceErrorCode =
  | "AI_UNAVAILABLE"
  | "INVALID_AI_RESPONSE"
  | "PERSISTENCE_FAILED";

export class FitnessRouteServiceError extends Error {
  readonly code: FitnessRouteServiceErrorCode;
  readonly status: 502 | 503;

  constructor(code: FitnessRouteServiceErrorCode, status: 502 | 503, cause?: unknown) {
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
    return { name, muscle_group: muscleGroup, exercises: exercises as GeneratedExercise[] };
  });

  if (workouts.some((workout) => workout === null)) {
    throw new FitnessRouteServiceError("INVALID_AI_RESPONSE", 502);
  }
  return workouts as GeneratedWorkout[];
}

type WorkoutRouteOptions<TClient> = {
  requireActiveSubscription: () => Promise<FitnessRouteAccess<TClient>>;
  loadFitnessContext: (client: TClient, userId: string) => Promise<UserFitnessContext>;
  invokeOpenAI: (fitnessPrompt: string) => Promise<string>;
  persistWorkouts: (
    access: FitnessRouteAccess<TClient>,
    workouts: readonly GeneratedWorkout[]
  ) => Promise<void>;
};

export async function runWorkoutGenerationRoute<TClient>(
  options: WorkoutRouteOptions<TClient>
): Promise<void> {
  await runFitnessRoutePipeline({
    requireActiveSubscription: options.requireActiveSubscription,
    loadFitnessContext: options.loadFitnessContext,
    validate: buildWorkoutFitnessPrompt,
    invokeOpenAI: async (fitnessPrompt, access) => {
      let content: string;
      try {
        content = await options.invokeOpenAI(fitnessPrompt);
      } catch (error) {
        if (error instanceof FitnessRouteServiceError) throw error;
        throw new FitnessRouteServiceError("AI_UNAVAILABLE", 503, error);
      }

      const workouts = parseGeneratedWorkouts(content);
      try {
        await options.persistWorkouts(access, workouts);
      } catch (error) {
        if (error instanceof FitnessRouteServiceError) throw error;
        throw new FitnessRouteServiceError("PERSISTENCE_FAILED", 503, error);
      }
    },
  });
}
