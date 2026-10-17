/**
 * Population: a layer of simulated citizens on top of the aggregated district
 * population. Citizens have homes, jobs, incomes, needs and preferences.
 * Each hour they decide what to do; at meal times they may eat out and choose
 * a venue (player business or AI competitor) by reputation, price, loyalty
 * and distance. Their visits become real guests of the venues.
 */

import type { SimContext } from '../core/context';
import type { Rng } from '../core/rng';
import type { Building, Citizen, District, GameState, PopulationState } from '../state';
import { randomName } from '../data/names';
import { DISTRICT_ARCHETYPES } from '../data/districts';
import { BUILDING_DEFINITIONS } from '../data/buildings';
import { menuPriceRatio } from './business';
import { retailPriceRatio } from './retail';
import { weatherFactors } from './weather';

/** Citizens per 1000 aggregated residents (agent density). */
const AGENTS_PER_THOUSAND = 7;
const MAX_CITIZENS = 2400;

export interface Venue {
  id: number; // building id
  kind: 'gastronomy' | 'retail';
  districtId: number;
  x: number;
  y: number;
  priceLevel: number;
  reputation: number;
  isPlayer: boolean;
  open: boolean;
}

function isOpenAt(openHour: number, closeHour: number, hour: number): boolean {
  return openHour < closeHour ? hour >= openHour && hour < closeHour : hour >= openHour || hour < closeHour;
}

export function createPopulation(): PopulationState {
  return { citizens: [], nextCitizenId: 1, pendingVisits: {} };
}

/** Generates citizens for all districts (called once per new game / migration). */
export function generateCitizens(state: GameState, rng: Rng): void {
  const pop = state.population;
  const residentialByDistrict = new Map<number, Building[]>();
  const workplacesByDistrict = new Map<number, Building[]>();
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner !== 'city') continue;
    const style = b.cityStyle ?? '';
    const residential = style === 'old' || style === 'undercity' || style === 'skyline' || style === 'ghost' || (style === 'market' && b.floors >= 3);
    if (residential) push(residentialByDistrict, b.districtId, b);
    push(workplacesByDistrict, b.districtId, b);
  }
  const total = state.districts.reduce((s, d) => s + d.stats.population, 0);
  const scale = Math.min(1, MAX_CITIZENS / ((total / 1000) * AGENTS_PER_THOUSAND));
  for (const d of state.districts) {
    const count = Math.round(((d.stats.population / 1000) * AGENTS_PER_THOUSAND) * scale);
    const homes = residentialByDistrict.get(d.id) ?? workplacesByDistrict.get(d.id) ?? [];
    if (homes.length === 0) continue;
    const employment = 0.55 + d.stats.purchasingPower / 250; // 0.55 .. 0.95
    for (let i = 0; i < count; i++) {
      const home = rng.pick(homes);
      const employed = rng.chance(employment);
      let work: Building | null = null;
      if (employed) {
        // Most people work in their own or a neighbouring, richer district.
        const workDistrict = rng.chance(0.65) ? d : rng.pick(state.districts);
        const places = workplacesByDistrict.get(workDistrict.id) ?? [];
        work = places.length > 0 ? rng.pick(places) : null;
      }
      const baseIncome = 40 + d.stats.purchasingPower * 1.6;
      const income = work ? Math.round(baseIncome * rng.range(0.6, 1.5)) : 0;
      const workStart = rng.int(6, 10);
      pop.citizens.push({
        id: pop.nextCitizenId++,
        name: randomName(rng),
        age: rng.int(18, 72),
        districtId: d.id,
        homeBuildingId: home.id,
        workBuildingId: work?.id ?? null,
        income,
        wealth: Math.round(income * rng.range(2, 12)),
        priceSensitivity: clamp(1 - d.stats.purchasingPower / 100 + rng.gaussian() * 0.15, 0.05, 1),
        qualityPreference: clamp(d.stats.purchasingPower / 100 + rng.gaussian() * 0.2, 0.05, 1),
        hunger: rng.next(),
        workStart,
        workEnd: workStart + rng.int(7, 10),
        activity: 'sleep',
        favorites: [],
        visitsToday: 0,
        spentToday: 0,
      });
    }
  }
  updateDistrictCensus(state);
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Collects all gastronomy venues (player and competitors) for the choice model. */
export function collectVenues(state: GameState, hour: number): Venue[] {
  const venues: Venue[] = [];
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner === 'player' && b.status === 'operational' && b.business) {
      const model = BUILDING_DEFINITIONS[b.defId]?.business;
      if (!model) continue;
      if (model.kind === 'gastronomy' && b.business.kind === 'gastronomy') {
        venues.push({ id: b.id, kind: 'gastronomy', districtId: b.districtId, x: b.x, y: b.y, priceLevel: menuPriceRatio(b.business), reputation: b.business.reputation, isPlayer: true, open: isOpenAt(model.openHour, model.closeHour, hour) });
      } else if (model.kind === 'retail' && b.business.kind === 'retail') {
        venues.push({ id: b.id, kind: 'retail', districtId: b.districtId, x: b.x, y: b.y, priceLevel: retailPriceRatio(b.business), reputation: b.business.reputation, isPlayer: true, open: isOpenAt(model.openHour, model.closeHour, hour) });
      }
    }
  }
  for (const key in state.competitors) {
    const c = state.competitors[key]!;
    const b = state.buildings[c.buildingId];
    if (!b) continue;
    venues.push({ id: c.buildingId, kind: 'gastronomy', districtId: c.districtId, x: b.x, y: b.y, priceLevel: c.priceLevel, reputation: c.reputation, isPlayer: false, open: hour >= 11 || hour < 1 });
  }
  return venues;
}

