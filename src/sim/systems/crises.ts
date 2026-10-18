/**
 * Economic crises: start randomly (more likely in unstable cities), apply
 * concrete effects while active, and are undone when they end.
 */

import type { SimContext } from '../core/context';
import type { District } from '../state';
import { isRegionUnlocked, regionOfDistrict } from './progression';
import type { CrisisState, GameState } from '../state';
import { viewOf } from '../players';
import { CRISES } from '../data/crises';
import { INGREDIENT_IDS, RETAIL_GOOD_IDS } from '../data/ingredients';
import { hasTech } from './research';
import { book } from '../economy/finance';
import { insuranceClaim } from './corporate';

export function createCrisisState(): CrisisState {
  return { active: null, lastCrisisEndDay: 0, history: [], bubbleApplied: false };
}

export function activeCrisis(state: GameState, id: string): boolean {
  return state.crisis.active?.id === id;
}

/** Severity-scaled multipliers other systems read. */
export function crisisFactors(state: GameState): { purchase: number; delivery: number; demand: number; wages: number; candidates: number } {
  const c = state.crisis.active;
  if (!c) return { purchase: 1, delivery: 1, demand: 1, wages: 1, candidates: 1 };
  const fusion = hasTech(state, 'fusion_cells');
  switch (c.id) {
    case 'supply_chain':
      return { purchase: 1.5, delivery: 2, demand: 1, wages: 1, candidates: 1 };
    case 'recession':
      return { purchase: 1, delivery: 1, demand: 0.85, wages: 1, candidates: 1 };
    case 'labor_shortage':
      return { purchase: 1, delivery: 1, demand: 1, wages: 1.25, candidates: 0.5 };
    case 'hyperinflation':
      return { purchase: 1.35, delivery: 1, demand: 1, wages: 1.35, candidates: 1 };
    case 'energy_shortage':
      return { purchase: 1, delivery: fusion ? 1 : 1.2, demand: 1, wages: 1, candidates: 1 };
    default:
      return { purchase: 1, delivery: 1, demand: 1, wages: 1, candidates: 1 };
  }
}

export function closeCrisisDay(ctx: SimContext, day: number): void {
  const { state, rng } = ctx;
  const cs = state.crisis;
  if (cs.active) {
    applyDailyEffects(ctx, day);
    if (day >= cs.active.endDay) endCrisis(ctx, day);
    return;
  }
  if (day - cs.lastCrisisEndDay < 6 || day < 5) return;
  // Instability raises the odds: high crime, high gang control, low employment.
  const avgCrime = state.districts.reduce((s, d) => s + d.stats.crime, 0) / state.districts.length;
  const anyOrg = state.world.playerOrder.some((id) => !!state.world.players[id]!.underworld.org);
  const instability = 1 + avgCrime / 100 + (anyOrg ? 0.3 : 0);
  for (const def of Object.values(CRISES)) {
    // Regional events only once a player has opened that region.
    if (def.region && !state.world.playerOrder.some((id) => isRegionUnlocked(viewOf(state, id), def.region!))) continue;
    if (rng.chance(def.chance * instability)) {
      startCrisis(ctx, def.id, day);
      return;
    }
  }
}

/** Demand multiplier a regional event applies to businesses in a district (1 elsewhere). */
export function regionDemandFactor(state: GameState, districtId: number, kind: 'gastronomy' | 'retail' | 'hotel' | 'transport' | 'industry'): number {
  const c = state.crisis.active;
  if (!c) return 1;
  const def = CRISES[c.id];
  if (!def?.region || regionOfDistrict(state, districtId) !== def.region) return 1;
  switch (c.id) {
    case 'village_fair':
      return kind === 'transport' ? 1.2 : 1.4;
    case 'traffic_jam':
      return kind === 'transport' ? 0.7 : kind === 'retail' ? 0.9 : 1;
    case 'chain_competition':
      return kind === 'retail' ? 0.8 : 1;
    case 'harvest_failure':
      return kind === 'industry' ? 0.6 : 1;
    case 'megacity_blackout':
      return kind === 'transport' ? 0.5 : 0.85;
    default:
      return 1;
  }
}

function regionDistricts(state: GameState, region: string): District[] {
  return state.districts.filter((d) => regionOfDistrict(state, d.id) === region);
}

