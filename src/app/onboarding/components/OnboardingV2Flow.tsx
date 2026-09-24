'use client';

import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Clock3,
  Dumbbell,
  Home,
  MapPin,
  Pencil,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useOnboardingV2Draft } from '../hooks/useOnboardingV2Draft';
import {
  beginOnboardingSubmission,
  createSingleNavigation,
  finishOnboardingSubmission,
  getOnboardingSubmissionView,
  ONBOARDING_COMPLETION_DESTINATION,
  type OnboardingSubmissionPhase,
} from '../lib/onboarding-completion-navigation';
import {
  getPreviousOnboardingV2Step,
  getVisibleOnboardingV2Steps,
  ONBOARDING_V2_STEPS,
} from '../lib/onboarding-v2-steps';
import {
  createInitialOnboardingV2State,
  onboardingV2Reducer,
  type OnboardingV2Action,
} from '../lib/onboarding-v2-state';
import {
  BIOLOGICAL_SEXES,
  BODY_AREAS,
  EQUIPMENT,
  EXERCISE_CONFIDENCES,
  PRIMARY_GOALS,
  RECENT_TRAINING_BREAKS,
  SESSION_DURATIONS,
  TRAINING_DAYS_PER_WEEK,
  TRAINING_EXPERIENCES,
  TRAINING_LOCATIONS,
  type BodyArea,
  type DietaryPattern,
  type Equipment,
  type FoodBudgetStyle,
  type FoodPreparationStyle,
  type MealScheduleFlexibility,
  type OnboardingV2FormState,
  type OnboardingV2RestrictionForm,
  type OnboardingV2StepId,
  type PrimaryGoal,
  type RestrictionCode,
  type SupplementCode,
  type Weekday,
} from '../lib/onboarding-v2-types';
import {
  validateOnboardingV2,
  validateOnboardingV2Step,
  type OnboardingV2ValidationIssue,
} from '../lib/onboarding-v2-validation';
import { ChoiceCards, type ChoiceCardOption } from './ChoiceCards';
import { TagListInput } from './TagListInput';
import { WeekdayPicker } from './WeekdayPicker';

interface OnboardingV2FlowProps {
  draftScope: string;
  onSubmit: (form: OnboardingV2FormState) => Promise<OnboardingV2SubmitResult>;
  onCompleted: () => void;
}

export type OnboardingV2SubmitResult =
  | { ok: true; completion: 'completed' | 'replay' }
  | { ok: false; message: string };

const GOAL_OPTIONS = [
  { value: 'fat_loss', title: 'Emagrecimento', description: 'Perder gordura e melhorar a composição corporal.', icon: <Zap className="size-5" /> },
  { value: 'hypertrophy', title: 'Hipertrofia', description: 'Ganhar massa muscular.', icon: <Dumbbell className="size-5" /> },
  { value: 'conditioning', title: 'Condicionamento', description: 'Melhorar resistência, fôlego e desempenho físico.', icon: <Activity className="size-5" /> },
] satisfies readonly ChoiceCardOption<PrimaryGoal>[];

const EXPERIENCE_OPTIONS = [
  { value: 'none', title: 'Nunca treinei', description: 'Vou começar do zero.' },
  { value: 'under_6_months', title: 'Menos de 6 meses', description: 'Ainda estou criando consistência.' },
  { value: '6_to_12_months', title: 'De 6 a 12 meses', description: 'Já conheço bem o básico.' },
  { value: '1_to_2_years', title: 'De 1 a 2 anos', description: 'Treino com boa regularidade.' },
  { value: 'over_2_years', title: 'Mais de 2 anos', description: 'Tenho bastante experiência.' },
] satisfies readonly ChoiceCardOption<(typeof TRAINING_EXPERIENCES)[number]>[];

const BREAK_OPTIONS = [
  { value: 'no_significant_break', title: 'Não tive pausa', description: 'Tenho treinado com regularidade.' },
  { value: 'under_1_month', title: 'Menos de 1 mês' },
  { value: '1_to_3_months', title: 'De 1 a 3 meses' },
  { value: 'over_3_months', title: 'Mais de 3 meses' },
] satisfies readonly ChoiceCardOption<(typeof RECENT_TRAINING_BREAKS)[number]>[];

const CONFIDENCE_OPTIONS = [
  { value: 'needs_guidance', title: 'Preciso de orientação', description: 'Quero instruções claras em cada exercício.' },
  { value: 'basic_independent', title: 'Faço o básico sozinho', description: 'Conheço os principais movimentos.' },
  { value: 'confident_independent', title: 'Treino com confiança', description: 'Tenho autonomia para ajustar meu treino.' },
] satisfies readonly ChoiceCardOption<(typeof EXERCISE_CONFIDENCES)[number]>[];

const EQUIPMENT_LABELS: Record<Equipment, string> = {
  bodyweight: 'Peso do corpo', dumbbells: 'Halteres', barbell: 'Barra', weight_plates: 'Anilhas', bench: 'Banco',
  rack: 'Rack', cable_machine: 'Polia / cabos', selectorized_machines: 'Máquinas', smith_machine: 'Smith',
  leg_press: 'Leg press', resistance_bands: 'Elásticos', pull_up_bar: 'Barra fixa', kettlebell: 'Kettlebell', other: 'Outro',
};

const BODY_AREA_LABELS: Record<BodyArea, string> = {
  neck: 'Pescoço', shoulder: 'Ombro', elbow: 'Cotovelo', wrist_hand: 'Punho ou mão', upper_back: 'Parte alta das costas',
  lower_back: 'Lombar', hip: 'Quadril', knee: 'Joelho', ankle_foot: 'Tornozelo ou pé', other: 'Outra região', unspecified: 'Não sei dizer',
};

