export const WEEKDAYS = [
  { value: 1, short: "Seg", label: "Segunda" },
  { value: 2, short: "Ter", label: "Terça" },
  { value: 3, short: "Qua", label: "Quarta" },
  { value: 4, short: "Qui", label: "Quinta" },
  { value: 5, short: "Sex", label: "Sexta" },
  { value: 6, short: "Sáb", label: "Sábado" },
  { value: 7, short: "Dom", label: "Domingo" },
] as const;

export type Weekday = (typeof WEEKDAYS)[number]["value"];
export type WorkoutExercise = {
  id: string;
  name: string;
  sets: string;
  reps: string;
  rest: string | null;
  tip: string | null;
};
export type Workout = {
  id: string;
  title: string;
  exercises: WorkoutExercise[];
  rawText: string | null;
  createdAt: string;
};
export type WorkoutLog = { id: string; workoutId: string; workoutDate: string };
export type TrainingScheduleProfile = {
  trainingDaysPerWeek: number | null;
  availableWeekdays: number[] | null;
  preferredWeekdays: number[] | null;
  sessionDurationMin: number | null;
  sessionDurationIsPlus: boolean | null;
  sessionDurationRange: string | null;
};
export type WeeklyScheduleItem = { day: Weekday; workout: Workout };
export type NextWorkoutState = {
  workout: Workout | null;
  scheduledToday: Workout | null;
  scheduledDay: Weekday | null;
  kind: "today" | "pending" | "next" | "unscheduled";
};

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

function parseExercise(value: unknown, index: number): WorkoutExercise | null {
  if (!isRecord(value)) return null;
  const name = nonEmptyString(value.name);
  if (!name) return null;
  const explicitId = nonEmptyString(value.exercise_id) ?? nonEmptyString(value.id);
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id: explicitId ?? `${slug || "exercicio"}-${index + 1}`,
    name,
    sets: nonEmptyString(value.sets) ?? "—",
    reps: nonEmptyString(value.reps) ?? "—",
    rest: nonEmptyString(value.rest),
    tip: nonEmptyString(value.tip),
  };
}

export function normalizeWorkout(value: unknown): Workout | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const title = nonEmptyString(value.title);
  const createdAt = nonEmptyString(value.created_at);
  if (!id || !title || !createdAt) return null;
  let parsed: unknown = value.exercises;
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    if (!trimmed) return { id, title, exercises: [], rawText: null, createdAt };
    try { parsed = JSON.parse(trimmed) as unknown; }
    catch { return { id, title, exercises: [], rawText: trimmed, createdAt }; }
  }
  if (!Array.isArray(parsed)) {
    return { id, title, exercises: [], rawText: nonEmptyString(value.exercises), createdAt };
  }
  return {
    id,
    title,
    exercises: parsed.map(parseExercise).filter((item): item is WorkoutExercise => item !== null),
    rawText: null,
    createdAt,
  };
}

function validWeekdays(value: number[] | null): Weekday[] {
  if (!value) return [];
  return Array.from(new Set(value.filter((day): day is Weekday =>
    Number.isInteger(day) && day >= 1 && day <= 7
  ))).sort((a, b) => a - b);
}

export function getScheduleDays(profile: TrainingScheduleProfile | null): Weekday[] {
  if (!profile) return [];
  const preferred = validWeekdays(profile.preferredWeekdays);
  if (preferred.length) return preferred;
  const available = validWeekdays(profile.availableWeekdays);
  return profile.trainingDaysPerWeek && profile.trainingDaysPerWeek > 0
    ? available.slice(0, profile.trainingDaysPerWeek)
    : available;
}

export function buildWeeklySchedule(workouts: Workout[], days: Weekday[]): WeeklyScheduleItem[] {
  if (!workouts.length || !days.length) return [];
  return days.map((day, index) => ({ day, workout: workouts[index % workouts.length] }));
}

export function isoWeekdayFromDate(date: string): Weekday {
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}

export function getNextWorkoutState(
  workouts: Workout[], schedule: WeeklyScheduleItem[], logs: WorkoutLog[], today: string
): NextWorkoutState {
  if (!workouts.length) return { workout: null, scheduledToday: null, scheduledDay: null, kind: "unscheduled" };
  const todayDay = isoWeekdayFromDate(today);
  const scheduledToday = schedule.find((item) => item.day === todayDay)?.workout ?? null;
  const latest = [...logs].sort((a, b) => b.workoutDate.localeCompare(a.workoutDate))[0];
  const completedIndex = latest ? workouts.findIndex((item) => item.id === latest.workoutId) : -1;
  const workout = workouts[completedIndex >= 0 ? (completedIndex + 1) % workouts.length : 0];
  const scheduledDay = schedule.find((item) => item.workout.id === workout.id)?.day ?? null;
  if (scheduledToday?.id === workout.id) return { workout, scheduledToday, scheduledDay, kind: "today" };
  if (scheduledDay !== null) {
    const daysSinceDue = (todayDay - scheduledDay + 7) % 7;
    const due = new Date(`${today}T12:00:00.000Z`);
    due.setUTCDate(due.getUTCDate() - daysSinceDue);
    const dueDate = due.toISOString().slice(0, 10);
    const planCreatedDate = workout.createdAt.slice(0, 10);
    if (dueDate >= planCreatedDate && (!latest || latest.workoutDate < dueDate)) {
      return { workout, scheduledToday, scheduledDay, kind: "pending" };
    }
  }
  return { workout, scheduledToday, scheduledDay, kind: schedule.length ? "next" : "unscheduled" };
}

export function getDurationLabel(profile: TrainingScheduleProfile | null): string | null {
  if (!profile) return null;
  if (profile.sessionDurationMin) return profile.sessionDurationIsPlus
    ? `${profile.sessionDurationMin}+ min` : `${profile.sessionDurationMin} min`;
  const labels: Record<string, string> = {
    under_30: "Até 30 min", "30_45": "30–45 min", "45_60": "45–60 min",
    "60_90": "60–90 min", over_90: "90+ min",
  };
  return profile.sessionDurationRange ? labels[profile.sessionDurationRange] ?? null : null;
}

export const getWeekdayLabel = (day: Weekday | null): string | null =>
  WEEKDAYS.find((item) => item.value === day)?.label ?? null;
