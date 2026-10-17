/**
 * Hotels: travellers arrive daily depending on district attractiveness,
 * traffic and business activity; they stay one to three nights, pay on
 * check-in and judge comfort, cleanliness, reception service and price.
 */

import type { SimContext } from '../core/context';
import type { Rng } from '../core/rng';
import type { HotelModel } from '../data/buildings';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { DIFFICULTIES } from '../data/difficulty';
import { upgradeEffects } from '../data/upgrades';
import { book } from '../economy/finance';
import type { Building, GameState, HotelState } from '../state';
import { closeStaffDay, createEmployee, generateCandidates, roleThroughput, ROLES_BY_KIND } from './staff';
import { techFactors } from './research';
import { crisisFactors } from './crises';
import { insuranceClaim } from './corporate';

export function createHotelState(model: HotelModel, rng: Rng, day: number, tick: number, districtSkillBias: number): HotelState {
  const biz: HotelState = {
    kind: 'hotel',
    pricePerNight: model.basePricePerNight,
    stays: [],
    cleanliness: 85,
    reputation: 40,
    rating: 0,
    reviewCount: 0,
    employees: [],
    candidates: [],
    upgrades: {},
    upgradeInProgress: null,
    nextEntityId: 1,
    todayCheckIns: 0,
    todayTurnedAway: 0,
    todayRevenue: 0,
    todayCosts: 0,
    lifetimeGuests: 0,
    lifetimeRevenue: 0,
    history: [],
  };
  for (const s of model.startingStaff) biz.employees.push(createEmployee(biz, rng, s.role, s.skill, tick));
  generateCandidates(biz, rng, day, districtSkillBias, ROLES_BY_KIND.hotel!);
  return biz;
}

export function hotelRooms(b: Building): number {
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  if (!model || model.kind !== 'hotel' || b.business?.kind !== 'hotel') return 0;
  return model.rooms + upgradeEffects(b.business.upgrades).rooms;
}

export interface HotelDemand {
  district: number;
  price: number;
  reputation: number;
  comfort: number;
  expectedArrivals: number;
}

export function explainHotelDemand(state: GameState, b: Building): HotelDemand | null {
  const model = BUILDING_DEFINITIONS[b.defId]?.business;
  const biz = b.business;
  if (!model || model.kind !== 'hotel' || !biz || biz.kind !== 'hotel') return null;
  const stats = state.districts[b.districtId]!.stats;
  const difficulty = DIFFICULTIES[state.player.difficulty];
  const district = (0.4 + stats.attractiveness / 100) * (0.5 + stats.traffic / 150) * (0.6 + stats.politicalInfluence / 200);
  const ratio = biz.pricePerNight / model.basePricePerNight;
  const price = Math.pow(Math.max(0.2, ratio), -(1.5 - stats.purchasingPower / 150));
  const reputation = 0.55 + (biz.reputation / 100) * 0.9;
  const comfort = 0.8 + ((model.comfort + upgradeEffects(biz.upgrades).comfort + techFactors(state).comfort) / 100) * 0.4;
  const marketing = upgradeEffects(biz.upgrades).draw;
  const expectedArrivals = model.baseDemand * district * price * reputation * comfort * marketing * difficulty.demandMultiplier * crisisFactors(state).demand;
  return { district, price, reputation, comfort, expectedArrivals };
}

/** Hourly: arrivals spread over the day (afternoon/evening peak). */
export function stepHotelsHour(ctx: SimContext, hour: number, day: number): void {
  const { state, rng, events } = ctx;
  const profile = hour >= 14 && hour <= 22 ? 1 : hour >= 8 && hour < 14 ? 0.35 : 0.1;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner !== 'player' || b.status !== 'operational' || b.business?.kind !== 'hotel') continue;
    const model = BUILDING_DEFINITIONS[b.defId]?.business;
    if (!model || model.kind !== 'hotel') continue;
    const biz = b.business;
    const demand = explainHotelDemand(state, b)!;
    const arrivals = Math.round((demand.expectedArrivals / 9.5) * profile * rng.range(0.7, 1.3));
    if (arrivals <= 0) continue;
    const reception = roleThroughput(biz, 'reception', 1);
    const rooms = hotelRooms(b);
    const free = rooms - biz.stays.length;
    const serviceCap = reception.count > 0 ? Math.ceil(reception.throughput * 6) : 2; // self check-in is slow
    let accepted = Math.min(arrivals, free, serviceCap);
    if (biz.upgradeInProgress) accepted = Math.floor(accepted * 0.8);
    biz.todayTurnedAway += arrivals - accepted;
    if (accepted <= 0) continue;
    const fx = upgradeEffects(biz.upgrades);
    for (let i = 0; i < accepted; i++) {
      const nights = rng.int(1, 3);
      const vip = rng.chance(0.03 + (model.comfort + fx.comfort) / 2000);
      biz.stays.push({ checkoutDay: day + nights, vip });
      const price = biz.pricePerNight * nights * (vip ? 1.6 : 1);
      biz.todayRevenue += price;
      biz.lifetimeRevenue += price;
      biz.todayCheckIns++;
      biz.lifetimeGuests++;
      if (vip) events.emit({ type: 'log', tick: state.tick, level: 'info', message: `${b.label}: Ein VIP-Gast hat eingecheckt (${nights} Nächte, Aufpreis 60 %).`, buildingId: String(b.id) });
    }
    book(state, events, biz.pricePerNight * accepted, { category: 'sales', description: `${b.label}: ${accepted} Check-ins`, buildingId: b.id });
    // Multi-night revenue beyond the first night is booked as prepaid at check-in as well.
    const extra = biz.todayRevenue - biz.pricePerNight * accepted;
    void extra;
  }
}

