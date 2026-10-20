import type { UserFitnessContext } from "../../fitness-context/model.ts";
import {
  GOAL_STRATEGY_VERSION,
  INDIRECT_SET_HEURISTIC_INTERPRETATION,
  INDIRECT_SET_HEURISTIC_VERSION,
  MUSCLE_TAXONOMY,
  type CardioPrescription,
  type ExerciseSlot,
  type ExerciseSlotRole,
  type GoalPrescriptionStrategy,
  type MovementPattern,
  type MuscleGroup,
  type MuscleVolumePrescription,
  type ResolvedWorkoutPrescription,
  type SessionDurationBudget,
  type SessionFocus,
  type SplitCandidate,
  type SplitScore,
  type TrainingLevel,
  type WeeklySessionPrescription,
  type WorkoutGoal,
  WorkoutPrescriptionError,
} from "./domain.ts";
import { getGoalPrescriptionStrategy } from "./registry.ts";

type SlotBlueprint = {
  movementPattern: MovementPattern;
  role: ExerciseSlotRole;
  primaryMuscles: readonly MuscleGroup[];
  secondaryMuscles: readonly MuscleGroup[];
};

const MAJOR_MUSCLES = new Set<MuscleGroup>([
  "chest", "back", "quadriceps", "hamstrings", "glutes", "shoulders",
]);

const SLOT_BLUEPRINTS: Readonly<Record<SessionFocus, readonly SlotBlueprint[]>> = {
  FULL_BODY: [
    slot("knee_dominant", "primary", ["quadriceps"], ["glutes"]),
    slot("horizontal_press", "primary", ["chest"], ["triceps", "shoulders"]),
    slot("horizontal_pull", "primary", ["back"], ["biceps"]),
    slot("hip_hinge", "secondary", ["hamstrings", "glutes"], ["back"]),
    slot("calf_accessory", "accessory", ["calves"], []),
    slot("vertical_press", "secondary", ["shoulders"], ["triceps"]),
    slot("vertical_pull", "secondary", ["back"], ["biceps"]),
    slot("biceps_accessory", "accessory", ["biceps"], []),
    slot("triceps_accessory", "accessory", ["triceps"], []),
  ],
  UPPER: [
    slot("horizontal_press", "primary", ["chest"], ["triceps", "shoulders"]),
    slot("horizontal_pull", "primary", ["back"], ["biceps"]),
    slot("vertical_press", "secondary", ["shoulders"], ["triceps"]),
    slot("vertical_pull", "secondary", ["back"], ["biceps"]),
    slot("biceps_accessory", "accessory", ["biceps"], []),
    slot("triceps_accessory", "accessory", ["triceps"], []),
    slot("lateral_delt_accessory", "accessory", ["shoulders"], []),
    slot("chest_accessory", "accessory", ["chest"], []),
  ],
  LOWER: [
    slot("knee_dominant", "primary", ["quadriceps"], ["glutes"]),
    slot("hip_hinge", "primary", ["hamstrings", "glutes"], ["back"]),
    slot("calf_accessory", "accessory", ["calves"], []),
    slot("unilateral_lower", "secondary", ["quadriceps", "glutes"], ["hamstrings"]),
    slot("hamstring_accessory", "accessory", ["hamstrings"], []),
  ],
  PUSH: [
    slot("horizontal_press", "primary", ["chest"], ["triceps", "shoulders"]),
    slot("vertical_press", "primary", ["shoulders"], ["triceps"]),
    slot("chest_accessory", "accessory", ["chest"], []),
    slot("lateral_delt_accessory", "accessory", ["shoulders"], []),
    slot("triceps_accessory", "accessory", ["triceps"], []),
  ],
  PULL: [
    slot("vertical_pull", "primary", ["back"], ["biceps"]),
    slot("horizontal_pull", "primary", ["back"], ["biceps"]),
    slot("biceps_accessory", "accessory", ["biceps"], []),
  ],
  LEGS: [
    slot("knee_dominant", "primary", ["quadriceps"], ["glutes"]),
    slot("hip_hinge", "primary", ["hamstrings", "glutes"], ["back"]),
    slot("calf_accessory", "accessory", ["calves"], []),
    slot("unilateral_lower", "secondary", ["quadriceps", "glutes"], ["hamstrings"]),
    slot("hamstring_accessory", "accessory", ["hamstrings"], []),
  ],
  STRENGTH_SUPPORT_FULL_BODY: [
    slot("knee_dominant", "primary", ["quadriceps"], ["glutes"]),
    slot("horizontal_press", "primary", ["chest"], ["triceps", "shoulders"]),
    slot("horizontal_pull", "primary", ["back"], ["biceps"]),
    slot("hip_hinge", "secondary", ["hamstrings", "glutes"], ["back"]),
    slot("calf_accessory", "accessory", ["calves"], []),
    slot("vertical_press", "secondary", ["shoulders"], ["triceps"]),
  ],
  AEROBIC_BASE: [slot("aerobic_modality", "cardio", [], [])],
  INTERVAL: [slot("aerobic_modality", "cardio", [], [])],
};

