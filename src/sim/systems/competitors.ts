/**
 * AI competitors: gastronomy venues run by the city's NPC businesses.
 * They serve citizens, earn and spend money, adjust prices, invest in
 * quality, close when they keep losing and open new venues where demand is
 * underserved. Deterministic utility rules, no external services.
 */

import type { SimContext } from '../core/context';
import type { Rng } from '../core/rng';
import type { Building, Competitor, GameState } from '../state';
import { DISTRICT_ARCHETYPES } from '../data/districts';
import { registerDemand } from './market';
import { applyVisitOutcome } from './population';

const VENUE_LABELS = ['Imbiss', 'Teehaus', 'Karaoke-Bar', 'Nudelküche', 'Synth-Grill', 'Kantine', 'Nachtbar'];
const VENUE_NAMES = ['Lucky Noodle', 'Hanzo Diner', 'Blue Lotus', 'Chrome Bowl', 'Mama Okafor', 'Neon Wok', 'Dock 9', 'Yume Ramen', 'Electric Dumpling', 'Last Stop', 'Kaiju Kitchen', 'Static Grill', 'Oni Bar', 'Byte Bistro', 'Velvet Broth'];
const BASE_PRICE = 15;
const COST_PER_GUEST = 6;
const DAILY_FIXED = 260;

export function createCompetitorsForCity(state: GameState, rng: Rng, day: number): void {
  const candidates: Building[] = [];
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner !== 'city') continue;
    if (VENUE_LABELS.includes(b.label) || b.label === 'Ladenzeile' || b.label === 'Eckladen') candidates.push(b);
  }
  const perDistrict = new Map<number, number>();
  let created = 0;
  // Shuffle deterministically.
  const shuffled = [...candidates].sort(() => rng.next() - 0.5);
  for (const b of shuffled) {
    const arch = DISTRICT_ARCHETYPES[state.districts[b.districtId]!.archetype];
    const cap = arch.style === 'market' ? 5 : arch.style === 'old' ? 4 : arch.style === 'corporate' || arch.style === 'chrome' ? 2 : 2;
    const have = perDistrict.get(b.districtId) ?? 0;
    if (have >= cap) continue;
    perDistrict.set(b.districtId, have + 1);
    openCompetitor(state, rng, b, day);
    created++;
    if (created >= 22) break;
  }
}

export function openCompetitor(state: GameState, rng: Rng, b: Building, day: number): Competitor {
  const district = state.districts[b.districtId]!;
  const c: Competitor = {
    buildingId: b.id,
    name: `${rng.pick(VENUE_NAMES)} ${rng.int(2, 99)}`,
    districtId: b.districtId,
    priceLevel: Math.round(rng.range(0.8, 1.25) * 100) / 100,
    quality: Math.round(35 + district.stats.purchasingPower * 0.4 + rng.gaussian() * 10),
    reputation: Math.round(40 + rng.gaussian() * 10),
    capacityPerHour: rng.int(14, 26),
    cash: rng.int(2000, 9000),
    visitsToday: 0,
    servedToday: 0,
    revenueToday: 0,
    lossDays: 0,
    openedDay: day,
    history: [],
  };
  c.quality = Math.max(10, Math.min(95, c.quality));
  c.reputation = Math.max(10, Math.min(90, c.reputation));
  b.label = rng.pick(VENUE_LABELS);
  state.competitors[b.id] = c;
  return c;
}

/** Serves this hour's citizen visits. */
export function stepCompetitorsHour(ctx: SimContext, hour: number): void {
  const { state, rng } = ctx;
  const visits = state.population.pendingVisits;
  const open = hour >= 11 || hour < 1;
  for (const key in state.competitors) {
    const c = state.competitors[key]!;
    if (!open) continue;
    const wanting = visits[c.buildingId] ?? 0;
    // Walk-in share from the aggregated population.
    const district = state.districts[c.districtId]!;
    const walkIns = Math.round((district.stats.demandFood / 100) * 4 * rng.range(0.6, 1.4) * (hour === 12 || hour === 13 || hour === 19 || hour === 20 ? 1.4 : 0.7));
    const total = wanting + walkIns;
    const served = Math.min(total, c.capacityPerHour);
    c.visitsToday += total;
    c.servedToday += served;
    const price = BASE_PRICE * c.priceLevel;
    c.revenueToday += served * price;
    c.cash += served * (price - COST_PER_GUEST);
    for (const ing of ['noodles', 'broth', 'vegetables', 'synthmeat']) registerDemand(state.market, ing, served * 0.8);
    const satisfaction = Math.max(0, Math.min(100, c.quality * 0.8 + 20 * Math.pow(1 / Math.max(0.3, c.priceLevel), 0.6) + rng.gaussian() * 4));
    if (wanting > 0) applyVisitOutcome(state, c.buildingId, wanting, Math.min(wanting, served), satisfaction, price);
    c.reputation += (satisfaction - c.reputation) * 0.02;
  }
}

