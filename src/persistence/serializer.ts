/**
 * Versioned save format with validation and migrations.
 *
 * Save files are plain JSON. They never contain executable content and all
 * imported data is validated structurally before it reaches the engine.
 */

import { SAVE_FORMAT_VERSION } from '../sim/engine';
import { stateFromJSON, stateToJSON, type GameState, type GameStateJSON, type WorldState } from '../sim/state';
import { DISTRICT_ARCHETYPES } from '../sim/data/districts';
import { DIFFICULTIES, BACKGROUNDS } from '../sim/data/difficulty';
import { MIGRATIONS } from './migrations';
import { RECIPES } from '../sim/data/recipes';
import { SUPPLIERS } from '../sim/data/suppliers';

export interface SaveFile {
  magic: 'NEON_DYNASTY_SAVE';
  version: number;
  savedAt: number;
  name: string;
  state: GameStateJSON;
}

export class SaveValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveValidationError';
  }
}

/** The shared world behind a player view (or the world itself). */
export function worldOf(state: GameState | WorldState): WorldState {
  return 'world' in state ? (state as GameState).world : (state as WorldState);
}

export function serialize(state: GameState | WorldState, name: string): string {
  const file: SaveFile = {
    magic: 'NEON_DYNASTY_SAVE',
    version: SAVE_FORMAT_VERSION,
    savedAt: Date.now(),
    name,
    state: stateToJSON(worldOf(state)),
  };
  return JSON.stringify(file);
}

export function deserialize(text: string): { state: WorldState; name: string; savedAt: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveValidationError('Die Datei enthält kein gültiges JSON.');
  }
  const file = validateSaveFile(parsed);
  const migrated = migrate(file);
  const state = stateFromJSON(migrated.state);
  return { state, name: migrated.name, savedAt: migrated.savedAt };
}

export { MIGRATIONS };

export function migrate(file: SaveFile): SaveFile {
  let version = file.version;
  let state: Record<string, unknown> = file.state as unknown as Record<string, unknown>;
  while (version < SAVE_FORMAT_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new SaveValidationError(`Keine Migration von Version ${version} verfügbar.`);
    state = step(state);
    version += 1;
    state.version = version;
  }
  if (version > SAVE_FORMAT_VERSION) {
    throw new SaveValidationError(`Der Spielstand stammt aus einer neueren Version (${version}).`);
  }
  return { ...file, version, state: state as unknown as GameStateJSON };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNumberArray(v: unknown, length?: number): v is number[] {
  if (!Array.isArray(v)) return false;
  if (length !== undefined && v.length !== length) return false;
  for (const n of v) if (typeof n !== 'number' || !Number.isFinite(n)) return false;
  return true;
}

function expectNumber(obj: Record<string, unknown>, key: string, path: string): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new SaveValidationError(`${path}.${key} fehlt oder ist keine Zahl.`);
  return v;
}

function expectString(obj: Record<string, unknown>, key: string, path: string): string {
  const v = obj[key];
  if (typeof v !== 'string') throw new SaveValidationError(`${path}.${key} fehlt oder ist kein Text.`);
  return v;
}

export function validateSaveFile(parsed: unknown): SaveFile {
  if (!isObject(parsed)) throw new SaveValidationError('Der Spielstand ist kein Objekt.');
  if (parsed.magic !== 'NEON_DYNASTY_SAVE') throw new SaveValidationError('Das ist keine Neon-Dynasty-Speicherdatei.');
  const version = expectNumber(parsed, 'version', 'save');
  const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
  const name = typeof parsed.name === 'string' ? parsed.name.slice(0, 60) : 'Importiert';
  if (!isObject(parsed.state)) throw new SaveValidationError('save.state fehlt.');
  validateState(parsed.state, version);
  return { magic: 'NEON_DYNASTY_SAVE', version, savedAt, name, state: parsed.state as unknown as GameStateJSON };
}

const MAX_CITY_SIZE = 256;

