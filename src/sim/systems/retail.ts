/**
 * Retail: a shop sells goods from its stock room at shelf prices. Customers
 * come from citizens (shopping trips) and walk-ins; each buys a basket of
 * available goods. Shrinkage follows district crime unless secured.
 */

import type { SimContext } from '../core/context';
import type { Rng } from '../core/rng';
import type { RetailModel } from '../data/buildings';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { BACKGROUNDS, DIFFICULTIES } from '../data/difficulty';
import { INGREDIENTS } from '../data/ingredients';
import { upgradeEffects } from '../data/upgrades';
import { effectiveUpkeep, stageEffects } from '../data/evolution';
import { book } from '../economy/finance';
import type { Building, GameState, RetailState } from '../state';
import { autoReorder, spoilInventory, stockOf, takeUnits } from './inventory';
import { registerDemand } from './market';
import { applyVisitOutcome } from './population';
import { closeStaffDay, createEmployee, generateCandidates, roleThroughput, ROLES_BY_KIND } from './staff';
import { techFactors } from './research';
import { crisisFactors, regionDemandFactor } from './crises';
import { insuranceClaim } from './corporate';

export function createRetailState(model: RetailModel, rng: Rng, day: number, tick: number, districtSkillBias: number): RetailState {
  const biz: RetailState = {
    kind: 'retail',
    prices: Object.fromEntries(model.goods.map((g) => [g, Math.round(INGREDIENTS[g]!.basePrice * (INGREDIENTS[g]!.retailMarkup ?? 2) * 10) / 10])),
    inventory: [],
    orders: [],
    autoReorder: true,
    preferredSupplierId: 'market_runner',
    reorderTargets: { ...model.startingStock },
    reputation: 40,
    employees: [],
    candidates: [],
    upgrades: {},
    upgradeInProgress: null,
    nextEntityId: 1,
    hourCustomers: 0,
    todayCustomers: 0,
    todayLostNoStock: 0,
    todayRevenue: 0,
    todayCogs: 0,
    todayPurchases: 0,
    todayShrinkage: 0,
    todayCitizenVisits: 0,
    lifetimeCustomers: 0,
    lifetimeRevenue: 0,
    history: [],
  };
  for (const [id, units] of Object.entries(model.startingStock)) {
    biz.inventory.push({ ingredientId: id, units, boughtDay: day, quality: 60, unitCost: INGREDIENTS[id]?.basePrice ?? 1 });
  }
  for (const s of model.startingStaff) biz.employees.push(createEmployee(biz, rng, s.role, s.skill, tick));
  generateCandidates(biz, rng, day, districtSkillBias, ROLES_BY_KIND.retail!);
  return biz;
}

export function isRetailOpen(model: RetailModel, hour: number): boolean {
  if (model.openHour < model.closeHour) return hour >= model.openHour && hour < model.closeHour;
  return hour >= model.openHour || hour < model.closeHour;
}

/** Shelf price relative to the typical markup, appeal weighted. */
export function retailPriceRatio(biz: RetailState): number {
  let n = 0;
  let sum = 0;
  for (const [id, price] of Object.entries(biz.prices)) {
    const def = INGREDIENTS[id];
    if (!def) continue;
    const typical = def.basePrice * (def.retailMarkup ?? 2);
    sum += price / typical;
    n++;
  }
  return n > 0 ? sum / n : 1;
}

export interface RetailDemand {
  district: number;
  price: number;
  reputation: number;
  upgrades: number;
  expectedPeakCustomers: number;
}

export function explainRetailDemand(state: GameState, b: Building): RetailDemand | null {
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  const biz = b.business;
  if (!model || model.kind !== 'retail' || !biz || biz.kind !== 'retail') return null;
  const stats = state.districts[b.districtId]!.stats;
  const difficulty = DIFFICULTIES[state.player.difficulty];
  const background = BACKGROUNDS[state.player.background];
  const district = (0.5 + stats.traffic / 100) * Math.min(1.5, 0.3 + 0.7 * Math.sqrt(stats.population / 30000)) * (0.7 + stats.purchasingPower / 200);
  const price = Math.pow(Math.max(0.2, retailPriceRatio(biz) / stageEffects(b).price), -(1.4 - stats.purchasingPower / 150));
  const reputation = 0.6 + (biz.reputation / 100) * 0.8;
  const upgrades = upgradeEffects(biz.upgrades).draw * stageEffects(b).draw;
  const expectedPeakCustomers = model.baseDraw * district * price * reputation * upgrades * difficulty.demandMultiplier * (background.id === 'street_kid' ? 1.1 : 1) * regionDemandFactor(state, b.districtId, 'retail');
  return { district, price, reputation, upgrades, expectedPeakCustomers };
}

