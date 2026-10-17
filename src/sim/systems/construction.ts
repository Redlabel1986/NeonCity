/**
 * Construction system: placement validation, cost calculation, progress.
 */

import type { SimContext } from '../core/context';
import type { Building, Facing, GameState } from '../state';
import { TileKind } from '../world/grid';
import { occupy, vacate } from '../world/generator';
import { BUILDING_DEFINITIONS, CURRENT_PHASE, type BuildingDefinition } from '../data/buildings';
import { DIFFICULTIES, BACKGROUNDS } from '../data/difficulty';
import { book, canAfford } from '../economy/finance';
import { createBusinessStateFor } from './businessFactory';
import { techFactors } from './research';
import { tickToDate } from '../core/clock';

export type PlacementError =
  | 'unknown_building'
  | 'not_available'
  | 'out_of_bounds'
  | 'tile_occupied'
  | 'no_road_access'
  | 'entrance_off_road'
  | 'no_power'
  | 'insufficient_funds';

export const PLACEMENT_ERROR_TEXT: Record<PlacementError, string> = {
  unknown_building: 'Unbekannter Gebäudetyp.',
  not_available: 'Dieses Gebäude ist in dieser Entwicklungsphase noch nicht verfügbar.',
  out_of_bounds: 'Das Grundstück liegt außerhalb der Stadtgrenzen.',
  tile_occupied: 'Das Grundstück ist bereits bebaut oder nicht bebaubar.',
  no_road_access: 'Das Gebäude braucht einen Straßenanschluss.',
  entrance_off_road: 'Der Eingang muss zur Straße zeigen. Drehe das Gebäude mit Q oder E.',
  no_power: 'Die Energieversorgung in diesem Bezirk reicht für einen Neubau nicht aus.',
  insufficient_funds: 'Nicht genug Credits für Grundstück und Bau.',
};

export interface PlacementQuote {
  def: BuildingDefinition;
  landCost: number;
  constructionCost: number;
  total: number;
  buildTime: number;
  districtId: number;
}

export interface PlacementCheck {
  ok: boolean;
  error?: PlacementError;
  quote?: PlacementQuote;
  /** Per-tile validity for the renderer ghost. */
  tiles: { x: number; y: number; ok: boolean }[];
  /** Facing that would be used (the requested one, or the automatically chosen road-side edge). */
  facing: Facing;
}

export const MIN_ENERGY_FOR_CONSTRUCTION = 20;

export function quotePlacement(state: GameState, def: BuildingDefinition, districtId: number): PlacementQuote {
  const difficulty = DIFFICULTIES[state.player.difficulty];
  const background = BACKGROUNDS[state.player.background];
  const district = state.districts[districtId]!;
  const tiles = def.footprint.w * def.footprint.h;
  const landCost = Math.round(district.stats.landPrice * tiles * difficulty.costMultiplier);
  const constructionCost = Math.round(def.cost * difficulty.costMultiplier * background.constructionBonus);
  const zoning = state.politics?.laws?.zoning ?? 1;
  const tech = state.research ? techFactors(state) : { buildTime: 1, buildCost: 1 };
  const energyFactor = district.stats.energySupply < 50 ? 1.5 : 1;
  const buildTime = difficulty.instantBuild ? 0 : Math.round(def.buildTimeMinutes * energyFactor * zoning * tech.buildTime);
  const zonedConstruction = Math.round(constructionCost * zoning * tech.buildCost);
  return { def, landCost, constructionCost: zonedConstruction, total: landCost + zonedConstruction, buildTime, districtId };
}

/**
 * Validates a placement. `facing` selects the entrance edge; when omitted the
 * first edge bordering a road is chosen automatically.
 */
