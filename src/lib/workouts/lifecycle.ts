import type {
  DurableWorkoutHistoryItem,
  LegacyWorkoutHistoryItem,
  Workout,
  WorkoutScheduleOccurrence,
  WorkoutSession,
  WorkoutSessionExercise,
  WorkoutWeeklyScheduleRow,
} from "./model.ts";
import {
  WorkoutPersistenceError,
  type WorkoutScheduleAssignment,
} from "./persistence.ts";

export type WorkoutLifecycleSnapshot = {
  workouts: Workout[];
  schedule: WorkoutWeeklyScheduleRow[];
  pending: WorkoutScheduleOccurrence | null;
  activeSession: WorkoutSession | null;
  activeExercises: WorkoutSessionExercise[];
  durableHistory: DurableWorkoutHistoryItem[];
  legacyHistory: LegacyWorkoutHistoryItem[];
  previousNote: string | null;
};

export type WorkoutStartInput = {
  intentKey: string;
  workoutId: string | null;
  occurrenceId: string | null;
};

export type WorkoutLifecycleGateway = {
  materialize(): Promise<number>;
  loadSnapshot(): Promise<WorkoutLifecycleSnapshot>;
  start(input: {
    workoutId: string | null;
    occurrenceId: string | null;
    clientRequestId: string;
  }): Promise<WorkoutSession>;
  setExercise(input: {
    sessionId: string;
    exerciseId: string;
    completed: boolean;
  }): Promise<{ exerciseId: string; completedAt: string | null }>;
  saveNote(input: { sessionId: string; note: string }): Promise<{ note: string | null }>;
  abandon(sessionId: string): Promise<void>;
  skip(input: { occurrenceId: string; reason: string }): Promise<void>;
  updateSchedule(assignments: WorkoutScheduleAssignment[]): Promise<{ effectiveFromDate: string }>;
  restoreSchedule(): Promise<{ effectiveFromDate: string }>;
  complete(sessionId: string): Promise<{ energyAwarded: 0; replayed: boolean }>;
};

export type WorkoutLifecycleIdFactory = () => string;

function isActiveSessionConflict(error: unknown): boolean {
  if (!(error instanceof WorkoutPersistenceError) || error.rpcError?.code !== "23505") {
    return false;
  }
  const detail = `${error.rpcError.message ?? ""} ${error.rpcError.details ?? ""}`;
  return /workout_sessions_one_in_progress_per_user_unique/i.test(detail);
}

export class WorkoutLifecycleCoordinator {
  private readonly requestIds = new Map<string, string>();
  private readonly starts = new Map<string, Promise<WorkoutLifecycleSnapshot>>();
  private readonly completions = new Map<string, Promise<WorkoutLifecycleSnapshot>>();
  private readonly gateway: WorkoutLifecycleGateway;
  private readonly createId: WorkoutLifecycleIdFactory;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(
    gateway: WorkoutLifecycleGateway,
    createId: WorkoutLifecycleIdFactory = () => crypto.randomUUID()
  ) {
    this.gateway = gateway;
    this.createId = createId;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  bootstrap(): Promise<WorkoutLifecycleSnapshot> {
    return this.enqueue(async () => {
      await this.gateway.materialize();
      return this.gateway.loadSnapshot();
    });
  }

  start(input: WorkoutStartInput): Promise<WorkoutLifecycleSnapshot> {
    const existing = this.starts.get(input.intentKey);
    if (existing) return existing;
    const clientRequestId = this.requestIds.get(input.intentKey) ?? this.createId();
    this.requestIds.set(input.intentKey, clientRequestId);
    const operation = this.enqueue(async () => {
      try {
        await this.gateway.start({
          workoutId: input.workoutId,
          occurrenceId: input.occurrenceId,
          clientRequestId,
        });
      } catch (error) {
        if (!isActiveSessionConflict(error)) throw error;
        const reconciled = await this.gateway.loadSnapshot();
        if (!reconciled.activeSession) throw error;
        this.requestIds.delete(input.intentKey);
        return reconciled;
      }
      const snapshot = await this.gateway.loadSnapshot();
      this.requestIds.delete(input.intentKey);
      return snapshot;
    });
    this.starts.set(input.intentKey, operation);
    void operation.then(
      () => this.starts.delete(input.intentKey),
      () => this.starts.delete(input.intentKey)
    );
    return operation;
  }

  setExercise(input: {
    sessionId: string;
    exerciseId: string;
    completed: boolean;
  }): Promise<WorkoutLifecycleSnapshot> {
    return this.enqueue(async () => {
      await this.gateway.setExercise(input);
      return this.gateway.loadSnapshot();
    });
  }

  saveNote(sessionId: string, note: string): Promise<WorkoutLifecycleSnapshot> {
    return this.enqueue(async () => {
      await this.gateway.saveNote({ sessionId, note });
      return this.gateway.loadSnapshot();
    });
  }

  abandon(sessionId: string): Promise<WorkoutLifecycleSnapshot> {
    return this.enqueue(async () => {
      await this.gateway.abandon(sessionId);
      await this.gateway.materialize();
      return this.gateway.loadSnapshot();
    });
  }

  skip(occurrenceId: string, reason: string): Promise<WorkoutLifecycleSnapshot> {
    return this.enqueue(async () => {
      await this.gateway.skip({ occurrenceId, reason });
      await this.gateway.materialize();
      return this.gateway.loadSnapshot();
    });
  }

  async updateSchedule(
    assignments: WorkoutScheduleAssignment[]
  ): Promise<{ snapshot: WorkoutLifecycleSnapshot; effectiveFromDate: string }> {
    return this.enqueue(async () => {
      const result = await this.gateway.updateSchedule(assignments);
      return { snapshot: await this.gateway.loadSnapshot(), ...result };
    });
  }

  async restoreSchedule(): Promise<{
    snapshot: WorkoutLifecycleSnapshot;
    effectiveFromDate: string;
  }> {
    return this.enqueue(async () => {
      const result = await this.gateway.restoreSchedule();
      return { snapshot: await this.gateway.loadSnapshot(), ...result };
    });
  }

  complete(input: {
    sessionId: string;
    exercises: WorkoutSessionExercise[];
    note: string;
    persistedNote: string | null;
  }): Promise<WorkoutLifecycleSnapshot> {
    const existing = this.completions.get(input.sessionId);
    if (existing) return existing;
    const operation = this.enqueue(async () => {
      if (!input.exercises.length || input.exercises.some((exercise) => !exercise.completedAt)) {
        throw new Error("Conclua todos os exercícios antes de finalizar.");
      }
      if (input.note !== (input.persistedNote ?? "")) {
        await this.gateway.saveNote({ sessionId: input.sessionId, note: input.note });
      }
      const result = await this.gateway.complete(input.sessionId);
      if (result.energyAwarded !== 0) {
        throw new Error("A conclusão retornou Energy fora do contrato atual.");
      }
      return this.gateway.loadSnapshot();
    });
    this.completions.set(input.sessionId, operation);
    void operation.then(
      () => this.completions.delete(input.sessionId),
      () => this.completions.delete(input.sessionId)
    );
    return operation;
  }
}