const HOUR_PROFILE: readonly number[] = [0.5, 0.35, 0.25, 0.15, 0.1, 0.15, 0.35, 0.7, 0.6, 0.4, 0.4, 0.5, 0.7, 0.5, 0.4, 0.5, 0.7, 0.9, 1.0, 1.0, 0.9, 0.8, 0.7, 0.6];

export function stepRetailHour(ctx: SimContext, hour: number): void {
  const { state, rng, events } = ctx;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner !== state.playerId || b.status !== 'operational' || b.business?.kind !== 'retail') continue;
    const model = BUILDING_DEFINITIONS[b.defId]?.business;
    if (!model || model.kind !== 'retail') continue;
    const biz = b.business;
    biz.hourCustomers = 0;
    if (!isRetailOpen(model, hour)) continue;
    const demand = explainRetailDemand(state, b)!;
    const fx = upgradeEffects(biz.upgrades);
    const tech = techFactors(state);
    const clerks = roleThroughput(biz, 'clerk', model.clerkRate * fx.clerkRate * stageEffects(b).throughput);
    const capacity = clerks.count > 0 ? Math.floor(clerks.throughput * (biz.upgradeInProgress || b.stageUpgrade ? 0.8 : 1)) : 0;
    const walkIns = Math.round(demand.expectedPeakCustomers * HOUR_PROFILE[hour]! * rng.range(0.85, 1.15) * (state.population.citizens.length > 0 ? 0.6 : 1) * crisisFactors(state).demand);
    const citizenVisits = state.population.pendingVisits[b.id] ?? 0;
    biz.todayCitizenVisits += citizenVisits;
    const wanting = walkIns + citizenVisits;
    const attempts = Math.min(wanting, capacity);
    let served = 0;
    let revenue = 0;
    let lost = 0;
    let satisfactionSum = 0;
    for (let i = 0; i < attempts; i++) {
      // Basket: 1-3 goods the shop has in stock.
      const available = model.goods.filter((g) => stockOf(biz, g) >= 1);
      if (available.length === 0) {
        lost++;
        continue;
      }
      const items = Math.min(available.length, 1 + (rng.chance(0.5) ? 1 : 0) + (rng.chance(0.25) ? 1 : 0));
      let basket = 0;
      let cogs = 0;
      for (let k = 0; k < items; k++) {
        const good = rng.pick(available);
        const wanted = Math.max(1, Math.round(fx.basket * tech.basket * (good === 'cyber_parts' ? 1 : rng.int(1, 2))));
        const units = Math.min(wanted, Math.floor(stockOf(biz, good)));
        if (units <= 0) continue;
        const taken = takeUnits(biz, good, units);
        if (!taken) continue;
        const price = biz.prices[good] ?? INGREDIENTS[good]!.basePrice * 2;
        basket += price * units;
        cogs += taken.cost;
        registerDemand(state.market, good, units);
      }
      if (basket <= 0) {
        lost++;
        continue;
      }
      served++;
      revenue += basket;
      biz.todayCogs += cogs;
      const value = Math.pow(1 / Math.max(0.3, retailPriceRatio(biz)), 0.5);
      satisfactionSum += clamp(40 + 25 * value + (clerks.skill - 50) * 0.2 + fx.satisfaction + rng.gaussian() * 4, 0, 100);
    }
    biz.todayLostNoStock += lost;
    biz.hourCustomers = served;
    if (served > 0) {
      biz.todayCustomers += served;
      biz.lifetimeCustomers += served;
      biz.todayRevenue += revenue;
      biz.lifetimeRevenue += revenue;
      book(state, events, revenue, { category: 'sales', description: `${b.label}: ${served} Kunden`, buildingId: b.id });
    }
    if (citizenVisits > 0) applyVisitOutcome(state, b.id, citizenVisits, Math.min(citizenVisits, served), served > 0 ? satisfactionSum / served : 0, served > 0 ? revenue / served : 0);
    if (lost > attempts * 0.5 && attempts > 0 && served === 0) {
      events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${b.label}: Regale leer, Kunden gehen wieder.`, buildingId: String(b.id) });
    }
    // Shrinkage (theft) scales with crime and falls with security.
    const crime = state.districts[b.districtId]!.stats.crime / 100;
    const guard = roleThroughput(biz, 'security', 1).count > 0 ? 0.4 : 1;
    const shrink = served * 0.04 * crime * fx.security * guard * tech.shrink;
    if (shrink > 0) {
      const good = rng.pick(model.goods);
      const units = Math.min(stockOf(biz, good), shrink);
      if (units > 0) {
        takeUnits(biz, good, units);
        biz.todayShrinkage += units;
      }
    }
  }
}

export function closeRetailDay(ctx: SimContext, day: number): void {
  const { state, rng, events } = ctx;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner !== state.playerId || b.status !== 'operational' || b.business?.kind !== 'retail') continue;
    const model = BUILDING_DEFINITIONS[b.defId]?.business;
    if (!model || model.kind !== 'retail') continue;
    const biz = b.business;
    const clerks = roleThroughput(biz, 'clerk', model.clerkRate);
    const utilization = clerks.throughput > 0 ? biz.todayCustomers / (clerks.throughput * 16) : 0;
    const wages = closeStaffDay(ctx, b, utilization);
    const waste = spoilInventory(b, day + 1, state);
    if (waste > 0) events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${b.label}: ${Math.round(waste)} Einheiten Ware abgelaufen.`, buildingId: String(b.id) });
    if (biz.todayShrinkage > 0) insuranceClaim(ctx, 'theft', Math.round(biz.todayShrinkage * 2), `Schwund ${b.label}`);
    const stockedShare = model.goods.filter((g) => stockOf(biz, g) >= 1).length / model.goods.length;
    const target = clamp(25 + stockedShare * 40 + (clerks.skill - 40) * 0.3 + 15 * Math.pow(1 / Math.max(0.3, retailPriceRatio(biz)), 0.5) + rng.gaussian() * 2, 0, 100);
    biz.reputation = clamp(biz.reputation + (target - biz.reputation) * 0.2, 0, 100);
    if (biz.todayLostNoStock > biz.todayCustomers * 0.3 && biz.todayCustomers > 0) {
      events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${b.label}: ${biz.todayLostNoStock} Kunden ohne passende Ware. Nachbestellen!`, buildingId: String(b.id) });
    }
    if (biz.todayShrinkage > 3) {
      events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${b.label}: Schwund ${Math.round(biz.todayShrinkage)} Einheiten durch Ladendiebstahl.`, buildingId: String(b.id) });
    }
    autoReorder(ctx, b);
    const costs = wages + biz.todayPurchases + effectiveUpkeep(b);
    biz.history.push({ day, customers: biz.todayCustomers, revenue: biz.todayRevenue, costs, cogs: biz.todayCogs, purchases: biz.todayPurchases, shrinkage: biz.todayShrinkage });
    if (biz.history.length > 30) biz.history.shift();
    biz.todayCustomers = 0;
    biz.todayLostNoStock = 0;
    biz.todayRevenue = 0;
    biz.todayCogs = 0;
    biz.todayPurchases = 0;
    biz.todayShrinkage = 0;
    biz.todayCitizenVisits = 0;
    generateCandidates(biz, rng, day + 1, state.districts[b.districtId]!.stats.purchasingPower, ROLES_BY_KIND.retail!);
  }
}

export function retailPriceBounds(goodId: string, priceLevel = 1): { min: number; max: number } | null {
  const def = INGREDIENTS[goodId];
  if (!def) return null;
  const typical = def.basePrice * (def.retailMarkup ?? 2);
  return { min: Math.max(0.5, Math.round(typical * 0.5 * 10) / 10), max: Math.round(typical * 2.5 * priceLevel * 10) / 10 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
