import type { ResolvedWorkoutPrescription } from "../prescription/domain.ts";
import { estimateSlotMinutes } from "../prescription/engine.ts";
import {
  isExerciseEquipmentCompatible,
  resolveExerciseMetadata,
  type ExerciseMetadata,
} from "./exercise-metadata.ts";
import {
  WORKOUT_DURATION_TOLERANCE_MINUTES,
  WORKOUT_SET_TOLERANCE,
  WORKOUT_VALIDATOR_VERSION,
  type GeneratedCardioSelection,
  type GeneratedWorkoutSelectionPlan,
  type WorkoutValidationIssue,
  type WorkoutValidationIssueCode,
  type WorkoutValidationReport,
  type WorkoutValidationSeverity,
} from "./domain.ts";

type IssueInput = Omit<WorkoutValidationIssue, "message"> & { message: string };

function issue(
  issues: WorkoutValidationIssue[],
  code: WorkoutValidationIssueCode,
  severity: WorkoutValidationSeverity,
  input: Omit<IssueInput, "code" | "severity">,
) {
  issues.push({ code, severity, ...input });
}

function transitionBufferMinutes(slotCount: number): number {
  return slotCount === 0 ? 0 : 2 + Math.ceil(Math.max(0, slotCount - 1) * 0.5);
}

function cardioMatches(
  actual: GeneratedCardioSelection | null,
  expected: ResolvedWorkoutPrescription["sessions"][number]["cardio"],
): boolean {
  if (!actual || !expected) return actual === null && expected === null;
  return actual.kind === expected.kind
    && Math.abs(actual.duration_minutes - expected.durationMinutes) <= WORKOUT_DURATION_TOLERANCE_MINUTES
    && actual.effort_method === expected.effortMethod
    && actual.target_rpe_min === expected.targetRpeRange[0]
    && actual.target_rpe_max === expected.targetRpeRange[1]
    && actual.talk_test === expected.talkTest
    && actual.interval_work_seconds === expected.intervalWorkSeconds
    && actual.interval_recovery_seconds === expected.intervalRecoverySeconds
    && actual.rounds === expected.rounds;
}

function metadataSignature(items: readonly ExerciseMetadata[]): string {
  return items.map((item) => item.canonicalName).sort().join("|");
}

