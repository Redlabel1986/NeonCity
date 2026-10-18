/**
 * Industry: factories turn raw materials into goods. Production needs
 * workers, machines (upgrades), energy and inputs from the shared stock
 * room. Output feeds the player's own venues first (internal transfers at
 * cost) and surplus is sold to the wholesale market at the market index.
 */

import type { SimContext } from '../core/context';
import type { Rng } from '../core/rng';
import type { IndustryModel } from '../data/buildings';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { INGREDIENTS } from '../data/ingredients';
import { PRODUCTION } from '../data/production';
import { upgradeEffects } from '../data/upgrades';
import { effectiveUpkeep, stageEffects } from '../data/evolution';
import { regionDistance } from '../data/regions';
import { regionDemandFactor } from './crises';
import { awardMilestone, regionOfDistrict } from './progression';

/** Credits per unit and region crossed when a factory supplies an own venue. */
export const TRANSPORT_PER_UNIT_REGION = 0.2;
import { book } from '../economy/finance';
import type { Building, GameState, IndustryState } from '../state';
import { addLot, autoReorder, spoilInventory, stockOf, takeUnits, totalUnits, storageCapacity, type StockHolder } from './inventory';
import { marketFactor, registerDemand } from './market';
import { closeStaffDay, createEmployee, generateCandidates, roleThroughput, ROLES_BY_KIND } from './staff';
import { techFactors } from './research';

export function createIndustryState(model: IndustryModel, rng: Rng, day: number, tick: number, districtSkillBias: number): IndustryState {
  const biz: IndustryState = {
    kind: 'industry',
    lines: [],
    inventory: [],
    orders: [],
    autoReorder: true,
    preferredSupplierId: 'docks_wholesale',
    reorderTargets: { ...model.startingStock },
    sellSurplus: true,
    reserve: {},
    reputation: 40,
    employees: [],
    candidates: [],
    upgrades: {},
    upgradeInProgress: null,
    nextEntityId: 1,
    todayProduced: {},
    todayRevenue: 0,
    todayCogs: 0,
    todayPurchases: 0,
    todayEnergy: 0,
    lifetimeRevenue: 0,
    history: [],
  };
  for (const [id, units] of Object.entries(model.startingStock)) biz.inventory.push({ ingredientId: id, units, boughtDay: day, quality: 60, unitCost: INGREDIENTS[id]?.basePrice ?? 1 });
  for (const s of model.startingStaff) biz.employees.push(createEmployee(biz, rng, s.role, s.skill, tick));
  generateCandidates(biz, rng, day, districtSkillBias, ROLES_BY_KIND.industry!);
  biz.lines.push({ id: biz.nextEntityId++, recipeId: model.lines[0]!, targetPerDay: 120 });
  return biz;
}

/** Daily labour capacity in worker-hours and machine capacity in units. */
export function factoryCapacity(state: GameState, b: Building): { workerHours: number; machineUnits: number } | null {
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  const biz = b.business;
  if (!model || model.kind !== 'industry' || !biz || biz.kind !== 'industry') return null;
  const workers = roleThroughput(biz, 'worker', 8); // 8 productive hours per worker-day at skill 50
  const technicians = biz.employees.filter((e) => e.role === 'technician').length;
  const fx = upgradeEffects(biz.upgrades);
  const machineUnits = model.baseMachineUnits * fx.machines * stageEffects(b).capacity * (1 + Math.min(0.4, technicians * 0.1));
  const energy = state.districts[b.districtId]!.stats.energySupply / 100;
  const energyFactor = Math.min(1, 0.4 + energy * 0.7);
  return { workerHours: workers.throughput, machineUnits: machineUnits * energyFactor * (biz.upgradeInProgress || b.stageUpgrade ? 0.8 : 1) * regionDemandFactor(state, b.districtId, 'industry') };
}

/** Production lines a factory may run at its tier. */
export function maxLines(b: Building): number {
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  if (!model || model.kind !== 'industry') return 0;
  return model.maxLines + stageEffects(b).lines;
}

export function setLine(state: GameState, buildingId: number, lineId: number | null, recipeId: string, targetPerDay: number): { ok: true } | { ok: false; error: string } {
  const b = state.buildings[buildingId];
  const model = BUILDING_DEFINITIONS[b?.defId ?? '']?.business;
  const biz = b?.business;
  if (!b || b.owner !== state.playerId || !biz || biz.kind !== 'industry' || !model || model.kind !== 'industry') return { ok: false, error: 'Keine eigene Fabrik.' };
  if (!PRODUCTION[recipeId] || !model.lines.includes(recipeId)) return { ok: false, error: 'Diese Fabrik kann das nicht herstellen.' };
  const target = Math.max(0, Math.min(2000, Math.round(targetPerDay)));
  if (lineId === null) {
    if (biz.lines.length >= maxLines(b)) return { ok: false, error: `Höchstens ${maxLines(b)} Linien.` };
    biz.lines.push({ id: biz.nextEntityId++, recipeId, targetPerDay: target });
    return { ok: true };
  }
  const line = biz.lines.find((l) => l.id === lineId);
  if (!line) return { ok: false, error: 'Linie nicht gefunden.' };
  line.recipeId = recipeId;
  line.targetPerDay = target;
  return { ok: true };
}