const DISPLAY_FOCUS: Readonly<Record<SessionFocus, string>> = {
  FULL_BODY: "Corpo inteiro",
  UPPER: "Membros superiores",
  LOWER: "Membros inferiores",
  PUSH: "Empurrar",
  PULL: "Puxar",
  LEGS: "Pernas",
  AEROBIC_BASE: "Base aeróbica",
  INTERVAL: "Intervalado",
  STRENGTH_SUPPORT_FULL_BODY: "Força de suporte — corpo inteiro",
};

function slot(
  movementPattern: MovementPattern,
  role: ExerciseSlotRole,
  primaryMuscles: readonly MuscleGroup[],
  secondaryMuscles: readonly MuscleGroup[],
): SlotBlueprint {
  return { movementPattern, role, primaryMuscles, secondaryMuscles };
}

function normalizedToken(value: string | null): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function resolveWorkoutGoal(context: UserFitnessContext): WorkoutGoal {
  const value = normalizedToken(context.training.primaryGoal ?? context.health.primaryGoal);
  const aliases: Record<string, WorkoutGoal> = {
    hypertrophy: "hypertrophy",
    hipertrofia: "hypertrophy",
    fat_loss: "fat_loss",
    emagrecimento: "fat_loss",
    conditioning: "conditioning",
    condicionamento: "conditioning",
  };
  const goal = aliases[value];
  if (!goal) {
    throw new WorkoutPrescriptionError("UNSUPPORTED_GOAL", "O objetivo não possui uma strategy V1.");
  }
  return goal;
}

export function resolveTrainingLevel(context: UserFitnessContext): TrainingLevel {
  const value = normalizedToken(context.training.initialTrainingLevel ?? context.training.trainingExperience);
  if (["advanced", "avancado"].includes(value)) return "advanced";
  if (["intermediate", "intermediario"].includes(value)) return "intermediate";
  return "beginner";
}

export function resolveSessionDurationBudget(context: UserFitnessContext): SessionDurationBudget {
  const minutes = context.training.sessionDurationMin;
  if (typeof minutes === "number" && Number.isFinite(minutes)) {
    if (minutes <= 37) return 30;
    if (minutes <= 52) return 45;
    if (minutes <= 75) return 60;
    return 90;
  }
  switch (context.training.sessionDurationRange) {
    case "under_30": return 30;
    case "30_45": return 45;
    case "45_60": return 60;
    case "60_90":
    case "over_90": return 90;
    default: return 60;
  }
}

function availabilityCap(context: UserFitnessContext): number {
  const raw = context.training.trainingDaysPerWeek;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return 3;
  return Math.min(6, Math.max(2, raw));
}

export function resolveEffectiveTrainingFrequency(
  strategy: GoalPrescriptionStrategy,
  context: UserFitnessContext,
): { availabilityCap: number; effectiveFrequency: number; rationale: readonly string[] } {
  const level = resolveTrainingLevel(context);
  const cap = availabilityCap(context);
  const policy = strategy.effectiveFrequencyPolicy[level];
  const effectiveFrequency = Math.min(cap, policy.preferredSessions, policy.maximumSessions);
  const rationale = [
    `availability_cap=${cap}`,
    `goal=${strategy.goal}`,
    `level=${level}`,
    `policy_preferred=${policy.preferredSessions}`,
    `policy_maximum=${policy.maximumSessions}`,
  ];
  if (effectiveFrequency < cap) {
    rationale.push(`reduced_from_availability=${cap - effectiveFrequency}`);
  } else {
    rationale.push("availability_used_without_exceeding_policy");
  }
  return { availabilityCap: cap, effectiveFrequency, rationale };
}

function combinations(values: readonly number[], size: number): number[][] {
  const result: number[][] = [];
  function walk(start: number, selected: number[]) {
    if (selected.length === size) {
      result.push(selected);
      return;
    }
    for (let index = start; index <= values.length - (size - selected.length); index += 1) {
      walk(index + 1, [...selected, values[index]]);
    }
  }
  walk(0, []);
  return result;
}

function circularGap(left: number, right: number): number {
  return right > left ? right - left : right + 7 - left;
}