function validateState(s: Record<string, unknown>, version: number): void {
  expectNumber(s, 'seed', 'state');
  expectNumber(s, 'tick', 'state');
  expectNumber(s, 'speed', 'state');
  expectNumber(s, 'nextBuildingId', 'state');
  if (!isObject(s.rng)) throw new SaveValidationError('state.rng fehlt.');
  expectNumber(s.rng, 'seed', 'state.rng');
  expectNumber(s.rng, 'state', 'state.rng');

  if (!isObject(s.grid)) throw new SaveValidationError('state.grid fehlt.');
  const width = expectNumber(s.grid, 'width', 'state.grid');
  const height = expectNumber(s.grid, 'height', 'state.grid');
  if (width < 8 || height < 8 || width > MAX_CITY_SIZE || height > MAX_CITY_SIZE || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new SaveValidationError('state.grid hat eine ungültige Größe.');
  }
  const n = width * height;
  for (const key of ['kind', 'district', 'variant', 'occupant'] as const) {
    if (!isNumberArray(s.grid[key], n)) throw new SaveValidationError(`state.grid.${key} ist ungültig.`);
  }

  if (!Array.isArray(s.districts) || s.districts.length === 0) throw new SaveValidationError('state.districts fehlt.');
  for (const [i, d] of (s.districts as unknown[]).entries()) {
    if (!isObject(d)) throw new SaveValidationError(`state.districts[${i}] ist ungültig.`);
    expectNumber(d, 'id', `state.districts[${i}]`);
    const archetype = expectString(d, 'archetype', `state.districts[${i}]`);
    if (!(archetype in DISTRICT_ARCHETYPES)) throw new SaveValidationError(`Unbekannter Bezirkstyp: ${archetype}`);
    if (!isObject(d.stats)) throw new SaveValidationError(`state.districts[${i}].stats fehlt.`);
    for (const key of Object.keys(DISTRICT_ARCHETYPES.old_city.stats)) expectNumber(d.stats, key, `state.districts[${i}].stats`);
  }
  for (const d of s.grid.district as number[]) {
    if (d < 0 || d >= (s.districts as unknown[]).length) throw new SaveValidationError('state.grid.district verweist auf unbekannten Bezirk.');
  }

  if (!isObject(s.buildings)) throw new SaveValidationError('state.buildings fehlt.');
  for (const [key, b] of Object.entries(s.buildings)) {
    if (!isObject(b)) throw new SaveValidationError(`state.buildings[${key}] ist ungültig.`);
    const path = `state.buildings[${key}]`;
    const id = expectNumber(b, 'id', path);
    if (String(id) !== key) throw new SaveValidationError(`${path}.id passt nicht zum Schlüssel.`);
    expectString(b, 'defId', path);
    expectString(b, 'label', path);
    if (typeof b.owner !== 'string' || b.owner.length === 0 || (version < 12 && b.owner !== 'player' && b.owner !== 'city')) throw new SaveValidationError(`${path}.owner ist ungültig.`);
    const x = expectNumber(b, 'x', path);
    const y = expectNumber(b, 'y', path);
    const w = expectNumber(b, 'w', path);
    const h = expectNumber(b, 'h', path);
    if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > width || y + h > height) throw new SaveValidationError(`${path} liegt außerhalb der Karte.`);
    expectNumber(b, 'districtId', path);
    if (b.status !== 'construction' && b.status !== 'operational') throw new SaveValidationError(`${path}.status ist ungültig.`);
    expectNumber(b, 'progress', path);
    expectNumber(b, 'buildTime', path);
    expectNumber(b, 'investment', path);
    if (b.business !== undefined) {
      if (!isObject(b.business)) throw new SaveValidationError(`${path}.business ist ungültig.`);
      const kind = b.business.kind;
      if (kind === 'gastronomy') {
        if (version >= 2) validateGastronomyV2(b.business, `${path}.business`);
        else {
          for (const k of ['price', 'quality', 'reputation', 'staff', 'lifetimeGuests', 'lifetimeRevenue']) expectNumber(b.business, k, `${path}.business`);
        }
      } else if (kind === 'hotel') {
        validateStaffed(b.business, `${path}.business`);
        for (const k of ['pricePerNight', 'cleanliness', 'reputation', 'rating', 'reviewCount', 'lifetimeGuests', 'lifetimeRevenue']) expectNumber(b.business, k, `${path}.business`);
        if (!Array.isArray(b.business.stays)) throw new SaveValidationError(`${path}.business.stays fehlt.`);
      } else if (kind === 'transport') {
        validateStaffed(b.business, `${path}.business`);
        for (const k of ['fare', 'reputation', 'lifetimeRides', 'lifetimeRevenue']) expectNumber(b.business, k, `${path}.business`);
        if (!Array.isArray(b.business.vehicles)) throw new SaveValidationError(`${path}.business.vehicles fehlt.`);
      } else if (kind === 'lab') {
        validateStaffed(b.business, `${path}.business`);
        expectNumber(b.business, 'progress', `${path}.business`);
      } else if (kind === 'industry') {
        validateStaffed(b.business, `${path}.business`);
        if (!Array.isArray(b.business.lines) || !Array.isArray(b.business.inventory) || !Array.isArray(b.business.orders)) throw new SaveValidationError(`${path}.business: Fabrik unvollständig.`);
      } else if (kind === 'security') {
        validateStaffed(b.business, `${path}.business`);
        for (const k of ['reputation', 'lifetimeRevenue']) expectNumber(b.business, k, `${path}.business`);
        if (!isObject(b.business.patrols)) throw new SaveValidationError(`${path}.business.patrols fehlt.`);
      } else if (kind === 'retail') {
        validateStaffed(b.business, `${path}.business`);
        for (const k of ['reputation', 'lifetimeCustomers', 'lifetimeRevenue', 'todayPurchases']) expectNumber(b.business, k, `${path}.business`);
        if (!isObject(b.business.prices) || !Array.isArray(b.business.inventory) || !Array.isArray(b.business.orders)) throw new SaveValidationError(`${path}.business: Laden unvollständig.`);
      } else if (kind === 'bank') {
        validateStaffed(b.business, `${path}.business`);
        for (const k of ['reserve', 'deposits', 'loansOut', 'depositRate', 'loanRate', 'reputation']) expectNumber(b.business, k, `${path}.business`);
      } else {
        throw new SaveValidationError(`${path}.business.kind ist unbekannt.`);
      }
      if (!Array.isArray(b.business.history)) throw new SaveValidationError(`${path}.business.history fehlt.`);
    }
    if (b.property !== undefined) {
      if (!isObject(b.property)) throw new SaveValidationError(`${path}.property ist ungültig.`);
      for (const k of ['purchasePrice', 'rentLevel', 'condition', 'renovationUntilTick', 'lifetimeRent']) expectNumber(b.property, k, `${path}.property`);
    }
  }

  // Player slices (v12+) or the single legacy player (older saves).
  const slices: [string, Record<string, unknown>][] = [];
  if (version >= 12) {
    if (!isObject(s.players)) throw new SaveValidationError('state.players fehlt.');
    if (!Array.isArray(s.playerOrder)) throw new SaveValidationError('state.playerOrder fehlt.');
    for (const id of s.playerOrder as unknown[]) {
      if (typeof id !== 'string' || !isObject((s.players as Record<string, unknown>)[id])) throw new SaveValidationError(`state.players[${String(id)}] fehlt.`);
      slices.push([`state.players.${id}`, (s.players as Record<string, Record<string, unknown>>)[id]!]);
    }
    for (const b of Object.values(s.buildings as Record<string, Record<string, unknown>>)) {
      if (b.owner !== 'city' && !isObject((s.players as Record<string, unknown>)[b.owner as string])) throw new SaveValidationError(`Gebäude ${String(b.id)} gehört einem unbekannten Spieler.`);
    }
  } else {
    slices.push(['state', s]);
  }
  for (const [path, slice] of slices) {
    validatePlayerSlice(slice, path, version);
  }

  if (version < 12) {
    if (!Array.isArray(s.log)) throw new SaveValidationError('state.log fehlt.');
    expectNumber(s, 'nextLogId', 'state');
    if (!Array.isArray(s.tasks)) throw new SaveValidationError('state.tasks fehlt.');
    if (!Array.isArray(s.undoStack)) throw new SaveValidationError('state.undoStack fehlt.');
  }
  if (!isObject(s.meta)) throw new SaveValidationError('state.meta fehlt.');
  if (version >= 3) {
    if (!isObject(s.population) || !Array.isArray((s.population as Record<string, unknown>).citizens)) throw new SaveValidationError('state.population fehlt.');
    for (const [i, c] of ((s.population as Record<string, unknown>).citizens as unknown[]).entries()) {
      if (!isObject(c)) throw new SaveValidationError(`state.population.citizens[${i}] ist ungültig.`);
      expectNumber(c, 'id', `citizens[${i}]`);
      expectNumber(c, 'districtId', `citizens[${i}]`);
      expectNumber(c, 'homeBuildingId', `citizens[${i}]`);
      expectNumber(c, 'wealth', `citizens[${i}]`);
      if (!Array.isArray(c.favorites)) throw new SaveValidationError(`citizens[${i}].favorites fehlt.`);
    }
    if (!isObject(s.competitors)) throw new SaveValidationError('state.competitors fehlt.');
    for (const [key, c] of Object.entries(s.competitors)) {
      if (!isObject(c)) throw new SaveValidationError(`state.competitors[${key}] ist ungültig.`);
      expectNumber(c, 'buildingId', `competitors[${key}]`);
      expectNumber(c, 'priceLevel', `competitors[${key}]`);
      expectNumber(c, 'reputation', `competitors[${key}]`);
      expectNumber(c, 'cash', `competitors[${key}]`);
    }
    if (!isObject(s.market) || !isObject((s.market as Record<string, unknown>).index)) throw new SaveValidationError('state.market fehlt.');
    expectNumber(s, 'lastCompetitorExpansionDay', 'state');
    if (version >= 5 && version < 12) {
      if (!isObject(s.underworld)) throw new SaveValidationError('state.underworld fehlt.');
      const uw = s.underworld as Record<string, unknown>;
      expectNumber(uw, 'heat', 'state.underworld');
      if (!Array.isArray(uw.rivals)) throw new SaveValidationError('state.underworld.rivals fehlt.');
      if (uw.org !== null) {
        if (!isObject(uw.org)) throw new SaveValidationError('state.underworld.org ist ungültig.');
        expectString(uw.org, 'name', 'state.underworld.org');
        for (const k of ['members', 'candidates', 'operations']) if (!Array.isArray(uw.org[k])) throw new SaveValidationError(`state.underworld.org.${k} fehlt.`);
        if (!isObject(uw.org.control)) throw new SaveValidationError('state.underworld.org.control fehlt.');
      }
      expectNumber(s.ledger as Record<string, unknown>, 'dirtyBalance', 'state.ledger');
    }
    if (version >= 12) {
      if (!Array.isArray(s.rivals)) throw new SaveValidationError('state.rivals fehlt.');
      if (!Array.isArray(s.factions)) throw new SaveValidationError('state.factions fehlt.');
      if (!isObject(s.politics) || !isObject((s.politics as Record<string, unknown>).laws) || !isObject((s.politics as Record<string, unknown>).council)) throw new SaveValidationError('state.politics fehlt.');
    }
    if (version >= 6 && version < 12) {
      if (!Array.isArray(s.factions)) throw new SaveValidationError('state.factions fehlt.');
      if (!isObject(s.politics) || !isObject((s.politics as Record<string, unknown>).laws) || !isObject((s.politics as Record<string, unknown>).council)) throw new SaveValidationError('state.politics fehlt.');
      expectNumber(s.politics as Record<string, unknown>, 'influence', 'state.politics');
      if (!isObject(s.decisions) || !Array.isArray((s.decisions as Record<string, unknown>).pending)) throw new SaveValidationError('state.decisions fehlt.');
    }
    if (version >= 7 && version < 12) {
      if (!isObject(s.corporate) || !Array.isArray((s.corporate as Record<string, unknown>).loans)) throw new SaveValidationError('state.corporate fehlt.');
      expectNumber(s.corporate as Record<string, unknown>, 'sharesSold', 'state.corporate');
      if (!isObject(s.research) || !Array.isArray((s.research as Record<string, unknown>).unlocked)) throw new SaveValidationError('state.research fehlt.');
    }
    if (version >= 7 && !isObject(s.crisis)) throw new SaveValidationError('state.crisis fehlt.');
    if (version >= 8) {
      if (!isObject(s.weather) || typeof (s.weather as Record<string, unknown>).kind !== 'string') throw new SaveValidationError('state.weather fehlt.');
    }
    for (const [i, d] of (s.districts as Record<string, unknown>[]).entries()) {
      if (!isObject(d.economy)) throw new SaveValidationError(`state.districts[${i}].economy fehlt.`);
    }
  }
}

