/**
 * Taxi companies: vehicles, drivers, fares. Ride demand comes from citizens
 * who commute or go out (wealth and district traffic decide whether they
 * take a taxi) plus aggregated district traffic within the depot's radius.
 */

import type { SimContext } from '../core/context';
import type { Rng } from '../core/rng';
import type { TransportModel } from '../data/buildings';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { BACKGROUNDS, DIFFICULTIES } from '../data/difficulty';
import { upgradeEffects } from '../data/upgrades';
import { effectiveUpkeep, hasFeature, stageEffects } from '../data/evolution';
import { book, canAfford } from '../economy/finance';
import type { Building, GameState, TransportState, Vehicle } from '../state';
import { closeStaffDay, createEmployee, generateCandidates, effortOf, ROLES_BY_KIND } from './staff';
import { techFactors } from './research';
import { crisisFactors, regionDemandFactor } from './crises';
import { insuranceClaim } from './corporate';
import { weatherFactors } from './weather';

export function createTransportState(model: TransportModel, rng: Rng, day: number, tick: number, districtSkillBias: number): TransportState {
  const biz: TransportState = {
    kind: 'transport',
    fare: model.baseFare,
    vehicles: [],
    reputation: 45,
    employees: [],
    candidates: [],
    upgrades: {},
    upgradeInProgress: null,
    nextEntityId: 1,
    todayRides: 0,
    todayMissed: 0,
    todayRevenue: 0,
    todayCosts: 0,
    lifetimeRides: 0,
    lifetimeRevenue: 0,
    history: [],
  };
  for (let i = 0; i < model.startingVehicles; i++) biz.vehicles.push(newVehicle(biz, rng));
  for (const s of model.startingStaff) biz.employees.push(createEmployee(biz, rng, s.role, s.skill, tick));
  generateCandidates(biz, rng, day, districtSkillBias, ROLES_BY_KIND.transport!);
  return biz;
}

function newVehicle(biz: TransportState, rng: Rng): Vehicle {
  return { id: biz.nextEntityId++, condition: Math.round(rng.range(85, 100)), mileage: 0, repairUntilTick: 0 };
}

export interface RideDemand {
  citizens: number;
  districts: number;
  price: number;
  reputation: number;
  expectedPeakRides: number;
}

/** Ride demand reachable from the depot. */
export function explainRideDemand(state: GameState, b: Building): RideDemand | null {
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  const biz = b.business;
  if (!model || model.kind !== 'transport' || !biz || biz.kind !== 'transport') return null;
  const difficulty = DIFFICULTIES[state.player.difficulty];
  let districtsScore = 0;
  let citizens = 0;
  for (const d of state.districts) {
    const dist = Math.abs(d.cx - b.x) + Math.abs(d.cy - b.y);
    // District centres can be far from the depot; the depot's own district is always served well.
    let reach = Math.max(0, 1 - dist / (model.radius * stageEffects(b).radius * 2.2));
    if (d.id === b.districtId) reach = Math.max(reach, 0.7);
    if (reach <= 0) continue;
    districtsScore += (d.stats.traffic / 100) * (0.4 + d.stats.purchasingPower / 120) * reach;
    citizens += d.economy.citizens * reach;
  }
  const ratio = biz.fare / model.baseFare / stageEffects(b).price;
  const price = Math.pow(Math.max(0.2, ratio), -1.3);
  const reputation = 0.6 + (biz.reputation / 100) * 0.8;
  const expectedPeakRides = (6 * districtsScore + citizens * 0.02) * price * reputation * difficulty.demandMultiplier * regionDemandFactor(state, b.districtId, 'transport');
  return { citizens, districts: districtsScore, price, reputation, expectedPeakRides };
}

const HOUR_PROFILE: readonly number[] = [0.5, 0.4, 0.3, 0.15, 0.1, 0.15, 0.4, 1.0, 1.0, 0.7, 0.5, 0.5, 0.6, 0.5, 0.5, 0.6, 0.8, 1.0, 1.0, 0.8, 0.7, 0.7, 0.8, 0.7];

