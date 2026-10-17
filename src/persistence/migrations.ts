/**
 * Save-format migrations. Each entry upgrades FROM the given version to the
 * next one. Migrations operate on plain JSON objects.
 */

import { Rng } from '../sim/core/rng';
import { BUILDING_DEFINITIONS } from '../sim/data/buildings';
import { createBusinessState } from '../sim/systems/business';
import { createPopulation, generateCitizens } from '../sim/systems/population';
import { createCompetitorsForCity } from '../sim/systems/competitors';
import { createMarket } from '../sim/systems/market';
import { createUnderworld } from '../sim/systems/underworld';
import { createFactions } from '../sim/systems/factions';
import { createPolitics } from '../sim/systems/politics';
import { createDecisionState } from '../sim/systems/decisions';
import { createCorporateState } from '../sim/systems/corporate';
import { createResearchState } from '../sim/systems/research';
import { TileKind } from '../sim/world/grid';
import { createCrisisState } from '../sim/systems/crises';
import { createWeather } from '../sim/systems/weather';
import { stateFromJSON, stateToJSON, type GameStateJSON } from '../sim/state';

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

interface LegacyGastronomyV1 {
  kind: 'gastronomy';
  price: number;
  quality: number;
  reputation: number;
  staff: number;
  lifetimeGuests: number;
  lifetimeRevenue: number;
  history: { day: number; guests: number; revenue: number; costs: number }[];
}

const LEGACY_BASE_PRICE: Record<string, number> = { ramen_bar: 18, food_stand: 7 };

/** v1 → v2: gastronomy businesses gain menu, inventory, staff, upgrades. */
const migrateV1toV2: Migration = (state) => {
  const buildings = state.buildings as Record<string, Record<string, unknown>>;
  const seed = typeof state.seed === 'number' ? state.seed : 1;
  const tick = typeof state.tick === 'number' ? state.tick : 0;
  const day = Math.floor((tick + 7 * 60) / 1440);
  const districts = state.districts as { stats: { purchasingPower: number } }[];
  for (const key of Object.keys(buildings)) {
    const b = buildings[key]!;
    const legacy = b.business as LegacyGastronomyV1 | undefined;
    if (!legacy || legacy.kind !== 'gastronomy') continue;
    const model = BUILDING_DEFINITIONS[b.defId as string]?.business;
    if (!model || model.kind !== 'gastronomy') {
      delete b.business;
      continue;
    }
    const rng = new Rng(`${seed}:migrate:${key}`);
    const bias = districts[b.districtId as number]?.stats.purchasingPower ?? 50;
    const fresh = createBusinessState(model, rng, day, tick, bias);
    const ratio = (legacy.price ?? LEGACY_BASE_PRICE[b.defId as string] ?? 1) / (LEGACY_BASE_PRICE[b.defId as string] ?? 1);
    for (const m of fresh.menu) m.price = Math.max(1, Math.round(m.price * ratio));
    fresh.reputation = legacy.reputation ?? fresh.reputation;
    fresh.quality = legacy.quality ?? fresh.quality;
    fresh.lifetimeGuests = legacy.lifetimeGuests ?? 0;
    fresh.lifetimeRevenue = legacy.lifetimeRevenue ?? 0;
    fresh.history = Array.isArray(legacy.history) ? legacy.history : [];
    b.business = fresh;
  }
  return state;
};

/** v2 → v3: citizens, competitors, ingredient market, district economy. */
const migrateV2toV3: Migration = (raw) => {
  const districts = raw.districts as Record<string, unknown>[];
  for (const d of districts) {
    if (!d.economy) d.economy = { citizens: 0, employed: 0, dailyWages: 0, dailyRent: 0, dailySpending: 0, dailyVisits: 0, venues: 0 };
  }
  const buildings = raw.buildings as Record<string, Record<string, unknown>>;
  for (const b of Object.values(buildings)) {
    const biz = b.business as Record<string, unknown> | undefined;
    if (biz && typeof biz.todayCitizenVisits !== 'number') biz.todayCitizenVisits = 0;
  }
  raw.population = createPopulation();
  raw.competitors = {};
  raw.market = createMarket();
  raw.lastCompetitorExpansionDay = 0;
  raw.version = 3;
  const state = stateFromJSON(raw as unknown as GameStateJSON);
  const rng = new Rng(`${state.seed}:migrate:v3`);
  createCompetitorsForCity(state, rng, Math.floor((state.tick + 7 * 60) / 1440));
  generateCitizens(state, rng);
  return stateToJSON(state) as unknown as Record<string, unknown>;
};

