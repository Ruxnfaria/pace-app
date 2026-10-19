import { MealPlanResolutionError, type NormalizedAwakeWindow } from "./domain";

const MINUTES_PER_DAY = 24 * 60;

function parseClock(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new MealPlanResolutionError("INVALID_CONTEXT", `Invalid clock value: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new MealPlanResolutionError("INVALID_CONTEXT", `Invalid clock value: ${value}`);
  }
  return hours * 60 + minutes;
}

export function normalizeAwakeWindow(wakeTime: string, sleepTime: string): NormalizedAwakeWindow {
  const wakeMinute = parseClock(wakeTime);
  const rawSleepMinute = parseClock(sleepTime);
  if (wakeMinute === rawSleepMinute) {
    throw new MealPlanResolutionError("INVALID_CONTEXT", "Wake and sleep times cannot be equal");
  }
  const crossesMidnight = rawSleepMinute < wakeMinute;
  const sleepMinute = rawSleepMinute + (crossesMidnight ? MINUTES_PER_DAY : 0);
  const durationMinutes = sleepMinute - wakeMinute;
  if (durationMinutes < 8 * 60 || durationMinutes > 20 * 60) {
    throw new MealPlanResolutionError("INVALID_CONTEXT", "Awake window must be between 8 and 20 hours");
  }
  return { wakeMinute, sleepMinute, durationMinutes, crossesMidnight };
}

export function formatAbsoluteMinute(value: number): { time: string; dayOffset: 0 | 1 } {
  const rounded = Math.round(value);
  const dayOffset = rounded >= MINUTES_PER_DAY ? 1 : 0;
  const minuteOfDay = ((rounded % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(minuteOfDay / 60).toString().padStart(2, "0");
  const minutes = (minuteOfDay % 60).toString().padStart(2, "0");
  return { time: `${hours}:${minutes}`, dayOffset };
}