/** Probability that a citizen wants to eat out at this hour. */
function eatOutDrive(hour: number, c: Citizen, district: District): number {
  const meal = hour === 12 || hour === 13 ? 1 : hour >= 18 && hour <= 21 ? 0.9 : hour >= 22 || hour < 1 ? 0.35 : hour === 11 || hour === 14 ? 0.3 : 0;
  if (meal === 0) return 0;
  const affordability = c.wealth > 40 ? 1 : 0.3;
  const habit = 0.12 + district.stats.purchasingPower / 300 + (c.workBuildingId !== null && (hour === 12 || hour === 13) ? 0.1 : 0);
  return meal * habit * affordability * (0.5 + c.hunger);
}

/** Hourly step: activities, hunger, venue choices. */
export function stepPopulationHour(ctx: SimContext, hour: number): void {
  const { state, rng } = ctx;
  const pop = state.population;
  if (pop.citizens.length === 0) return;
  const allVenues = collectVenues(state, hour).filter((v) => v.open);
  const venues = allVenues.filter((v) => v.kind === 'gastronomy');
  const shops = allVenues.filter((v) => v.kind === 'retail');
  const venuesByDistrict = new Map<number, Venue[]>();
  for (const v of venues) push(venuesByDistrict, v.districtId, v);
  const outdoor = weatherFactors(state).outdoor;
  const shopDrive = (hour >= 17 && hour <= 22 ? 0.07 : hour >= 7 && hour <= 9 ? 0.03 : hour >= 10 && hour <= 16 ? 0.015 : 0) * outdoor;
  const buildings = state.buildings;
  pop.pendingVisits = {};
  for (const c of pop.citizens) {
    const working = c.workBuildingId !== null && hour >= c.workStart && hour < c.workEnd;
    c.hunger = clamp(c.hunger + 0.09, 0, 1);
    if (hour < 6 || hour >= 23) c.activity = 'sleep';
    else if (working) c.activity = hour === c.workStart ? 'commute' : 'work';
    else if (c.workBuildingId !== null && hour === c.workEnd) c.activity = 'commute';
    else c.activity = hour >= 18 ? 'leisure' : 'home';
    if (c.activity === 'sleep') continue;
    const district = state.districts[c.districtId]!;
    // Shopping trips to player shops.
    if (shops.length > 0 && shopDrive > 0 && c.wealth > 20 && rng.chance(shopDrive * (0.6 + district.stats.purchasingPower / 150))) {
      const atShop = working && c.workBuildingId !== null ? buildings[c.workBuildingId] : buildings[c.homeBuildingId];
      if (atShop) {
        const shop = chooseVenue(c, shops, atShop.x, atShop.y, rng);
        if (shop) {
          pop.pendingVisits[shop.id] = (pop.pendingVisits[shop.id] ?? 0) + 1;
          c.visitsToday++;
        }
      }
    }
    const drive = eatOutDrive(hour, c, district) * (0.6 + outdoor * 0.4);
    if (drive <= 0 || !rng.chance(drive)) continue;
    // Where is the citizen now? At work during work hours, else at home.
    const at = working && c.workBuildingId !== null ? buildings[c.workBuildingId] : buildings[c.homeBuildingId];
    if (!at) continue;
    const local = venuesByDistrict.get(at.districtId) ?? [];
    const candidates = local.length >= 3 ? local : venues;
    if (candidates.length === 0) continue;
    const choice = chooseVenue(c, candidates, at.x, at.y, rng);
    if (!choice) continue;
    pop.pendingVisits[choice.id] = (pop.pendingVisits[choice.id] ?? 0) + 1;
    c.activity = 'eat';
    c.hunger = 0;
    c.visitsToday++;
  }
}

