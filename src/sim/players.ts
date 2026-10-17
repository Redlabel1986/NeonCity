/**
 * Players in a shared world. A WorldState holds one PlayerSlice per player;
 * `withPlayer(world, id)` returns the GameState view that merges the shared
 * world with that player's slice. Views are Proxies: reads and writes of
 * player fields (ledger, corporate, ...) go to the slice, everything else to
 * the world, and `underworld`, `factions` and `politics` are merged objects.
 *
 * Views are cached per world and player; they stay valid while the world
 * object lives.
 */

import type { BackgroundId, DifficultyId } from './data/difficulty';
import { BACKGROUNDS, DIFFICULTIES } from './data/difficulty';
import { FACTION_IDS } from './data/factions';
import { createLedger } from './economy/finance';
import { createTaskStates } from './systems/tasks';
import { createDecisionState } from './systems/decisions';
import { createCorporateState } from './systems/corporate';
import { createResearchState } from './systems/research';
import { createCasinoState } from './systems/casino';
import type { FactionState, GameState, PlayerFactionState, PlayerSlice, WorldState } from './state';

const PLAYER_KEYS = new Set<PropertyKey>(['player', 'ledger', 'log', 'nextLogId', 'tasks', 'undoStack', 'decisions', 'corporate', 'research', 'casino']);
const PLAYER_POLITICS_KEYS = new Set<PropertyKey>(['influence', 'districtInfluence', 'initiativeCooldownDay', 'lifetimeTaxes', 'lifetimeDonations']);
const PLAYER_FACTION_KEYS = new Set<PropertyKey>(['relation', 'lastActionDay', 'activeUntilDay', 'activeEffect']);

/** Id used for passes that belong to no player (shared systems). Never persisted. */
export const SYSTEM_PLAYER_ID = '__system';

const viewCache = new WeakMap<WorldState, Map<string, GameState>>();

export interface NewPlayerOptions {
  id: string;
  name: string;
  background: BackgroundId;
  difficulty: DifficultyId;
}

export function defaultFactionState(): PlayerFactionState {
  return { relation: 0, lastActionDay: -10, activeUntilDay: 0, activeEffect: null };
}

/** Creates a player's slice with starting money, home district and background perks. */
export function createPlayerSlice(world: WorldState, options: NewPlayerOptions): PlayerSlice {
  const difficulty = DIFFICULTIES[options.difficulty];
  const background = BACKGROUNDS[options.background];
  const homeDistrict = world.districts.find((d) => d.archetype === background.homeDistrict) ?? world.districts[0]!;
  const startingCredits = Math.max(2000, difficulty.startingCredits + background.creditsBonus);
  const name = options.name.trim() || 'Unbekannt';
  const slice: PlayerSlice = {
    id: options.id,
    player: {
      name,
      background: background.id,
      difficulty: difficulty.id,
      apartmentRent: Math.round(background.apartmentRent * difficulty.rentMultiplier),
      homeDistrictId: homeDistrict.id,
      reputation: 10,
      wantedLevel: 0,
    },
    ledger: createLedger(startingCredits),
    log: [],
    nextLogId: 1,
    tasks: createTaskStates(),
    undoStack: [],
    underworld: { org: null, heat: 0, lockdownUntilDay: 0, recentBribes: 0 },
    factions: Object.fromEntries(FACTION_IDS.map((id) => [id, defaultFactionState()])),
    politics: { influence: 0, districtInfluence: {}, initiativeCooldownDay: {}, lifetimeTaxes: 0, lifetimeDonations: 0 },
    decisions: createDecisionState(),
    corporate: createCorporateState(`${name} Holdings`),
    research: createResearchState(),
    casino: createCasinoState(),
    joinedTick: world.tick,
  };
  const perks = background.perks;
  if (perks) {
    if (perks.startDirty) slice.ledger.dirtyBalance = perks.startDirty;
    if (perks.startInfluence) slice.politics.influence = perks.startInfluence;
    for (const [id, value] of Object.entries(perks.relations ?? {})) {
      const f = slice.factions[id];
      if (f && value !== undefined) f.relation = value;
    }
  }
  return slice;
}

/** Adds a player to the world and returns the view. Fails when the id is taken. */
export function addPlayer(world: WorldState, options: NewPlayerOptions): GameState {
  if (world.players[options.id]) throw new Error(`Spieler ${options.id} existiert bereits.`);
  world.players[options.id] = createPlayerSlice(world, options);
  world.playerOrder.push(options.id);
  return withPlayer(world, options.id);
}

export function playerIds(world: WorldState): readonly string[] {
  return world.playerOrder;
}

