/**
 * Gastronomy operations (Phase 2 vertical slice).
 *
 * Every hour during opening time, guests arrive according to district
 * demand. Each served guest picks a dish from the menu that can actually be
 * cooked from stock, ingredients are consumed FIFO, dish quality depends on
 * ingredient quality, cook skill and kitchen upgrades, and the guest's
 * satisfaction feeds reputation and ratings. Staff, upgrades, hygiene and
 * supply orders all interact here.
 */

import type { SimContext } from '../core/context';
import type { Rng } from '../core/rng';
import type { GastronomyModel } from '../data/buildings';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { BACKGROUNDS, DIFFICULTIES } from '../data/difficulty';
import { RECIPES } from '../data/recipes';
import { INGREDIENTS } from '../data/ingredients';
import { UPGRADES, upgradeEffects } from '../data/upgrades';
import { book, canAfford } from '../economy/finance';
import { BUSINESS_HISTORY_LIMIT, type Building, type GameState, type GastronomyState } from '../state';
import { autoReorder, canMake, consumeForRecipe, spoilInventory, stepDeliveries } from './inventory';
import { closeStaffDay, createEmployee, generateCandidates, staffCapacity } from './staff';
import { applyVisitOutcome } from './population';
import { registerDemand } from './market';
import { techFactors } from './research';
import { crisisFactors } from './crises';
import { insuranceClaim } from './corporate';
import { weatherFactors } from './weather';

/**
 * Reorder targets sized for roughly 1.3 days of full-capacity service of the
 * enabled dishes, scaled down to fit 90 % of the storage room.
 */
export function suggestedReorderTargets(model: GastronomyModel, enabledRecipeIds: readonly string[], storage: number): Record<string, number> {
  const openHours = model.openHour < model.closeHour ? model.closeHour - model.openHour : 24 - model.openHour + model.closeHour;
  const dailyDishes = Math.min(model.seats * 2.2, model.cookRate * 1.1 * Math.max(1, model.startingStaff.filter((s) => s.role === 'cook').length)) * openHours;
  const recipes = enabledRecipeIds.map((id) => RECIPES[id]).filter((r): r is NonNullable<typeof r> => !!r);
  const appealSum = recipes.reduce((s, r) => s + r.appeal, 0) || 1;
  const need: Record<string, number> = {};
  for (const r of recipes) {
    const share = r.appeal / appealSum;
    for (const [ing, units] of Object.entries(r.ingredients)) need[ing] = (need[ing] ?? 0) + units * share * dailyDishes * 1.3;
  }
  for (const ing of Object.keys(model.startingStock)) if (!need[ing]) need[ing] = model.startingStock[ing]! * 0.5;
  const total = Object.values(need).reduce((s, v) => s + v, 0);
  const scale = total > storage * 0.9 ? (storage * 0.9) / total : 1;
  return Object.fromEntries(Object.entries(need).map(([k, v]) => [k, Math.max(5, Math.round(v * scale))]));
}

export function createBusinessState(model: GastronomyModel, rng: Rng, day: number, tick: number, districtSkillBias = 50): GastronomyState {
  const biz: GastronomyState = {
    kind: 'gastronomy',
    reputation: 35,
    quality: 50,
    hygiene: 85,
    rating: 0,
    reviewCount: 0,
    menu: model.recipes.map((recipeId, i) => ({ recipeId, price: RECIPES[recipeId]!.basePrice, enabled: i < model.enabledAtStart, soldToday: 0 })),
    inventory: [],
    orders: [],
    autoReorder: true,
    preferredSupplierId: 'market_runner',
    reorderTargets: suggestedReorderTargets(model, model.recipes.slice(0, model.enabledAtStart), model.storage),
    employees: [],
    candidates: [],
    upgrades: {},
    upgradeInProgress: null,
    nextEntityId: 1,
    hourGuests: 0,
    todayGuests: 0,
    todayRevenue: 0,
    todayCogs: 0,
    todayCosts: 0,
    todayPurchases: 0,
    todayTurnedAway: 0,
    todayLostNoIngredients: 0,
    todayWasteUnits: 0,
    todaySatisfactionSum: 0,
    todaySatisfactionCount: 0,
    todayQualitySum: 0,
    todayConsumed: {},
    todayCitizenVisits: 0,
    lifetimeGuests: 0,
    lifetimeRevenue: 0,
    history: [],
  };
  for (const [ingredientId, units] of Object.entries(model.startingStock)) {
    biz.inventory.push({ ingredientId, units, boughtDay: day, quality: 55, unitCost: INGREDIENTS[ingredientId]?.basePrice ?? 1 });
  }
  for (const s of model.startingStaff) biz.employees.push(createEmployee(biz, rng, s.role, s.skill, tick));
  generateCandidates(biz, rng, day, districtSkillBias);
  return biz;
}

