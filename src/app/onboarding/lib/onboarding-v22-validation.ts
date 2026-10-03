import {
  ACTIVITY_INTENSITIES, AEROBIC_PRACTICE_FREQUENCIES, CURRENT_EATING_ROUTINES,
  DURATION_RANGES, FOOD_PREPARATION_AVAILABILITIES, INITIAL_TRAINING_LEVELS,
  MEAL_MOMENTS, V22_ACTIVITY_CODES, V22_TRAINING_LOCATIONS,
} from './onboarding-v22-contract.ts';
import { BIOLOGICAL_SEXES, DIETARY_PATTERNS, EQUIPMENT, PRIMARY_GOALS, RESTRICTION_CODES, RESTRICTION_TYPES, SUPPLEMENT_CODES } from './onboarding-v2-types.ts';
import { getVisibleOnboardingV22Steps } from './onboarding-v22-steps.ts';
import type { OnboardingV22FormState, OnboardingV22StepId } from './onboarding-v22-types.ts';

export interface OnboardingV22ValidationIssue {
  stepId: OnboardingV22StepId;
  field: string;
  message: string;
}
export interface OnboardingV22ValidationResult { valid: boolean; issues: OnboardingV22ValidationIssue[] }
export interface OnboardingV22ValidationOptions { today?: string }

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const TRAINING_DAYS = [2, 3, 4, 5, 6] as const;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const isOneOf = <T>(values: readonly T[], value: unknown): value is T => values.includes(value as T);
const unique = (values: readonly unknown[]) => new Set(values).size === values.length;
const issue = (stepId: OnboardingV22StepId, field: string, message: string): OnboardingV22ValidationIssue => ({ stepId, field, message });
const validLabel = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && [...value.trim()].length <= max && !CONTROL.test(value);

function validateBirthDate(value: string | undefined, today: string): string | null {
  if (!value) return 'Informe sua data de nascimento.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Informe uma data válida.';
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value.startsWith('0000')) return 'Informe uma data válida.';
  const age = Number(today.slice(0, 4)) - Number(value.slice(0, 4)) - (today.slice(5) < value.slice(5) ? 1 : 0);
  if (value > today || age < 18) return 'É necessário ter pelo menos 18 anos.';
  return null;
}

function validateLabels(stepId: OnboardingV22StepId, field: string, labels: readonly string[]) {
  const issues: OnboardingV22ValidationIssue[] = [];
  labels.forEach((label, index) => {
    if (!validLabel(label, 160)) issues.push(issue(stepId, `${field}.${index}`, 'Use um texto entre 1 e 160 caracteres.'));
  });
  if (!unique(labels.map((label) => label.trim().toLocaleLowerCase('pt-BR')))) issues.push(issue(stepId, field, 'Remova itens duplicados.'));
  return issues;
}