export function removeLine(state: GameState, buildingId: number, lineId: number): { ok: true } | { ok: false; error: string } {
  const biz = state.buildings[buildingId]?.business;
  if (!biz || biz.kind !== 'industry') return { ok: false, error: 'Keine eigene Fabrik.' };
  const idx = biz.lines.findIndex((l) => l.id === lineId);
  if (idx < 0) return { ok: false, error: 'Linie nicht gefunden.' };
  biz.lines.splice(idx, 1);
  return { ok: true };
}

export function setSurplusPolicy(state: GameState, buildingId: number, sellSurplus: boolean, reserve?: Record<string, number>): { ok: true } | { ok: false; error: string } {
  const biz = state.buildings[buildingId]?.business;
  if (!biz || biz.kind !== 'industry') return { ok: false, error: 'Keine eigene Fabrik.' };
  biz.sellSurplus = sellSurplus;
  if (reserve) for (const [k, v] of Object.entries(reserve)) if (INGREDIENTS[k] && Number.isFinite(v)) biz.reserve[k] = Math.max(0, Math.round(v));
  return { ok: true };
}

/** Daily production for all factories. */
export function closeIndustryDay(ctx: SimContext, day: number): void {
  const { state, events, rng } = ctx;
  const tech = techFactors(state);
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner !== state.playerId || b.status !== 'operational' || b.business?.kind !== 'industry') continue;
    const model = BUILDING_DEFINITIONS[b.defId]?.business;
    if (!model || model.kind !== 'industry') continue;
    const biz = b.business;
    const cap = factoryCapacity(state, b)!;
    let hoursLeft = cap.workerHours;
    let unitsLeft = cap.machineUnits;
    let produced = 0;
    let energyCost = 0;
    const district = state.districts[b.districtId]!;
    const crisisEnergy = state.crisis.active?.id === 'energy_shortage' ? 0.6 : 1;
    unitsLeft *= crisisEnergy;
    for (const line of biz.lines) {
      const recipe = PRODUCTION[line.recipeId];
      if (!recipe || line.targetPerDay <= 0) continue;
      // How many units can we make: bounded by target, machines, labour and inputs.
      let units = Math.min(line.targetPerDay, unitsLeft, Math.floor(hoursLeft / Math.max(0.001, recipe.laborPerUnit)));
      for (const [input, perUnit] of Object.entries(recipe.inputs)) units = Math.min(units, Math.floor(stockOf(biz, input) / perUnit));
      units = Math.floor(units);
      if (units <= 0) continue;
      let cost = 0;
      for (const [input, perUnit] of Object.entries(recipe.inputs)) {
        const taken = takeUnits(biz, input, units * perUnit);
        if (taken) cost += taken.cost;
        registerDemand(state.market, input, units * perUnit);
      }
      const energy = units * recipe.energyPerUnit * tech.factoryEnergy * (state.crisis.active?.id === 'energy_shortage' ? 1.5 : 1);
      energyCost += energy;
      const quality = Math.max(30, Math.min(95, 50 + roleThroughput(biz, 'worker', 1).skill * 0.4 + (biz.upgrades.machines ?? 0) * 5));
      addLot(biz, { ingredientId: recipe.output, units, boughtDay: day, quality, unitCost: Math.round(((cost + energy) / units) * 100) / 100 });
      biz.todayProduced[recipe.output] = (biz.todayProduced[recipe.output] ?? 0) + units;
      produced += units;
      hoursLeft -= units * recipe.laborPerUnit;
      unitsLeft -= units;
      district.stats.pollution = Math.min(100, district.stats.pollution + (units / 100) * recipe.pollutionPer100 * (1 - (biz.upgrades.filters ?? 0) * 0.4));
    }
    if (energyCost > 0) book(state, events, -Math.round(energyCost), { category: 'upkeep', description: `${b.label}: Energie`, buildingId: b.id });
    biz.todayEnergy += energyCost;
    // Internal transfers: own venues pull finished goods at cost.
    internalTransfers(ctx, b, biz);
    // Surplus sale: megacorps hold supply contracts with competitors (95 % of base price) before the wholesale market (85 %).
    let revenue = 0;
    if (biz.sellSurplus && state.corporate.megacorp) {
      const buyers = Object.values(state.competitors).filter((c) => Math.abs(state.buildings[c.buildingId]!.x - b.x) + Math.abs(state.buildings[c.buildingId]!.y - b.y) <= 40);
      for (const goodId of ['noodles', 'broth', 'synthmeat', 'drinks']) {
        const def = INGREDIENTS[goodId];
        if (!def || buyers.length === 0) continue;
        const demand = Math.min(Math.floor(stockOf(biz, goodId) - (biz.reserve[goodId] ?? 0)), buyers.length * 12);
        if (demand <= 0) continue;
        const taken = takeUnits(biz, goodId, demand);
        if (!taken) continue;
        const price = def.basePrice * 0.95 * marketFactor(state.market, goodId);
        revenue += demand * price;
        biz.todayCogs += taken.cost;
        for (const c of buyers) c.cash -= (demand * price) / buyers.length;
      }
    }
    if (biz.sellSurplus) {
      for (const goodId of Object.keys(biz.todayProduced).concat(Object.keys(biz.reserve))) {
        const def = INGREDIENTS[goodId];
        if (!def) continue;
        const keep = biz.reserve[goodId] ?? 0;
        const surplus = Math.floor(stockOf(biz, goodId) - keep);
        if (surplus <= 0) continue;
        const taken = takeUnits(biz, goodId, surplus);
        if (!taken) continue;
        const price = def.basePrice * 0.85 * marketFactor(state.market, goodId);
        revenue += surplus * price;
        biz.todayCogs += taken.cost;
        // Selling into the market eases prices a little.
        state.market.index[goodId] = Math.max(0.6, (state.market.index[goodId] ?? 1) - surplus / 20000);
      }
    }
    if (revenue > 0) {
      revenue = Math.round(revenue);
      book(state, events, revenue, { category: 'sales', description: `${b.label}: Großhandelsverkauf`, buildingId: b.id });
      biz.todayRevenue += revenue;
      biz.lifetimeRevenue += revenue;
    }
    const wages = closeStaffDay(ctx, b, cap.workerHours > 0 ? Math.min(1, (cap.workerHours - hoursLeft) / cap.workerHours) : 0);
    const waste = spoilInventory(b, day + 1);
    if (waste > 0) events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${b.label}: ${Math.round(waste)} Einheiten verdorben.`, buildingId: String(b.id) });
    autoReorder(ctx, b);
    if (produced === 0 && biz.lines.length > 0) {
      events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${b.label}: Keine Produktion. Rohstoffe, Arbeiter oder Energie fehlen.`, buildingId: String(b.id) });
    }
    const costs = wages + effectiveUpkeep(b) + Math.round(energyCost) + biz.todayPurchases;
    biz.history.push({ day, revenue: biz.todayRevenue, costs, produced, purchases: biz.todayPurchases, energy: Math.round(energyCost), internal: biz.todayInternal ?? 0 });
    biz.todayInternal = 0;
    if (biz.history.length > 30) biz.history.shift();
    biz.todayProduced = {};
    biz.todayRevenue = 0;
    biz.todayCogs = 0;
    biz.todayPurchases = 0;
    biz.todayEnergy = 0;
    generateCandidates(biz, rng, day + 1, district.stats.purchasingPower, ROLES_BY_KIND.industry!);
    void totalUnits;
    void storageCapacity;
  }
}

