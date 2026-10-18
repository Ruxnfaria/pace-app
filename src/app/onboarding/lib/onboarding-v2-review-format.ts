import type { Weekday } from './onboarding-v2-types.ts';

const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
  7: 'Dom',
};

export function formatBirthDateForReview(birthDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return birthDate;

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function formatWeekdaysForReview(weekdays: readonly Weekday[]): string {
  if (weekdays.length === 0) return 'Nenhum informado';

  const orderedWeekdays = [...weekdays].sort((left, right) => left - right);
  const isContinuous =
    orderedWeekdays.length > 1 &&
    orderedWeekdays.every(
      (weekday, index) => index === 0 || weekday === orderedWeekdays[index - 1] + 1,
    );

  if (isContinuous) {
    return `${WEEKDAY_LABELS[orderedWeekdays[0]]} a ${WEEKDAY_LABELS[orderedWeekdays.at(-1)!]}`;
  }

  return orderedWeekdays.map((weekday) => WEEKDAY_LABELS[weekday]).join(', ');
}
