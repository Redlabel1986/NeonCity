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
import { createRivals } from '../sim/systems/underworld';
import { withPlayer, SYSTEM_PLAYER_ID, defaultFactionState } from '../sim/players';
import { FACTION_IDS } from '../sim/data/factions';
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
  const world = stateFromJSON(raw as unknown as GameStateJSON);
  const view = withPlayer(world, SYSTEM_PLAYER_ID);
  const rng = new Rng(`${world.seed}:migrate:v3`);
  createCompetitorsForCity(view, rng, Math.floor((world.tick + 7 * 60) / 1440));
  generateCitizens(view, rng);
  return stateToJSON(world) as unknown as Record<string, unknown>;
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
  raw.version = 5;
  const world = stateFromJSON(raw as unknown as GameStateJSON);
  const rivals = createRivals(withPlayer(world, SYSTEM_PLAYER_ID), new Rng(`${world.seed}:migrate:v5`));
  raw.underworld = { org: null, heat: 0, lockdownUntilDay: 0, rivals, recentBribes: 0 };
  return raw;
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

/** v10 → v11: hourly guest / customer counters for the interior view. */
const migrateV10toV11: Migration = (raw) => {
  const buildings = (raw.buildings ?? {}) as Record<string, { business?: Record<string, unknown> }>;
  for (const b of Object.values(buildings)) {
    const biz = b.business;
    if (!biz) continue;
    if (biz.kind === 'gastronomy' && typeof biz.hourGuests !== 'number') biz.hourGuests = 0;
    if (biz.kind === 'retail' && typeof biz.hourCustomers !== 'number') biz.hourCustomers = 0;
  }
  raw.version = 11;
  return raw;
};

/** v11 → v12: shared world with player slices; the single player becomes player 'player'. */
const migrateV11toV12: Migration = (raw) => {
  const uw = (raw.underworld ?? { org: null, heat: 0, lockdownUntilDay: 0, rivals: [], recentBribes: 0 }) as Record<string, unknown>;
  const factions = (raw.factions ?? []) as Record<string, unknown>[];
  const pol = (raw.politics ?? {}) as Record<string, unknown>;
  const slice: Record<string, unknown> = {
    id: 'player',
    player: raw.player,
    ledger: raw.ledger,
    log: raw.log ?? [],
    nextLogId: raw.nextLogId ?? 1,
    tasks: raw.tasks ?? [],
    undoStack: raw.undoStack ?? [],
    underworld: { org: uw.org ?? null, heat: uw.heat ?? 0, lockdownUntilDay: uw.lockdownUntilDay ?? 0, recentBribes: uw.recentBribes ?? 0 },
    factions: Object.fromEntries(
      FACTION_IDS.map((id) => {
        const f = factions.find((x) => x.id === id);
        return [id, f ? { relation: f.relation ?? 0, lastActionDay: f.lastActionDay ?? -10, activeUntilDay: f.activeUntilDay ?? 0, activeEffect: f.activeEffect ?? null } : defaultFactionState()];
      }),
    ),
    politics: {
      influence: pol.influence ?? 0,
      districtInfluence: pol.districtInfluence ?? {},
      initiativeCooldownDay: pol.initiativeCooldownDay ?? {},
      lifetimeTaxes: pol.lifetimeTaxes ?? 0,
      lifetimeDonations: pol.lifetimeDonations ?? 0,
    },
    decisions: raw.decisions ?? createDecisionState(),
    corporate: raw.corporate ?? createCorporateState('Holdings'),
    research: raw.research ?? createResearchState(),
    joinedTick: 0,
  };
  raw.players = { player: slice };
  raw.playerOrder = ['player'];
  raw.rivals = uw.rivals ?? [];
  raw.factions = FACTION_IDS.map((id) => {
    const f = factions.find((x) => x.id === id);
    return { id, influence: f?.influence ?? 30 };
  });
  raw.politics = {
    council: pol.council ?? { progress_bloc: 13, social_alliance: 11 },
    laws: pol.laws ?? {},
    proposals: pol.proposals ?? [],
    nextProposalId: pol.nextProposalId ?? 1,
    nextElectionDay: pol.nextElectionDay ?? 30,
  };
  for (const key of ['player', 'ledger', 'log', 'nextLogId', 'tasks', 'undoStack', 'underworld', 'decisions', 'corporate', 'research']) delete raw[key];
  raw.version = 12;
  return raw;
};

/** v12 → v13: casino state per player. */
const migrateV12toV13: Migration = (raw) => {
  const players = (raw.players ?? {}) as Record<string, Record<string, unknown>>;
  for (const slice of Object.values(players)) {
    if (!slice.casino) slice.casino = { blackjack: null, lastSlots: null, lastRoulette: null, stats: { rounds: 0, wagered: 0, returned: 0, biggestWin: 0 }, history: [] };
  }
  raw.version = 13;
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
  10: migrateV10toV11,
  11: migrateV11toV12,
  12: migrateV12toV13,
};