function activityConflictDays(context: UserFitnessContext): Set<number> {
  const days = new Set<number>();
  for (const activity of context.training.activities ?? []) {
    for (const day of activity.availableWeekdays ?? []) days.add(day);
  }
  return days;
}

function normalizedWeekdays(days: readonly number[] | null): number[] {
  return [...new Set(days ?? [])]
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    .sort((left, right) => left - right);
}

function schedulingPool(count: number, context: UserFitnessContext): {
  days: readonly number[];
  constrainedByAvailability: boolean;
} {
  const available = normalizedWeekdays(context.training.availableWeekdays);
  if (available.length >= count) {
    return { days: available, constrainedByAvailability: available.length < 7 };
  }
  return { days: [1, 2, 3, 4, 5, 6, 7], constrainedByAvailability: false };
}

function scoreWeekdays(days: readonly number[], context: UserFitnessContext): number {
  const preferred = new Set(normalizedWeekdays(context.training.preferredWeekdays));
  const sorted = [...days].sort((a, b) => a - b);
  const gaps = sorted.map((day, index) => circularGap(day, sorted[(index + 1) % sorted.length]));
  const spacing = gaps.reduce((sum, gap) => sum + Math.min(gap, 2), 0);
  const preference = sorted.filter((day) => preferred.has(day)).length * 8;
  return spacing + preference;
}

function focusMuscles(focus: SessionFocus): Set<MuscleGroup> {
  const muscles = new Set<MuscleGroup>();
  for (const item of SLOT_BLUEPRINTS[focus]) {
    for (const muscle of item.primaryMuscles) muscles.add(muscle);
  }
  return muscles;
}

function recoveryViolations(candidate: SplitCandidate, weekdays: readonly number[]): string[] {
  const violations = new Set<string>();
  for (let index = 0; index < candidate.sessions.length; index += 1) {
    const nextIndex = (index + 1) % candidate.sessions.length;
    if (circularGap(weekdays[index], weekdays[nextIndex]) !== 1) continue;
    const current = candidate.sessions[index];
    const next = candidate.sessions[nextIndex];
    if (current.kind === "STRENGTH_SUPPORT" && next.kind === "STRENGTH_SUPPORT") {
      violations.add("CONSECUTIVE_STRENGTH_SUPPORT");
    }
    if ((current.focus === "LOWER" || current.focus === "UPPER") && next.focus === "FULL_BODY") {
      violations.add(`${current.focus}_TO_FULL_BODY_NEXT_DAY`);
    }
    const currentMuscles = focusMuscles(current.focus);
    const nextMuscles = focusMuscles(next.focus);
    if ([...MAJOR_MUSCLES].some((muscle) => currentMuscles.has(muscle) && nextMuscles.has(muscle))) {
      violations.add("SAME_MAJOR_GROUP_UNDER_48H");
    }
  }
  return [...violations].sort();
}

function recoverySpacingScore(candidate: SplitCandidate, weekdays: readonly number[]): number {
  let score = 0;
  for (const muscle of MAJOR_MUSCLES) {
    const exposureDays = candidate.sessions.flatMap((session, index) =>
      focusMuscles(session.focus).has(muscle) ? [weekdays[index]] : []
    ).sort((left, right) => left - right);
    if (exposureDays.length < 2) continue;
    for (let index = 0; index < exposureDays.length; index += 1) {
      const gap = circularGap(exposureDays[index], exposureDays[(index + 1) % exposureDays.length]);
      score += gap >= 2 ? 2 : -20;
    }
  }
  score -= recoveryViolations(candidate, weekdays).length * 30;
  return score;
}

function durationFitScore(): number {
  // Slot allocation is budget-aware and verified after concrete sets are assigned.
  return 2;
}

function activityConflictScore(
  candidate: SplitCandidate,
  weekdays: readonly number[],
  conflicts: ReadonlySet<number>,
): number {
  return candidate.sessions.reduce((score, session, index) => {
    if (!conflicts.has(weekdays[index])) return score;
    if (session.kind === "INTERVAL") return score - 3;
    if (session.kind === "RESISTANCE" || session.kind === "STRENGTH_SUPPORT") return score - 2;
    return score - 1;
  }, 0);
}