/** Daily AI decisions. */
export function closeCompetitorsDay(ctx: SimContext, day: number): void {
  const { state, rng, events } = ctx;
  const closing: number[] = [];
  for (const key in state.competitors) {
    const c = state.competitors[key]!;
    const profit = c.revenueToday - c.servedToday * COST_PER_GUEST - DAILY_FIXED;
    c.cash -= DAILY_FIXED;
    c.history.push({ day, served: c.servedToday, profit });
    if (c.history.length > 14) c.history.shift();
    c.lossDays = profit < 0 ? c.lossDays + 1 : 0;
    const utilization = c.servedToday / (c.capacityPerHour * 12);
    // Price policy
    if (utilization > 0.75 && c.priceLevel < 1.6) c.priceLevel = Math.round((c.priceLevel + 0.05) * 100) / 100;
    else if (utilization < 0.45 && c.priceLevel > 0.65) c.priceLevel = Math.round((c.priceLevel - 0.05) * 100) / 100;
    else if (rng.chance(0.15)) c.priceLevel = Math.round((c.priceLevel + rng.pick([-0.03, 0.03])) * 100) / 100;
    // Investment
    if (c.cash > 4000 && c.quality < 92 && rng.chance(0.5)) {
      c.cash -= 1500;
      c.quality = Math.min(95, c.quality + 4);
    }
    c.visitsToday = 0;
    c.servedToday = 0;
    c.revenueToday = 0;
    if ((c.lossDays >= 10 && c.cash < 500) || c.cash < -2500) closing.push(c.buildingId);
  }
  for (const id of closing) {
    const c = state.competitors[id]!;
    const b = state.buildings[id];
    delete state.competitors[id];
    if (b) b.label = 'Leerstand';
    events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${c.name} in ${state.districts[c.districtId]!.name} hat Insolvenz angemeldet und geschlossen.`, buildingId: String(id) });
  }
  // Expansion every few days when a district is underserved.
  if (day - state.lastCompetitorExpansionDay >= 5) {
    state.lastCompetitorExpansionDay = day;
    expand(ctx, day);
  }
}

function expand(ctx: SimContext, day: number): void {
  const { state, rng, events } = ctx;
  if (Object.keys(state.competitors).length >= 40) return;
  // Underserved = many citizens per venue. Try districts in that order.
  const ranked = state.districts
    .map((d) => ({ districtId: d.id, ratio: d.economy.citizens / (d.economy.venues + 1) }))
    .filter((r) => r.ratio >= 40)
    .sort((a, b) => b.ratio - a.ratio);
  const preferred = new Set(['Leerstand', 'Ladenzeile', 'Eckladen', 'Imbiss', 'Containerwohnung', 'Teehaus', 'Karaoke-Bar', 'Spielhalle', 'Pfandleihe']);
  let b: Building | null = null;
  for (const r of ranked) {
    const all = Object.values(state.buildings).filter((x) => x.owner === 'city' && x.districtId === r.districtId && !state.competitors[x.id]);
    const options = all.filter((x) => preferred.has(x.label));
    const pool = options.length > 0 ? options : all.filter((x) => x.w * x.h === 1 && x.floors <= 8);
    if (pool.length === 0) continue;
    b = rng.pick(pool);
    break;
  }
  if (!b) return;
  const c = openCompetitor(state, rng, b, day);
  const near = Object.values(state.buildings).find((p) => p.owner !== 'city' && p.business && Math.abs(p.x - b.x) + Math.abs(p.y - b.y) <= 6);
  events.emit({
    type: 'log',
    tick: state.tick,
    level: near ? 'warning' : 'info',
    message: near ? `Konkurrenz: ${c.name} eröffnet direkt neben ${near.label}.` : `${c.name} eröffnet in ${state.districts[b.districtId]!.name}.`,
    buildingId: String(b.id),
  });
}