export function validateOnboardingV22Step(
  stepId: OnboardingV22StepId,
  form: OnboardingV22FormState,
  options: OnboardingV22ValidationOptions = {},
): OnboardingV22ValidationResult {
  const issues: OnboardingV22ValidationIssue[] = [];
  const { health, training, nutrition } = form;
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  switch (stepId) {
    case 'welcome': break;
    case 'personal': {
      if (!validLabel(form.identity.name, 80)) issues.push(issue(stepId, 'identity.name', 'Informe seu nome em até 80 caracteres.'));
      const birthMessage = validateBirthDate(health.birthDate, today);
      if (birthMessage) issues.push(issue(stepId, 'health.birthDate', birthMessage));
      if (!isOneOf(BIOLOGICAL_SEXES, health.biologicalSex)) issues.push(issue(stepId, 'health.biologicalSex', 'Escolha uma opção válida.'));
      if (typeof health.heightCm !== 'number' || !Number.isFinite(health.heightCm) || health.heightCm <= 0 || health.heightCm > 300) issues.push(issue(stepId, 'health.heightCm', 'Informe uma altura entre 1 e 300 cm.'));
      if (typeof health.weightKg !== 'number' || !Number.isFinite(health.weightKg) || health.weightKg <= 0 || health.weightKg > 500) issues.push(issue(stepId, 'health.weightKg', 'Informe um peso entre 1 e 500 kg.'));
      break;
    }
    case 'goal': if (!isOneOf(PRIMARY_GOALS, health.primaryGoal)) issues.push(issue(stepId, 'health.primaryGoal', 'Escolha um objetivo.')); break;
    case 'experience': if (!isOneOf(INITIAL_TRAINING_LEVELS, training.initialTrainingLevel)) issues.push(issue(stepId, 'training.initialTrainingLevel', 'Escolha seu nível atual.')); break;
    case 'location': {
      if (!isOneOf(V22_TRAINING_LOCATIONS, training.trainingLocation)) issues.push(issue(stepId, 'training.trainingLocation', 'Escolha onde você treina.'));
      else if ((training.trainingLocation === 'other') !== (training.otherLocationLabel !== null && validLabel(training.otherLocationLabel, 80))) issues.push(issue(stepId, 'training.otherLocationLabel', 'Descreva o local em até 80 caracteres.'));
      const equipmentValid = unique(training.availableEquipment) && training.availableEquipment.every((value) => isOneOf(EQUIPMENT, value));
      if (!equipmentValid || (training.trainingLocation === 'full_gym' ? training.availableEquipment.length !== 0 : training.availableEquipment.length === 0)) issues.push(issue(stepId, 'training.availableEquipment', 'Selecione os equipamentos disponíveis.'));
      const hasOther = training.availableEquipment.includes('other');
      if (hasOther !== (training.otherEquipmentLabel !== null && validLabel(training.otherEquipmentLabel, 80))) issues.push(issue(stepId, 'training.otherEquipmentLabel', 'Descreva o outro equipamento.'));
      break;
    }
    case 'frequency': if (!isOneOf(TRAINING_DAYS, training.trainingDaysPerWeek)) issues.push(issue(stepId, 'training.trainingDaysPerWeek', 'Escolha de 2 a 6 dias.')); break;
    case 'preferred-days':
      if (!unique(training.preferredWeekdays) || training.preferredWeekdays.some((day) => !isOneOf(WEEKDAYS, day))) issues.push(issue(stepId, 'training.preferredWeekdays', 'Escolha dias válidos, sem repetição.'));
      break;
    case 'duration': if (!isOneOf(DURATION_RANGES, training.sessionDurationRange)) issues.push(issue(stepId, 'training.sessionDurationRange', 'Escolha uma duração.')); break;
    case 'activities': {
      if (!unique(training.activities.map(({ activityCode }) => activityCode))) issues.push(issue(stepId, 'training.activities', 'Cada atividade pode aparecer apenas uma vez.'));
      training.activities.forEach((activity, index) => {
        const prefix = `training.activities.${index}`;
        if (!isOneOf(V22_ACTIVITY_CODES, activity.activityCode)) issues.push(issue(stepId, `${prefix}.activityCode`, 'Atividade inválida.'));
        if ((activity.activityCode === 'other') !== (activity.otherActivityLabel !== null && validLabel(activity.otherActivityLabel, 80))) issues.push(issue(stepId, `${prefix}.otherActivityLabel`, 'Descreva a outra atividade.'));
        if (activity.weekdays !== null && (activity.weekdays.length === 0 || !unique(activity.weekdays) || activity.weekdays.some((day) => !isOneOf(WEEKDAYS, day)))) issues.push(issue(stepId, `${prefix}.weekdays`, 'Escolha dias válidos ou deixe sem preencher.'));
        if (activity.sessionsPerWeek !== null && (!Number.isInteger(activity.sessionsPerWeek) || activity.sessionsPerWeek < 1 || activity.sessionsPerWeek > 32767)) issues.push(issue(stepId, `${prefix}.sessionsPerWeek`, 'Informe uma frequência inteira maior que zero.'));
        if (activity.durationRange !== null && !isOneOf(DURATION_RANGES, activity.durationRange)) issues.push(issue(stepId, `${prefix}.durationRange`, 'Duração inválida.'));
        if (activity.intensity !== null && !isOneOf(ACTIVITY_INTENSITIES, activity.intensity)) issues.push(issue(stepId, `${prefix}.intensity`, 'Intensidade inválida.'));
      });
      break;
    }
    case 'cardio':
      if (!isOneOf(AEROBIC_PRACTICE_FREQUENCIES, training.aerobicPracticeFrequency)) issues.push(issue(stepId, 'training.aerobicPracticeFrequency', 'Escolha a frequência atual.'));
      if (typeof training.aerobicSafetyLimitation !== 'boolean') issues.push(issue(stepId, 'training.aerobicSafetyLimitation', 'Responda sim ou não.'));
      break;
    case 'eating-routine': if (!isOneOf(CURRENT_EATING_ROUTINES, nutrition.currentEatingRoutine)) issues.push(issue(stepId, 'nutrition.currentEatingRoutine', 'Escolha a opção mais próxima da sua rotina.')); break;
    case 'meal-moments': if (nutrition.availableMealMoments.length < 1 || !unique(nutrition.availableMealMoments) || nutrition.availableMealMoments.some((value) => !isOneOf(MEAL_MOMENTS, value))) issues.push(issue(stepId, 'nutrition.availableMealMoments', 'Escolha pelo menos um momento.')); break;
    case 'food-preparation': if (!isOneOf(FOOD_PREPARATION_AVAILABILITIES, nutrition.foodPreparationAvailability)) issues.push(issue(stepId, 'nutrition.foodPreparationAvailability', 'Escolha sua disponibilidade.')); break;
    case 'restrictions':
      if (!isOneOf(DIETARY_PATTERNS, nutrition.dietaryPattern)) issues.push(issue(stepId, 'nutrition.dietaryPattern', 'Escolha seu padrão alimentar.'));
      if ((nutrition.dietaryPattern === 'other') !== (nutrition.dietaryPatternOtherLabel !== null && validLabel(nutrition.dietaryPatternOtherLabel, 80))) issues.push(issue(stepId, 'nutrition.dietaryPatternOtherLabel', 'Descreva o padrão alimentar.'));
      nutrition.restrictions.forEach((item, index) => {
        if (!isOneOf(RESTRICTION_TYPES, item.restriction_type) || (item.restriction_code !== null && !isOneOf(RESTRICTION_CODES, item.restriction_code))) issues.push(issue(stepId, `nutrition.restrictions.${index}`, 'Restrição inválida.'));
      });
      issues.push(...validateLabels(stepId, 'nutrition.restrictions', nutrition.restrictions.map(({ declared_label }) => declared_label)));
      break;
    case 'disliked-foods': issues.push(...validateLabels(stepId, 'nutrition.dislikedFoods', nutrition.dislikedFoods)); break;
    case 'preferred-foods': issues.push(...validateLabels(stepId, 'nutrition.preferredFoods', nutrition.preferredFoods)); break;
    case 'supplements':
      nutrition.supplements.forEach((item, index) => { if (item.supplement_code !== null && !isOneOf(SUPPLEMENT_CODES, item.supplement_code)) issues.push(issue(stepId, `nutrition.supplements.${index}`, 'Suplemento inválido.')); });
      issues.push(...validateLabels(stepId, 'nutrition.supplements', nutrition.supplements.map(({ declared_label }) => declared_label)));
      break;
    case 'review': break;
  }
  return { valid: issues.length === 0, issues };
}

export function validateOnboardingV22(form: OnboardingV22FormState, options: OnboardingV22ValidationOptions = {}) {
  const issues = getVisibleOnboardingV22Steps(form).flatMap(({ id }) => id === 'review' ? [] : validateOnboardingV22Step(id, form, options).issues);
  return { valid: issues.length === 0, issues };
}