function scoreSplit(
  candidate: SplitCandidate,
  weekdays: readonly number[],
  duration: SessionDurationBudget,
  context: UserFitnessContext,
): SplitScore {
  const muscleExposures = new Map<MuscleGroup, number>();
  candidate.sessions.forEach((session) => {
    for (const muscle of focusMuscles(session.focus)) {
      muscleExposures.set(muscle, (muscleExposures.get(muscle) ?? 0) + 1);
    }
  });
  const coveredMajor = [...MAJOR_MUSCLES].filter((muscle) => (muscleExposures.get(muscle) ?? 0) > 0).length;
  const repeatedMajor = [...MAJOR_MUSCLES].filter((muscle) => (muscleExposures.get(muscle) ?? 0) >= 2).length;
  const conflicts = activityConflictDays(context);
  const score: Omit<SplitScore, "total"> = {
    goalAlignment: candidate.goalAlignment,
    muscleCoverage: coveredMajor * 2,
    weeklyFrequency: repeatedMajor,
    recoverySpacing: recoverySpacingScore(candidate, weekdays),
    preferredWeekdays: scoreWeekdays(weekdays, context),
    sessionDuration: durationFitScore(),
    existingActivityConflicts: activityConflictScore(candidate, weekdays, conflicts),
    trainingPeriod: context.training.preferredTrainingPeriod ? 1 : 0,
  };
  return { ...score, total: Object.values(score).reduce((sum, value) => sum + value, 0) };
}

function normalizeConditioningIntervals(
  candidate: SplitCandidate,
  strategy: GoalPrescriptionStrategy,
  level: TrainingLevel,
): SplitCandidate {
  if (strategy.goal !== "conditioning" || strategy.cardioPolicy[level].maximumIntervalSessions > 0) {
    return candidate;
  }
  return {
    ...candidate,
    id: candidate.id.replace("interval", "base"),
    sessions: candidate.sessions.map((session) => session.kind === "INTERVAL"
      ? { kind: "AEROBIC_BASE" as const, focus: "AEROBIC_BASE" as const }
      : session),
  };
}

export function resolveWeeklyStructure(
  strategy: GoalPrescriptionStrategy,
  context: UserFitnessContext,
): {
  effectiveFrequency: number;
  availabilityCap: number;
  frequencyRationale: readonly string[];
  durationBudgetMinutes: SessionDurationBudget;
  candidate: SplitCandidate;
  weekdays: readonly number[];
  splitScore: SplitScore;
  scheduleRationale: readonly string[];
  recoveryViolations: readonly string[];
} {
  const frequency = resolveEffectiveTrainingFrequency(strategy, context);
  const duration = resolveSessionDurationBudget(context);
  const level = resolveTrainingLevel(context);
  const candidates = strategy.candidateSplits[frequency.effectiveFrequency];
  if (!candidates?.length) {
    throw new WorkoutPrescriptionError("NO_SPLIT_AVAILABLE", "Nenhum split determinístico cobre a frequência efetiva.");
  }
  const pool = schedulingPool(frequency.effectiveFrequency, context);
  const weekdayCombinations = combinations(pool.days, frequency.effectiveFrequency);
  const scored = candidates.flatMap((rawCandidate) => {
    const candidate = normalizeConditioningIntervals(rawCandidate, strategy, level);
    return weekdayCombinations.map((weekdays) => ({
      candidate,
      weekdays,
      score: scoreSplit(candidate, weekdays, duration, context),
    }));
  }).sort((left, right) =>
    right.score.total - left.score.total
    || left.candidate.id.localeCompare(right.candidate.id)
    || left.weekdays.join("").localeCompare(right.weekdays.join(""))
  );
  const selected = scored[0];
  const violations = recoveryViolations(selected.candidate, selected.weekdays);
  const scheduleRationale = [
    `selected_weekdays=${selected.weekdays.join(",")}`,
    pool.constrainedByAvailability ? "available_weekdays_respected" : "full_week_spacing_optimized",
    violations.length === 0
      ? "recovery_constraints_satisfied"
      : "recovery_constraint_limited_by_available_weekdays",
  ];
  return {
    availabilityCap: frequency.availabilityCap,
    effectiveFrequency: frequency.effectiveFrequency,
    frequencyRationale: frequency.rationale,
    durationBudgetMinutes: duration,
    candidate: selected.candidate,
    weekdays: selected.weekdays,
    splitScore: selected.score,
    scheduleRationale,
    recoveryViolations: violations,
  };
}

function existingAerobicExposureCount(context: UserFitnessContext): number {
  return (context.training.activities ?? []).reduce(
    (sum, activity) => sum + Math.max(0, activity.sessionsPerWeek ?? 0),
    0,
  );
}

function targetWeeklyCardioMinutes(strategy: GoalPrescriptionStrategy, level: TrainingLevel): number {
  const policy = strategy.cardioPolicy[level];
  return policy.targetWeeklyExposures * policy.embeddedDurationMinutes;
}