const GOAL_LABELS = Object.fromEntries(GOAL_OPTIONS.map(({ value, title }) => [value, title])) as Record<PrimaryGoal, string>;
const WEEKDAY_LABELS: Record<Weekday, string> = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' };
const MEAL_SCHEDULE_OPTIONS = [
  { value: 'limited', title: 'Pouco tempo', description: 'Preciso de uma organização bem prática para o dia a dia.' },
  { value: 'moderate', title: 'Rotina normal', description: 'Consigo reservar alguns momentos para me alimentar.' },
  { value: 'flexible', title: 'Bem flexível', description: 'Tenho liberdade para organizar os horários ao longo do dia.' },
] satisfies readonly ChoiceCardOption<MealScheduleFlexibility>[];
const MEAL_SCHEDULE_LABELS = Object.fromEntries(MEAL_SCHEDULE_OPTIONS.map(({ value, title }) => [value, title])) as Record<MealScheduleFlexibility, string>;
const PREPARATION_OPTIONS = [
  { value: 'very_quick', title: 'O mais prático possível', description: 'Refeições rápidas e montagem simples.' },
  { value: 'cook_some', title: 'Cozinho um pouco', description: 'Equilíbrio entre praticidade e preparo.' },
  { value: 'meal_prep', title: 'Preparo com antecedência', description: 'Organizo refeições para vários dias.' },
  { value: 'flexible', title: 'Sou flexível', description: 'Posso variar o tempo e o tipo de preparo.' },
] satisfies readonly ChoiceCardOption<FoodPreparationStyle>[];
const PREPARATION_LABELS = Object.fromEntries(PREPARATION_OPTIONS.map(({ value, title }) => [value, title])) as Record<FoodPreparationStyle, string>;
const BUDGET_OPTIONS = [
  { value: 'economic', title: 'Econômico', description: 'Priorizar escolhas que rendem mais.' },
  { value: 'balanced', title: 'Equilibrado', description: 'Combinar custo, praticidade e variedade.' },
  { value: 'varied', title: 'Mais flexível', description: 'Ter mais liberdade para variar os alimentos.' },
] satisfies readonly ChoiceCardOption<FoodBudgetStyle>[];
const BUDGET_LABELS = Object.fromEntries(BUDGET_OPTIONS.map(({ value, title }) => [value, title])) as Record<FoodBudgetStyle, string>;
const DIETARY_OPTIONS = [
  { value: 'omnivore', title: 'Onívoro', description: 'Incluo alimentos de origem animal e vegetal.' },
  { value: 'vegetarian', title: 'Vegetariano', description: 'Não consumo carnes ou peixes.' },
  { value: 'vegan', title: 'Vegano', description: 'Não consumo produtos de origem animal.' },
  { value: 'pescatarian', title: 'Pescetariano', description: 'Incluo peixes, mas não outras carnes.' },
  { value: 'other', title: 'Outro padrão', description: 'Quero descrever de outro jeito.' },
] satisfies readonly ChoiceCardOption<DietaryPattern>[];
const DIETARY_LABELS = Object.fromEntries(DIETARY_OPTIONS.map(({ value, title }) => [value, title])) as Record<DietaryPattern, string>;

const RESTRICTION_OPTIONS: readonly (OnboardingV2RestrictionForm & { restrictionCode: RestrictionCode; title: string })[] = [
  { restrictionCode: 'lactose', restrictionType: 'intolerance', declaredLabel: 'Lactose', title: 'Lactose' },
  { restrictionCode: 'gluten', restrictionType: 'intolerance', declaredLabel: 'Glúten', title: 'Glúten' },
  { restrictionCode: 'milk', restrictionType: 'allergy', declaredLabel: 'Leite', title: 'Leite' },
  { restrictionCode: 'egg', restrictionType: 'allergy', declaredLabel: 'Ovo', title: 'Ovo' },
  { restrictionCode: 'peanut', restrictionType: 'allergy', declaredLabel: 'Amendoim', title: 'Amendoim' },
  { restrictionCode: 'tree_nuts', restrictionType: 'allergy', declaredLabel: 'Castanhas', title: 'Castanhas' },
  { restrictionCode: 'soy', restrictionType: 'allergy', declaredLabel: 'Soja', title: 'Soja' },
  { restrictionCode: 'fish', restrictionType: 'allergy', declaredLabel: 'Peixe', title: 'Peixe' },
  { restrictionCode: 'shellfish', restrictionType: 'allergy', declaredLabel: 'Frutos do mar', title: 'Frutos do mar' },
];
const RESTRICTION_CODE_LABELS = Object.fromEntries(RESTRICTION_OPTIONS.map(({ restrictionCode, title }) => [restrictionCode, title])) as Record<RestrictionCode, string>;
const SUPPLEMENT_OPTIONS = [
  { value: 'whey_protein', title: 'Whey protein' },
  { value: 'creatine', title: 'Creatina' },
  { value: 'mass_gainer', title: 'Hipercalórico' },
  { value: 'protein_powder_other', title: 'Outra proteína em pó' },
  { value: 'multivitamin', title: 'Multivitamínico' },
] satisfies readonly ChoiceCardOption<SupplementCode>[];
const SUPPLEMENT_LABELS = Object.fromEntries(SUPPLEMENT_OPTIONS.map(({ value, title }) => [value, title])) as Record<SupplementCode, string>;