function startCrisis(ctx: SimContext, id: string, day: number): void {
  const { state, events, rng } = ctx;
  const def = CRISES[id]!;
  const severity = rng.range(0.8, 1.2);
  state.crisis.active = { id, startDay: day, endDay: day + rng.int(def.days[0], def.days[1]), severity };
  switch (id) {
    case 'energy_shortage':
      for (const d of state.districts) d.stats.energySupply = Math.max(10, d.stats.energySupply - 30 * (hasTech(state, 'fusion_cells') ? 0.5 : 1));
      break;
    case 'recession':
      for (const d of state.districts) d.stats.purchasingPower = Math.max(5, d.stats.purchasingPower * 0.85);
      break;
    case 'property_bubble':
      for (const d of state.districts) d.stats.landPrice = Math.round(d.stats.landPrice * 1.6);
      state.crisis.bubbleApplied = true;
      break;
    case 'supply_chain':
      for (const g of [...INGREDIENT_IDS, ...RETAIL_GOOD_IDS]) state.market.index[g] = Math.min(1.9, (state.market.index[g] ?? 1) * 1.3);
      break;
    case 'harvest_failure':
      for (const g of ['vegetables', 'herbs', 'grain']) state.market.index[g] = Math.min(1.9, (state.market.index[g] ?? 1) * 1.5);
      break;
    case 'corp_scandal':
      for (const d of regionDistricts(state, 'neon_central')) d.stats.purchasingPower = Math.max(5, d.stats.purchasingPower * 0.88);
      break;
    case 'megacity_blackout':
      for (const d of regionDistricts(state, 'nova_eclipse')) d.stats.energySupply = Math.max(10, d.stats.energySupply - 40);
      break;
    case 'financial_scandal': {
      for (const id of state.world.playerOrder) {
        const v = viewOf(state, id);
        const pulled = Math.round(v.corporate.investorCapital * 0.2);
        if (pulled > 0 && v.corporate.sharesSold > 0) {
          book(v, events, -Math.min(pulled, Math.max(0, v.ledger.balance)), { category: 'capital', description: 'Investoren ziehen Kapital ab' });
          v.corporate.investorCapital -= pulled;
        }
      }
      break;
    }
    default:
      break;
  }
  events.emit({ type: 'log', tick: state.tick, level: 'danger', message: `Krise: ${def.name}. ${def.description} Dauer etwa ${state.crisis.active.endDay - day} Tage.` });
}

function applyDailyEffects(ctx: SimContext, day: number): void {
  const { state, events, rng } = ctx;
  const c = state.crisis.active!;
  if (c.id === 'cyber_wave') {
    for (const b of Object.values(state.buildings)) {
      if (b.owner === 'city' || !state.world.players[b.owner] || !b.business || b.status !== 'operational') continue;
      const v = viewOf(state, b.owner);
      if ((b.business.upgrades.security ?? 0) > 0 || hasTech(v, 'surveillance_ai')) continue;
      if (!rng.chance(0.3)) continue;
      const last = b.business.history[b.business.history.length - 1];
      const loss = Math.round(last ? last.revenue : 300);
      if (loss <= 0) continue;
      book(v, events, -loss, { category: 'other', description: `Cyberangriff: ${b.label}`, buildingId: b.id });
      insuranceClaim({ ...ctx, state: v }, 'cyber', loss, b.label);
      events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${b.label}: Systeme lahmgelegt, ${loss} ¢ Verlust.`, buildingId: String(b.id) });
    }
  }
  if (c.id === 'general_strike') {
    // handled through laborState in the engine (strike flag) — nothing to book here
  }
  void day;
}

function endCrisis(ctx: SimContext, day: number): void {
  const { state, events } = ctx;
  const c = state.crisis.active!;
  const def = CRISES[c.id]!;
  switch (c.id) {
    case 'energy_shortage':
      for (const d of state.districts) d.stats.energySupply = Math.min(100, d.stats.energySupply + 30 * (hasTech(state, 'fusion_cells') ? 0.5 : 1));
      break;
    case 'recession':
      for (const d of state.districts) d.stats.purchasingPower = Math.min(100, d.stats.purchasingPower / 0.85);
      break;
    case 'property_bubble':
      for (const d of state.districts) d.stats.landPrice = Math.max(100, Math.round(d.stats.landPrice * 0.65));
      state.crisis.bubbleApplied = false;
      events.emit({ type: 'log', tick: state.tick, level: 'danger', message: 'Die Immobilienblase platzt: Grundstückspreise −35 %. Wer jetzt verkauft, verliert.' });
      break;
    case 'harvest_failure':
      for (const g of ['vegetables', 'herbs', 'grain']) state.market.index[g] = Math.max(0.5, (state.market.index[g] ?? 1) / 1.5);
      break;
    case 'corp_scandal':
      for (const d of regionDistricts(state, 'neon_central')) d.stats.purchasingPower = Math.min(100, d.stats.purchasingPower / 0.88);
      break;
    case 'megacity_blackout':
      for (const d of regionDistricts(state, 'nova_eclipse')) d.stats.energySupply = Math.min(100, d.stats.energySupply + 40);
      break;
    default:
      break;
  }
  state.crisis.history.push({ id: c.id, startDay: c.startDay, endDay: day });
  if (state.crisis.history.length > 20) state.crisis.history.shift();
  state.crisis.lastCrisisEndDay = day;
  state.crisis.active = null;
  events.emit({ type: 'log', tick: state.tick, level: 'info', message: `Krise vorbei: ${def.name}.` });
}