export function fleetCapacity(b: Building, state?: GameState): { drivers: number; available: number; ridesPerHour: number } | null {
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  const biz = b.business;
  if (!model || model.kind !== 'transport' || !biz || biz.kind !== 'transport') return null;
  const fx = upgradeEffects(biz.upgrades);
  const available = biz.vehicles.filter((v) => v.repairUntilTick === 0 && v.condition > 10).length;
  const drivers = biz.employees.filter((e) => e.role === 'driver' && !e.training);
  let rides = 0;
  const active = Math.min(drivers.length, available);
  drivers.slice(0, active).forEach((d) => {
    rides += model.ridesPerDriverHour * stageEffects(b).throughput * (0.6 + (d.skill / 100) * 0.8) * effortOf(d);
  });
  // Driverless stages: vehicles without a driver still run, at 70 % of a skilled driver's rate.
  if (hasFeature(b, 'driverless')) rides += Math.max(0, available - active) * model.ridesPerDriverHour * stageEffects(b).throughput * 0.7;
  // Dispatchers route the fleet: +10 % each, up to three.
  const dispatchers = biz.employees.filter((e) => e.role === 'dispatcher').length;
  rides *= (1 + 0.1 * Math.min(3, dispatchers)) * (hasFeature(b, 'dispatch') ? 1.15 : 1);
  return { drivers: drivers.length, available, ridesPerHour: rides * fx.rides * (state ? techFactors(state).rides : 1) };
}

export function stepTransportHour(ctx: SimContext, hour: number): void {
  const { state, rng, events } = ctx;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner !== state.playerId || b.status !== 'operational' || b.business?.kind !== 'transport') continue;
    const model = BUILDING_DEFINITIONS[b.defId]?.business;
    if (!model || model.kind !== 'transport') continue;
    const biz = b.business;
    const demand = explainRideDemand(state, b)!;
    const cap = fleetCapacity(b, state)!;
    const wanting = Math.round(demand.expectedPeakRides * HOUR_PROFILE[hour]! * rng.range(0.8, 1.2) * crisisFactors(state).demand * weatherFactors(state).taxi);
    // Drivers work shifts: assume 14 active hours (06-20) full, otherwise 60 %.
    const shift = hour >= 6 && hour < 20 ? 1 : 0.6;
    const possible = Math.floor(cap.ridesPerHour * shift);
    const rides = Math.min(wanting, possible);
    biz.todayMissed += Math.max(0, wanting - rides);
    if (rides <= 0) continue;
    const fx = upgradeEffects(biz.upgrades);
    const revenue = rides * biz.fare;
    const energy = rides * model.energyPerRide * fx.energy;
    biz.todayRides += rides;
    biz.lifetimeRides += rides;
    biz.todayRevenue += revenue;
    biz.lifetimeRevenue += revenue;
    biz.todayCosts += energy;
    book(state, events, revenue, { category: 'sales', description: `${b.label}: ${rides} Fahrten`, buildingId: b.id });
    book(state, events, -energy, { category: 'upkeep', description: `${b.label}: Energie`, buildingId: b.id });
    // Wear and accidents.
    const active = biz.vehicles.filter((v) => v.repairUntilTick === 0 && v.condition > 10);
    const perVehicle = rides / Math.max(1, active.length);
    for (const v of active) {
      v.mileage += perVehicle * 6;
      v.condition = Math.max(0, v.condition - perVehicle * 0.35 * fx.wear * (BACKGROUNDS[state.player.background].perks?.vehicleWear ?? 1));
      const accident = 0.0015 * perVehicle * (1.5 - v.condition / 100);
      if (rng.chance(accident)) {
        const cost = Math.round((1500 + rng.range(0, 2500)) * fx.repair);
        v.condition = Math.max(5, v.condition - 30);
        v.repairUntilTick = state.tick + rng.int(12, 36) * 60;
        book(state, events, -cost, { category: 'upkeep', description: `${b.label}: Unfallreparatur`, buildingId: b.id });
        insuranceClaim(ctx, 'accident', cost, `Unfall ${b.label}`);
        biz.todayCosts += cost;
        biz.reputation = Math.max(0, biz.reputation - 4);
        events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${b.label}: Unfall mit Fahrzeug ${v.id}. Reparatur ${cost} ¢, Ausfall ${Math.round((v.repairUntilTick - state.tick) / 60)} h.`, buildingId: String(b.id) });
      }
    }
    for (const v of biz.vehicles) if (v.repairUntilTick > 0 && v.repairUntilTick <= state.tick) v.repairUntilTick = 0;
  }
}

export function closeTransportDay(ctx: SimContext, day: number): void {
  const { state, rng, events } = ctx;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner !== state.playerId || b.status !== 'operational' || b.business?.kind !== 'transport') continue;
    const model = BUILDING_DEFINITIONS[b.defId]?.business;
    if (!model || model.kind !== 'transport') continue;
    const biz = b.business;
    const fx = upgradeEffects(biz.upgrades);
    const cap = fleetCapacity(b)!;
    const utilization = cap.ridesPerHour > 0 ? biz.todayRides / (cap.ridesPerHour * 16) : 0;
    const wages = closeStaffDay(ctx, b, utilization);
    // Routine maintenance restores condition a little; vehicles below 30 % go to the shop automatically.
    let maintenance = 0;
    for (const v of biz.vehicles) {
      v.condition = Math.min(100, v.condition + 1.5);
      if (v.condition < 30 && v.repairUntilTick === 0) {
        const cost = Math.round(900 * fx.repair);
        maintenance += cost;
        v.condition = 85;
        v.repairUntilTick = state.tick + 10 * 60;
      }
    }
    if (maintenance > 0) book(state, events, -maintenance, { category: 'upkeep', description: `${b.label}: Wartung`, buildingId: b.id });
    // Reputation: punctuality (missed rides) and vehicle condition.
    const avgCondition = biz.vehicles.length > 0 ? biz.vehicles.reduce((s, v) => s + v.condition, 0) / biz.vehicles.length : 0;
    const served = biz.todayRides / Math.max(1, biz.todayRides + biz.todayMissed);
    const target = clamp(30 + served * 45 + avgCondition * 0.25 + rng.gaussian() * 2, 0, 100);
    biz.reputation = clamp(biz.reputation + (target - biz.reputation) * 0.2, 0, 100);
    if (biz.todayMissed > biz.todayRides * 0.5 && biz.todayRides > 0) {
      events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${b.label}: ${biz.todayMissed} Fahrten verpasst. Mehr Fahrzeuge oder Fahrer nötig.`, buildingId: String(b.id) });
    }
    const costs = wages + biz.todayCosts + maintenance + effectiveUpkeep(b);
    biz.history.push({ day, rides: biz.todayRides, missed: biz.todayMissed, revenue: biz.todayRevenue, costs });
    if (biz.history.length > 30) biz.history.shift();
    biz.todayRides = 0;
    biz.todayMissed = 0;
    biz.todayRevenue = 0;
    biz.todayCosts = 0;
    generateCandidates(biz, rng, day + 1, state.districts[b.districtId]!.stats.purchasingPower, ROLES_BY_KIND.transport!);
  }
}