const STEP_COPY: Record<OnboardingV2StepId, { eyebrow: string; title: string; subtitle?: string }> = {
  goal: { eyebrow: 'Você', title: 'O que você quer conquistar primeiro?', subtitle: 'Seu objetivo guia as recomendações do PACE.' },
  'birth-date': { eyebrow: 'Você', title: 'Quando você nasceu?', subtitle: 'Isso ajuda a personalizar seu plano com segurança.' },
  'biological-sex': { eyebrow: 'Você', title: 'Qual opção descreve seu sexo biológico?', subtitle: 'Usamos essa informação apenas para personalizar seus cálculos.' },
  measurements: { eyebrow: 'Você', title: 'Quais são suas medidas?', subtitle: 'O peso-alvo é opcional e pode ser alterado depois.' },
  'training-experience': { eyebrow: 'Treino', title: 'Há quanto tempo você treina?', subtitle: 'Não existe resposta certa — o plano se adapta a você.' },
  'training-break': { eyebrow: 'Treino', title: 'Você ficou quanto tempo sem treinar?', subtitle: 'Vamos ajustar o ritmo da sua volta.' },
  'exercise-confidence': { eyebrow: 'Treino', title: 'Como você se sente treinando por conta própria?' },
  'training-frequency': { eyebrow: 'Treino', title: 'Quantos dias por semana você quer treinar?', subtitle: 'Escolha uma frequência realista para sua rotina.' },
  'training-weekdays': { eyebrow: 'Treino', title: 'Em quais dias você consegue treinar?', subtitle: 'Escolha a quantidade definida na etapa anterior.' },
  'session-duration': { eyebrow: 'Treino', title: 'Quanto tempo cabe na sua rotina?' },
  'training-location': { eyebrow: 'Treino', title: 'Onde você costuma treinar?' },
  equipment: { eyebrow: 'Treino', title: 'O que você tem disponível?', subtitle: 'Selecione pelo menos uma opção.' },
  pain: { eyebrow: 'Treino', title: 'Sente dor ou tem alguma limitação?', subtitle: 'Isso não substitui avaliação profissional; serve para adaptar o plano.' },
  'pain-areas': { eyebrow: 'Treino', title: 'Quais regiões precisam de atenção?', subtitle: 'Selecione todas que se aplicam.' },
  'meal-schedule-flexibility': { eyebrow: 'Nutrição', title: 'Quanto espaço sua rotina oferece para organizar a alimentação?', subtitle: 'Isso ajuda o PACE a montar uma estrutura alimentar que caiba no seu dia.' },
  'preparation-style': { eyebrow: 'Nutrição', title: 'Como você prefere preparar sua comida?' },
  'budget-style': { eyebrow: 'Nutrição', title: 'Como quer equilibrar custo e variedade?' },
  'dietary-pattern': { eyebrow: 'Nutrição', title: 'Qual padrão combina com você?' },
  restrictions: { eyebrow: 'Nutrição', title: 'Você tem alguma restrição?' },
  'food-preferences': { eyebrow: 'Nutrição', title: 'Quais são suas preferências?' },
  supplements: { eyebrow: 'Nutrição', title: 'Você usa algum suplemento?' },
  review: { eyebrow: 'Revisão', title: 'Tudo certo?' },
};