/** Day close: checkouts, cleaning, costs, satisfaction, history. */
export function closeHotelsDay(ctx: SimContext, day: number): void {
  const { state, rng, events } = ctx;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner !== 'player' || b.status !== 'operational' || b.business?.kind !== 'hotel') continue;
    const model = BUILDING_DEFINITIONS[b.defId]?.business;
    if (!model || model.kind !== 'hotel') continue;
    const biz = b.business;
    const fx = upgradeEffects(biz.upgrades);
    const rooms = hotelRooms(b);
    const occupied = biz.stays.length;
    // Costs per occupied room-night.
    const roomCosts = Math.round(occupied * model.costPerRoomNight * fx.roomCost * techFactors(state).roomCost);
    if (roomCosts > 0) book(state, events, -roomCosts, { category: 'upkeep', description: `Zimmerkosten: ${b.label}`, buildingId: b.id });
    // Revenue for nights beyond the first was credited at check-in; book the remainder now so cash matches todayRevenue.
    const prepaid = biz.todayRevenue - biz.todayCheckIns * biz.pricePerNight;
    if (prepaid > 0.5) book(state, events, prepaid, { category: 'sales', description: `${b.label}: Vorauszahlungen weitere Nächte`, buildingId: b.id });
    const utilization = rooms > 0 ? occupied / rooms : 0;
    const wages = closeStaffDay(ctx, b, utilization);
    // Cleanliness: housekeeping restores, occupancy wears.
    const housekeeping = roleThroughput(biz, 'housekeeping', 1);
    const wear = occupied * 0.9 * (fx.roomCost < 1 ? 0.6 : 1);
    const cleaning = 6 + housekeeping.count * 9 + housekeeping.skill * 0.1 + (biz.upgrades.housekeeping_tech ?? 0) * 8;
    biz.cleanliness = clamp(biz.cleanliness - wear + cleaning, 0, 100);
    // Satisfaction of departing guests.
    const reception = roleThroughput(biz, 'reception', 1);
    const comfort = model.comfort + fx.comfort;
    const value = Math.pow(model.basePricePerNight / Math.max(1, biz.pricePerNight), 0.6);
    const security = roleThroughput(biz, 'security', 1).count > 0 || (biz.upgrades.security ?? 0) > 0 ? 4 : 0;
    const incidentChance = (state.districts[b.districtId]!.stats.crime / 100) * 0.08 * fx.security * (security ? 0.5 : 1);
    let satisfaction = clamp(0.35 * comfort + 0.3 * biz.cleanliness + 22 * value + (reception.skill - 50) * 0.15 + security + rng.gaussian() * 3, 0, 100);
    if (rng.chance(incidentChance)) {
      satisfaction -= 15;
      const loss = 600;
      book(state, events, -loss, { category: 'other', description: `Entschädigung nach Zwischenfall: ${b.label}`, buildingId: b.id });
      insuranceClaim(ctx, 'accident', loss, `Zwischenfall ${b.label}`);
      events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${b.label}: Diebstahl auf einem Zimmer gemeldet, ${loss} ¢ Entschädigung. Mehr Sicherheit hilft.`, buildingId: String(b.id) });
    }
    const departing = biz.stays.filter((s) => s.checkoutDay <= day + 1).length;
    biz.stays = biz.stays.filter((s) => s.checkoutDay > day + 1);
    if (departing > 0) {
      biz.reputation = clamp(biz.reputation + (satisfaction - biz.reputation) * 0.2, 0, 100);
      const reviews = Math.max(1, Math.round(departing / 3));
      biz.rating = (biz.rating * biz.reviewCount + (1 + (satisfaction / 100) * 4) * reviews) / (biz.reviewCount + reviews);
      biz.reviewCount += reviews;
    }
    if (biz.todayTurnedAway > rooms * 0.3) {
      events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${b.label}: ${biz.todayTurnedAway} Gäste abgewiesen. Mehr Zimmer oder Rezeption nötig.`, buildingId: String(b.id) });
    }
    const def = BUILDING_DEFINITIONS[b.defId]!;
    const costs = wages + roomCosts + def.upkeepPerDay;
    biz.history.push({ day, occupancy: utilization, revenue: biz.todayRevenue, costs, checkIns: biz.todayCheckIns, satisfaction: departing > 0 ? satisfaction : undefined });
    if (biz.history.length > 30) biz.history.shift();
    biz.todayCheckIns = 0;
    biz.todayTurnedAway = 0;
    biz.todayRevenue = 0;
    biz.todayCosts = 0;
    generateCandidates(biz, rng, day + 1, state.districts[b.districtId]!.stats.purchasingPower, ROLES_BY_KIND.hotel!);
  }
}

export function hotelPriceBounds(defId: string): { min: number; max: number } | null {
  const model = BUILDING_DEFINITIONS[defId]?.business;
  if (!model || model.kind !== 'hotel') return null;
  return { min: Math.ceil(model.basePricePerNight * 0.5), max: Math.floor(model.basePricePerNight * 2.5) };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