/** A private slice for shared passes; its fields are never persisted. */
function systemSlice(world: WorldState): PlayerSlice {
  const existing = (world as unknown as { __system?: PlayerSlice }).__system;
  if (existing) return existing;
  const slice: PlayerSlice = {
    id: SYSTEM_PLAYER_ID,
    player: { name: 'System', background: 'restaurateur', difficulty: 'standard', apartmentRent: 0, homeDistrictId: 0, reputation: 0, wantedLevel: 0 },
    ledger: createLedger(0),
    log: [],
    nextLogId: 1,
    tasks: [],
    undoStack: [],
    underworld: { org: null, heat: 0, lockdownUntilDay: 0, recentBribes: 0 },
    factions: Object.fromEntries(FACTION_IDS.map((id) => [id, defaultFactionState()])),
    politics: { influence: 0, districtInfluence: {}, initiativeCooldownDay: {}, lifetimeTaxes: 0, lifetimeDonations: 0 },
    decisions: createDecisionState(),
    corporate: createCorporateState('System'),
    research: createResearchState(),
    casino: createCasinoState(),
    joinedTick: 0,
  };
  Object.defineProperty(world, '__system', { value: slice, enumerable: false, configurable: true, writable: true });
  return slice;
}

/** Returns the merged view of the world for a player (or the system pass when the id is SYSTEM_PLAYER_ID). */
export function withPlayer(world: WorldState, id: string): GameState {
  let perWorld = viewCache.get(world);
  if (!perWorld) {
    perWorld = new Map();
    viewCache.set(world, perWorld);
  }
  const cached = perWorld.get(id);
  if (cached) return cached;
  const slice = id === SYSTEM_PLAYER_ID ? systemSlice(world) : world.players[id];
  if (!slice) throw new Error(`Unbekannter Spieler: ${id}`);
  const view = buildView(world, slice);
  perWorld.set(id, view);
  return view;
}

/** Drops cached views (after replacing a player's slice wholesale). */
export function invalidateViews(world: WorldState): void {
  viewCache.delete(world);
}

const WORLD_KEYS = [
  'version', 'seed', 'rng', 'tick', 'speed', 'grid', 'districts', 'buildings', 'nextBuildingId', 'population', 'competitors', 'market',
  'lastCompetitorExpansionDay', 'crisis', 'weather', 'meta', 'players', 'playerOrder',
] as const;
const PLAYER_UNDERWORLD_KEYS = ['org', 'heat', 'lockdownUntilDay', 'recentBribes'] as const;
const SHARED_POLITICS_KEYS = ['council', 'laws', 'proposals', 'nextProposalId', 'nextElectionDay'] as const;

function forward<T extends object>(target: T, source: object, keys: readonly PropertyKey[]): void {
  for (const key of keys) {
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: true,
      get: () => (source as Record<PropertyKey, unknown>)[key as string],
      set: (value: unknown) => {
        (source as Record<PropertyKey, unknown>)[key as string] = value;
      },
    });
  }
}

/**
 * Builds the merged view with accessor properties (faster than a Proxy in the
 * simulation's hot loops): shared keys forward to the world, player keys to
 * the slice, and the three merged objects combine both.
 */
function buildView(world: WorldState, slice: PlayerSlice): GameState {
  const view = {} as Record<string, unknown>;
  Object.defineProperty(view, 'playerId', { value: slice.id, enumerable: false });
  Object.defineProperty(view, 'world', { value: world, enumerable: false });
  const worldKeys = new Set<string>([...WORLD_KEYS, ...Object.keys(world)]);
  for (const k of ['rivals', 'factions', 'politics']) worldKeys.delete(k);
  forward(view, world, [...worldKeys]);
  forward(view, slice, [...PLAYER_KEYS] as PropertyKey[]);

  const underworld = {} as Record<string, unknown>;
  forward(underworld, slice.underworld, PLAYER_UNDERWORLD_KEYS);
  forward(underworld, world, ['rivals']);
  Object.defineProperty(view, 'underworld', { enumerable: true, get: () => underworld, set: () => { throw new Error('underworld kann in einer Spielersicht nicht ersetzt werden.'); } });

  const politics = {} as Record<string, unknown>;
  forward(politics, world.politics, SHARED_POLITICS_KEYS);
  forward(politics, slice.politics, [...PLAYER_POLITICS_KEYS] as PropertyKey[]);
  Object.defineProperty(view, 'politics', { enumerable: true, get: () => politics, set: () => { throw new Error('politics kann in einer Spielersicht nicht ersetzt werden.'); } });

  let factionsSource: typeof world.factions | null = null;
  let factions: FactionState[] = [];
  Object.defineProperty(view, 'factions', {
    enumerable: true,
    get: () => {
      if (factionsSource === world.factions && factions.length === world.factions.length) return factions;
      factionsSource = world.factions;
      factions = world.factions.map((shared) => {
        const own = (slice.factions[shared.id] ??= defaultFactionState());
        const merged = {} as Record<string, unknown>;
        forward(merged, shared, ['id', 'influence']);
        forward(merged, own, [...PLAYER_FACTION_KEYS] as PropertyKey[]);
        return merged as unknown as FactionState;
      });
      return factions;
    },
    set: () => {
      throw new Error('factions kann in einer Spielersicht nicht ersetzt werden.');
    },
  });
  return view as unknown as GameState;
}

/** View of another player from any view of the same world. */
export function viewOf(state: GameState, playerId: string): GameState {
  return withPlayer(state.world, playerId);
}

/** True when the owner id belongs to a player of this world. */
export function isPlayerOwner(world: WorldState, owner: string): boolean {
  return owner !== 'city' && owner in world.players;
}
