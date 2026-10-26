import { getVisibleOnboardingV2Steps, type OnboardingV2StepId } from './onboarding-v2-steps.ts';
import {
  ACTIVITY_LEVELS,
  BIOLOGICAL_SEXES,
  BODY_AREAS,
  DIETARY_PATTERNS,
  EQUIPMENT,
  EXERCISE_CONFIDENCES,
  FOOD_BUDGET_STYLES,
  FOOD_PREPARATION_STYLES,
  PRIMARY_GOALS,
  MEAL_SCHEDULE_FLEXIBILITIES,
  MEAL_BREAK_AVAILABILITIES,
  PREFERRED_TRAINING_PERIODS,
  REPRODUCTIVE_STATUSES,
  RECENT_TRAINING_BREAKS,
  RESTRICTION_CODES,
  RESTRICTION_TYPES,
  ROUTINE_PREDICTABILITIES,
  SESSION_DURATIONS,
  SUPPLEMENT_CODES,
  TRAINING_DAYS_PER_WEEK,
  TRAINING_EXPERIENCES,
  TRAINING_LOCATIONS,
  WEEKDAYS,
  type OnboardingV2FormState,
} from './onboarding-v2-types.ts';

export interface OnboardingV2ValidationIssue {
  stepId: OnboardingV2StepId;
  field: string;
  message: string;
}

export type OnboardingV2ValidationResult =
  | { valid: true; issues: [] }
  | { valid: false; issues: OnboardingV2ValidationIssue[] };

export interface OnboardingV2ValidationOptions {
  referenceDate?: Date;
}

function issue(
  stepId: OnboardingV2StepId,
  field: string,
  message: string,
): OnboardingV2ValidationIssue {
  return { stepId, field, message };
}

function isOneOf<T>(values: readonly T[], value: unknown): value is T {
  return values.some((candidate) => candidate === value);
}

function isFiniteInRange(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= maximum;
}

function isUnique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function isLocalTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validConditionalLabel(label: string | null, maximum: number): boolean {
  if (label === null) return false;
  const trimmed = label.trim();
  return trimmed.length > 0 && trimmed.length <= maximum;
}

