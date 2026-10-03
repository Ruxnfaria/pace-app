import type {
  V22ActivityCode, V22ActivityIntensity, V22AerobicFrequency, V22CurrentEatingRoutine,
  V22DurationRange, V22FoodPreparationAvailability, V22MealMoment, V22PrimaryGoal,
  V22TrainingLevel, V22TrainingLocation, V22Weekday,
} from './onboarding-v22-types.ts';

export const V22_GOAL_LABELS: Record<V22PrimaryGoal, string> = { hypertrophy: 'Ganhar massa muscular', fat_loss: 'Perder gordura', conditioning: 'Melhorar condicionamento' };
export const V22_LEVEL_LABELS: Record<V22TrainingLevel, string> = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' };
export const V22_LOCATION_LABELS: Record<V22TrainingLocation, string> = { full_gym: 'Academia completa', simple_gym: 'Academia simples / condomínio', home: 'Casa', outdoor: 'Ao ar livre', other: 'Outro local' };
export const V22_DURATION_LABELS: Record<V22DurationRange, string> = { under_30: 'Até 30 min', '30_45': '30–45 min', '45_60': '45–60 min', '60_90': '60–90 min', over_90: 'Mais de 90 min' };
export const V22_ACTIVITY_LABELS: Record<V22ActivityCode, string> = { running: 'Corrida', football: 'Futebol', cycling: 'Ciclismo', swimming: 'Natação', combat_sports: 'Luta', walking: 'Caminhada', other: 'Outra' };
export const V22_INTENSITY_LABELS: Record<V22ActivityIntensity, string> = { low: 'Leve', moderate: 'Moderada', high: 'Alta' };
export const V22_AEROBIC_LABELS: Record<V22AerobicFrequency, string> = { never: 'Nunca', sometimes: 'Às vezes', regularly: 'Regularmente' };
export const V22_EATING_LABELS: Record<V22CurrentEatingRoutine, string> = { structured: 'Tenho uma rotina bem definida', variable: 'Varia bastante', irregular: 'Tenho dificuldade em manter uma rotina' };
export const V22_MEAL_LABELS: Record<V22MealMoment, string> = { breakfast: 'Café da manhã', morning_snack: 'Lanche da manhã', lunch: 'Almoço', afternoon_snack: 'Lanche da tarde', dinner: 'Jantar', supper: 'Ceia' };
export const V22_PREPARATION_LABELS: Record<V22FoodPreparationAvailability, string> = { limited: 'Tenho pouco tempo', moderate: 'Consigo preparar algumas refeições', flexible: 'Tenho boa disponibilidade' };
export const V22_WEEKDAY_LABELS: Record<V22Weekday, string> = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' };

export function joinFriendlyLabels<T extends string | number>(values: readonly T[], labels: Record<T, string>) {
  return values.map((value) => labels[value]).join(', ');
}