/** v3 → v4: new business kinds and real estate are optional additions; only the version changes. */
const migrateV3toV4: Migration = (raw) => {
  raw.version = 4;
  return raw;
};

/** v4 → v5: underworld state and dirty money. */
const migrateV4toV5: Migration = (raw) => {
  const ledger = raw.ledger as Record<string, unknown>;
  if (typeof ledger.dirtyBalance !== 'number') ledger.dirtyBalance = 0;
  raw.underworld = { org: null, heat: 0, lockdownUntilDay: 0, rivals: [], recentBribes: 0 };
  raw.version = 5;
  const state = stateFromJSON(raw as unknown as GameStateJSON);
  state.underworld = createUnderworld(state, new Rng(`${state.seed}:migrate:v5`));
  return stateToJSON(state) as unknown as Record<string, unknown>;
};

/** v5 → v6: factions, politics, decisions. */
const migrateV5toV6: Migration = (raw) => {
  raw.factions = createFactions();
  raw.politics = createPolitics();
  raw.decisions = createDecisionState();
  raw.version = 6;
  return raw;
};

/** v6 → v7: corporate finance, research, crises. */
const migrateV6toV7: Migration = (raw) => {
  const player = raw.player as { name?: string };
  raw.corporate = createCorporateState(`${player?.name ?? 'Unbekannt'} Holdings`);
  raw.research = createResearchState();
  raw.crisis = createCrisisState();
  raw.version = 7;
  return raw;
};

/** v7 → v8: weather. */
const migrateV7toV8: Migration = (raw) => {
  raw.weather = createWeather();
  raw.version = 8;
  return raw;
};

/** v8 → v9: megacorp status and careers. */
const migrateV8toV9: Migration = (raw) => {
  const corp = raw.corporate as Record<string, unknown>;
  if (typeof corp.megacorp !== 'boolean') corp.megacorp = false;
  if (typeof corp.megacorpSinceDay !== 'number') corp.megacorpSinceDay = 0;
  if (typeof corp.careers !== 'number') corp.careers = 1;
  if (typeof corp.chainTakeoverCooldownDay !== 'number') corp.chainTakeoverCooldownDay = 0;
  raw.version = 9;
  return raw;
};

/** v9 → v10: building facing (entrance edge); chosen from the road-side edges of the footprint. */
const migrateV9toV10: Migration = (raw) => {
  const grid = raw.grid as { width: number; height: number; kind: number[] } | undefined;
  const isRoad = (x: number, y: number): boolean =>
    !!grid && x >= 0 && y >= 0 && x < grid.width && y < grid.height && grid.kind[y * grid.width + x] === TileKind.Road;
  const buildings = (raw.buildings ?? {}) as Record<string, Record<string, unknown>>;
  for (const b of Object.values(buildings)) {
    if (typeof b.facing === 'number') continue;
    const x = b.x as number;
    const y = b.y as number;
    const w = b.w as number;
    const h = b.h as number;
    let facing = 0;
    const edges: [number, () => boolean][] = [
      [0, () => Array.from({ length: h }, (_, i) => isRoad(x + w, y + i)).some(Boolean)],
      [1, () => Array.from({ length: w }, (_, i) => isRoad(x + i, y + h)).some(Boolean)],
      [2, () => Array.from({ length: h }, (_, i) => isRoad(x - 1, y + i)).some(Boolean)],
      [3, () => Array.from({ length: w }, (_, i) => isRoad(x + i, y - 1)).some(Boolean)],
    ];
    for (const [f, test] of edges) {
      if (test()) {
        facing = f;
        break;
      }
    }
    b.facing = facing;
  }
  raw.version = 10;
  return raw;
};

export const MIGRATIONS: Record<number, Migration> = {
  1: migrateV1toV2,
  2: migrateV2toV3,
  3: migrateV3toV4,
  4: migrateV4toV5,
  5: migrateV5toV6,
  6: migrateV6toV7,
  7: migrateV7toV8,
  8: migrateV8toV9,
  9: migrateV9toV10,
};