function toggleItem<T>(items: readonly T[], item: T): T[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

function numberOrUndefined(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function FieldError({ issues, fieldPrefix, id = 'step-error' }: { issues: readonly OnboardingV2ValidationIssue[]; fieldPrefix?: string; id?: string }) {
  const issue = fieldPrefix ? issues.find(({ field }) => field.startsWith(fieldPrefix)) : issues[0];
  if (!issue) return null;
  return <p id={id} role="alert" tabIndex={-1} className="mt-3 text-sm font-semibold text-rose-300 outline-none">{issue.message}</p>;
}

function TextInput({ id, label, value, onChange, placeholder, maxLength = 80, error }: {
  id: string; label: string; value: string; onChange: (value: string) => void; placeholder: string; maxLength?: number; error?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-bold text-zinc-200">{label}</label>
      <input id={id} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}
        aria-invalid={error || undefined} aria-describedby={error ? 'step-error' : undefined}
        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" />
    </div>
  );
}

function StepContent({ stepId, form, dispatch, issues }: {
  stepId: OnboardingV2StepId;
  form: OnboardingV2FormState;
  dispatch: React.Dispatch<OnboardingV2Action>;
  issues: readonly OnboardingV2ValidationIssue[];
}) {
  const { health, training, nutrition } = form;
  const hasError = issues.length > 0;

  switch (stepId) {
    case 'goal':
      return <><ChoiceCards columns={1} options={GOAL_OPTIONS} value={health.primaryGoal} onChange={(primaryGoal) => dispatch({ type: 'update-health', changes: { primaryGoal } })} ariaLabel="Objetivo principal" /><FieldError issues={issues} /></>;
    case 'birth-date':
      return <div className="max-w-sm space-y-2"><label htmlFor="birth-date" className="text-sm font-bold text-zinc-200">Data de nascimento</label><input id="birth-date" type="date" value={health.birthDate ?? ''} onChange={(event) => dispatch({ type: 'update-health', changes: { birthDate: event.target.value || undefined } })} aria-invalid={hasError || undefined} aria-describedby={hasError ? 'step-error' : 'birth-help'} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-base text-white [color-scheme:dark] outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" /><p id="birth-help" className="text-xs text-zinc-500">O PACE está disponível para maiores de 18 anos.</p><FieldError issues={issues} /></div>;
    case 'biological-sex': {
      const options = [
        { value: 'male', title: 'Masculino' }, { value: 'female', title: 'Feminino' }, { value: 'not_specified', title: 'Prefiro não informar' },
      ] satisfies readonly ChoiceCardOption<(typeof BIOLOGICAL_SEXES)[number]>[];
      return <><ChoiceCards columns={1} options={options} value={health.biologicalSex} onChange={(biologicalSex) => dispatch({ type: 'update-health', changes: { biologicalSex } })} ariaLabel="Sexo biológico" /><FieldError issues={issues} /></>;
    }
    case 'measurements':
      return <div className="grid gap-4 sm:grid-cols-2">{[
        { id: 'height', label: 'Altura', unit: 'cm', value: health.heightCm, placeholder: '175', field: 'heightCm' },
        { id: 'weight', label: 'Peso atual', unit: 'kg', value: health.weightKg, placeholder: '75', field: 'weightKg' },
        { id: 'target-weight', label: 'Peso-alvo (opcional)', unit: 'kg', value: health.targetWeightKg ?? undefined, placeholder: '70', field: 'targetWeightKg' },
      ].map((item) => {
        const fieldIssueIndex = issues.findIndex(({ field }) => field.endsWith(item.field));
        const hasFieldError = fieldIssueIndex >= 0;
        const errorId = fieldIssueIndex === 0 ? 'step-error' : `step-error-${item.id}`;
        return <div key={item.id} className={item.id === 'target-weight' ? 'sm:col-span-2' : ''}><label htmlFor={item.id} className="mb-2 block text-sm font-bold text-zinc-200">{item.label}</label><div className="relative"><input id={item.id} type="number" inputMode="decimal" min="0" step="0.1" value={item.value ?? ''} placeholder={item.placeholder} onChange={(event) => dispatch({ type: 'update-health', changes: { [item.field]: numberOrUndefined(event.target.value) } })} aria-invalid={hasFieldError || undefined} aria-describedby={hasFieldError ? errorId : undefined} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 pr-14 text-lg font-bold text-white outline-none placeholder:text-zinc-700 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-500">{item.unit}</span></div><FieldError id={errorId} issues={issues} fieldPrefix={`health.${item.field}`} /></div>;
      })}</div>;
    case 'training-experience':
      return <><ChoiceCards columns={1} options={EXPERIENCE_OPTIONS} value={training.trainingExperience} onChange={(trainingExperience) => dispatch({ type: 'update-training', changes: { trainingExperience } })} ariaLabel="Experiência de treino" /><FieldError issues={issues} /></>;
    case 'training-break':
      return <><ChoiceCards columns={1} options={BREAK_OPTIONS} value={training.recentTrainingBreak ?? undefined} onChange={(recentTrainingBreak) => dispatch({ type: 'update-training', changes: { recentTrainingBreak } })} ariaLabel="Pausa recente" /><FieldError issues={issues} /></>;
    case 'exercise-confidence':
      return <><ChoiceCards columns={1} options={CONFIDENCE_OPTIONS} value={training.exerciseConfidence} onChange={(exerciseConfidence) => dispatch({ type: 'update-training', changes: { exerciseConfidence } })} ariaLabel="Autonomia no treino" /><FieldError issues={issues} /></>;
    case 'training-frequency': {
      const options = TRAINING_DAYS_PER_WEEK.map((value) => ({ value, title: `${value} dias`, description: value <= 3 ? 'Uma rotina enxuta e consistente.' : value <= 5 ? 'Mais estímulos durante a semana.' : 'Alta frequência semanal.' }));
      return <><ChoiceCards options={options} value={training.trainingDaysPerWeek} onChange={(trainingDaysPerWeek) => dispatch({ type: 'update-training', changes: { trainingDaysPerWeek, availableWeekdays: training.availableWeekdays.slice(0, trainingDaysPerWeek) } })} ariaLabel="Frequência semanal" /><FieldError issues={issues} /></>;
    }
    case 'training-weekdays':
      return <><div className="mb-4 flex items-center justify-between text-sm"><span className="text-zinc-400">Dias selecionados</span><span className="font-black text-violet-300">{training.availableWeekdays.length}/{training.trainingDaysPerWeek ?? 0}</span></div><WeekdayPicker value={training.availableWeekdays} max={training.trainingDaysPerWeek} onChange={(availableWeekdays) => dispatch({ type: 'update-training', changes: { availableWeekdays } })} /><FieldError issues={issues} /></>;
    case 'session-duration': {
      const options = SESSION_DURATIONS.map((value) => ({ value, title: value === 90 ? '90+ min' : `${value} min`, icon: <Clock3 className="size-5" /> }));
      return <><ChoiceCards options={options} value={training.sessionDurationMin} onChange={(sessionDurationMin) => dispatch({ type: 'update-training', changes: { sessionDurationMin } })} ariaLabel="Duração do treino" /><FieldError issues={issues} /></>;
    }
    case 'training-location': {
      const options = [
        { value: 'full_gym', title: 'Academia completa', description: 'Máquinas, pesos livres e cabos.', icon: <Dumbbell className="size-5" /> },
        { value: 'home', title: 'Em casa', description: 'Com o que estiver disponível.', icon: <Home className="size-5" /> },
        { value: 'outdoor', title: 'Ao ar livre', description: 'Parque, praça ou rua.', icon: <MapPin className="size-5" /> },
        { value: 'other', title: 'Outro local', icon: <Sparkles className="size-5" /> },
      ] satisfies readonly ChoiceCardOption<(typeof TRAINING_LOCATIONS)[number]>[];
      return <div className="space-y-4"><ChoiceCards options={options} value={training.trainingLocation} onChange={(trainingLocation) => dispatch({ type: 'update-training', changes: { trainingLocation } })} ariaLabel="Local de treino" />{training.trainingLocation === 'other' ? <TextInput id="other-location" label="Qual local?" value={training.otherLocationLabel ?? ''} onChange={(otherLocationLabel) => dispatch({ type: 'update-training', changes: { otherLocationLabel } })} placeholder="Ex.: academia do condomínio" error={hasError} /> : null}<FieldError issues={issues} /></div>;
    }
    case 'equipment': {
      const options = EQUIPMENT.map((value) => ({ value, title: EQUIPMENT_LABELS[value] }));
      return <div className="space-y-4"><ChoiceCards columns={3} multiple options={options} value={training.availableEquipment} onChange={(equipment) => dispatch({ type: 'update-training', changes: { availableEquipment: toggleItem(training.availableEquipment, equipment) } })} ariaLabel="Equipamentos disponíveis" />{training.availableEquipment.includes('other') ? <TextInput id="other-equipment" label="Qual equipamento?" value={training.otherEquipmentLabel ?? ''} onChange={(otherEquipmentLabel) => dispatch({ type: 'update-training', changes: { otherEquipmentLabel } })} placeholder="Descreva o equipamento" error={hasError} /> : null}<FieldError issues={issues} /></div>;
    }
    case 'pain': {
      const options = [{ value: 'no', title: 'Não', description: 'Posso treinar sem limitações conhecidas.' }, { value: 'yes', title: 'Sim', description: 'Há uma região que precisa de atenção.' }];
      const value = training.hasPainOrLimitation === undefined ? undefined : training.hasPainOrLimitation ? 'yes' : 'no';
      return <><ChoiceCards columns={1} options={options} value={value} onChange={(answer) => dispatch({ type: 'update-training', changes: { hasPainOrLimitation: answer === 'yes' } })} ariaLabel="Dor ou limitação" /><FieldError issues={issues} /></>;
    }
    case 'pain-areas': {
      const options = BODY_AREAS.map((value) => ({ value, title: BODY_AREA_LABELS[value] }));
      return <><ChoiceCards columns={2} multiple options={options} value={training.painAreas} onChange={(area) => dispatch({ type: 'update-training', changes: { painAreas: toggleItem(training.painAreas, area) } })} ariaLabel="Regiões com dor ou limitação" /><FieldError issues={issues} /></>;
    }
    case 'meal-schedule-flexibility':
      return <><ChoiceCards columns={1} options={MEAL_SCHEDULE_OPTIONS} value={nutrition.mealScheduleFlexibility} onChange={(mealScheduleFlexibility) => dispatch({ type: 'update-nutrition', changes: { mealScheduleFlexibility } })} ariaLabel="Flexibilidade da rotina para organizar a alimentação" /><FieldError issues={issues} /></>;
    case 'preparation-style':
      return <><ChoiceCards columns={1} options={PREPARATION_OPTIONS} value={nutrition.preparationStyle} onChange={(preparationStyle) => dispatch({ type: 'update-nutrition', changes: { preparationStyle } })} ariaLabel="Estilo de preparo" /><FieldError issues={issues} /></>;
    case 'budget-style':
      return <><ChoiceCards columns={1} options={BUDGET_OPTIONS} value={nutrition.budgetStyle} onChange={(budgetStyle) => dispatch({ type: 'update-nutrition', changes: { budgetStyle } })} ariaLabel="Estilo de orçamento" /><FieldError issues={issues} /></>;
    case 'dietary-pattern':
      return <div className="space-y-4"><ChoiceCards options={DIETARY_OPTIONS} value={nutrition.dietaryPattern} onChange={(dietaryPattern) => dispatch({ type: 'update-nutrition', changes: { dietaryPattern } })} ariaLabel="Padrão alimentar" />{nutrition.dietaryPattern === 'other' ? <TextInput id="other-dietary-pattern" label="Como você descreve seu padrão?" value={nutrition.dietaryPatternOtherLabel ?? ''} onChange={(dietaryPatternOtherLabel) => dispatch({ type: 'update-nutrition', changes: { dietaryPatternOtherLabel } })} placeholder="Ex.: alimentação sem carne vermelha" error={hasError} /> : null}<FieldError issues={issues} /></div>;
    case 'restrictions': {
      const answer = nutrition.hasDietaryRestrictions === undefined ? undefined : nutrition.hasDietaryRestrictions ? 'yes' : 'no';
      const selectedCodes = nutrition.restrictions.flatMap(({ restrictionCode }) => restrictionCode ? [restrictionCode] : []);
      const customRestrictions = nutrition.restrictions.map((item, index) => ({ item, index })).filter(({ item }) => item.restrictionCode === null);
      return <div className="space-y-6"><ChoiceCards options={[{ value: 'no', title: 'Não tenho', description: 'Nenhuma restrição alimentar declarada.' }, { value: 'yes', title: 'Sim', description: 'Vou indicar o que precisa ser evitado.' }]} value={answer} onChange={(value) => dispatch({ type: 'update-nutrition', changes: { hasDietaryRestrictions: value === 'yes' } })} ariaLabel="Possui restrições alimentares" />{nutrition.hasDietaryRestrictions ? <div className="space-y-6 border-t border-white/8 pt-6"><div><p className="mb-3 text-sm font-black text-white">Selecione as opções que se aplicam</p><ChoiceCards columns={3} multiple options={RESTRICTION_OPTIONS.map(({ restrictionCode, title }) => ({ value: restrictionCode, title }))} value={selectedCodes} onChange={(restrictionCode) => { const existing = nutrition.restrictions.findIndex((item) => item.restrictionCode === restrictionCode); if (existing >= 0) dispatch({ type: 'remove-restriction', index: existing }); else { const option = RESTRICTION_OPTIONS.find((item) => item.restrictionCode === restrictionCode); if (option) dispatch({ type: 'add-restriction', item: { restrictionType: option.restrictionType, restrictionCode, declaredLabel: option.declaredLabel } }); } }} ariaLabel="Restrições alimentares estruturadas" /></div><TagListInput label="Outra restrição" hint="Se não estiver na lista, descreva sem tentar escolher um código." placeholder="Ex.: restrição por orientação pessoal" values={customRestrictions.map(({ item }) => item.declaredLabel)} onAdd={(declaredLabel) => dispatch({ type: 'add-restriction', item: { restrictionType: 'other', restrictionCode: null, declaredLabel } })} onRemove={(customIndex) => dispatch({ type: 'remove-restriction', index: customRestrictions[customIndex].index })} /></div> : null}<FieldError issues={issues} /></div>;
    }
    case 'food-preferences':
      return <div className="space-y-7"><TagListInput label="Alimentos que você não gosta (opcional)" hint="Vamos considerar isso na personalização, sem transformar preferências em restrições." placeholder="Ex.: berinjela" values={nutrition.dislikedFoods.map(({ declaredLabel }) => declaredLabel)} onAdd={(declaredLabel) => dispatch({ type: 'add-disliked-food', item: { declaredLabel } })} onRemove={(index) => dispatch({ type: 'remove-disliked-food', index })} /><div className="border-t border-white/8 pt-7"><TagListInput label="Alimentos que você prefere (opcional)" hint="Isso ajuda a personalizar o plano, mas não garante presença em todas as refeições." placeholder="Ex.: arroz" values={nutrition.preferredFoods.map(({ declaredLabel }) => declaredLabel)} onAdd={(declaredLabel) => dispatch({ type: 'add-preferred-food', item: { declaredLabel } })} onRemove={(index) => dispatch({ type: 'remove-preferred-food', index })} /></div><FieldError issues={issues} /></div>;
    case 'supplements': {
      const answer = nutrition.usesSupplements === undefined ? undefined : nutrition.usesSupplements ? 'yes' : 'no';
      const selectedCodes = nutrition.supplements.flatMap(({ supplementCode }) => supplementCode ? [supplementCode] : []);
      const customSupplements = nutrition.supplements.map((item, index) => ({ item, index })).filter(({ item }) => item.supplementCode === null);
      return <div className="space-y-6"><ChoiceCards options={[{ value: 'no', title: 'Não uso', description: 'Nenhum suplemento declarado.' }, { value: 'yes', title: 'Sim', description: 'Vou informar o que já uso hoje.' }]} value={answer} onChange={(value) => dispatch({ type: 'update-nutrition', changes: { usesSupplements: value === 'yes' } })} ariaLabel="Usa suplementos" />{nutrition.usesSupplements ? <div className="space-y-6 border-t border-white/8 pt-6"><div><p className="mb-3 text-sm font-black text-white">Quais você já usa?</p><ChoiceCards multiple options={SUPPLEMENT_OPTIONS} value={selectedCodes} onChange={(supplementCode) => { const existing = nutrition.supplements.findIndex((item) => item.supplementCode === supplementCode); if (existing >= 0) dispatch({ type: 'remove-supplement', index: existing }); else dispatch({ type: 'add-supplement', item: { supplementCode, declaredLabel: SUPPLEMENT_LABELS[supplementCode] } }); }} ariaLabel="Suplementos estruturados" /></div><TagListInput label="Outro suplemento" hint="Apenas registre o que você já utiliza; o PACE não recomenda iniciar suplementos aqui." placeholder="Ex.: suplemento já utilizado" values={customSupplements.map(({ item }) => item.declaredLabel)} onAdd={(declaredLabel) => dispatch({ type: 'add-supplement', item: { supplementCode: null, declaredLabel } })} onRemove={(customIndex) => dispatch({ type: 'remove-supplement', index: customSupplements[customIndex].index })} /></div> : null}<FieldError issues={issues} /></div>;
    }
    default:
      return null;
  }
}

function joinOrNone(values: readonly string[], empty = 'Nenhum informado'): string {
  return values.length > 0 ? values.join(', ') : empty;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 border-b border-white/6 py-3 last:border-0 sm:grid-cols-[10rem_1fr]"><dt className="text-xs font-bold uppercase tracking-wide text-zinc-500">{label}</dt><dd className="text-sm leading-6 text-zinc-200">{value}</dd></div>;
}

function ReviewCard({ title, editLabel, onEdit, children, editingDisabled }: { title: string; editLabel: string; onEdit: () => void; children: React.ReactNode; editingDisabled: boolean }) {
  return <section className="rounded-3xl border border-white/8 bg-white/[0.03] p-4 sm:p-5"><div className="mb-2 flex items-center justify-between gap-3"><h2 className="text-lg font-black text-white">{title}</h2><button type="button" onClick={onEdit} disabled={editingDisabled} aria-disabled={editingDisabled} aria-label={editLabel} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-black text-violet-300 transition hover:bg-violet-500/10 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-40"><Pencil aria-hidden="true" className="size-4" />Editar</button></div><dl>{children}</dl></section>;
}

function ReviewContent({ form, onEdit, editingDisabled = false }: { form: OnboardingV2FormState; onEdit: (stepId: OnboardingV2StepId) => void; editingDisabled?: boolean }) {
  const { health, training, nutrition } = form;
  const sexLabels = { male: 'Masculino', female: 'Feminino', not_specified: 'Prefiro não informar' } as const;
  const experienceLabels = Object.fromEntries(EXPERIENCE_OPTIONS.map(({ value, title }) => [value, title])) as Record<NonNullable<typeof training.trainingExperience>, string>;
  const confidenceLabels = Object.fromEntries(CONFIDENCE_OPTIONS.map(({ value, title }) => [value, title])) as Record<NonNullable<typeof training.exerciseConfidence>, string>;
  const locationLabels = { full_gym: 'Academia completa', home: 'Em casa', outdoor: 'Ao ar livre', other: training.otherLocationLabel || 'Outro local' } as const;
  const restrictionLabels = nutrition.restrictions.map((item) => item.restrictionCode ? RESTRICTION_CODE_LABELS[item.restrictionCode] : item.declaredLabel);
  const supplementLabels = nutrition.supplements.map((item) => item.supplementCode ? SUPPLEMENT_LABELS[item.supplementCode] : item.declaredLabel);

  return <div className="space-y-4">
    <ReviewCard title="Você" editLabel="Editar seus dados pessoais" onEdit={() => onEdit('goal')} editingDisabled={editingDisabled}>
      <ReviewRow label="Objetivo" value={health.primaryGoal && PRIMARY_GOALS.includes(health.primaryGoal as PrimaryGoal) ? GOAL_LABELS[health.primaryGoal as PrimaryGoal] : 'Não informado'} />
      <ReviewRow label="Nascimento" value={health.birthDate ?? 'Não informado'} />
      <ReviewRow label="Sexo biológico" value={health.biologicalSex ? sexLabels[health.biologicalSex] : 'Não informado'} />
      <ReviewRow label="Medidas" value={`${health.heightCm ?? '—'} cm · ${health.weightKg ?? '—'} kg${health.targetWeightKg ? ` · meta ${health.targetWeightKg} kg` : ''}`} />
    </ReviewCard>
    <ReviewCard title="Treino" editLabel="Editar dados de treino" onEdit={() => onEdit('training-experience')} editingDisabled={editingDisabled}>
      <ReviewRow label="Experiência" value={training.trainingExperience ? experienceLabels[training.trainingExperience] : 'Não informada'} />
      <ReviewRow label="Autonomia" value={training.exerciseConfidence ? confidenceLabels[training.exerciseConfidence] : 'Não informada'} />
      <ReviewRow label="Rotina" value={`${training.trainingDaysPerWeek ?? '—'}x por semana · ${joinOrNone(training.availableWeekdays.map((day) => WEEKDAY_LABELS[day]))} · ${training.sessionDurationMin === 90 ? '90+ min' : `${training.sessionDurationMin ?? '—'} min`}`} />
      <ReviewRow label="Local" value={training.trainingLocation ? locationLabels[training.trainingLocation] : 'Não informado'} />
      <ReviewRow label="Equipamentos" value={training.trainingLocation === 'full_gym' ? 'Academia completa' : joinOrNone(training.availableEquipment.map((item) => item === 'other' ? training.otherEquipmentLabel || 'Outro' : EQUIPMENT_LABELS[item]))} />
      <ReviewRow label="Cuidados" value={training.hasPainOrLimitation ? joinOrNone(training.painAreas.map((item) => BODY_AREA_LABELS[item])) : 'Nenhuma dor ou limitação declarada'} />
    </ReviewCard>
    <ReviewCard title="Nutrição" editLabel="Editar dados de nutrição" onEdit={() => onEdit('meal-schedule-flexibility')} editingDisabled={editingDisabled}>
      <ReviewRow label="Flexibilidade da rotina" value={nutrition.mealScheduleFlexibility ? MEAL_SCHEDULE_LABELS[nutrition.mealScheduleFlexibility] : 'Não informada'} />
      <ReviewRow label="Preparo" value={nutrition.preparationStyle ? PREPARATION_LABELS[nutrition.preparationStyle] : 'Não informado'} />
      <ReviewRow label="Orçamento" value={nutrition.budgetStyle ? BUDGET_LABELS[nutrition.budgetStyle] : 'Não informado'} />
      <ReviewRow label="Padrão" value={nutrition.dietaryPattern ? nutrition.dietaryPattern === 'other' ? nutrition.dietaryPatternOtherLabel || 'Outro' : DIETARY_LABELS[nutrition.dietaryPattern] : 'Não informado'} />
      <ReviewRow label="Restrições" value={joinOrNone(restrictionLabels, 'Nenhuma')} />
      <ReviewRow label="Não gosta" value={joinOrNone(nutrition.dislikedFoods.map(({ declaredLabel }) => declaredLabel), 'Nenhum informado')} />
      <ReviewRow label="Preferidos" value={joinOrNone(nutrition.preferredFoods.map(({ declaredLabel }) => declaredLabel), 'Nenhum informado')} />
      <ReviewRow label="Suplementos" value={joinOrNone(supplementLabels, 'Nenhum')} />
    </ReviewCard>
  </div>;
}

export function OnboardingV2Flow({ draftScope, onSubmit, onCompleted }: OnboardingV2FlowProps) {
  const [state, dispatch] = useReducer(onboardingV2Reducer, undefined, createInitialOnboardingV2State);
  const [issues, setIssues] = useState<OnboardingV2ValidationIssue[]>([]);
  const [notice, setNotice] = useState('');
  const [submissionPhase, setSubmissionPhase] = useState<OnboardingSubmissionPhase>('idle');
  const submitInFlightRef = useRef(false);
  const navigationRef = useRef<(() => boolean) | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submissionView = getOnboardingSubmissionView(submissionPhase);
  const isSubmitting = submissionPhase !== 'idle';
  const { isHydrated } = useOnboardingV2Draft({
    userId: draftScope,
    state,
    scopeComplete: false,
    onHydrate: (savedState) => {
      dispatch({ type: 'hydrate', state: savedState });
    },
  });

  const visibleSteps = useMemo(() => getVisibleOnboardingV2Steps(state.form), [state.form]);
  const currentIndex = visibleSteps.findIndex(({ id }) => id === state.currentStepId);
  const safeIndex = Math.max(0, currentIndex);
  const progress = ((safeIndex + 1) / visibleSteps.length) * 100;
  const currentDefinition = ONBOARDING_V2_STEPS.find(({ id }) => id === state.currentStepId);
  const sectionLabel = currentDefinition?.section === 'health' ? 'Você' : currentDefinition?.section === 'training' ? 'Treino' : currentDefinition?.section === 'nutrition' ? 'Nutrição' : 'Revisão';
  const copy = STEP_COPY[state.currentStepId];

  useEffect(() => {
    if (!isHydrated) return;
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [isHydrated, state.currentStepId]);

  useEffect(() => {
    if (submissionPhase !== 'finalizing') return;

    try {
      navigationRef.current ??= createSingleNavigation(onCompleted);
      navigationRef.current?.();
    } catch (error) {
      console.error('[PRAXE] Full-document post-onboarding navigation failed.', error);
    }
  }, [onCompleted, submissionPhase]);

  function updateForm(action: OnboardingV2Action) {
    setIssues([]);
    setNotice('');
    dispatch(action);
  }

  async function handleContinue() {
    if (submitInFlightRef.current) return;
    setNotice('');
    if (state.currentStepId === 'review') {
      const finalValidation = validateOnboardingV2(state.form);
      if (!finalValidation.valid) {
        const firstIssue = finalValidation.issues[0];
        setIssues([firstIssue]);
        setNotice(`Vamos ajustar uma resposta: ${firstIssue.message}`);
        dispatch({ type: 'go-to-step', stepId: firstIssue.stepId });
        return;
      }
      setIssues([]);
      submitInFlightRef.current = true;
      setSubmissionPhase((phase) => beginOnboardingSubmission(phase));
      try {
        const result = await onSubmit(state.form);
        if (!result.ok) {
          setNotice(result.message);
          submitInFlightRef.current = false;
          setSubmissionPhase(finishOnboardingSubmission(false));
        } else {
          setSubmissionPhase(finishOnboardingSubmission(true));
        }
      } catch (error) {
        console.error('[PRAXE] Unexpected V2.1 submit handler failure.', error);
        setNotice('Não foi possível concluir seu cadastro agora. Tente novamente.');
        submitInFlightRef.current = false;
        setSubmissionPhase(finishOnboardingSubmission(false));
      }
      return;
    }
    const validation = validateOnboardingV2Step(state.currentStepId, state.form);
    if (!validation.valid) {
      setIssues(validation.issues);
      queueMicrotask(() => document.getElementById('step-error')?.focus());
      return;
    }
    setIssues([]);
    const next = visibleSteps[safeIndex + 1];
    if (next) {
      dispatch({ type: 'go-to-step', stepId: next.id });
    }
  }

  function handleBack() {
    if (submitInFlightRef.current) return;
    setIssues([]);
    setNotice('');
    const previous = getPreviousOnboardingV2Step(state.form, state.currentStepId);
    if (previous) dispatch({ type: 'go-to-step', stepId: previous.id });
  }

  function handleEdit(stepId: OnboardingV2StepId) {
    if (submitInFlightRef.current) return;
    setIssues([]);
    setNotice('');
    dispatch({ type: 'go-to-step', stepId });
  }

  if (!isHydrated) return <div className="grid min-h-dvh place-items-center bg-[#09090b] text-zinc-400"><div className="flex items-center gap-3 text-sm font-bold"><span className="size-4 animate-spin rounded-full border-2 border-violet-400 border-r-transparent" />Recuperando seu rascunho…</div></div>;

  if (!submissionView.formVisible) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#09090b] px-6 text-white">
        <div role="status" aria-live="polite" className="max-w-md text-center">
          <span aria-hidden="true" className="mx-auto block size-10 animate-spin rounded-full border-4 border-violet-400 border-r-transparent" />
          <h1 className="mt-6 text-2xl font-black">{submissionView.statusMessage}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">Seus dados foram salvos. Estamos abrindo seu dashboard.</p>
          <a href={ONBOARDING_COMPLETION_DESTINATION} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 px-6 text-sm font-black text-violet-200 hover:bg-white/5">
            Ir para o dashboard se a página não avançar
          </a>
        </div>
      </main>
    );
  }

  const canGoBack = safeIndex > 0;
  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-[#09090b] text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_50%_-20%,rgba(124,58,237,0.30),transparent_66%)]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 sm:px-6">
        <header className="pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-violet-600 shadow-lg shadow-violet-950/50"><Zap aria-hidden="true" className="size-5 fill-white" /></span><span className="text-lg font-black tracking-tight">PACE</span></div>
          </div>
          <div className="space-y-2 pt-2"><div className="flex items-center justify-between text-xs font-bold"><span className="text-violet-300">{sectionLabel}</span><span className="text-zinc-500">{Math.round(progress)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/8" role="progressbar" aria-label="Progresso do onboarding" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><div className="h-full rounded-full bg-gradient-to-r from-violet-600 via-violet-500 to-fuchsia-400 shadow-[0_0_18px_rgba(139,92,246,0.55)] transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} /></div></div>
        </header>

        <section className="flex flex-1 flex-col py-8 sm:py-12">
          <><div className="mb-7"><p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-violet-400">{copy.eyebrow}</p><h1 ref={headingRef} tabIndex={-1} className="text-2xl font-black leading-tight tracking-tight outline-none sm:text-4xl">{copy.title}</h1>{copy.subtitle ? <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">{copy.subtitle}</p> : null}</div><div className="rounded-[28px] border border-white/8 bg-[#111116]/90 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur sm:p-6">{state.currentStepId === 'review' ? <ReviewContent form={state.form} onEdit={handleEdit} editingDisabled={isSubmitting} /> : <StepContent stepId={state.currentStepId} form={state.form} dispatch={updateForm} issues={issues} />}</div></>
          {notice ? <p role="status" className="mt-4 rounded-2xl border border-violet-400/15 bg-violet-500/10 px-4 py-3 text-sm text-violet-200">{notice}</p> : null}
        </section>

        <footer className="sticky bottom-0 -mx-4 border-t border-white/8 bg-[#09090b]/92 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl sm:-mx-6 sm:px-6"><div className="mx-auto flex max-w-3xl gap-3"><button type="button" onClick={handleBack} disabled={!canGoBack || isSubmitting} aria-disabled={!canGoBack || isSubmitting} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 text-sm font-bold text-zinc-300 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:invisible"><ArrowLeft className="size-4" />Voltar</button><button type="button" onClick={() => void handleContinue()} disabled={isSubmitting} aria-disabled={isSubmitting} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 text-sm font-black text-white shadow-[0_12px_32px_rgba(124,58,237,0.30)] transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] disabled:cursor-wait disabled:opacity-60">{isSubmitting ? 'Concluindo…' : state.currentStepId === 'review' ? 'Concluir cadastro' : 'Continuar'}{isSubmitting ? <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-white border-r-transparent" /> : <ArrowRight className="size-4" />}</button></div>{submissionView.statusVisible ? <p role="status" className="mt-2 text-center text-xs font-bold text-violet-200">{submissionView.statusMessage}</p> : null}</footer>
      </div>
    </main>
  );
}