export function validateWorkoutPrescription(
  prescription: ResolvedWorkoutPrescription,
  generated: GeneratedWorkoutSelectionPlan,
): WorkoutValidationReport {
  const issues: WorkoutValidationIssue[] = [];
  if (generated.sessions.length !== prescription.sessions.length) {
    issue(issues, "SESSION_COUNT_MISMATCH", "HARD_FAILURE", {
      expected: prescription.sessions.length,
      observed: generated.sessions.length,
      message: "Generated session count differs from the authoritative prescription.",
    });
  }

  const generatedById = new Map<string, typeof generated.sessions[number]>();
  const duplicateIds = new Set<string>();
  generated.sessions.forEach((session, sessionIndex) => {
    if (generatedById.has(session.session_id)) duplicateIds.add(session.session_id);
    else generatedById.set(session.session_id, session);
    if (!prescription.sessions.some((expected) => expected.id === session.session_id)) {
      issue(issues, "EXTRA_UNAUTHORIZED_SESSION", "HARD_FAILURE", {
        sessionId: session.session_id,
        sessionIndex,
        message: "Generated plan contains a session that was not prescribed.",
      });
    }
  });
  for (const sessionId of duplicateIds) {
    issue(issues, "EXTRA_UNAUTHORIZED_SESSION", "HARD_FAILURE", {
      sessionId,
      message: "Generated plan contains a duplicated session id.",
    });
  }

  const actualDirect = new Map<string, number>();
  const actualIndirect = new Map<string, number>();
  const exposureSessions = new Map<string, Set<string>>();
  const sessionMetadata = new Map<string, ExerciseMetadata[]>();
  let recoveryStructureChanged = false;

  prescription.sessions.forEach((expectedSession, sessionIndex) => {
    const actualSession = generatedById.get(expectedSession.id);
    if (!actualSession) {
      issue(issues, "REQUIRED_SLOT_MISSING", "HARD_FAILURE", {
        sessionId: expectedSession.id,
        sessionIndex,
        expected: expectedSession.requiredSlots.map((slot) => slot.id),
        observed: [],
        message: "Authoritative session is missing from the generated plan.",
      });
      return;
    }
    if (actualSession.session_kind !== expectedSession.kind) {
      issue(issues, "SESSION_KIND_MISMATCH", "HARD_FAILURE", {
        sessionId: expectedSession.id,
        sessionIndex,
        expected: expectedSession.kind,
        observed: actualSession.session_kind,
        message: "Generated session kind differs from the authoritative structure.",
      });
      recoveryStructureChanged = true;
    }
    if (actualSession.iso_weekday !== expectedSession.isoWeekday) {
      issue(issues, "SESSION_DAY_MISMATCH", "HARD_FAILURE", {
        sessionId: expectedSession.id,
        sessionIndex,
        expected: expectedSession.isoWeekday,
        observed: actualSession.iso_weekday,
        message: "Generated session day differs from the recovery-aware schedule.",
      });
      recoveryStructureChanged = true;
    }

    const expectedBySlot = new Map(expectedSession.requiredSlots.map((slot) => [slot.id, slot]));
    const actualBySlot = new Map(actualSession.exercises.map((selection) => [selection.slot_id, selection]));
    if (actualBySlot.size !== actualSession.exercises.length) {
      issue(issues, "EXTRA_UNAUTHORIZED_EXERCISE", "HARD_FAILURE", {
        sessionId: expectedSession.id,
        sessionIndex,
        message: "Generated session contains duplicated slot selections.",
      });
    }
    actualSession.exercises.forEach((selection, exerciseIndex) => {
      if (!expectedBySlot.has(selection.slot_id)) {
        issue(issues, "EXTRA_UNAUTHORIZED_EXERCISE", "HARD_FAILURE", {
          sessionId: expectedSession.id,
          sessionIndex,
          exerciseIndex,
          observed: selection.slot_id,
          message: "Exercise targets a slot that was not prescribed.",
        });
      }
    });

    const resolvedMetadata: ExerciseMetadata[] = [];
    let estimatedMinutes = 0;
    expectedSession.requiredSlots.forEach((requiredSlot) => {
      const exerciseIndex = actualSession.exercises.findIndex((item) => item.slot_id === requiredSlot.id);
      const selection = exerciseIndex >= 0 ? actualSession.exercises[exerciseIndex] : undefined;
      if (!selection) {
        issue(issues, "REQUIRED_SLOT_MISSING", "HARD_FAILURE", {
          sessionId: expectedSession.id,
          sessionIndex,
          expected: requiredSlot.id,
          message: "A required exercise slot is missing.",
        });
        issue(issues, "REQUIRED_MOVEMENT_PATTERN_MISSING", "HARD_FAILURE", {
          sessionId: expectedSession.id,
          sessionIndex,
          expected: requiredSlot.movementPattern,
          message: "A prescribed movement pattern is missing.",
        });
        return;
      }
      if (selection.sets <= 0) {
        issue(issues, "INVALID_SET_COUNT", "HARD_FAILURE", {
          sessionId: expectedSession.id,
          sessionIndex,
          exerciseIndex,
          observed: selection.sets,
          message: "Exercise sets must be positive.",
        });
      }
      if (Math.abs(selection.sets - requiredSlot.sets) > WORKOUT_SET_TOLERANCE) {
        issue(issues, "VOLUME_MISMATCH", "HARD_FAILURE", {
          sessionId: expectedSession.id,
          sessionIndex,
          exerciseIndex,
          expected: requiredSlot.sets,
          observed: selection.sets,
          message: "Exercise sets exceed the versioned slot tolerance.",
        });
      }
      if (selection.rep_min > selection.rep_max
          || selection.rep_min < requiredSlot.repRange.min
          || selection.rep_max > requiredSlot.repRange.max) {
        issue(issues, "REP_RANGE_MISMATCH", "HARD_FAILURE", {
          sessionId: expectedSession.id,
          sessionIndex,
          exerciseIndex,
          expected: requiredSlot.repRange,
          observed: { min: selection.rep_min, max: selection.rep_max },
          message: "Exercise rep range is incompatible with the prescribed slot policy.",
        });
      }
      const metadata = resolveExerciseMetadata(selection.name);
      if (!metadata) {
        issue(issues, "UNKNOWN_EXERCISE_METADATA", "HARD_FAILURE", {
          sessionId: expectedSession.id,
          sessionIndex,
          exerciseIndex,
          observed: selection.name,
          message: "Exercise is not present in the controlled metadata catalog.",
        });
        return;
      }
      resolvedMetadata.push(metadata);
      if (metadata.movementPattern !== requiredSlot.movementPattern) {
        issue(issues, "REQUIRED_MOVEMENT_PATTERN_MISSING", "HARD_FAILURE", {
          sessionId: expectedSession.id,
          sessionIndex,
          exerciseIndex,
          expected: requiredSlot.movementPattern,
          observed: metadata.movementPattern,
          message: "Selected exercise does not satisfy the prescribed movement pattern.",
        });
      }
      if (!isExerciseEquipmentCompatible(metadata, requiredSlot.selectionConstraints.equipment)) {
        issue(issues, "EQUIPMENT_CONFLICT", "HARD_FAILURE", {
          sessionId: expectedSession.id,
          sessionIndex,
          exerciseIndex,
          expected: requiredSlot.selectionConstraints.equipment,
          observed: metadata.equipment,
          message: "Selected exercise requires unavailable equipment.",
        });
      }
      const painConflicts = metadata.incompatibleAffectedBodyAreas.filter((area) =>
        requiredSlot.selectionConstraints.affectedBodyAreas.includes(area)
      );
      if (painConflicts.length > 0) {
        issue(issues, "PAIN_LIMITATION_CONFLICT", "HARD_FAILURE", {
          sessionId: expectedSession.id,
          sessionIndex,
          exerciseIndex,
          expected: requiredSlot.selectionConstraints.affectedBodyAreas,
          observed: painConflicts,
          message: "Controlled metadata marks the exercise as incompatible with a declared affected area.",
        });
      }
      if (requiredSlot.role !== "cardio") {
        estimatedMinutes += estimateSlotMinutes({
          sets: selection.sets,
          restSeconds: selection.rest_seconds,
          role: requiredSlot.role,
        });
      }
      for (const muscle of metadata.primaryMuscles) {
        actualDirect.set(muscle, (actualDirect.get(muscle) ?? 0) + selection.sets);
        const exposures = exposureSessions.get(muscle) ?? new Set<string>();
        exposures.add(expectedSession.id);
        exposureSessions.set(muscle, exposures);
      }
      for (const muscle of metadata.secondaryMuscles) {
        actualIndirect.set(muscle, (actualIndirect.get(muscle) ?? 0) + selection.sets * 0.5);
        const exposures = exposureSessions.get(muscle) ?? new Set<string>();
        exposures.add(expectedSession.id);
        exposureSessions.set(muscle, exposures);
      }
    });
    sessionMetadata.set(expectedSession.id, resolvedMetadata);
    estimatedMinutes += transitionBufferMinutes(
      actualSession.exercises.filter((item) => expectedBySlot.get(item.slot_id)?.role !== "cardio").length,
    );
    estimatedMinutes += actualSession.cardio?.duration_minutes ?? 0;
    if (estimatedMinutes > expectedSession.durationBudgetMinutes + WORKOUT_DURATION_TOLERANCE_MINUTES) {
      issue(issues, "TIME_BUDGET_EXCEEDED", "HARD_FAILURE", {
        sessionId: expectedSession.id,
        sessionIndex,
        expected: expectedSession.durationBudgetMinutes,
        observed: estimatedMinutes,
        message: "Recalculated session duration exceeds the allowed tolerance.",
      });
    } else if (estimatedMinutes >= expectedSession.durationBudgetMinutes * 0.9) {
      issue(issues, "SESSION_NEAR_TIME_LIMIT", "WARNING", {
        sessionId: expectedSession.id,
        sessionIndex,
        expected: expectedSession.durationBudgetMinutes,
        observed: estimatedMinutes,
        message: "Session is close to its time budget.",
      });
    }
    if (!cardioMatches(actualSession.cardio, expectedSession.cardio)) {
      issue(issues, "CARDIO_PRESCRIPTION_VIOLATION", "HARD_FAILURE", {
        sessionId: expectedSession.id,
        sessionIndex,
        expected: expectedSession.cardio,
        observed: actualSession.cardio,
        message: "Generated cardio differs from the authoritative cardio prescription.",
      });
    }
    if (resolvedMetadata.length > 0
        && resolvedMetadata.every((metadata) => metadata.exerciseType === "core")) {
      issue(issues, "STANDALONE_CORE_MISUSE", "HARD_FAILURE", {
        sessionId: expectedSession.id,
        sessionIndex,
        message: "Standalone core session is not authorized by the strategy.",
      });
    }
  });

  if (recoveryStructureChanged) {
    issue(issues, "RECOVERY_STRUCTURE_VIOLATION", "HARD_FAILURE", {
      message: "Generated plan changed the authoritative recovery-aware structure.",
    });
  }

  for (let left = 0; left < prescription.sessions.length; left += 1) {
    for (let right = left + 1; right < prescription.sessions.length; right += 1) {
      const leftExpected = prescription.sessions[left];
      const rightExpected = prescription.sessions[right];
      if (leftExpected.focus === rightExpected.focus) continue;
      const bothResistance = ["RESISTANCE", "STRENGTH_SUPPORT"].includes(leftExpected.kind)
        && ["RESISTANCE", "STRENGTH_SUPPORT"].includes(rightExpected.kind);
      if (!bothResistance) continue;
      const leftMetadata = sessionMetadata.get(leftExpected.id) ?? [];
      const rightMetadata = sessionMetadata.get(rightExpected.id) ?? [];
      if (leftMetadata.length > 0 && metadataSignature(leftMetadata) === metadataSignature(rightMetadata)) {
        issue(issues, "DUPLICATED_SESSION", "HARD_FAILURE", {
          sessionId: rightExpected.id,
          sessionIndex: right,
          message: "Distinct prescribed stimuli were generated as duplicate sessions.",
        });
      }
    }
  }

  const accessorySelections = new Map<string, number>();
  for (const metadataItems of sessionMetadata.values()) {
    for (const metadata of metadataItems) {
      if (metadata.exerciseType !== "accessory") continue;
      accessorySelections.set(
        metadata.canonicalName,
        (accessorySelections.get(metadata.canonicalName) ?? 0) + 1,
      );
    }
  }
  for (const [name, count] of accessorySelections) {
    if (count < 3) continue;
    issue(issues, "ACCESSORY_SELECTION_REPETITIVE", "WARNING", {
      observed: { name, count },
      message: "Accessory selection is repetitive but remains structurally compatible.",
    });
  }

  for (const expectedVolume of prescription.muscleVolumes) {
    const direct = actualDirect.get(expectedVolume.muscle) ?? 0;
    const indirect = actualIndirect.get(expectedVolume.muscle) ?? 0;
    const effective = direct + indirect;
    if (Math.abs(direct - expectedVolume.plannedDirectSets) > WORKOUT_SET_TOLERANCE) {
      issue(issues, "VOLUME_MISMATCH", "HARD_FAILURE", {
        muscleGroup: expectedVolume.muscle,
        expected: expectedVolume.plannedDirectSets,
        observed: direct,
        message: "Reconciled direct volume differs from the authoritative plan.",
      });
    }
    const coverage = expectedVolume.coverageRequirement === "OPTIONAL"
      || (expectedVolume.coverageRequirement === "DIRECT_TARGET_REQUIRED"
        ? direct >= expectedVolume.minWeeklySets
        : effective >= expectedVolume.minWeeklySets);
    if (!coverage && expectedVolume.coverageSatisfied) {
      issue(issues, "MUSCLE_COVERAGE_OUTSIDE_HARD_POLICY", "HARD_FAILURE", {
        muscleGroup: expectedVolume.muscle,
        expected: expectedVolume.minWeeklySets,
        observed: { direct, indirect, effective, frequency: exposureSessions.get(expectedVolume.muscle)?.size ?? 0 },
        message: "Reconciled muscle coverage is below the goal-specific hard policy.",
      });
    }
    if (direct <= expectedVolume.maxWeeklySets && effective > expectedVolume.maxWeeklySets) {
      issue(issues, "INDIRECT_ESTIMATE_HIGH", "WARNING", {
        muscleGroup: expectedVolume.muscle,
        expected: expectedVolume.maxWeeklySets,
        observed: effective,
        message: "Indirect v1 estimate is high; it is contextual and not physiological equivalence.",
      });
    }
  }

  const generatedKinds = generated.sessions.map((session) => session.session_kind);
  const hasResistance = generatedKinds.some((kind) => kind === "RESISTANCE" || kind === "STRENGTH_SUPPORT");
  const hasAerobic = generatedKinds.some((kind) => kind === "AEROBIC_BASE" || kind === "INTERVAL")
    || generated.sessions.some((session) => session.cardio !== null);
  const goalMisaligned = prescription.goal === "hypertrophy"
    ? !hasResistance
    : prescription.goal === "fat_loss"
      ? !hasResistance || (prescription.cardioWeeklyTargetMinutes > 0 && !hasAerobic)
      : !hasResistance || !hasAerobic;
  if (goalMisaligned) {
    issue(issues, "GOAL_MISALIGNMENT", "HARD_FAILURE", {
      expected: prescription.goal,
      message: "Generated plan does not preserve the strategy's primary goal invariants.",
    });
  }

  const hardFailures = issues.filter((item) => item.severity === "HARD_FAILURE").length;
  const warnings = issues.filter((item) => item.severity === "WARNING").length;
  return {
    valid: hardFailures === 0,
    hardFailures,
    warnings,
    issues,
    strategyVersion: prescription.strategyVersion,
    validatorVersion: WORKOUT_VALIDATOR_VERSION,
  };
}
