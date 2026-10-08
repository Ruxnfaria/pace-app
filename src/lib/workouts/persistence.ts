import type { UserFitnessContext } from "../fitness-context/model.ts";
import type { GeneratedWorkout } from "../fitness-context/route-pipeline.ts";

export type WorkoutRpcError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export type WorkoutRpcClient = {
  rpc(
    functionName: string,
    args?: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: WorkoutRpcError | null }>;
};

export class WorkoutPersistenceError extends Error {
  readonly operation: string;
  readonly rpcError: WorkoutRpcError | null;

  constructor(operation: string, message: string, rpcError: WorkoutRpcError | null = null) {
    super(message, { cause: rpcError ?? undefined });
    this.name = "WorkoutPersistenceError";
    this.operation = operation;
    this.rpcError = rpcError;
  }
}

export class WorkoutPersistenceInputError extends Error {
  readonly operation: string;
  readonly reason: string;

  constructor(operation: string, reason: string) {
    super(`${operation} rejected invalid local input: ${reason}`);
    this.name = "WorkoutPersistenceInputError";
    this.operation = operation;
    this.reason = reason;
  }
}

export class WorkoutPersistenceResponseError extends Error {
  readonly operation: string;
  readonly reason: string;

  constructor(operation: string, reason: string) {
    super(`${operation} returned a malformed response: ${reason}`);
    this.name = "WorkoutPersistenceResponseError";
    this.operation = operation;
    this.reason = reason;
  }
}

export type PendingWorkoutOccurrence = {
  occurrence_id: string;
  scheduled_for_date: string;
  source_workout_id: string | null;
  workout_title: string;
};

export type PersistedWorkoutSession = {
  session_id: string;
  status: "in_progress" | "completed" | "abandoned";
  workout_id: string | null;
  schedule_occurrence_id: string | null;
  scheduled_for_date: string | null;
  workout_title: string;
  started_at: string;
  completed_at: string | null;
  note: string | null;
  replayed: boolean;
};

export type PersistedSessionExercise = {
  id: string;
  session_id: string;
  exercise_key: string | null;
  name: string;
  exercise_position: number;
  sets: string;
  reps: string;
  rest: string | null;
  tip_snapshot: string | null;
  completed_at: string | null;
};

export type PersistedWorkoutHistoryItem = {
  session: PersistedWorkoutSession;
  exercises: PersistedSessionExercise[];
  workoutLogId: string | null;
  durationSeconds: number | null;
};

export type WorkoutPlanPayload = {
  workouts: Array<{
    client_key: string;
    title: string;
    exercises: Array<{
      name: string;
      sets: string;
      reps: string;
      rest?: string | null;
      tip?: string | null;
    }>;
  }>;
  schedule: Array<{
    iso_weekday: number;
    workout_key: string | null;
  }>;
};