export function checkPlacement(state: GameState, defId: string, x: number, y: number, facing?: Facing): PlacementCheck {
  const def = BUILDING_DEFINITIONS[defId];
  const requested: Facing = facing ?? 0;
  if (!def) return { ok: false, error: 'unknown_building', tiles: [], facing: requested };
  const { w, h } = def.footprint;
  const tiles: PlacementCheck['tiles'] = [];
  let allFree = true;
  let allInside = true;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      const inside = state.grid.inBounds(tx, ty);
      const free = inside && state.grid.kindAt(tx, ty) === TileKind.Lot && state.grid.occupantAt(tx, ty) === 0;
      tiles.push({ x: tx, y: ty, ok: free });
      if (!inside) allInside = false;
      if (!free) allFree = false;
    }
  }
  if (def.availability > CURRENT_PHASE) return { ok: false, error: 'not_available', tiles, facing: requested };
  if (!allInside) return { ok: false, error: 'out_of_bounds', tiles, facing: requested };
  if (!allFree) return { ok: false, error: 'tile_occupied', tiles, facing: requested };
  const blocked = tiles.map((t) => ({ ...t, ok: false }));
  if (!state.grid.footprintTouchesRoad(x, y, w, h)) {
    return { ok: false, error: 'no_road_access', tiles: blocked, facing: requested };
  }
  const chosen: Facing | null = facing ?? state.grid.pickFacing(x, y, w, h);
  if (chosen === null) return { ok: false, error: 'no_road_access', tiles: blocked, facing: requested };
  if (!state.grid.edgeTouchesRoad(x, y, w, h, chosen)) {
    return { ok: false, error: 'entrance_off_road', tiles: blocked, facing: chosen };
  }
  const districtId = state.grid.districtAt(x, y);
  const district = state.districts[districtId]!;
  if (district.stats.energySupply < MIN_ENERGY_FOR_CONSTRUCTION) {
    return { ok: false, error: 'no_power', tiles: blocked, quote: undefined, facing: chosen };
  }
  const quote = quotePlacement(state, def, districtId);
  if (!canAfford(state, quote.total)) return { ok: false, error: 'insufficient_funds', quote, tiles, facing: chosen };
  return { ok: true, quote, tiles, facing: chosen };
}

export function placeBuilding(
  ctx: SimContext,
  defId: string,
  x: number,
  y: number,
  facing?: Facing,
): { ok: true; building: Building } | { ok: false; error: PlacementError } {
  const { state, events } = ctx;
  const check = checkPlacement(state, defId, x, y, facing);
  if (!check.ok || !check.quote) return { ok: false, error: check.error ?? 'tile_occupied' };
  const { def, landCost, constructionCost, buildTime, districtId } = check.quote;
  const id = state.nextBuildingId++;
  const rngVariant = ctx.rng.int(0, 255);
  const building: Building = {
    id,
    defId,
    facing: check.facing,
    label: def.name,
    owner: 'player',
    x,
    y,
    w: def.footprint.w,
    h: def.footprint.h,
    floors: def.floors,
    variant: rngVariant,
    districtId,
    status: buildTime === 0 ? 'operational' : 'construction',
    progress: 0,
    buildTime,
    placedTick: state.tick,
    investment: landCost + constructionCost,
  };
  if (def.business) {
    building.business = createBusinessStateFor(def, ctx.rng, tickToDate(state.tick).day, state.tick, state.districts[districtId]!.stats.purchasingPower);
  }
  state.buildings[id] = building;
  occupy(state.grid, building);
  book(state, events, -landCost, { category: 'land', description: `Grundstück für ${def.name}`, buildingId: id });
  book(state, events, -constructionCost, { category: 'construction', description: `Bau: ${def.name}`, buildingId: id });
  if (building.status === 'construction') {
    state.undoStack.push({ buildingId: id, tick: state.tick });
    if (state.undoStack.length > 20) state.undoStack.shift();
  }
  events.emit({ type: 'building:placed', tick: state.tick, buildingId: String(id) });
  if (building.status === 'operational') {
    events.emit({ type: 'building:completed', tick: state.tick, buildingId: String(id) });
    events.emit({ type: 'log', tick: state.tick, level: 'success', message: `${def.name} eröffnet (Sandbox).`, buildingId: String(id) });
  } else {
    events.emit({
      type: 'log',
      tick: state.tick,
      level: 'info',
      message: `Baustelle eröffnet: ${def.name} in ${state.districts[districtId]!.name}.`,
      buildingId: String(id),
    });
  }
  return { ok: true, building };
}