function chooseVenue(c: Citizen, venues: Venue[], x: number, y: number, rng: Rng): Venue | null {
  let best: Venue | null = null;
  let bestScore = -Infinity;
  for (const v of venues) {
    const dist = Math.abs(v.x - x) + Math.abs(v.y - y);
    if (dist > 30) continue;
    const loyalty = c.favorites.find((f) => f.venueId === v.id)?.score ?? 0;
    const score =
      (v.reputation / 100) * (0.6 + c.qualityPreference * 0.8) -
      c.priceSensitivity * (v.priceLevel - 1) * 1.2 +
      loyalty * 0.5 -
      dist / 45 +
      rng.gaussian() * 0.18;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return bestScore > -0.6 ? best : null;
}

/** Applies the outcome of visits (served or not, satisfaction) to loyalty. */
export function applyVisitOutcome(state: GameState, venueId: number, visitors: number, served: number, satisfaction: number, pricePaid: number): void {
  if (visitors <= 0) return;
  const pop = state.population;
  const servedShare = served / visitors;
  const sample = Math.min(visitors, 40);
  // Find citizens that are eating right now (cheap approximation: those with activity 'eat' who could have chosen this venue).
  let applied = 0;
  for (const c of pop.citizens) {
    if (c.activity !== 'eat') continue;
    if (applied >= sample) break;
    applied++;
    c.spentToday += pricePaid;
    c.wealth = Math.max(0, c.wealth - pricePaid);
    const district = state.districts[c.districtId]!;
    district.economy.dailySpending += pricePaid;
    district.economy.dailyVisits += 1;
    const delta = servedShare >= 1 ? (satisfaction - 55) / 100 : -0.25;
    const fav = c.favorites.find((f) => f.venueId === venueId);
    if (fav) fav.score = clamp(fav.score + delta, -1, 1);
    else {
      c.favorites.push({ venueId, score: clamp(delta, -1, 1) });
      if (c.favorites.length > 3) c.favorites.sort((a, b) => b.score - a.score).pop();
    }
  }
}

/** Day close: incomes, rent, census, district drift. */
export function closePopulationDay(ctx: SimContext): void {
  const { state, rng } = ctx;
  const pop = state.population;
  for (const d of state.districts) {
    d.economy.dailyWages = 0;
    d.economy.dailyRent = 0;
  }
  for (const c of pop.citizens) {
    const d = state.districts[c.districtId]!;
    const rent = Math.round(d.stats.rentIndex * 0.9 + 10);
    c.wealth = Math.max(0, c.wealth + c.income - rent - 12);
    d.economy.dailyWages += c.income;
    d.economy.dailyRent += rent;
    c.visitsToday = 0;
    c.spentToday = 0;
    // Job churn: small chance to lose or find a job.
    if (c.workBuildingId !== null && rng.chance(0.004)) {
      c.workBuildingId = null;
      c.income = 0;
    } else if (c.workBuildingId === null && rng.chance(0.03)) {
      const places = Object.values(state.buildings).filter((b) => b.owner === 'city' && b.districtId === c.districtId);
      if (places.length > 0) {
        c.workBuildingId = rng.pick(places).id;
        c.income = Math.round((40 + d.stats.purchasingPower * 1.6) * rng.range(0.6, 1.5));
      }
    }
    // Favourites fade slowly.
    for (const f of c.favorites) f.score *= 0.97;
  }
  updateDistrictCensus(state);
  // District drift: purchasing power follows employment and spending, slowly and bounded.
  for (const d of state.districts) {
    const e = d.economy;
    if (e.citizens === 0) continue;
    const employment = e.employed / e.citizens;
    const base = DISTRICT_ARCHETYPES[d.archetype].stats.purchasingPower;
    const target = base * (0.75 + employment * 0.3);
    d.stats.purchasingPower = clamp(d.stats.purchasingPower + clamp((target - d.stats.purchasingPower) * 0.05, -1, 1), 5, 100);
    d.stats.competition = clamp(Math.round(10 + e.venues * 9), 0, 100);
    e.dailySpending = 0;
    e.dailyVisits = 0;
  }
}

export function updateDistrictCensus(state: GameState): void {
  for (const d of state.districts) {
    d.economy.citizens = 0;
    d.economy.employed = 0;
    d.economy.venues = 0;
  }
  for (const c of state.population.citizens) {
    const e = state.districts[c.districtId]!.economy;
    e.citizens++;
    if (c.workBuildingId !== null) e.employed++;
  }
  for (const key in state.competitors) state.districts[state.competitors[key]!.districtId]!.economy.venues++;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.owner === 'player' && b.business && b.status === 'operational') state.districts[b.districtId]!.economy.venues++;
  }
}

export function createDistrictEconomy(): District['economy'] {
  return { citizens: 0, employed: 0, dailyWages: 0, dailyRent: 0, dailySpending: 0, dailyVisits: 0, venues: 0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