/** Relative gastronomy demand per hour of day. */
const HOUR_PROFILE: readonly number[] = [
  0.55, 0.35, 0.2, 0.1, 0.05, 0.05, 0.15, 0.3, 0.35, 0.3, 0.35, 0.55, 1.0, 0.9, 0.5, 0.3, 0.3, 0.5, 0.9, 1.0, 0.9,
  0.8, 0.7, 0.6,
];

export function isOpen(model: GastronomyModel, hour: number): boolean {
  if (model.openHour < model.closeHour) return hour >= model.openHour && hour < model.closeHour;
  return hour >= model.openHour || hour < model.closeHour;
}

export interface DemandBreakdown {
  district: number;
  competition: number;
  safety: number;
  price: number;
  reputation: number;
  upgrades: number;
  modifiers: number;
  expectedPeakGuests: number;
}

/** Average price ratio of the enabled menu versus base prices (appeal weighted). */
export function menuPriceRatio(biz: GastronomyState): number {
  let w = 0;
  let sum = 0;
  for (const m of biz.menu) {
    if (!m.enabled) continue;
    const r = RECIPES[m.recipeId];
    if (!r) continue;
    w += r.appeal;
    sum += (m.price / r.basePrice) * r.appeal;
  }
  return w > 0 ? sum / w : 1;
}

/** Explains the demand multipliers of a business (used by the UI and tests). */
export function explainDemand(state: GameState, b: Building): DemandBreakdown | null {
  const def = BUILDING_DEFINITIONS[b.defId];
  const model = def?.business;
  const biz = b.business;
  if (!model || !biz || model.kind !== 'gastronomy' || biz.kind !== 'gastronomy') return null;
  const stats = state.districts[b.districtId]!.stats;
  const difficulty = DIFFICULTIES[state.player.difficulty];
  const background = BACKGROUNDS[state.player.background];

  const populationFactor = Math.min(1.5, 0.3 + 0.7 * Math.sqrt(stats.population / 30000));
  const district = (stats.demandFood / 60) * (0.4 + 0.6 * (stats.traffic / 100)) * populationFactor;

  let competition = 1 - stats.competition / 250;
  for (const id in state.buildings) {
    const other = state.buildings[id]!;
    if (other.id === b.id || other.owner !== 'player' || other.status !== 'operational' || !other.business) continue;
    const dist = Math.abs(other.x - b.x) + Math.abs(other.y - b.y);
    if (dist <= 6) competition *= 0.92;
  }

  const safety = (1 - stats.crime / 300) * (0.9 + (stats.attractiveness / 100) * 0.2);

  const ratio = menuPriceRatio(biz);
  const elasticity = 1.6 - stats.purchasingPower / 100;
  const price = Math.pow(Math.max(0.2, ratio), -elasticity);

  const reputation = 0.6 + (biz.reputation / 100) * 0.8;
  const upgrades = upgradeEffects(biz.upgrades).draw;
  const modifiers = difficulty.demandMultiplier * background.gastronomyBonus;

  const expectedPeakGuests = model.baseDraw * district * competition * safety * price * reputation * upgrades * modifiers;
  return { district, competition, safety, price, reputation, upgrades, modifiers, expectedPeakGuests };
}