/** Removes a building. Under construction: full refund (undo). Operational: demolition cost, partial land refund. */
export function removeBuilding(
  ctx: SimContext,
  buildingId: number,
  mode: 'undo' | 'demolish',
): { ok: true } | { ok: false; error: string } {
  const { state, events } = ctx;
  const b = state.buildings[buildingId];
  if (!b) return { ok: false, error: 'Gebäude nicht gefunden.' };
  if (b.owner !== 'player') return { ok: false, error: 'Dieses Gebäude gehört dir nicht.' };
  const def = BUILDING_DEFINITIONS[b.defId];
  const name = def?.name ?? b.label;
  if (mode === 'undo') {
    if (b.status !== 'construction') return { ok: false, error: 'Rückgängig ist nur für laufende Baustellen möglich.' };
    book(state, events, b.investment, { category: 'refund', description: `Bau abgebrochen: ${name}`, buildingId });
    events.emit({ type: 'log', tick: state.tick, level: 'info', message: `Baustelle ${name} rückgängig gemacht. Volle Erstattung.` });
  } else {
    const landRefund = Math.round(state.districts[b.districtId]!.stats.landPrice * b.w * b.h * 0.7);
    const demolitionCost = Math.round((def?.cost ?? 1000) * 0.08);
    book(state, events, landRefund, { category: 'land', description: `Grundstücksverkauf: ${name}`, buildingId });
    book(state, events, -demolitionCost, { category: 'demolition', description: `Abriss: ${name}`, buildingId });
    events.emit({ type: 'log', tick: state.tick, level: 'warning', message: `${name} abgerissen.` });
  }
  vacate(state.grid, b);
  delete state.buildings[buildingId];
  delete state.competitors[buildingId];
  // Citizens who lived or worked here move to another city building of the district.
  const replacements = Object.values(state.buildings).filter((x) => x.owner === 'city' && x.districtId === b.districtId);
  for (const c of state.population.citizens) {
    if (c.homeBuildingId === buildingId) c.homeBuildingId = replacements.length > 0 ? ctx.rng.pick(replacements).id : c.workBuildingId ?? c.homeBuildingId;
    if (c.workBuildingId === buildingId) {
      c.workBuildingId = replacements.length > 0 ? ctx.rng.pick(replacements).id : null;
      if (c.workBuildingId === null) c.income = 0;
    }
  }
  if (state.underworld.org) state.underworld.org.operations = state.underworld.org.operations.filter((o) => o.frontBuildingId !== buildingId);
  state.undoStack = state.undoStack.filter((u) => u.buildingId !== buildingId);
  events.emit({ type: 'building:removed', tick: state.tick, buildingId: String(buildingId) });
  return { ok: true };
}

/** Advances all construction sites by one tick (one minute). */
export function stepConstruction(ctx: SimContext): void {
  const { state, events } = ctx;
  for (const id in state.buildings) {
    const b = state.buildings[id]!;
    if (b.status !== 'construction') continue;
    b.progress += 1;
    if (b.progress >= b.buildTime) {
      b.status = 'operational';
      b.progress = b.buildTime;
      const def = BUILDING_DEFINITIONS[b.defId];
      state.undoStack = state.undoStack.filter((u) => u.buildingId !== b.id);
      events.emit({ type: 'building:completed', tick: state.tick, buildingId: String(b.id) });
      events.emit({
        type: 'log',
        tick: state.tick,
        level: 'success',
        message: `${def?.name ?? b.label} fertiggestellt und eröffnet.`,
        buildingId: String(b.id),
      });
    }
  }
}