function validateDeclaredLabels(
  labels: readonly string[],
  stepId: OnboardingV2StepId,
  field: string,
): OnboardingV2ValidationIssue[] {
  const issues: OnboardingV2ValidationIssue[] = [];
  const normalized = labels.map((label) => label.trim().toLowerCase());

  labels.forEach((label, index) => {
    const trimmed = label.trim();
    if (trimmed.length === 0 || trimmed.length > 160) {
      issues.push(
        issue(stepId, `${field}.${index}.declaredLabel`, 'Use um label entre 1 e 160 caracteres.'),
      );
    }
  });

  if (!isUnique(normalized)) {
    issues.push(issue(stepId, field, 'Remova labels duplicados, ignorando maiúsculas e espaços.'));
  }

  return issues;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function compareCalendarDates(left: CalendarDate, right: CalendarDate): number {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

export function validateBirthDate(
  value: string | undefined,
  referenceDate = new Date(),
): string | null {
  if (value === undefined) return 'Informe a data de nascimento.';
  const birthDate = parseCalendarDate(value);
  if (!birthDate) return 'Informe uma data real no formato AAAA-MM-DD.';

  const today = {
    year: referenceDate.getFullYear(),
    month: referenceDate.getMonth() + 1,
    day: referenceDate.getDate(),
  };
  if (compareCalendarDates(birthDate, today) > 0) return 'A data não pode estar no futuro.';

  const eighteenthBirthdayDate = new Date(
    birthDate.year + 18,
    birthDate.month - 1,
    birthDate.day,
  );
  const eighteenthBirthday = {
    year: eighteenthBirthdayDate.getFullYear(),
    month: eighteenthBirthdayDate.getMonth() + 1,
    day: eighteenthBirthdayDate.getDate(),
  };
  if (compareCalendarDates(today, eighteenthBirthday) < 0) {
    return 'É necessário ter pelo menos 18 anos.';
  }

  return null;
}

export function validateOnboardingV2Step(
  stepId: OnboardingV2StepId,
  form: OnboardingV2FormState,
  options: OnboardingV2ValidationOptions = {},
): OnboardingV2ValidationResult {
  const issues: OnboardingV2ValidationIssue[] = [];
  const { health, training, nutrition, routine } = form;

  switch (stepId) {
    case 'goal':
      if (!isOneOf(PRIMARY_GOALS, health.primaryGoal)) {
        issues.push(issue(stepId, 'health.primaryGoal', 'Escolha um objetivo válido.'));
      }
      break;
    case 'birth-date': {
      const message = validateBirthDate(health.birthDate, options.referenceDate);
      if (message) issues.push(issue(stepId, 'health.birthDate', message));
      break;
    }
    case 'biological-sex':
      if (!isOneOf(BIOLOGICAL_SEXES, health.biologicalSex)) {
        issues.push(issue(stepId, 'health.biologicalSex', 'Escolha uma opção válida.'));
      }
      if (health.biologicalSex === 'female') {
        const isApplicableReproductiveStatus = (value: unknown) =>
          value !== 'not_applicable' && isOneOf(REPRODUCTIVE_STATUSES, value);
        if (!isApplicableReproductiveStatus(health.pregnancyStatus)) {
          issues.push(
            issue(stepId, 'health.pregnancyStatus', 'Informe seu contexto de gestação.'),
          );
        }
        if (!isApplicableReproductiveStatus(health.lactationStatus)) {
          issues.push(
            issue(stepId, 'health.lactationStatus', 'Informe seu contexto de amamentação.'),
          );
        }
      }
      break;
    case 'measurements':
      if (!isFiniteInRange(health.heightCm, 300)) {
        issues.push(issue(stepId, 'health.heightCm', 'A altura deve ser maior que 0 e até 300 cm.'));
      }
      if (!isFiniteInRange(health.weightKg, 500)) {
        issues.push(issue(stepId, 'health.weightKg', 'O peso deve ser maior que 0 e até 500 kg.'));
      }
      if (
        health.targetWeightKg !== undefined &&
        health.targetWeightKg !== null &&
        !isFiniteInRange(health.targetWeightKg, 500)
      ) {
        issues.push(
          issue(stepId, 'health.targetWeightKg', 'O peso-alvo deve ser maior que 0 e até 500 kg.'),
        );
      }
      break;
    case 'activity-level':
      if (!isOneOf(ACTIVITY_LEVELS, health.activityLevel)) {
        issues.push(issue(stepId, 'health.activityLevel', 'Escolha seu nível de atividade diária.'));
      }
      break;
    case 'daily-routine':
      if (!isLocalTime(routine.wakeTime)) {
        issues.push(issue(stepId, 'routine.wakeTime', 'Informe um horário aproximado para acordar.'));
      }
      if (!isLocalTime(routine.sleepTime)) {
        issues.push(issue(stepId, 'routine.sleepTime', 'Informe um horário aproximado para dormir.'));
      }
      if (
        isLocalTime(routine.wakeTime) &&
        isLocalTime(routine.sleepTime) &&
        routine.wakeTime === routine.sleepTime
      ) {
        issues.push(issue(stepId, 'routine.sleepTime', 'Os horários de acordar e dormir precisam ser diferentes.'));
      }
      if (!isOneOf(ROUTINE_PREDICTABILITIES, routine.routinePredictability)) {
        issues.push(issue(stepId, 'routine.routinePredictability', 'Escolha como seu ritmo varia ao longo dos dias.'));
      }
      break;
    case 'training-experience':
      if (!isOneOf(TRAINING_EXPERIENCES, training.trainingExperience)) {
        issues.push(issue(stepId, 'training.trainingExperience', 'Escolha uma experiência válida.'));
      }
      if (training.trainingExperience === 'none') {
        if (training.recentTrainingBreak !== null) {
          issues.push(
            issue(stepId, 'training.recentTrainingBreak', 'A pausa deve ser nula para quem nunca treinou.'),
          );
        }
      } else if (!isOneOf(RECENT_TRAINING_BREAKS, training.recentTrainingBreak)) {
        issues.push(issue(stepId, 'training.recentTrainingBreak', 'Escolha uma pausa válida.'));
      }
      if (!isOneOf(EXERCISE_CONFIDENCES, training.exerciseConfidence)) {
        issues.push(issue(stepId, 'training.exerciseConfidence', 'Escolha uma autonomia válida.'));
      }
      break;
    case 'training-frequency':
      if (!isOneOf(TRAINING_DAYS_PER_WEEK, training.trainingDaysPerWeek)) {
        issues.push(issue(stepId, 'training.trainingDaysPerWeek', 'Escolha de 2 a 6 dias.'));
      }
      if (
        !isUnique(training.availableWeekdays) ||
        training.availableWeekdays.some((value) => !isOneOf(WEEKDAYS, value)) ||
        training.trainingDaysPerWeek === undefined ||
        training.availableWeekdays.length < training.trainingDaysPerWeek
      ) {
        issues.push(
          issue(
            stepId,
            'training.availableWeekdays',
            'Escolha dias únicos em quantidade suficiente para a frequência.',
          ),
        );
      }
      if (!isOneOf(SESSION_DURATIONS, training.sessionDurationMin)) {
        issues.push(issue(stepId, 'training.sessionDurationMin', 'Escolha uma duração válida.'));
      }
      if (!isOneOf(PREFERRED_TRAINING_PERIODS, routine.preferredTrainingPeriod)) {
        issues.push(issue(stepId, 'routine.preferredTrainingPeriod', 'Escolha o período em que costuma treinar.'));
      }
      break;
    case 'training-location':
      if (!isOneOf(TRAINING_LOCATIONS, training.trainingLocation)) {
        issues.push(issue(stepId, 'training.trainingLocation', 'Escolha um local válido.'));
      } else if (
        training.trainingLocation === 'other' &&
        !validConditionalLabel(training.otherLocationLabel, 80)
      ) {
        issues.push(
          issue(stepId, 'training.otherLocationLabel', 'Descreva o local em até 80 caracteres.'),
        );
      } else if (training.trainingLocation !== 'other' && training.otherLocationLabel !== null) {
        issues.push(issue(stepId, 'training.otherLocationLabel', 'Remova o local alternativo oculto.'));
      }
      const hasOther = training.availableEquipment.includes('other');
      if (training.trainingLocation === 'full_gym') {
        if (training.availableEquipment.length !== 0 || training.otherEquipmentLabel !== null) {
          issues.push(issue(stepId, 'training.availableEquipment', 'Academia completa não deve enviar equipamentos individuais.'));
        }
        break;
      }
      if (
        training.availableEquipment.length < 1 ||
        !isUnique(training.availableEquipment) ||
        training.availableEquipment.some((value) => !isOneOf(EQUIPMENT, value))
      ) {
        issues.push(issue(stepId, 'training.availableEquipment', 'Escolha equipamentos sem repetição.'));
      }
      if (hasOther && !validConditionalLabel(training.otherEquipmentLabel, 80)) {
        issues.push(
          issue(stepId, 'training.otherEquipmentLabel', 'Descreva o equipamento em até 80 caracteres.'),
        );
      } else if (!hasOther && training.otherEquipmentLabel !== null) {
        issues.push(issue(stepId, 'training.otherEquipmentLabel', 'Remova o equipamento oculto.'));
      }
      break;
    case 'pain':
      if (typeof training.hasPainOrLimitation !== 'boolean') {
        issues.push(issue(stepId, 'training.hasPainOrLimitation', 'Responda sim ou não.'));
      }
      if (
        !isUnique(training.painAreas) ||
        training.painAreas.some((value) => !isOneOf(BODY_AREAS, value)) ||
        (training.hasPainOrLimitation === true && training.painAreas.length < 1) ||
        (training.hasPainOrLimitation === false && training.painAreas.length !== 0)
      ) {
        issues.push(issue(stepId, 'training.painAreas', 'Mantenha as áreas coerentes com a resposta de dor.'));
      }
      break;
    case 'meal-schedule-flexibility':
      if (!isOneOf(MEAL_SCHEDULE_FLEXIBILITIES, nutrition.mealScheduleFlexibility)) {
        issues.push(issue(stepId, 'nutrition.mealScheduleFlexibility', 'Escolha quanto espaço sua rotina oferece para organizar a alimentação.'));
      }
      if (!isOneOf(MEAL_BREAK_AVAILABILITIES, routine.mealBreakAvailability)) {
        issues.push(issue(stepId, 'routine.mealBreakAvailability', 'Escolha sua disponibilidade para pausas.'));
      }
      if (!isOneOf(FOOD_PREPARATION_STYLES, nutrition.preparationStyle)) {
        issues.push(issue(stepId, 'nutrition.preparationStyle', 'Escolha um preparo válido.'));
      }
      if (!isOneOf(FOOD_BUDGET_STYLES, nutrition.budgetStyle)) {
        issues.push(issue(stepId, 'nutrition.budgetStyle', 'Escolha um orçamento válido.'));
      }
      break;
    case 'dietary-pattern':
      if (!isOneOf(DIETARY_PATTERNS, nutrition.dietaryPattern)) {
        issues.push(issue(stepId, 'nutrition.dietaryPattern', 'Escolha um padrão alimentar válido.'));
      } else if (
        nutrition.dietaryPattern === 'other' &&
        !validConditionalLabel(nutrition.dietaryPatternOtherLabel, 80)
      ) {
        issues.push(
          issue(stepId, 'nutrition.dietaryPatternOtherLabel', 'Descreva o padrão em até 80 caracteres.'),
        );
      } else if (
        nutrition.dietaryPattern !== 'other' &&
        nutrition.dietaryPatternOtherLabel !== null
      ) {
        issues.push(issue(stepId, 'nutrition.dietaryPatternOtherLabel', 'Remova o padrão oculto.'));
      }
      break;
    case 'restrictions':
      if (typeof nutrition.hasDietaryRestrictions !== 'boolean') {
        issues.push(issue(stepId, 'nutrition.hasDietaryRestrictions', 'Responda sim ou não.'));
      } else if (
        nutrition.hasDietaryRestrictions !== (nutrition.restrictions.length > 0)
      ) {
        issues.push(issue(stepId, 'nutrition.restrictions', 'A resposta deve corresponder à lista de restrições.'));
      }
      nutrition.restrictions.forEach((restriction, index) => {
        if (!isOneOf(RESTRICTION_TYPES, restriction.restrictionType)) {
          issues.push(issue(stepId, `nutrition.restrictions.${index}.restrictionType`, 'Tipo inválido.'));
        }
        if (
          restriction.restrictionCode !== null &&
          !isOneOf(RESTRICTION_CODES, restriction.restrictionCode)
        ) {
          issues.push(issue(stepId, `nutrition.restrictions.${index}.restrictionCode`, 'Código inválido.'));
        }
      });
      issues.push(
        ...validateDeclaredLabels(
          nutrition.restrictions.map(({ declaredLabel }) => declaredLabel),
          stepId,
          'nutrition.restrictions',
        ),
      );
      break;
    case 'food-preferences':
      issues.push(
        ...validateDeclaredLabels(
          nutrition.dislikedFoods.map(({ declaredLabel }) => declaredLabel),
          stepId,
          'nutrition.dislikedFoods',
        ),
        ...validateDeclaredLabels(
          nutrition.preferredFoods.map(({ declaredLabel }) => declaredLabel),
          stepId,
          'nutrition.preferredFoods',
        ),
      );
      break;
    case 'supplements':
      if (typeof nutrition.usesSupplements !== 'boolean') {
        issues.push(issue(stepId, 'nutrition.usesSupplements', 'Responda sim ou não.'));
      } else if (nutrition.usesSupplements !== (nutrition.supplements.length > 0)) {
        issues.push(issue(stepId, 'nutrition.supplements', 'A resposta deve corresponder à lista de suplementos.'));
      }
      nutrition.supplements.forEach((supplement, index) => {
        if (
          supplement.supplementCode !== null &&
          !isOneOf(SUPPLEMENT_CODES, supplement.supplementCode)
        ) {
          issues.push(issue(stepId, `nutrition.supplements.${index}.supplementCode`, 'Código inválido.'));
        }
      });
      issues.push(
        ...validateDeclaredLabels(
          nutrition.supplements.map(({ declaredLabel }) => declaredLabel),
          stepId,
          'nutrition.supplements',
        ),
      );
      break;
    case 'review':
      break;
  }

  return issues.length === 0 ? { valid: true, issues: [] } : { valid: false, issues };
}

export function validateOnboardingV2(
  form: OnboardingV2FormState,
  options: OnboardingV2ValidationOptions = {},
): OnboardingV2ValidationResult {
  const issues = getVisibleOnboardingV2Steps(form).flatMap(({ id }) =>
    id === 'review' ? [] : validateOnboardingV2Step(id, form, options).issues,
  );

  return issues.length === 0 ? { valid: true, issues: [] } : { valid: false, issues };
}