export interface CapacityBreakdown {
  seats: number;
  seatCapacity: number;
  cookThroughput: number;
  serviceThroughput: number;
  capacity: number;
  upgrading: boolean;
  cooks: number;
  service: number;
  managers: number;
}

export function effectiveCapacity(b: Building, state?: GameState): CapacityBreakdown | null {
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  const biz = b.business;
  if (!model || !biz || model.kind !== 'gastronomy' || biz.kind !== 'gastronomy') return null;
  const fx = upgradeEffects(biz.upgrades);
  const techCook = state ? techFactors(state).cookRate : 1;
  const staff = staffCapacity(biz, model.cookRate * fx.cookRate * techCook, model.serviceRate);
  const seats = model.seats + fx.seats;
  const seatCapacity = seats * 2.2;
  const serviceThroughput = staff.service > 0 ? staff.serviceThroughput : staff.cookThroughput * 0.55; // cooks serve themselves, slowly
  const upgrading = biz.upgradeInProgress !== null;
  let capacity = Math.min(seatCapacity, staff.cookThroughput, serviceThroughput);
  if (upgrading) capacity *= 0.8;
  return {
    seats,
    seatCapacity,
    cookThroughput: staff.cookThroughput,
    serviceThroughput,
    capacity: Math.floor(capacity),
    upgrading,
    cooks: staff.cooks,
    service: staff.service,
    managers: staff.managers,
  };
}

export function priceBounds(recipeId: string): { min: number; max: number } | null {
  const r = RECIPES[recipeId];
  if (!r) return null;
  return { min: Math.max(1, Math.ceil(r.basePrice * 0.5)), max: Math.floor(r.basePrice * 2.5) };
}

/** Runs one hour of business for all operational player businesses. */
export function stepBusinessHour(ctx: SimContext, hour: number, day: number): void {
  const { state, rng } = ctx;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner !== 'player' || b.status !== 'operational' || !b.business) continue;
    const model = BUILDING_DEFINITIONS[b.defId]?.business;
    if (!model) continue;
    stepDeliveries(ctx, b, day);
    if (model.kind !== 'gastronomy' || b.business.kind !== 'gastronomy') continue;
    b.business.hourGuests = 0;
    if (!isOpen(model, hour)) continue;
    const curfew = state.politics?.laws?.curfew ?? 0;
    if (curfew === 1 && hour >= 1 && hour < 6) continue; // closed 01:00-06:00
    if (curfew === 2 && (hour >= 23 || hour < 6)) continue; // closed 23:00-06:00
    const breakdown = explainDemand(state, b);
    const cap = effectiveCapacity(b, state);
    if (!breakdown || !cap) continue;
    const biz = b.business;
    // Walk-ins from the aggregated population plus simulated citizens who chose this venue.
    const walkInShare = state.population.citizens.length > 0 ? 0.55 : 1;
    const expected = breakdown.expectedPeakGuests * HOUR_PROFILE[hour]! * rng.range(0.85, 1.15) * walkInShare * crisisFactors(state).demand * weatherFactors(state).walkIns;
    const citizenVisits = state.population.pendingVisits[b.id] ?? 0;
    biz.todayCitizenVisits += citizenVisits;
    const wanting = Math.max(0, Math.round(expected)) + citizenVisits;
    const attempts = Math.min(wanting, cap.capacity);
    biz.todayTurnedAway += wanting - attempts;
    if (attempts === 0) {
      if (citizenVisits > 0) applyVisitOutcome(state, b.id, citizenVisits, 0, 0, 0);
      continue;
    }
    const outcome = serveGuests(ctx, b, biz, model, attempts, cap, hour);
    biz.hourGuests = outcome.served;
    if (citizenVisits > 0) {
      const servedCitizens = Math.min(citizenVisits, outcome.served);
      applyVisitOutcome(state, b.id, citizenVisits, servedCitizens, outcome.avgSatisfaction, outcome.avgPrice);
    }
  }
}