/**
 * Moves finished goods from the factory into own venues that are below their
 * reorder targets. Goods crossing regions pay transport (per unit and region
 * crossed) and only half of the need moves per day two or more regions away.
 */
function internalTransfers(ctx: SimContext, factory: Building, biz: IndustryState): void {
  const { state, events } = ctx;
  let transportCost = 0;
  let moved = 0;
  for (const id in state.buildings) {
    const venue = state.buildings[id]!;
    if (venue.id === factory.id || venue.owner !== state.playerId || venue.status !== 'operational') continue;
    const holder = venue.business;
    if (!holder || (holder.kind !== 'gastronomy' && holder.kind !== 'retail')) continue;
    const target = holder as StockHolder;
    const distance = regionDistance(regionOfDistrict(state, factory.districtId), regionOfDistrict(state, venue.districtId));
    for (const [goodId, want] of Object.entries(target.reorderTargets)) {
      const have = stockOf(target, goodId);
      let need = Math.floor(want - have);
      if (distance >= 2) need = Math.floor(need / 2); // long haul: trucks arrive over two days
      if (need < 5) continue;
      const available = Math.floor(stockOf(biz, goodId));
      const units = Math.min(need, available);
      if (units <= 0) continue;
      transportCost += units * TRANSPORT_PER_UNIT_REGION * distance;
      moved += units;
      const taken = takeUnits(biz, goodId, units);
      if (!taken) continue;
      biz.todayInternal = (biz.todayInternal ?? 0) + units;
      addLot(target, { ingredientId: goodId, units, boughtDay: Math.floor((state.tick + 7 * 60) / 1440), quality: taken.quality, unitCost: Math.round((taken.cost / units) * 100) / 100 });
    }
  }
  if (transportCost > 0) book(state, events, -Math.round(transportCost), { category: 'upkeep', description: `Transport zwischen Regionen: ${factory.label}`, buildingId: factory.id });
  if (moved > 0) awardMilestone(state, events, 'supply_chain');
}