const GASTRONOMY_NUMBERS = [
  'reputation', 'quality', 'hygiene', 'rating', 'reviewCount', 'nextEntityId', 'todayGuests', 'todayRevenue', 'todayCogs', 'todayCosts',
  'todayPurchases', 'todayTurnedAway', 'todayLostNoIngredients', 'todayWasteUnits', 'todaySatisfactionSum', 'todaySatisfactionCount',
  'todayQualitySum', 'lifetimeGuests', 'lifetimeRevenue',
];

function validateStaffed(biz: Record<string, unknown>, path: string): void {
  for (const k of ['employees', 'candidates']) if (!Array.isArray(biz[k])) throw new SaveValidationError(`${path}.${k} fehlt.`);
  if (!isObject(biz.upgrades)) throw new SaveValidationError(`${path}.upgrades fehlt.`);
  expectNumber(biz, 'nextEntityId', path);
  for (const [i, e] of (biz.employees as unknown[]).entries()) {
    if (!isObject(e)) throw new SaveValidationError(`${path}.employees[${i}] ist ungültig.`);
    expectNumber(e, 'id', `${path}.employees[${i}]`);
    expectString(e, 'role', `${path}.employees[${i}]`);
    for (const k of ['skill', 'wage', 'morale']) expectNumber(e, k, `${path}.employees[${i}]`);
  }
}

