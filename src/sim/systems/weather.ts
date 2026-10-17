/**
 * Weather: rain, fog and storms change citizen behaviour (fewer walk-ins,
 * more taxi rides) and the look of the city. Deterministic from the seed.
 */

import type { SimContext } from '../core/context';
import type { GameState, WeatherState } from '../state';

export type WeatherKind = WeatherState['kind'];

export const WEATHER_LABELS: Record<WeatherKind, string> = { clear: 'Klar', rain: 'Regen', fog: 'Nebel', storm: 'Gewitter' };

export function createWeather(): WeatherState {
  return { kind: 'clear', untilTick: 6 * 60, intensity: 0 };
}

/** Multipliers other systems read. */
export function weatherFactors(state: GameState): { walkIns: number; taxi: number; outdoor: number } {
  const w = state.weather;
  switch (w?.kind) {
    case 'rain':
      return { walkIns: 1 - 0.18 * w.intensity, taxi: 1 + 0.25 * w.intensity, outdoor: 0.7 };
    case 'storm':
      return { walkIns: 1 - 0.35 * w.intensity, taxi: 1 + 0.35 * w.intensity, outdoor: 0.4 };
    case 'fog':
      return { walkIns: 1 - 0.08 * w.intensity, taxi: 1 + 0.1 * w.intensity, outdoor: 0.85 };
    default:
      return { walkIns: 1, taxi: 1, outdoor: 1 };
  }
}

/** Hourly: roll new weather when the current spell ends. */
export function stepWeatherHour(ctx: SimContext): void {
  const { state, rng, events } = ctx;
  const w = state.weather;
  if (state.tick < w.untilTick) return;
  const roll = rng.next();
  const pollution = state.districts.reduce((s, d) => s + d.stats.pollution, 0) / state.districts.length / 100;
  let kind: WeatherKind = 'clear';
  if (roll < 0.06) kind = 'storm';
  else if (roll < 0.3 + pollution * 0.1) kind = 'rain';
  else if (roll < 0.42 + pollution * 0.15) kind = 'fog';
  const hours = kind === 'clear' ? rng.int(6, 18) : kind === 'storm' ? rng.int(2, 4) : rng.int(3, 9);
  const previous = w.kind;
  w.kind = kind;
  w.intensity = kind === 'clear' ? 0 : Math.round(rng.range(0.4, 1) * 100) / 100;
  w.untilTick = state.tick + hours * 60;
  if (kind !== previous && kind !== 'clear') {
    events.emit({ type: 'log', tick: state.tick, level: 'info', message: `Wetter: ${WEATHER_LABELS[kind]}${kind === 'storm' ? '. Weniger Laufkundschaft, mehr Taxifahrten.' : '.'}` });
  }
}