function resolvedEquipment(context: UserFitnessContext): string[] {
  if (context.training.trainingLocation === "full_gym") return ["full_gym"];
  return (context.training.availableEquipment ?? []).map((equipment) =>
    equipment === "other" && context.training.otherEquipmentLabel
      ? context.training.otherEquipmentLabel
      : equipment
  );
}

export function resolveCardioPrescription(
  strategy: GoalPrescriptionStrategy,
  context: UserFitnessContext,
  structure: ReturnType<typeof resolveWeeklyStructure>,
): readonly CardioPrescription[] {
  const level = resolveTrainingLevel(context);
  const policy = strategy.cardioPolicy[level];
  const pureCardioIndexes = structure.candidate.sessions.flatMap((session, index) =>
    session.kind === "AEROBIC_BASE" || session.kind === "INTERVAL" ? [index] : []
  );
  const existing = existingAerobicExposureCount(context);
  const desiredNewExposures = strategy.goal === "hypertrophy"
    ? Math.max(0, policy.targetWeeklyExposures - existing)
    : policy.targetWeeklyExposures;
  const weeklyMinuteTarget = strategy.goal === "hypertrophy"
    ? Math.max(0, desiredNewExposures * policy.embeddedDurationMinutes)
    : targetWeeklyCardioMinutes(strategy, level);
  const strengthIndexes = structure.candidate.sessions.flatMap((session, index) =>
    session.kind === "RESISTANCE" || session.kind === "STRENGTH_SUPPORT" ? [index] : []
  );
  const assignmentIndexes = [...pureCardioIndexes];
  let assignedMinutes = pureCardioIndexes.reduce((sum) =>
    sum + Math.min(policy.baseDurationMinutes, structure.durationBudgetMinutes), 0);
  for (const index of strengthIndexes) {
    if (assignmentIndexes.length >= desiredNewExposures || assignedMinutes >= weeklyMinuteTarget) break;
    const blueprint = structure.candidate.sessions[index];
    const minimumResistance = minimumRequiredResistanceMinutes(
      strategy,
      level,
      blueprint.focus,
      blueprint.kind,
      structure.durationBudgetMinutes,
    );
    const availableForCardio = Math.max(0, structure.durationBudgetMinutes - minimumResistance);
    const duration = Math.min(policy.embeddedDurationMinutes, availableForCardio);
    if (duration < 8) continue;
    assignmentIndexes.push(index);
    assignedMinutes += duration;
  }

  let intervalCount = 0;
  return assignmentIndexes.map((sessionIndex, index) => {
    const session = structure.candidate.sessions[sessionIndex];
    const prescribedInterval = session.kind === "INTERVAL"
      && intervalCount < policy.maximumIntervalSessions;
    if (prescribedInterval) intervalCount += 1;
    const embedded = session.kind !== "AEROBIC_BASE" && session.kind !== "INTERVAL";
    const durationMinutes = embedded
      ? Math.min(
        policy.embeddedDurationMinutes,
        Math.max(8, structure.durationBudgetMinutes
          - minimumRequiredResistanceMinutes(
            strategy,
            level,
            session.focus,
            session.kind,
            structure.durationBudgetMinutes,
          )),
      )
      : Math.min(policy.baseDurationMinutes, structure.durationBudgetMinutes);
    return {
      id: `cardio-${String(index + 1).padStart(2, "0")}`,
      sessionId: `session-${String(sessionIndex + 1).padStart(2, "0")}`,
      kind: prescribedInterval ? "INTERVAL" : "AEROBIC_BASE",
      embedded,
      durationMinutes,
      effortMethod: prescribedInterval ? "rpe" : "talk_test",
      targetRpeRange: prescribedInterval ? [7, 8] : [3, 5],
      talkTest: prescribedInterval ? "short_phrases" : "comfortable_conversation",
      intervalWorkSeconds: prescribedInterval ? 60 : null,
      intervalRecoverySeconds: prescribedInterval ? 120 : null,
      rounds: prescribedInterval ? Math.max(4, Math.min(8, Math.floor(durationMinutes / 3))) : null,
    } satisfies CardioPrescription;
  });
}

function maximumSlotCount(duration: number): number {
  if (duration <= 30) return 5;
  if (duration <= 45) return 7;
  return 8;
}

function setsForRole(
  role: ExerciseSlotRole,
  duration: number,
  kind: WeeklySessionPrescription["kind"],
  strategy: GoalPrescriptionStrategy,
  level: TrainingLevel,
): number {
  if (role === "cardio") return 1;
  if (role === "core") return 2;
  if (kind === "STRENGTH_SUPPORT") return role === "accessory" ? 2 : 2;
  if (level === "beginner") {
    return strategy.goal === "hypertrophy" && role === "primary" ? 3 : 2;
  }
  if (role === "accessory") return strategy.goal === "hypertrophy" && duration >= 60 ? 3 : 2;
  return strategy.goal === "fat_loss" && duration <= 30 ? 2 : 3;
}