function validateGastronomyV2(biz: Record<string, unknown>, path: string): void {
  for (const k of GASTRONOMY_NUMBERS) expectNumber(biz, k, path);
  for (const k of ['menu', 'inventory', 'orders', 'employees', 'candidates']) {
    if (!Array.isArray(biz[k])) throw new SaveValidationError(`${path}.${k} fehlt.`);
  }
  for (const k of ['upgrades', 'reorderTargets', 'todayConsumed']) {
    if (!isObject(biz[k])) throw new SaveValidationError(`${path}.${k} fehlt.`);
  }
  if (typeof biz.autoReorder !== 'boolean') throw new SaveValidationError(`${path}.autoReorder fehlt.`);
  const supplier = expectString(biz, 'preferredSupplierId', path);
  if (!(supplier in SUPPLIERS)) throw new SaveValidationError(`${path}: unbekannter Lieferant ${supplier}.`);
  for (const [i, m] of (biz.menu as unknown[]).entries()) {
    if (!isObject(m)) throw new SaveValidationError(`${path}.menu[${i}] ist ungültig.`);
    const recipeId = expectString(m, 'recipeId', `${path}.menu[${i}]`);
    if (!(recipeId in RECIPES)) throw new SaveValidationError(`${path}.menu[${i}]: unbekanntes Rezept ${recipeId}.`);
    expectNumber(m, 'price', `${path}.menu[${i}]`);
  }
  for (const [i, e] of (biz.employees as unknown[]).entries()) {
    if (!isObject(e)) throw new SaveValidationError(`${path}.employees[${i}] ist ungültig.`);
    expectNumber(e, 'id', `${path}.employees[${i}]`);
    expectString(e, 'name', `${path}.employees[${i}]`);
    if (typeof e.role !== 'string') throw new SaveValidationError(`${path}.employees[${i}].role ist ungültig.`);
    for (const k of ['skill', 'wage', 'morale']) expectNumber(e, k, `${path}.employees[${i}]`);
  }
  for (const [i, l] of (biz.inventory as unknown[]).entries()) {
    if (!isObject(l)) throw new SaveValidationError(`${path}.inventory[${i}] ist ungültig.`);
    expectString(l, 'ingredientId', `${path}.inventory[${i}]`);
    for (const k of ['units', 'boughtDay', 'quality', 'unitCost']) expectNumber(l, k, `${path}.inventory[${i}]`);
  }
  if (biz.upgradeInProgress !== null && biz.upgradeInProgress !== undefined && !isObject(biz.upgradeInProgress)) {
    throw new SaveValidationError(`${path}.upgradeInProgress ist ungültig.`);
  }
}

