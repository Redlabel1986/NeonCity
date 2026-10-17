/**
 * Real estate: buying city buildings, collecting rent from the citizens who
 * live there (or the businesses that trade there), renovating, selling, and
 * taking over competitor venues.
 */

import type { SimContext } from '../core/context';
import type { Building, GameState } from '../state';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { DIFFICULTIES } from '../data/difficulty';
import { book, canAfford } from '../economy/finance';
import { createBusinessStateFor } from './businessFactory';
import { tickToDate } from '../core/clock';

export const RESIDENTIAL_STYLES = new Set(['old', 'undercity', 'skyline', 'ghost']);

export function isResidential(b: Building): boolean {
  const style = b.cityStyle ?? '';
  return RESIDENTIAL_STYLES.has(style) || (style === 'market' && b.floors >= 3);
}

/** Purchase price of a city building. */
export function propertyPrice(state: GameState, b: Building): number {
  const district = state.districts[b.districtId]!;
  const difficulty = DIFFICULTIES[state.player.difficulty];
  const land = district.stats.landPrice * b.w * b.h;
  const structure = b.floors * b.w * b.h * (180 + district.stats.attractiveness * 4);
  const competitorPremium = state.competitors[b.id] ? state.competitors[b.id]!.cash * 0.6 + 6000 : 0;
  return Math.round((land + structure + competitorPremium) * difficulty.costMultiplier);
}

/** Tenants living in the building (citizens). */
export function tenantCount(state: GameState, buildingId: number): number {
  let n = 0;
  for (const c of state.population.citizens) if (c.homeBuildingId === buildingId) n++;
  return n;
}

/** Daily rent the property yields at current settings. */
export function dailyRent(state: GameState, b: Building): number {
  const p = b.property;
  if (!p) return 0;
  const district = state.districts[b.districtId]!;
  if (p.renovationUntilTick > state.tick) return 0;
  const conditionFactor = 0.5 + p.condition / 200;
  if (isResidential(b)) {
    const tenants = tenantCount(state, b.id);
    const perTenant = (district.stats.rentIndex * 0.9 + 10) * p.rentLevel;
    return Math.round(tenants * perTenant * conditionFactor);
  }
  // Commercial lease: competitors or other city businesses pay by floor area.
  const base = district.stats.rentIndex * b.w * b.h * b.floors * 0.6;
  const occupied = state.competitors[b.id] ? 1.3 : 1;
  return Math.round(base * p.rentLevel * conditionFactor * occupied);
}

export function buyProperty(ctx: SimContext, buildingId: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const b = state.buildings[buildingId];
  if (!b) return { ok: false, error: 'Gebäude nicht gefunden.' };
  if (b.owner === state.playerId) return { ok: false, error: 'Dieses Gebäude gehört bereits dir.' };
  if (b.owner !== 'city') return { ok: false, error: 'Dieses Gebäude gehört einem anderen Spieler.' };
  const price = propertyPrice(state, b);
  if (!canAfford(state, price)) return { ok: false, error: `Nicht genug Credits für den Kauf (${price} ¢).` };
  book(state, events, -price, { category: 'land', description: `Immobilienkauf: ${b.label}`, buildingId: b.id });
  b.owner = state.playerId;
  b.investment = price;
  b.property = { purchasePrice: price, purchasedTick: state.tick, rentLevel: 1, condition: Math.round(55 + (100 - state.districts[b.districtId]!.stats.pollution) * 0.35), renovationUntilTick: 0, todayRent: 0, lifetimeRent: 0, tenants: tenantCount(state, b.id) };
  events.emit({ type: 'log', tick: state.tick, level: 'success', message: `${b.label} in ${state.districts[b.districtId]!.name} gekauft für ${price} ¢.`, buildingId: String(b.id) });
  return { ok: true };
}