function repRangeForRole(strategy: GoalPrescriptionStrategy, role: ExerciseSlotRole) {
  if (role === "cardio") return { min: 1, max: 1 };
  return strategy.repPolicy[role];
}

function shouldAddCore(sessionIndex: number, strategy: GoalPrescriptionStrategy, resistanceSessionCount: number): boolean {
  const target = Math.min(
    strategy.corePolicy.maximumWeeklyExposures,
    Math.max(strategy.corePolicy.minimumWeeklyExposures, Math.ceil(resistanceSessionCount / 2)),
  );
  if (target <= 0 || resistanceSessionCount <= 0) return false;
  const interval = resistanceSessionCount / target;
  return Math.floor((sessionIndex + 1) / interval) > Math.floor(sessionIndex / interval);
}

function requiredBlueprintCount(strategy: GoalPrescriptionStrategy, focus: SessionFocus): number {
  switch (focus) {
    case "FULL_BODY": return strategy.goal === "hypertrophy" ? 7 : 5;
    case "UPPER": return 4;
    case "LOWER": return 3;
    case "PUSH": return 2;
    case "PULL": return 2;
    case "LEGS": return 3;
    case "STRENGTH_SUPPORT_FULL_BODY": return 5;
    case "AEROBIC_BASE":
    case "INTERVAL": return 1;
  }
}

function restSecondsForRole(role: ExerciseSlotRole): number {
  return role === "primary" ? 120 : role === "secondary" ? 90 : role === "cardio" ? 0 : 60;
}

export function estimateSlotMinutes(slot: Pick<ExerciseSlot, "sets" | "restSeconds" | "role">): number {
  if (slot.role === "cardio") return 0;
  const activeMinutes = slot.sets * 0.75;
  const restMinutes = Math.max(0, slot.sets - 1) * slot.restSeconds / 60;
  return Math.ceil(activeMinutes + restMinutes);
}

function transitionBufferMinutes(slotCount: number): number {
  return slotCount === 0 ? 0 : 2 + Math.ceil(Math.max(0, slotCount - 1) * 0.5);
}

function estimatedResistanceMinutes(slots: readonly ExerciseSlot[]): number {
  const resistanceSlots = slots.filter((item) => item.role !== "cardio");
  return resistanceSlots.reduce((sum, item) => sum + estimateSlotMinutes(item), 0)
    + transitionBufferMinutes(resistanceSlots.length);
}

function minimumRequiredResistanceMinutes(
  strategy: GoalPrescriptionStrategy,
  level: TrainingLevel,
  focus: SessionFocus,
  kind: WeeklySessionPrescription["kind"],
  duration: number,
): number {
  if (kind === "AEROBIC_BASE" || kind === "INTERVAL") return 0;
  const required = SLOT_BLUEPRINTS[focus].slice(0, requiredBlueprintCount(strategy, focus));
  const slots = required.map((blueprint) => ({
    ...blueprint,
    sets: setsForRole(blueprint.role, duration, kind, strategy, level),
    restSeconds: restSecondsForRole(blueprint.role),
  }));
  return slots.reduce((sum, item) => sum + estimateSlotMinutes(item), 0)
    + transitionBufferMinutes(slots.length);
}