/**
 * Attempts to recover a damaged save: strips unknown log entries, resets
 * transient fields. Returns null when the core data is unusable.
 */
export function tryRepair(text: string): { state: WorldState; name: string; savedAt: number; repaired: string[] } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(parsed) || !isObject(parsed.state)) return null;
  const repaired: string[] = [];
  const s = parsed.state;
  // Player slices (v12+) carry log, tasks, undo stack and ledger; older saves keep them at the top level.
  const slices: Record<string, unknown>[] = isObject(s.players) ? Object.values(s.players as Record<string, unknown>).filter(isObject) : [];
  for (const slice of slices) {
    if (!Array.isArray(slice.log)) {
      slice.log = [];
      repaired.push('Ereignisprotokoll zurückgesetzt');
    }
    if (typeof slice.nextLogId !== 'number') slice.nextLogId = 1;
    if (!Array.isArray(slice.tasks)) {
      slice.tasks = [];
      repaired.push('Aufgaben zurückgesetzt');
    }
    if (!Array.isArray(slice.undoStack)) {
      slice.undoStack = [];
      repaired.push('Rückgängig-Verlauf zurückgesetzt');
    }
    if (isObject(slice.ledger)) {
      for (const key of ['todayIncome', 'todayExpenses', 'yesterdayIncome', 'yesterdayExpenses', 'daysInDebt']) {
        if (typeof slice.ledger[key] !== 'number') {
          slice.ledger[key] = 0;
          repaired.push(`Finanzfeld ${key} zurückgesetzt`);
        }
      }
      if (!Array.isArray(slice.ledger.transactions)) {
        slice.ledger.transactions = [];
        repaired.push('Transaktionen zurückgesetzt');
      }
      if (!Array.isArray(slice.ledger.balanceHistory)) {
        slice.ledger.balanceHistory = [];
        repaired.push('Kontoverlauf zurückgesetzt');
      }
    }
  }
  if (slices.length === 0 && !Array.isArray(s.log)) {
    s.log = [];
    repaired.push('Ereignisprotokoll zurückgesetzt');
  }
  if (slices.length === 0 && typeof s.nextLogId !== 'number') {
    s.nextLogId = 1;
    repaired.push('Protokollzähler zurückgesetzt');
  }
  if (slices.length === 0 && !Array.isArray(s.tasks)) {
    s.tasks = [];
    repaired.push('Aufgaben zurückgesetzt');
  }
  if (slices.length === 0 && !Array.isArray(s.undoStack)) {
    s.undoStack = [];
    repaired.push('Rückgängig-Verlauf zurückgesetzt');
  }
  if (!isObject(s.meta)) {
    s.meta = { createdAt: 0, cityName: 'Nova Eclipse' };
    repaired.push('Metadaten ergänzt');
  }
  if (typeof s.speed !== 'number') {
    s.speed = 1;
    repaired.push('Geschwindigkeit zurückgesetzt');
  }
  if (isObject(s.ledger)) {
    for (const key of ['todayIncome', 'todayExpenses', 'yesterdayIncome', 'yesterdayExpenses', 'daysInDebt']) {
      if (typeof s.ledger[key] !== 'number') {
        s.ledger[key] = 0;
        repaired.push(`Finanzfeld ${key} zurückgesetzt`);
      }
    }
    if (!Array.isArray(s.ledger.transactions)) {
      s.ledger.transactions = [];
      repaired.push('Transaktionen zurückgesetzt');
    }
    if (!Array.isArray(s.ledger.balanceHistory)) {
      s.ledger.balanceHistory = [];
      repaired.push('Kontoverlauf zurückgesetzt');
    }
  }
  try {
    const result = deserialize(JSON.stringify(parsed));
    return { ...result, repaired };
  } catch {
    return null;
  }
}