export function sellProperty(ctx: SimContext, buildingId: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const b = state.buildings[buildingId];
  if (!b || b.owner !== state.playerId || !b.property) return { ok: false, error: 'Keine eigene Immobilie.' };
  const value = Math.round(propertyPrice(state, { ...b, cityStyle: b.cityStyle }) * 0.85 * (0.7 + b.property.condition / 333));
  book(state, events, value, { category: 'land', description: `Immobilienverkauf: ${b.label}`, buildingId: b.id });
  b.owner = 'city';
  b.investment = 0;
  delete b.property;
  events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${b.label} verkauft für ${value} ¢.`, buildingId: String(b.id) });
  return { ok: true };
}

export function setRentLevel(state: GameState, buildingId: number, level: number): { ok: true } | { ok: false; error: string } {
  const b = state.buildings[buildingId];
  if (!b || b.owner !== state.playerId || !b.property) return { ok: false, error: 'Keine eigene Immobilie.' };
  if (!Number.isFinite(level)) return { ok: false, error: 'Ungültige Miete.' };
  const cap = state.politics?.laws?.rentCap ?? 1.6;
  b.property.rentLevel = Math.max(0.6, Math.min(cap, Math.round(level * 20) / 20));
  return { ok: true };
}

export function renovate(ctx: SimContext, buildingId: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const b = state.buildings[buildingId];
  if (!b || b.owner !== state.playerId || !b.property) return { ok: false, error: 'Keine eigene Immobilie.' };
  if (b.property.renovationUntilTick > state.tick) return { ok: false, error: 'Die Renovierung läuft bereits.' };
  if (b.property.condition >= 95) return { ok: false, error: 'Das Gebäude ist in bestem Zustand.' };
  const difficulty = DIFFICULTIES[state.player.difficulty];
  const cost = Math.round(b.floors * b.w * b.h * 120 * difficulty.costMultiplier);
  if (!canAfford(state, cost)) return { ok: false, error: `Nicht genug Credits für die Renovierung (${cost} ¢).` };
  book(state, events, -cost, { category: 'construction', description: `Renovierung: ${b.label}`, buildingId: b.id });
  b.property.renovationUntilTick = difficulty.instantBuild ? state.tick : state.tick + 36 * 60;
  b.property.condition = 100;
  events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${b.label}: Renovierung gestartet (36 h, ${cost} ¢). Solange keine Mieteinnahmen.`, buildingId: String(b.id) });
  return { ok: true };
}

/** Buys a competitor venue and turns it into a player-run diner. */
export function takeoverCompetitor(ctx: SimContext, buildingId: number): { ok: true } | { ok: false; error: string } {
  const { state, events, rng } = ctx;
  const b = state.buildings[buildingId];
  const c = state.competitors[buildingId];
  if (!b || !c) return { ok: false, error: 'Hier gibt es kein Konkurrenzlokal.' };
  const price = propertyPrice(state, b);
  if (!canAfford(state, price)) return { ok: false, error: `Nicht genug Credits für die Übernahme (${price} ¢).` };
  book(state, events, -price, { category: 'land', description: `Übernahme: ${c.name}`, buildingId: b.id });
  delete state.competitors[buildingId];
  const def = BUILDING_DEFINITIONS.diner!;
  b.owner = state.playerId;
  b.defId = 'diner';
  b.label = c.name;
  b.investment = price;
  b.status = 'operational';
  b.progress = 0;
  b.buildTime = 0;
  b.placedTick = state.tick;
  const day = tickToDate(state.tick).day;
  b.business = createBusinessStateFor(def, rng, day, state.tick, state.districts[b.districtId]!.stats.purchasingPower);
  if (b.business && b.business.kind === 'gastronomy') b.business.reputation = c.reputation;
  events.emit({ type: 'log', tick: state.tick, level: 'success', message: `${c.name} übernommen für ${price} ¢. Das Lokal gehört jetzt dir.`, buildingId: String(b.id) });
  return { ok: true };
}

/** Day close: rent income, condition decay, tenant churn with rent level. */
export function closePropertyDay(ctx: SimContext): void {
  const { state, events, rng } = ctx;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    const p = b.property;
    if (!p || b.owner !== state.playerId) continue;
    const rent = dailyRent(state, b);
    if (rent > 0) {
      book(state, events, rent, { category: 'rent', description: `Mieteinnahmen: ${b.label}`, buildingId: b.id });
      p.todayRent = rent;
      p.lifetimeRent += rent;
    } else p.todayRent = 0;
    const maintenance = Math.round(b.floors * b.w * b.h * 4);
    book(state, events, -maintenance, { category: 'upkeep', description: `Instandhaltung: ${b.label}`, buildingId: b.id });
    p.condition = Math.max(0, p.condition - 0.4 - state.districts[b.districtId]!.stats.pollution / 400);
    p.tenants = tenantCount(state, b.id);
    // Tenants leave expensive, run-down buildings and move into cheap, good ones.
    if (isResidential(b)) {
      const leaveChance = Math.max(0, (p.rentLevel - 1) * 0.08) + Math.max(0, (40 - p.condition) / 400);
      for (const c of state.population.citizens) {
        if (c.homeBuildingId !== b.id) continue;
        if (rng.chance(leaveChance)) {
          const alternatives = Object.values(state.buildings).filter((x) => x.owner === 'city' && x.districtId === c.districtId && RESIDENTIAL_STYLES.has(x.cityStyle ?? ''));
          if (alternatives.length > 0) c.homeBuildingId = rng.pick(alternatives).id;
        }
      }
      if (p.rentLevel < 1 && p.condition > 60 && rng.chance(0.3)) {
        const mover = state.population.citizens.find((c) => c.districtId === b.districtId && c.homeBuildingId !== b.id && rng.chance(0.3));
        if (mover) mover.homeBuildingId = b.id;
      }
    }
  }
}