function buildExerciseSlots(
  strategy: GoalPrescriptionStrategy,
  context: UserFitnessContext,
  focus: SessionFocus,
  kind: WeeklySessionPrescription["kind"],
  sessionId: string,
  resistanceBudgetMinutes: number,
  resistanceOrdinal: number,
  resistanceSessionCount: number,
): readonly ExerciseSlot[] {
  const constraints = {
    equipment: resolvedEquipment(context),
    trainingLocation: context.training.trainingLocation,
    affectedBodyAreas: [...(context.training.affectedBodyAreas ?? [])],
    conservativeSelectionRequired: context.training.painOrLimitation === true,
  };
  if (kind === "AEROBIC_BASE" || kind === "INTERVAL") {
    return [{
      id: `${sessionId}-aerobic-modality`,
      ...SLOT_BLUEPRINTS[focus][0],
      sets: 1,
      repRange: { min: 1, max: 1 },
      restSeconds: 0,
      selectionConstraints: constraints,
    }];
  }
  const level = resolveTrainingLevel(context);
  const requiredCount = requiredBlueprintCount(strategy, focus);
  const core: SlotBlueprint = slot("core_stability", "core", ["core"], []);
  const candidates = [...SLOT_BLUEPRINTS[focus]];
  if (shouldAddCore(resistanceOrdinal, strategy, resistanceSessionCount)) {
    candidates.splice(requiredCount, 0, core);
  }
  const selected: ExerciseSlot[] = [];
  const slotCap = strategy.goal === "fat_loss" && focus === "FULL_BODY"
    ? Math.min(6, maximumSlotCount(resistanceBudgetMinutes))
    : maximumSlotCount(resistanceBudgetMinutes);
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    if (selected.length >= slotCap) break;
    const blueprint = candidates[candidateIndex];
    const required = candidateIndex < requiredCount;
    let sets = setsForRole(blueprint.role, resistanceBudgetMinutes, kind, strategy, level);
    let exerciseSlot: ExerciseSlot = {
      id: `${sessionId}-slot-${String(selected.length + 1).padStart(2, "0")}-${blueprint.movementPattern}`,
      ...blueprint,
      sets,
      repRange: repRangeForRole(strategy, blueprint.role),
      restSeconds: restSecondsForRole(blueprint.role),
      selectionConstraints: constraints,
    };
    while (sets > 1 && estimatedResistanceMinutes([...selected, exerciseSlot]) > resistanceBudgetMinutes) {
      sets -= 1;
      exerciseSlot = { ...exerciseSlot, sets };
    }
    if (estimatedResistanceMinutes([...selected, exerciseSlot]) <= resistanceBudgetMinutes) {
      selected.push(exerciseSlot);
      continue;
    }
    if (required) {
      throw new WorkoutPrescriptionError(
        "INVALID_CONTEXT",
        `Required movement ${blueprint.movementPattern} does not fit the session budget.`,
      );
    }
  }
  return selected;
}

function volumeRangeFor(strategy: GoalPrescriptionStrategy, level: TrainingLevel, muscle: MuscleGroup) {
  if (muscle === "core") return strategy.volumePolicy[level].core;
  if (MAJOR_MUSCLES.has(muscle)) return strategy.volumePolicy[level].major;
  return strategy.volumePolicy[level].small;
}

export function resolveMuscleVolumePrescription(
  strategy: GoalPrescriptionStrategy,
  level: TrainingLevel,
  sessions: readonly WeeklySessionPrescription[],
  duration: SessionDurationBudget,
): readonly MuscleVolumePrescription[] {
  return MUSCLE_TAXONOMY.map((muscle) => {
    let direct = 0;
    let indirect = 0;
    let frequency = 0;
    for (const session of sessions) {
      let exposed = false;
      for (const exerciseSlot of session.requiredSlots) {
        if (exerciseSlot.primaryMuscles.includes(muscle)) {
          direct += exerciseSlot.sets;
          exposed = true;
        }
        if (exerciseSlot.secondaryMuscles.includes(muscle)) {
          indirect += exerciseSlot.sets * 0.5;
          exposed = true;
        }
      }
      if (exposed) frequency += 1;
    }
    const range = volumeRangeFor(strategy, level, muscle);
    const durationScale = duration === 30 ? 0.75 : duration === 45 ? 0.9 : 1;
    const target = Math.max(0, Math.round(range.target * durationScale));
    const coverageRequirement = strategy.muscleCoverageRequirements[muscle];
    const coverageSatisfied = coverageRequirement === "OPTIONAL"
      || (coverageRequirement === "DIRECT_TARGET_REQUIRED" ? direct >= range.min : direct + indirect >= range.min);
    return {
      muscle,
      minWeeklySets: range.min,
      targetDirectSets: target,
      maxWeeklySets: range.max,
      plannedDirectSets: direct,
      plannedIndirectContribution: indirect,
      effectiveSetEstimate: direct + indirect,
      weeklyFrequency: frequency,
      coverageRequirement,
      coverageSatisfied,
      directHardLimitExceeded: direct > range.max,
      heuristicVersion: INDIRECT_SET_HEURISTIC_VERSION,
      heuristicInterpretation: INDIRECT_SET_HEURISTIC_INTERPRETATION,
    };
  });
}

