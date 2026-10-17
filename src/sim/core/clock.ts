/**
 * Game time. One simulation tick equals one in-game minute.
 * The clock is a pure value object; the engine owns the tick counter.
 */

export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;

/** The game starts on day 0 at this minute of the day. */
export const START_MINUTE_OF_DAY = 7 * MINUTES_PER_HOUR;
export const START_YEAR = 2187;

export interface GameDate {
  readonly tick: number;
  readonly day: number; // days since game start (0-based)
  readonly minuteOfDay: number;
  readonly hour: number;
  readonly minute: number;
  readonly year: number;
  readonly month: number; // 1-12
  readonly dayOfMonth: number; // 1-30
}

export function tickToDate(tick: number): GameDate {
  const absoluteMinutes = tick + START_MINUTE_OF_DAY;
  const day = Math.floor(absoluteMinutes / MINUTES_PER_DAY);
  const minuteOfDay = absoluteMinutes - day * MINUTES_PER_DAY;
  const month0 = Math.floor(day / DAYS_PER_MONTH);
  return {
    tick,
    day,
    minuteOfDay,
    hour: Math.floor(minuteOfDay / MINUTES_PER_HOUR),
    minute: minuteOfDay % MINUTES_PER_HOUR,
    year: START_YEAR + Math.floor(month0 / MONTHS_PER_YEAR),
    month: (month0 % MONTHS_PER_YEAR) + 1,
    dayOfMonth: (day % DAYS_PER_MONTH) + 1,
  };
}

export function isDayBoundary(tick: number): boolean {
  return (tick + START_MINUTE_OF_DAY) % MINUTES_PER_DAY === 0;
}

export function isHourBoundary(tick: number): boolean {
  return (tick + START_MINUTE_OF_DAY) % MINUTES_PER_HOUR === 0;
}

export function formatClock(date: GameDate): string {
  return `${pad2(date.hour)}:${pad2(date.minute)}`;
}

export function formatDate(date: GameDate): string {
  return `${pad2(date.dayOfMonth)}.${pad2(date.month)}.${date.year}`;
}

/**
 * Daylight factor in [0,1]: 1 = full day, 0 = deep night.
 * Smooth transitions at dawn (05:00-07:30) and dusk (18:00-20:30).
 */
export function daylightFactor(minuteOfDay: number): number {
  const h = minuteOfDay / MINUTES_PER_HOUR;
  const dawnStart = 5;
  const dawnEnd = 7.5;
  const duskStart = 18;
  const duskEnd = 20.5;
  if (h < dawnStart || h >= duskEnd) return 0;
  if (h < dawnEnd) return smooth((h - dawnStart) / (dawnEnd - dawnStart));
  if (h < duskStart) return 1;
  return 1 - smooth((h - duskStart) / (duskEnd - duskStart));
}

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
