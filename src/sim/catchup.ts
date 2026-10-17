/**
 * Offline progress: when the player returns (loaded save, background tab,
 * cloud download), the real time that passed is simulated with the normal
 * engine at the game's speed, capped to a configurable number of game days.
 * Nothing is estimated: the catch-up runs the same ticks the game would
 * have run, and the report sums the day results the engine produced.
 */

import type { SimEvent } from './core/events';
import { MINUTES_PER_DAY } from './core/clock';

/** Game minutes per real second at speed 1 (same as the UI loop). */
export const MINUTES_PER_SECOND = 2;

export interface CatchUpReport {
  /** Real time that passed (ms). */
  elapsedMs: number;
  /** Ticks actually simulated. */
  ticks: number;
  /** Whether the cap cut the simulation short. */
  capped: boolean;
  startTick: number;
  endTick: number;
  startBalance: number;
  endBalance: number;
  /** Completed days (day:ended events) and the bookings made during the window (finance:transaction events). */
  days: number;
  income: number;
  expenses: number;
  completedBuildings: number;
  /** Notable log lines (warnings, dangers, successes), newest last, bounded. */
  notable: { level: string; message: string }[];
}

export const NOTABLE_LIMIT = 15;

/** Ticks to simulate for the elapsed real time at `speed`, capped at `capDays` game days (0 = feature off). */
export function ticksForElapsed(elapsedMs: number, speed: number, capDays: number): { ticks: number; capped: boolean } {
  if (capDays <= 0 || speed <= 0 || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return { ticks: 0, capped: false };
  const wanted = Math.floor((elapsedMs / 1000) * speed * MINUTES_PER_SECOND);
  const cap = Math.round(capDays * MINUTES_PER_DAY);
  return wanted > cap ? { ticks: cap, capped: true } : { ticks: wanted, capped: false };
}

export function emptyReport(elapsedMs: number, startTick: number, startBalance: number, capped: boolean): CatchUpReport {
  return { elapsedMs, ticks: 0, capped, startTick, endTick: startTick, startBalance, endBalance: startBalance, days: 0, income: 0, expenses: 0, completedBuildings: 0, notable: [] };
}

/** Folds a batch of engine events into the report. */
export function collectEvents(report: CatchUpReport, events: readonly SimEvent[]): void {
  for (const e of events) {
    if (e.type === 'day:ended') {
      report.days++;
    } else if (e.type === 'finance:transaction') {
      // Sum the bookings of the window itself (day totals would include the hours before and after it).
      if (e.amount > 0) report.income += e.amount;
      else report.expenses -= e.amount;
    } else if (e.type === 'building:completed') {
      report.completedBuildings++;
    } else if (e.type === 'log' && (e.level === 'warning' || e.level === 'danger' || e.level === 'success')) {
      report.notable.push({ level: e.level, message: e.message });
      if (report.notable.length > NOTABLE_LIMIT) report.notable.shift();
    }
  }
}

/** Human readable duration for the report ("2 Std. 15 Min."). */
export function describeElapsed(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} Std. ${minutes % 60} Min.`;
  return `${Math.floor(hours / 24)} Tage ${hours % 24} Std.`;
}