/** Checks one player's slice (ledger, profile, company). Older saves keep these fields at the top level. */
function validatePlayerSlice(slice: Record<string, unknown>, path: string, version: number): void {
  if (!isObject(slice.ledger)) throw new SaveValidationError(`${path}.ledger fehlt.`);
  expectNumber(slice.ledger, 'balance', `${path}.ledger`);
  if (!Array.isArray(slice.ledger.transactions)) throw new SaveValidationError(`${path}.ledger.transactions fehlt.`);
  if (!Array.isArray(slice.ledger.balanceHistory)) throw new SaveValidationError(`${path}.ledger.balanceHistory fehlt.`);
  for (const key of ['todayIncome', 'todayExpenses', 'yesterdayIncome', 'yesterdayExpenses', 'daysInDebt']) expectNumber(slice.ledger, key, `${path}.ledger`);
  if (!isObject(slice.player)) throw new SaveValidationError(`${path}.player fehlt.`);
  expectString(slice.player, 'name', `${path}.player`);
  const difficulty = expectString(slice.player, 'difficulty', `${path}.player`);
  if (!(difficulty in DIFFICULTIES)) throw new SaveValidationError(`Unbekannter Schwierigkeitsgrad: ${difficulty}`);
  const background = expectString(slice.player, 'background', `${path}.player`);
  if (!(background in BACKGROUNDS)) throw new SaveValidationError(`Unbekannter Hintergrund: ${background}`);
  expectNumber(slice.player, 'apartmentRent', `${path}.player`);
  expectNumber(slice.player, 'homeDistrictId', `${path}.player`);
  expectNumber(slice.player, 'reputation', `${path}.player`);
  if (version >= 12) {
    expectString(slice, 'id', path);
    if (!Array.isArray(slice.log) || !Array.isArray(slice.tasks) || !Array.isArray(slice.undoStack)) throw new SaveValidationError(`${path}: Protokoll, Aufgaben oder Rückgängig-Stapel fehlen.`);
    if (!isObject(slice.underworld) || !isObject(slice.factions) || !isObject(slice.politics)) throw new SaveValidationError(`${path}: Unterwelt, Fraktionen oder Politik fehlen.`);
    expectNumber(slice.underworld, 'heat', `${path}.underworld`);
    expectNumber(slice.politics, 'influence', `${path}.politics`);
    if (!isObject(slice.decisions) || !isObject(slice.corporate) || !isObject(slice.research)) throw new SaveValidationError(`${path}: Entscheidungen, Konzern oder Forschung fehlen.`);
    expectNumber(slice.ledger as Record<string, unknown>, 'dirtyBalance', `${path}.ledger`);
  }
  if (version >= 13) {
    if (!isObject(slice.casino) || !isObject((slice.casino as Record<string, unknown>).stats) || !Array.isArray((slice.casino as Record<string, unknown>).history)) throw new SaveValidationError(`${path}.casino fehlt.`);
  }
  if (version >= 14) {
    const p = slice.progression as Record<string, unknown> | undefined;
    if (!isObject(p) || !Array.isArray(p.unlockedRegions) || !Array.isArray(p.milestones)) throw new SaveValidationError(`${path}.progression fehlt.`);
    expectNumber(p, 'level', `${path}.progression`);
    expectNumber(p, 'xp', `${path}.progression`);
  }
}
