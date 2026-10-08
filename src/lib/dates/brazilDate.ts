const BRAZIL_TIME_ZONE = 'America/Sao_Paulo';

const brazilDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BRAZIL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getBrazilDate(date = new Date()) {
  const parts = brazilDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Unable to determine the Brazil calendar date');
  }

  return `${year}-${month}-${day}`;
}

export type BrazilWeekRange = {
  startDate: string;
  endDate: string;
  weekId: string;
  daysRemaining: number;
};

const LOGICAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function formatUtcCalendarDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function getBrazilWeekRangeFromDate(
  logicalDate: string
): BrazilWeekRange {
  const match = LOGICAL_DATE_PATTERN.exec(logicalDate);

  if (!match) {
    throw new Error('logicalDate must use YYYY-MM-DD');
  }

  const [, year, month, day] = match;
  const calendarDate = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day)
  ));

  if (formatUtcCalendarDate(calendarDate) !== logicalDate) {
    throw new Error('logicalDate must be a valid calendar date');
  }

  const daysSinceMonday = (calendarDate.getUTCDay() + 6) % 7;
  const weekStart = new Date(calendarDate);
  weekStart.setUTCDate(calendarDate.getUTCDate() - daysSinceMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  const startDate = formatUtcCalendarDate(weekStart);

  return {
    startDate,
    endDate: formatUtcCalendarDate(weekEnd),
    weekId: startDate,
    daysRemaining: 6 - daysSinceMonday,
  };
}

export function getBrazilWeekRange(date = new Date()) {
  return getBrazilWeekRangeFromDate(getBrazilDate(date));
}

export type BrazilMonthRange = {
  startDate: string;
  endDate: string;
  monthId: string;
  daysRemaining: number;
};

export function getBrazilMonthRangeFromDate(
  logicalDate: string
): BrazilMonthRange {
  const match = LOGICAL_DATE_PATTERN.exec(logicalDate);

  if (!match) {
    throw new Error('logicalDate must use YYYY-MM-DD');
  }

  const [, year, month, day] = match;
  const calendarDate = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day)
  ));

  if (formatUtcCalendarDate(calendarDate) !== logicalDate) {
    throw new Error('logicalDate must be a valid calendar date');
  }

  const monthEnd = new Date(Date.UTC(Number(year), Number(month), 0));
  const monthId = `${year}-${month}`;

  return {
    startDate: `${monthId}-01`,
    endDate: formatUtcCalendarDate(monthEnd),
    monthId,
    daysRemaining: monthEnd.getUTCDate() - Number(day),
  };
}

export function getBrazilMonthRange(date = new Date()) {
  return getBrazilMonthRangeFromDate(getBrazilDate(date));
}
