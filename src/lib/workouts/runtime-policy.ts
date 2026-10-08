/**
 * Server/runtime flag for the Workout persistence cutover.
 *
 * This is intentionally not NEXT_PUBLIC_: Route Handlers and the Workouts
 * Server Component read it at request time. The client receives only the
 * resulting boolean, which is not an authorization boundary. Database ACLs
 * remain the independent security boundary.
 */
export const WORKOUT_PERSISTENCE_V2_ENV = "PRAXE_WORKOUT_PERSISTENCE_V2";

export function isWorkoutPersistenceV2Enabled(
  value: string | undefined = process.env.PRAXE_WORKOUT_PERSISTENCE_V2
): boolean {
  return value?.trim().toLowerCase() === "true";
}

export const CHAT_WORKOUT_SAVE_UNAVAILABLE =
  "Salvar treinos pelo Chat está temporariamente indisponível durante a migração da experiência de treinos. As demais ações do Chat continuam disponíveis.";

export function getChatWorkoutSaveContainment(enabled: boolean):
  | { blocked: false }
  | { blocked: true; notice: string } {
  return enabled
    ? { blocked: true, notice: CHAT_WORKOUT_SAVE_UNAVAILABLE }
    : { blocked: false };
}

export async function resolveWorkoutMissionCompletedToday(options: {
  persistenceV2Enabled: boolean;
  loadLegacyWorkoutCompletion: () => Promise<boolean>;
}): Promise<boolean> {
  if (options.persistenceV2Enabled) {
    // A legacy log/date/category match is not a deterministic
    // workout_session -> daily_mission mapping and cannot award Energy.
    return false;
  }
  return options.loadLegacyWorkoutCompletion();
}