export function resolveWorkoutPrescription(context: UserFitnessContext): ResolvedWorkoutPrescription {
  const goal = resolveWorkoutGoal(context);
  const strategy = getGoalPrescriptionStrategy(goal);
  const level = resolveTrainingLevel(context);
  const structure = resolveWeeklyStructure(strategy, context);
  const cardio = resolveCardioPrescription(strategy, context, structure);
  const cardioBySession = new Map(cardio.map((item) => [item.sessionId, item]));
  const resistanceSessionCount = structure.candidate.sessions.filter(
    (session) => session.kind === "RESISTANCE" || session.kind === "STRENGTH_SUPPORT",
  ).length;
  let resistanceOrdinal = 0;
  const sessions = structure.candidate.sessions.map((blueprint, index) => {
    const id = `session-${String(index + 1).padStart(2, "0")}`;
    const cardioBlock = cardioBySession.get(id) ?? null;
    const isResistance = blueprint.kind === "RESISTANCE" || blueprint.kind === "STRENGTH_SUPPORT";
    const resistanceBudgetMinutes = isResistance
      ? Math.max(0, structure.durationBudgetMinutes - (cardioBlock?.durationMinutes ?? 0))
      : 0;
    const slots = [...buildExerciseSlots(
      strategy,
      context,
      blueprint.focus,
      blueprint.kind,
      id,
      resistanceBudgetMinutes,
      resistanceOrdinal,
      resistanceSessionCount,
    )];
    if (isResistance && cardioBlock) {
      slots.push({
        id: `${id}-slot-cardio-aerobic_modality`,
        movementPattern: "aerobic_modality",
        role: "cardio",
        primaryMuscles: [],
        secondaryMuscles: [],
        sets: 1,
        repRange: { min: 1, max: 1 },
        restSeconds: 0,
        selectionConstraints: {
          equipment: resolvedEquipment(context),
          trainingLocation: context.training.trainingLocation,
          affectedBodyAreas: [...(context.training.affectedBodyAreas ?? [])],
          conservativeSelectionRequired: context.training.painOrLimitation === true,
        },
      });
    }
    if (isResistance) resistanceOrdinal += 1;
    const resistanceSlots = slots.filter((item) => item.role !== "cardio");
    const estimatedMinutes = estimatedResistanceMinutes(resistanceSlots);
    const overflowMinutes = Math.max(
      0,
      estimatedMinutes + (cardioBlock?.durationMinutes ?? 0) - structure.durationBudgetMinutes,
    );
    return {
      id,
      isoWeekday: structure.weekdays[index],
      kind: blueprint.kind,
      focus: blueprint.focus,
      displayFocus: DISPLAY_FOCUS[blueprint.focus],
      durationBudgetMinutes: structure.durationBudgetMinutes,
      resistanceBudgetMinutes,
      estimatedResistanceMinutes: estimatedMinutes,
      transitionBufferMinutes: transitionBufferMinutes(resistanceSlots.length),
      sessionBudgetOverflowMinutes: overflowMinutes,
      requiredSlots: slots,
      cardio: cardioBlock,
    } satisfies WeeklySessionPrescription;
  });
  if (sessions.some((session) => session.requiredSlots.length > 0
      && session.requiredSlots.every((exerciseSlot) => exerciseSlot.primaryMuscles.includes("core")))) {
    throw new WorkoutPrescriptionError("INVALID_CONTEXT", "Core-only sessions are not allowed by strategy V1.");
  }
  if (sessions.some((session) => session.sessionBudgetOverflowMinutes !== 0)) {
    throw new WorkoutPrescriptionError("INVALID_CONTEXT", "Session budget overflow is not allowed by strategy V1.");
  }
  const cardioWeeklyMinutes = cardio.reduce((sum, item) => sum + item.durationMinutes, 0);
  return {
    strategyVersion: GOAL_STRATEGY_VERSION,
    goal,
    level,
    availabilityCap: structure.availabilityCap,
    effectiveFrequency: structure.effectiveFrequency,
    frequencyRationale: structure.frequencyRationale,
    durationBudgetMinutes: structure.durationBudgetMinutes,
    selectedSplitId: structure.candidate.id,
    selectedSplitLabel: structure.candidate.label,
    splitScore: structure.splitScore,
    scheduleRationale: structure.scheduleRationale,
    recoveryViolations: structure.recoveryViolations,
    sessions,
    muscleVolumes: resolveMuscleVolumePrescription(strategy, level, sessions, structure.durationBudgetMinutes),
    cardioPrescriptions: cardio,
    cardioWeeklyMinutes,
    cardioWeeklyTargetMinutes: targetWeeklyCardioMinutes(strategy, level),
    constraints: {
      equipment: resolvedEquipment(context),
      trainingLocation: context.training.trainingLocation,
      affectedBodyAreas: [...(context.training.affectedBodyAreas ?? [])],
      painOrLimitation: context.training.painOrLimitation === true,
      preferredTrainingPeriod: context.training.preferredTrainingPeriod,
    },
  };
}