interface ServeOutcome {
  served: number;
  avgSatisfaction: number;
  avgPrice: number;
}

function serveGuests(ctx: SimContext, b: Building, biz: GastronomyState, model: GastronomyModel, attempts: number, cap: CapacityBreakdown, _hour: number): ServeOutcome {
  const { state, rng } = ctx;
  const events = ctx.events;
  const fx = upgradeEffects(biz.upgrades);
  const tech = techFactors(state);
  const staff = staffCapacity(biz, model.cookRate, model.serviceRate);
  const utilization = cap.capacity > 0 ? attempts / Math.max(1, cap.capacity) : 1;
  const crowdingPenalty = Math.max(0, utilization - 0.85) * 60;
  const serviceBonus = staff.service > 0 ? (staff.serviceSkill - 50) * 0.12 : -8;
  let revenue = 0;
  let served = 0;
  let lost = 0;
  let satisfactionSum = 0;
  for (let i = 0; i < attempts; i++) {
    const choice = chooseDish(biz, rng);
    if (!choice) {
      lost++;
      continue;
    }
    const recipe = RECIPES[choice.recipeId]!;
    const consumed = consumeForRecipe(biz, choice.recipeId);
    if (!consumed) {
      lost++;
      continue;
    }
    for (const [ing, units] of Object.entries(recipe.ingredients)) {
      biz.todayConsumed[ing] = (biz.todayConsumed[ing] ?? 0) + units;
      registerDemand(state.market, ing, units);
    }
    const skillFactor = Math.min(1, (staff.cookSkill + 15) / (recipe.complexity + 15));
    const dishQuality = clamp(0.5 * consumed.quality + 50 * skillFactor + fx.quality * 0.6, 0, 100);
    const value = Math.pow(recipe.basePrice / Math.max(1, choice.price), 0.6);
    const satisfaction = clamp(
      0.55 * dishQuality + 22 * value + 0.15 * biz.hygiene + fx.satisfaction + tech.satisfaction + serviceBonus - crowdingPenalty + rng.gaussian() * 3,
      0,
      100,
    );
    biz.todaySatisfactionSum += satisfaction;
    biz.todaySatisfactionCount++;
    satisfactionSum += satisfaction;
    biz.todayQualitySum += dishQuality;
    biz.todayCogs += consumed.cost;
    choice.soldToday++;
    revenue += choice.price * tech.revenue;
    served++;
  }
  biz.todayLostNoIngredients += lost;
  biz.hygiene = clamp(biz.hygiene - served * model.hygieneLossPerGuest * fx.hygieneLoss, 0, 100);
  if (served > 0) {
    biz.todayGuests += served;
    biz.todayRevenue += revenue;
    biz.lifetimeGuests += served;
    biz.lifetimeRevenue += revenue;
    book(state, events, revenue, { category: 'sales', description: `${b.label}: ${served} Gäste`, buildingId: b.id });
  }
  if (lost > 0 && lost >= attempts * 0.5 && served === 0) {
    events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${b.label}: Keine Zutaten, Gäste gehen wieder. Bestelle nach.`, buildingId: String(b.id) });
  }
  return { served, avgSatisfaction: served > 0 ? satisfactionSum / served : 0, avgPrice: served > 0 ? revenue / served : 0 };
}

function chooseDish(biz: GastronomyState, rng: Rng): GastronomyState['menu'][number] | null {
  let total = 0;
  const weights: number[] = [];
  for (const m of biz.menu) {
    let w = 0;
    if (m.enabled && canMake(biz, m.recipeId)) {
      const r = RECIPES[m.recipeId]!;
      w = r.appeal * Math.pow(r.basePrice / Math.max(1, m.price), 1.2);
    }
    weights.push(w);
    total += w;
  }
  if (total <= 0) return null;
  let roll = rng.next() * total;
  for (let i = 0; i < biz.menu.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return biz.menu[i]!;
  }
  return biz.menu[biz.menu.length - 1]!;
}

/** Day close for businesses: upkeep, wages, spoilage, hygiene, reputation, history, reorders. */
export function closeBusinessDay(ctx: SimContext, day: number): void {
  const { state, events, rng } = ctx;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner !== 'player') continue;
    const def = BUILDING_DEFINITIONS[b.defId];
    if (!def) continue;
    if (b.status === 'operational' && def.upkeepPerDay > 0) {
      book(state, events, -Math.round(def.upkeepPerDay * techFactors(state).upkeep), { category: 'upkeep', description: `Betriebskosten: ${b.label}`, buildingId: b.id });
    }
    const biz = b.business;
    const model = def.business;
    if (!biz || !model || b.status !== 'operational') continue;
    if (biz.kind !== 'gastronomy' || model.kind !== 'gastronomy') continue;
    const cap = effectiveCapacity(b);
    const utilization = cap && cap.capacity > 0 ? biz.todayGuests / (cap.capacity * 10) : 0;
    const wages = closeStaffDay(ctx, b, utilization);

    // Hygiene: night cleaning by service staff and managers.
    const staff = staffCapacity(biz, model.cookRate, model.serviceRate);
    const cleaning = 8 + staff.service * 6 + staff.serviceSkill * 0.12 + (staff.managers > 0 ? 4 : 0) + (biz.upgrades.hygiene_station ?? 0) * 5;
    biz.hygiene = clamp(biz.hygiene + cleaning, 0, 100);
    let fines = 0;
    if (biz.hygiene < 35 && rng.chance(0.25)) {
      fines = 400;
      book(state, events, -fines, { category: 'fine', description: `Hygienekontrolle: ${b.label}`, buildingId: b.id });
      insuranceClaim(ctx, 'fine', fines, `Hygienekontrolle ${b.label}`);
      events.emit({ type: 'log', tick: state.tick, level: 'danger', message: `${b.label}: Hygienekontrolle, Bußgeld ${fines} ¢. Mehr Servicepersonal oder eine Hygienestation hilft.`, buildingId: String(b.id) });
    }

    const waste = spoilInventory(b, day + 1, state) * techFactors(state).waste;
    if (waste > 0) {
      events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${b.label}: ${Math.round(waste)} Einheiten Zutaten verdorben.`, buildingId: String(b.id) });
    }
    biz.todayWasteUnits += waste;

    // Reputation and rating from satisfaction.
    const count = biz.todaySatisfactionCount;
    const avgSat = count > 0 ? biz.todaySatisfactionSum / count : null;
    if (avgSat !== null) {
      biz.reputation = clamp(biz.reputation + (avgSat - biz.reputation) * 0.2, 0, 100);
      biz.quality = biz.todayQualitySum / count;
      const reviews = Math.max(1, Math.round(biz.todayGuests / 8));
      const newRating = 1 + (avgSat / 100) * 4;
      biz.rating = (biz.rating * biz.reviewCount + newRating * reviews) / (biz.reviewCount + reviews);
      biz.reviewCount += reviews;
    }
    if (biz.todayLostNoIngredients > 0) biz.reputation = clamp(biz.reputation - Math.min(6, biz.todayLostNoIngredients * 0.08), 0, 100);
    if (biz.todayTurnedAway > biz.todayGuests * 0.3 && biz.todayGuests > 0) {
      events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${b.label}: ${biz.todayTurnedAway} Gäste abgewiesen, die Kapazität reicht nicht.`, buildingId: String(b.id) });
    }

    // Manager: smart reorder targets from consumption.
    if (staff.managers > 0 && biz.autoReorder) {
      for (const [ing, units] of Object.entries(biz.todayConsumed)) biz.reorderTargets[ing] = Math.max(biz.reorderTargets[ing] ?? 0, Math.ceil(units * 1.6));
    }
    autoReorder(ctx, b);

    const costs = wages + def.upkeepPerDay + biz.todayPurchases + fines;
    biz.history.push({
      day,
      guests: biz.todayGuests,
      revenue: biz.todayRevenue,
      costs,
      cogs: biz.todayCogs,
      wages,
      purchases: biz.todayPurchases,
      satisfaction: avgSat ?? undefined,
      turnedAway: biz.todayTurnedAway,
      lostNoIngredients: biz.todayLostNoIngredients,
      waste: biz.todayWasteUnits,
    });
    if (biz.history.length > BUSINESS_HISTORY_LIMIT) biz.history.splice(0, biz.history.length - BUSINESS_HISTORY_LIMIT);
    biz.todayGuests = 0;
    biz.todayRevenue = 0;
    biz.todayCogs = 0;
    biz.todayCosts = 0;
    biz.todayPurchases = 0;
    biz.todayTurnedAway = 0;
    biz.todayLostNoIngredients = 0;
    biz.todayWasteUnits = 0;
    biz.todaySatisfactionSum = 0;
    biz.todaySatisfactionCount = 0;
    biz.todayQualitySum = 0;
    biz.todayConsumed = {};
    biz.todayCitizenVisits = 0;
    for (const m of biz.menu) m.soldToday = 0;
    generateCandidates(biz, rng, day + 1, state.districts[b.districtId]!.stats.purchasingPower);
  }
}

export function startUpgrade(ctx: SimContext, b: Building, upgradeId: string): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const biz = b.business;
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  if (!biz || !model) return { ok: false, error: 'Kein Betrieb.' };
  const def = UPGRADES[upgradeId];
  if (!def || !model.upgrades.includes(upgradeId)) return { ok: false, error: 'Dieser Ausbau ist hier nicht möglich.' };
  if (b.status !== 'operational') return { ok: false, error: 'Der Betrieb ist noch nicht eröffnet.' };
  if (biz.upgradeInProgress) return { ok: false, error: 'Es läuft bereits ein Ausbau.' };
  const level = (biz.upgrades[upgradeId] ?? 0) + 1;
  const spec = def.levels[level - 1];
  if (!spec) return { ok: false, error: `${def.name} ist bereits voll ausgebaut.` };
  const difficulty = DIFFICULTIES[state.player.difficulty];
  const cost = Math.round(spec.cost * difficulty.costMultiplier);
  if (!canAfford(state, cost)) return { ok: false, error: `Nicht genug Credits für ${def.name} Stufe ${level} (${cost} ¢).` };
  book(state, events, -cost, { category: 'upgrade', description: `${def.name} Stufe ${level}: ${b.label}`, buildingId: b.id });
  const minutes = difficulty.instantBuild ? 0 : spec.hours * 60;
  if (minutes === 0) {
    biz.upgrades[upgradeId] = level;
    events.emit({ type: 'log', tick: state.tick, level: 'success', message: `${b.label}: ${def.name} Stufe ${level} fertig.`, buildingId: String(b.id) });
  } else {
    biz.upgradeInProgress = { id: upgradeId, level, readyTick: state.tick + minutes };
    events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${b.label}: Umbau ${def.name} Stufe ${level} gestartet (${spec.hours} h, Kapazität −20 %).`, buildingId: String(b.id) });
  }
  return { ok: true };
}

/** Completes finished upgrades (called every tick). */
export function stepUpgrades(ctx: SimContext): void {
  const { state, events } = ctx;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    const biz = b.business;
    if (!biz?.upgradeInProgress || biz.upgradeInProgress.readyTick > state.tick) continue;
    const { id: upgradeId, level } = biz.upgradeInProgress;
    biz.upgrades[upgradeId] = level;
    biz.upgradeInProgress = null;
    events.emit({ type: 'log', tick: state.tick, level: 'success', message: `${b.label}: ${UPGRADES[upgradeId]?.name ?? upgradeId} Stufe ${level} fertig.`, buildingId: String(b.id) });
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
