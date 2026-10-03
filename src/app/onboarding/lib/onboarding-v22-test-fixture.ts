import type { OnboardingV22FormState } from './onboarding-v22-types.ts';

export function completeV22Form(): OnboardingV22FormState {
  return {
    identity: { name: 'Pessoa Teste' },
    health: { birthDate: '2000-01-01', biologicalSex: 'not_specified', heightCm: 175, weightKg: 70, primaryGoal: 'hypertrophy' },
    training: {
      initialTrainingLevel: 'intermediate', trainingDaysPerWeek: 4, preferredWeekdays: [1, 3],
      sessionDurationRange: '45_60', trainingLocation: 'simple_gym', otherLocationLabel: null,
      availableEquipment: ['bodyweight', 'dumbbells'], otherEquipmentLabel: null,
      activities: [
        { activityCode: 'walking', otherActivityLabel: null, weekdays: [2, 5], sessionsPerWeek: 2, durationRange: '30_45', intensity: 'low' },
        { activityCode: 'other', otherActivityLabel: 'Tênis', weekdays: null, sessionsPerWeek: null, durationRange: null, intensity: null },
      ],
      aerobicPracticeFrequency: 'sometimes', aerobicSafetyLimitation: false,
    },
    nutrition: {
      currentEatingRoutine: 'variable', availableMealMoments: ['breakfast', 'lunch', 'dinner'],
      foodPreparationAvailability: 'moderate', dietaryPattern: 'omnivore', dietaryPatternOtherLabel: null,
      restrictions: [{ restriction_type: 'intolerance', restriction_code: 'lactose', declared_label: 'Lactose' }],
      dislikedFoods: ['Quiabo'], preferredFoods: ['Arroz'],
      supplements: [{ supplement_code: 'creatine', declared_label: 'Creatina' }],
    },
  };
}