export type WorkoutScheduleAssignment = {
  iso_weekday: number;
  workout_id: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;
const POSITIVE_BIGINT_PATTERN = /^[1-9]\d*$/;
const MAX_PLAN_BYTES = 262144;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function codePointLength(value: string) {
  return [...value].length;
}

function postgresBtrim(value: string) {
  return value.replace(/^ +| +$/g, "");
}

function jsonbText(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(", ")}]`;
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}: ${jsonbText(item)}`)
      .join(", ")}}`;
  }
  throw new TypeError("Value is not JSON serializable");
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match || !isIsoDate(match[1])) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const offsetHour = match[6] === undefined ? 0 : Number(match[6]);
  const offsetMinute = match[7] === undefined ? 0 : Number(match[7]);
  return hour <= 23
    && minute <= 59
    && second <= 59
    && offsetHour <= 15
    && offsetMinute <= 59
    && Number.isFinite(Date.parse(value));
}

function responseFailure(operation: string, reason: string): never {
  throw new WorkoutPersistenceResponseError(operation, reason);
}

function inputFailure(operation: string, reason: string): never {
  throw new WorkoutPersistenceInputError(operation, reason);
}

function exactlyOneRow(operation: string, data: unknown): Record<string, unknown> {
  if (!Array.isArray(data)) responseFailure(operation, "expected an array containing exactly one row");
  if (data.length !== 1) responseFailure(operation, "expected exactly one row");
  if (!isRecord(data[0])) responseFailure(operation, "row must be an object");
  return data[0];
}

function zeroOrOneRow(operation: string, data: unknown): Record<string, unknown> | null {
  if (!Array.isArray(data)) responseFailure(operation, "expected an array containing zero or one row");
  if (data.length > 1) responseFailure(operation, "expected at most one row");
  if (data.length === 0) return null;
  if (!isRecord(data[0])) responseFailure(operation, "row must be an object");
  return data[0];
}

function requiredUuid(operation: string, row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    responseFailure(operation, `${field} must be a UUID`);
  }
  return value;
}

function nullableUuid(operation: string, row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    responseFailure(operation, `${field} must be a UUID or null`);
  }
  return value;
}

function requiredString(operation: string, row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    responseFailure(operation, `${field} must be a non-empty string`);
  }
  return value;
}

function nullableString(operation: string, row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "string") responseFailure(operation, `${field} must be a string or null`);
  return value;
}

function requiredBoolean(operation: string, row: Record<string, unknown>, field: string): boolean {
  const value = row[field];
  if (typeof value !== "boolean") responseFailure(operation, `${field} must be a boolean`);
  return value;
}

function requiredInteger(operation: string, row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (!Number.isSafeInteger(value)) responseFailure(operation, `${field} must be a safe integer`);
  return value as number;
}

function requiredDate(operation: string, row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (!isIsoDate(value)) responseFailure(operation, `${field} must be a valid ISO date`);
  return value;
}

function nullableDate(operation: string, row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (!isIsoDate(value)) responseFailure(operation, `${field} must be a valid ISO date or null`);
  return value;
}

function requiredTimestamp(operation: string, row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (!isTimestamp(value)) responseFailure(operation, `${field} must be a valid timestamp`);
  return value;
}

function nullableTimestamp(operation: string, row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (!isTimestamp(value)) responseFailure(operation, `${field} must be a valid timestamp or null`);
  return value;
}

function normalizedBigint(operation: string, row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value === "string" && POSITIVE_BIGINT_PATTERN.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  responseFailure(operation, `${field} must be a positive bigint string or safe integer`);
}

function assertInputUuid(operation: string, field: string, value: string | null, nullable = false) {
  if (value === null && nullable) return;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    inputFailure(operation, `${field} must be a UUID${nullable ? " or null" : ""}`);
  }
}

function assertAllowedKeys(operation: string, value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    inputFailure(operation, "payload contains unexpected fields");
  }
}

async function callRpc(
  client: WorkoutRpcClient,
  functionName: string,
  args?: Record<string, unknown>
): Promise<unknown> {
  const { data, error } = await client.rpc(functionName, args);
  if (error) {
    throw new WorkoutPersistenceError(
      functionName,
      error.message || `${functionName} failed`,
      error
    );
  }
  return data;
}

export async function materializeMyWorkoutSchedule(client: WorkoutRpcClient): Promise<number> {
  const operation = "materialize_my_workout_schedule";
  const data = await callRpc(client, operation);
  if (!Number.isSafeInteger(data) || (data as number) < 0) {
    responseFailure(operation, "expected a non-negative integer scalar");
  }
  return data as number;
}

export async function getPendingWorkoutOccurrence(
  client: WorkoutRpcClient
): Promise<PendingWorkoutOccurrence | null> {
  const operation = "get_pending_workout_occurrence";
  const row = zeroOrOneRow(operation, await callRpc(client, operation));
  if (!row) return null;
  return {
    occurrence_id: requiredUuid(operation, row, "occurrence_id"),
    scheduled_for_date: requiredDate(operation, row, "scheduled_for_date"),
    source_workout_id: nullableUuid(operation, row, "source_workout_id"),
    workout_title: requiredString(operation, row, "workout_title"),
  };
}

export async function startWorkoutSession(
  client: WorkoutRpcClient,
  input: { workoutId: string | null; occurrenceId: string | null; clientRequestId: string }
): Promise<PersistedWorkoutSession> {
  const operation = "start_workout_session";
  assertInputUuid(operation, "workoutId", input.workoutId, true);
  assertInputUuid(operation, "occurrenceId", input.occurrenceId, true);
  assertInputUuid(operation, "clientRequestId", input.clientRequestId);
  if (input.workoutId === null && input.occurrenceId === null) {
    inputFailure(operation, "workoutId is required for an ad-hoc session");
  }
  const row = exactlyOneRow(operation, await callRpc(client, operation, {
    p_workout_id: input.workoutId,
    p_schedule_occurrence_id: input.occurrenceId,
    p_client_request_id: input.clientRequestId,
  }));
  const status = row.status;
  if (status !== "in_progress" && status !== "completed" && status !== "abandoned") {
    responseFailure(operation, "status is invalid");
  }
  return {
    session_id: requiredUuid(operation, row, "session_id"),
    status,
    workout_id: nullableUuid(operation, row, "workout_id"),
    schedule_occurrence_id: nullableUuid(operation, row, "schedule_occurrence_id"),
    scheduled_for_date: nullableDate(operation, row, "scheduled_for_date"),
    workout_title: requiredString(operation, row, "workout_title"),
    started_at: requiredTimestamp(operation, row, "started_at"),
    completed_at: nullableTimestamp(operation, row, "completed_at"),
    note: nullableString(operation, row, "note"),
    replayed: requiredBoolean(operation, row, "replayed"),
  };
}

export async function setWorkoutSessionExerciseCompletion(
  client: WorkoutRpcClient,
  input: { sessionId: string; exerciseId: string; completed: boolean }
): Promise<{ exercise_id: string; completed_at: string | null }> {
  const operation = "set_workout_session_exercise_completion";
  assertInputUuid(operation, "sessionId", input.sessionId);
  assertInputUuid(operation, "exerciseId", input.exerciseId);
  if (typeof input.completed !== "boolean") inputFailure(operation, "completed must be a boolean");
  const row = exactlyOneRow(operation, await callRpc(client, operation, {
    p_session_id: input.sessionId,
    p_exercise_id: input.exerciseId,
    p_completed: input.completed,
  }));
  return {
    exercise_id: requiredUuid(operation, row, "exercise_id"),
    completed_at: nullableTimestamp(operation, row, "completed_at"),
  };
}

export async function updateWorkoutSessionNote(
  client: WorkoutRpcClient,
  input: { sessionId: string; note: string }
): Promise<{ session_id: string; note: string | null; updated_at: string }> {
  const operation = "update_workout_session_note";
  assertInputUuid(operation, "sessionId", input.sessionId);
  if (typeof input.note !== "string" || codePointLength(postgresBtrim(input.note)) > 2000) {
    inputFailure(operation, "note must be a string containing at most 2000 characters");
  }
  const row = exactlyOneRow(operation, await callRpc(client, operation, {
    p_session_id: input.sessionId,
    p_note: input.note,
  }));
  return {
    session_id: requiredUuid(operation, row, "session_id"),
    note: nullableString(operation, row, "note"),
    updated_at: requiredTimestamp(operation, row, "updated_at"),
  };
}

export async function abandonWorkoutSession(
  client: WorkoutRpcClient,
  sessionId: string
): Promise<{ session_id: string; status: "abandoned" }> {
  const operation = "abandon_workout_session";
  assertInputUuid(operation, "sessionId", sessionId);
  const row = exactlyOneRow(operation, await callRpc(client, operation, {
    p_session_id: sessionId,
  }));
  if (row.status !== "abandoned") responseFailure(operation, "status must be abandoned");
  return { session_id: requiredUuid(operation, row, "session_id"), status: "abandoned" };
}

export async function skipWorkoutScheduleOccurrence(
  client: WorkoutRpcClient,
  input: { occurrenceId: string; reason: string }
): Promise<{ occurrence_id: string; skipped_at: string; skip_reason: string }> {
  const operation = "skip_workout_schedule_occurrence";
  assertInputUuid(operation, "occurrenceId", input.occurrenceId);
  if (typeof input.reason !== "string") inputFailure(operation, "reason must be a string");
  const normalizedReason = input.reason.trim();
  if (codePointLength(normalizedReason) < 1 || codePointLength(normalizedReason) > 240) {
    inputFailure(operation, "reason must contain 1 to 240 characters after trimming");
  }
  const row = exactlyOneRow(operation, await callRpc(client, operation, {
    p_occurrence_id: input.occurrenceId,
    p_reason: input.reason,
  }));
  const skipReason = requiredString(operation, row, "skip_reason");
  if (codePointLength(skipReason) > 240) responseFailure(operation, "skip_reason exceeds 240 characters");
  return {
    occurrence_id: requiredUuid(operation, row, "occurrence_id"),
    skipped_at: requiredTimestamp(operation, row, "skipped_at"),
    skip_reason: skipReason,
  };
}

function validateWeeklySchedule(assignments: WorkoutScheduleAssignment[]) {
  const operation = "update_workout_weekly_schedule";
  if (!Array.isArray(assignments) || assignments.length !== 7) {
    inputFailure(operation, "assignments must contain exactly seven rows");
  }
  const weekdays = new Set<number>();
  for (const value of assignments as unknown[]) {
    if (!isRecord(value)) inputFailure(operation, "each assignment must be an object");
    assertAllowedKeys(operation, value, ["iso_weekday", "workout_id"]);
    if (!Number.isInteger(value.iso_weekday) || (value.iso_weekday as number) < 1 || (value.iso_weekday as number) > 7) {
      inputFailure(operation, "iso_weekday must be an integer from 1 through 7");
    }
    const weekday = value.iso_weekday as number;
    if (weekdays.has(weekday)) inputFailure(operation, "iso_weekday values must be unique");
    weekdays.add(weekday);
    if (value.workout_id !== null && (typeof value.workout_id !== "string" || !UUID_PATTERN.test(value.workout_id))) {
      inputFailure(operation, "workout_id must be a UUID or null");
    }
  }
}

export async function updateWorkoutWeeklySchedule(
  client: WorkoutRpcClient,
  assignments: WorkoutScheduleAssignment[]
): Promise<{ effective_from_date: string; updated_rows: number }> {
  const operation = "update_workout_weekly_schedule";
  validateWeeklySchedule(assignments);
  const row = exactlyOneRow(operation, await callRpc(client, operation, {
    p_assignments: assignments,
  }));
  const updatedRows = requiredInteger(operation, row, "updated_rows");
  if (updatedRows !== 7) responseFailure(operation, "updated_rows must equal seven");
  return {
    effective_from_date: requiredDate(operation, row, "effective_from_date"),
    updated_rows: updatedRows,
  };
}

export async function restoreOriginalWorkoutSchedule(
  client: WorkoutRpcClient
): Promise<{ effective_from_date: string; updated_rows: number }> {
  const operation = "restore_original_workout_schedule";
  const row = exactlyOneRow(operation, await callRpc(client, operation));
  const updatedRows = requiredInteger(operation, row, "updated_rows");
  if (updatedRows !== 7) responseFailure(operation, "updated_rows must equal seven");
  return {
    effective_from_date: requiredDate(operation, row, "effective_from_date"),
    updated_rows: updatedRows,
  };
}

function validateExercise(operation: string, value: unknown) {
  if (!isRecord(value)) inputFailure(operation, "each exercise must be an object");
  const requiredBounds = { name: 160, sets: 40, reps: 80 } as const;
  for (const [field, maximum] of Object.entries(requiredBounds)) {
    const fieldValue = value[field];
    if (typeof fieldValue !== "string" || fieldValue.trim().length === 0 || codePointLength(fieldValue.trim()) > maximum) {
      inputFailure(operation, `exercise ${field} must be a non-empty bounded string`);
    }
  }
  const optionalBounds = { rest: 80, tip: 500 } as const;
  for (const [field, maximum] of Object.entries(optionalBounds)) {
    const fieldValue = value[field];
    if (fieldValue === undefined || fieldValue === null) continue;
    if (typeof fieldValue !== "string" || codePointLength(postgresBtrim(fieldValue)) > maximum) {
      inputFailure(operation, `exercise ${field} must be a bounded string or null`);
    }
  }
}

function validateWorkoutPlan(plan: WorkoutPlanPayload) {
  const operation = "replace_user_workout_plan";
  if (!isRecord(plan)) inputFailure(operation, "plan must be an object");
  assertAllowedKeys(operation, plan, ["workouts", "schedule"]);
  let serializedPlan: string;
  try {
    const transportPlan = JSON.parse(JSON.stringify(plan)) as unknown;
    serializedPlan = jsonbText(transportPlan);
  } catch {
    inputFailure(operation, "plan must be JSON serializable");
  }
  if (new TextEncoder().encode(serializedPlan).byteLength > MAX_PLAN_BYTES) {
    inputFailure(operation, `serialized plan exceeds ${MAX_PLAN_BYTES} UTF-8 bytes`);
  }
  if (!Array.isArray(plan.workouts) || plan.workouts.length < 1 || plan.workouts.length > 14) {
    inputFailure(operation, "workouts must contain 1 to 14 rows");
  }
  if (!Array.isArray(plan.schedule) || plan.schedule.length !== 7) {
    inputFailure(operation, "schedule must contain exactly seven rows");
  }
  const keys = new Set<string>();
  for (const value of plan.workouts as unknown[]) {
    if (!isRecord(value)) inputFailure(operation, "each workout must be an object");
    assertAllowedKeys(operation, value, ["client_key", "title", "exercises"]);
    if (typeof value.client_key !== "string") inputFailure(operation, "client_key must be a string");
    const key = value.client_key.trim();
    if (!key || codePointLength(key) > 80) inputFailure(operation, "client_key is blank or oversized");
    if (keys.has(key)) inputFailure(operation, "client_key values must be unique");
    keys.add(key);
    if (typeof value.title !== "string" || !value.title.trim() || codePointLength(value.title.trim()) > 160) {
      inputFailure(operation, "title is blank or oversized");
    }
    if (!Array.isArray(value.exercises) || value.exercises.length < 1 || value.exercises.length > 40) {
      inputFailure(operation, "exercises must contain 1 to 40 rows");
    }
    value.exercises.forEach((exercise) => validateExercise(operation, exercise));
  }
  const weekdays = new Set<number>();
  for (const value of plan.schedule as unknown[]) {
    if (!isRecord(value)) inputFailure(operation, "each schedule row must be an object");
    assertAllowedKeys(operation, value, ["iso_weekday", "workout_key"]);
    if (!Number.isInteger(value.iso_weekday) || (value.iso_weekday as number) < 1 || (value.iso_weekday as number) > 7) {
      inputFailure(operation, "schedule weekday must be an integer from 1 through 7");
    }
    const weekday = value.iso_weekday as number;
    if (weekdays.has(weekday)) inputFailure(operation, "schedule weekdays must be unique");
    weekdays.add(weekday);
    if (value.workout_key !== null) {
      if (typeof value.workout_key !== "string" || !value.workout_key.trim()) {
        inputFailure(operation, "workout_key must be non-empty or null");
      }
      if (!keys.has(value.workout_key.trim())) inputFailure(operation, "workout_key references an unknown client_key");
    }
  }
}

export async function replaceUserWorkoutPlan(
  client: WorkoutRpcClient,
  plan: WorkoutPlanPayload
): Promise<{ workouts_created: number; schedule_effective_from: string }> {
  const operation = "replace_user_workout_plan";
  validateWorkoutPlan(plan);
  const row = exactlyOneRow(operation, await callRpc(client, operation, { p_plan: plan }));
  const workoutsCreated = requiredInteger(operation, row, "workouts_created");
  if (workoutsCreated < 1 || workoutsCreated > 14) {
    responseFailure(operation, "workouts_created must be between 1 and 14");
  }
  return {
    workouts_created: workoutsCreated,
    schedule_effective_from: requiredDate(operation, row, "schedule_effective_from"),
  };
}

export async function completeWorkoutSession(
  client: WorkoutRpcClient,
  sessionId: string
): Promise<{
  session_id: string;
  status: "completed";
  completed_at: string;
  completion_date: string;
  workout_log_id: string;
  energy_awarded: number;
  replayed: boolean;
}> {
  const operation = "complete_workout_session";
  assertInputUuid(operation, "sessionId", sessionId);
  const row = exactlyOneRow(operation, await callRpc(client, operation, { p_session_id: sessionId }));
  if (row.status !== "completed") responseFailure(operation, "status must be completed");
  const energyAwarded = requiredInteger(operation, row, "energy_awarded");
  if (energyAwarded !== 0) responseFailure(operation, "energy_awarded must equal zero");
  return {
    session_id: requiredUuid(operation, row, "session_id"),
    status: "completed",
    completed_at: requiredTimestamp(operation, row, "completed_at"),
    completion_date: requiredDate(operation, row, "completion_date"),
    workout_log_id: normalizedBigint(operation, row, "workout_log_id"),
    energy_awarded: energyAwarded,
    replayed: requiredBoolean(operation, row, "replayed"),
  };
}

function validWeekdays(value: number[] | null): number[] {
  if (!value) return [];
  return [...new Set(value.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))]
    .sort((left, right) => left - right);
}

export function buildWorkoutPlanPayload(
  workouts: readonly GeneratedWorkout[],
  training: UserFitnessContext["training"]
): WorkoutPlanPayload {
  const workoutRows = workouts.map((workout, index) => ({
    client_key: `workout-${String(index + 1).padStart(2, "0")}`,
    title: workout.name,
    exercises: workout.exercises,
  }));
  const preferred = validWeekdays(training.preferredWeekdays);
  const available = validWeekdays(training.availableWeekdays);
  const scheduledDays = preferred.length
    ? preferred
    : training.trainingDaysPerWeek && training.trainingDaysPerWeek > 0
      ? available.slice(0, training.trainingDaysPerWeek)
      : available;
  let assignmentIndex = 0;
  const schedule = Array.from({ length: 7 }, (_, index) => {
    const isoWeekday = index + 1;
    if (!scheduledDays.includes(isoWeekday)) {
      return { iso_weekday: isoWeekday, workout_key: null };
    }
    const workoutKey = workoutRows[assignmentIndex % workoutRows.length]?.client_key ?? null;
    assignmentIndex += 1;
    return { iso_weekday: isoWeekday, workout_key: workoutKey };
  });
  return { workouts: workoutRows, schedule };
}

export async function persistGeneratedWorkoutPlan(options: {
  persistenceV2Enabled: boolean;
  client: WorkoutRpcClient;
  workouts: readonly GeneratedWorkout[];
  training: UserFitnessContext["training"];
  persistLegacy: () => Promise<void>;
}): Promise<
  | { mode: "legacy" }
  | {
      mode: "v2";
      result: { workouts_created: number; schedule_effective_from: string };
    }
> {
  if (!options.persistenceV2Enabled) {
    await options.persistLegacy();
    return { mode: "legacy" };
  }
  const plan = buildWorkoutPlanPayload(options.workouts, options.training);
  const result = await replaceUserWorkoutPlan(options.client, plan);
  return { mode: "v2", result };
}
