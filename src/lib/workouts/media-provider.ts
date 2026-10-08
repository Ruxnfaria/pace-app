export type ExerciseMedia =
  | { status: "loading" }
  | { status: "available"; videoUrl: string; posterUrl?: string; alt: string }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

export type ExerciseMediaRequest = {
  exerciseId: string;
  exerciseName: string;
};

export interface ExerciseMediaProvider {
  resolve(request: ExerciseMediaRequest): Promise<ExerciseMedia>;
}

class UnconfiguredExerciseMediaProvider implements ExerciseMediaProvider {
  async resolve(): Promise<ExerciseMedia> {
    return { status: "unavailable", message: "Demonstração em breve" };
  }
}

const provider: ExerciseMediaProvider = new UnconfiguredExerciseMediaProvider();

/** Provider boundary. No external media source is connected until licensed. */
export function resolveExerciseMedia(
  request: ExerciseMediaRequest
): Promise<ExerciseMedia> {
  return provider.resolve(request);
}
