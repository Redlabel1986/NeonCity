/**
 * Ingredient market: a price index per ingredient that reacts to city-wide
 * demand (player and competitors) and reverts to the mean. Applied on top of
 * supplier prices.
 */

import type { SimContext } from '../core/context';
import type { MarketState } from '../state';
import { INGREDIENT_IDS } from '../data/ingredients';

export const MARKET_MIN = 0.6;
export const MARKET_MAX = 1.9;

/** Typical city-wide daily consumption per ingredient that keeps the index stable. */
const TYPICAL_DAILY_DEMAND = 900;

export function createMarket(): MarketState {
  return {
    index: Object.fromEntries(INGREDIENT_IDS.map((id) => [id, 1])),
    demandToday: {},
  };
}

export function marketFactor(market: MarketState, ingredientId: string): number {
  return market.index[ingredientId] ?? 1;
}

export function registerDemand(market: MarketState, ingredientId: string, units: number): void {
  market.demandToday[ingredientId] = (market.demandToday[ingredientId] ?? 0) + units;
}

/** Daily update: mean reversion plus demand pressure plus noise. */
export function closeMarketDay(ctx: SimContext): void {
  const { state, rng, events } = ctx;
  const market = state.market;
  let shock: string | null = null;
  for (const id of INGREDIENT_IDS) {
    const current = market.index[id] ?? 1;
    const demand = market.demandToday[id] ?? 0;
    const pressure = 0.03 * (demand / TYPICAL_DAILY_DEMAND - 1);
    let next = current + 0.12 * (1 - current) + pressure + rng.gaussian() * 0.025;
    // Occasional supply shock.
    if (rng.chance(0.02)) {
      next += rng.range(0.25, 0.5);
      shock = id;
    }
    market.index[id] = Math.max(MARKET_MIN, Math.min(MARKET_MAX, Math.round(next * 1000) / 1000));
  }
  market.demandToday = {};
  if (shock) {
    events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `Marktbericht: Lieferengpass bei ${shock === 'synthmeat' ? 'Synth-Fleisch' : shock}. Einkaufspreise steigen.` });
  }
}