export function buyVehicle(ctx: SimContext, b: Building): { ok: true } | { ok: false; error: string } {
  const { state, events, rng } = ctx;
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  const biz = b.business;
  if (!model || model.kind !== 'transport' || !biz || biz.kind !== 'transport') return { ok: false, error: 'Kein Taxiunternehmen.' };
  if (biz.vehicles.length >= 12) return { ok: false, error: 'Das Depot fasst höchstens zwölf Fahrzeuge.' };
  const price = Math.round(model.vehiclePrice * DIFFICULTIES[state.player.difficulty].costMultiplier);
  if (!canAfford(state, price)) return { ok: false, error: `Nicht genug Credits für ein Fahrzeug (${price} ¢).` };
  book(state, events, -price, { category: 'construction', description: `Fahrzeugkauf: ${b.label}`, buildingId: b.id });
  biz.vehicles.push(newVehicle(biz, rng));
  return { ok: true };
}

export function sellVehicle(ctx: SimContext, b: Building, vehicleId: number): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  const biz = b.business;
  if (!model || model.kind !== 'transport' || !biz || biz.kind !== 'transport') return { ok: false, error: 'Kein Taxiunternehmen.' };
  const idx = biz.vehicles.findIndex((v) => v.id === vehicleId);
  if (idx < 0) return { ok: false, error: 'Fahrzeug nicht gefunden.' };
  const v = biz.vehicles[idx]!;
  const value = Math.round(model.vehiclePrice * 0.45 * (v.condition / 100));
  biz.vehicles.splice(idx, 1);
  book(state, events, value, { category: 'refund', description: `Fahrzeugverkauf: ${b.label}`, buildingId: b.id });
  return { ok: true };
}

export function fareBounds(defId: string, priceLevel = 1): { min: number; max: number } | null {
  const model = BUILDING_DEFINITIONS[defId]?.business;
  if (!model || model.kind !== 'transport') return null;
  return { min: Math.ceil(model.baseFare * 0.5), max: Math.floor(model.baseFare * 2.5 * priceLevel) };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
