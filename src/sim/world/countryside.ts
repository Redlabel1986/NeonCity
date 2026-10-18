/**
 * Adds the countryside of Greenhaven to cities generated before the regions
 * existed (save v14 and older): a strip along the western edge becomes the
 * Greenhaven district. City buildings there are replaced by villages,
 * fields, forests and lakes; player buildings stay where they are and simply
 * belong to Greenhaven afterwards. Citizens who lived or worked in removed
 * buildings move; new villagers move into the new homes. Deterministic per
 * city seed, so the online world and every client agree.
 */

import { Rng } from '../core/rng';
import { DISTRICT_ARCHETYPES } from '../data/districts';
import type { District, GameState, WorldState } from '../state';
import { TileKind } from './grid';
import { carveLakes, fillBlocks, occupy, vacate } from './generator';
import { generateCitizens } from '../systems/population';
import { withPlayer, SYSTEM_PLAYER_ID } from '../players';

/** Share of the map width that becomes countryside. */
export const COUNTRYSIDE_SHARE = 0.17;

export function hasCountryside(world: WorldState): boolean {
  return world.districts.some((d) => d.archetype === 'greenhaven');
}

/** Converts the western strip into Greenhaven. Returns false when the city already has it. */
export function addCountryside(world: WorldState): boolean {
  if (hasCountryside(world)) return false;
  const { grid } = world;
  const rng = new Rng(`${world.seed}:countryside`);
  const edge = Math.max(6, Math.round(grid.width * COUNTRYSIDE_SHARE));
  // A wavy border instead of a ruler line.
  const border = (y: number): number => edge + Math.round(Math.sin(y * 0.21) * 2 + Math.sin(y * 0.07 + 1.3) * 2);
  const id = world.districts.length;
  const arch = DISTRICT_ARCHETYPES.greenhaven;
  const district: District = {
    id,
    archetype: 'greenhaven',
    name: arch.name,
    cx: Math.round(edge * 0.45),
    cy: Math.round(grid.height / 2),
    tileCount: 0,
    stats: { ...arch.stats },
    economy: { citizens: 0, employed: 0, dailyWages: 0, dailyRent: 0, dailySpending: 0, dailyVisits: 0, venues: 0 },
  };
  world.districts.push(district);
  const inStrip = (x: number, y: number): boolean => x < border(y);

  // 1. Remove city-owned buildings that start in the strip (player buildings, owned properties and rival venues of players stay).
  const view: GameState = withPlayer(world, SYSTEM_PLAYER_ID);
  const removed = new Set<number>();
  for (const b of Object.values(world.buildings)) {
    if (!inStrip(b.x, b.y)) continue;
    if (b.owner !== 'city') {
      b.districtId = id;
      continue;
    }
    vacate(grid, b);
    removed.add(b.id);
    delete world.buildings[b.id];
    delete world.competitors[b.id];
  }

  // 2. Reassign tiles; turn plazas and courtyards back into open land so the countryside can grow.
  const stripTiles = new Set<number>();
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!inStrip(x, y)) continue;
      const i = grid.index(x, y);
      if (grid.kind[i] === TileKind.Water) continue; // harbour water on the far side never reaches here, but stay safe
      grid.district[i] = id;
      stripTiles.add(i);
      if (grid.kind[i] === TileKind.Park || grid.kind[i] === TileKind.Blocked) {
        grid.kind[i] = TileKind.Lot;
        grid.variant[i] = 0;
      }
    }
  }
  // Player buildings partly reaching into the strip keep their own tiles occupied.
  for (const b of Object.values(world.buildings)) if (b.owner !== 'city' || !removed.has(b.id)) occupy(grid, b);

  // 3. Lakes, then villages, fields and forests with the rural archetype.
  const only = (i: number): boolean => stripTiles.has(i) && grid.occupant[i] === 0;
  carveLakes(grid, world.districts, rng.fork('lakes'), only);
  grid.recomputeRoadMasks();
  const filled = fillBlocks(grid, world.districts, rng.fork('blocks'), only, world.nextBuildingId);
  Object.assign(world.buildings, filled.buildings);
  world.nextBuildingId = filled.nextBuildingId;

  // 4. District size and population follow the strip.
  let tiles = 0;
  for (let i = 0; i < grid.district.length; i++) if (grid.district[i] === id && grid.kind[i] !== TileKind.Water) tiles++;
  district.tileCount = tiles;
  const others = world.districts.filter((d) => d.id !== id);
  const avg = others.reduce((s, d) => s + d.tileCount, 0) / Math.max(1, others.length);
  district.stats.population = Math.round(arch.stats.population * (avg > 0 ? tiles / avg : 1));
  // Other districts lost land: shrink their population accordingly.
  for (const d of others) {
    let now = 0;
    for (let i = 0; i < grid.district.length; i++) if (grid.district[i] === d.id && grid.kind[i] !== TileKind.Water) now++;
    if (d.tileCount > 0 && now < d.tileCount) {
      d.stats.population = Math.round(d.stats.population * (now / d.tileCount));
      d.tileCount = now;
    }
  }

  // 5. Citizens: those whose home or work vanished move or lose the job; villagers move into Greenhaven.
  const cityIds = Object.values(world.buildings).filter((b) => b.owner === 'city');
  const pop = world.population;
  pop.citizens = pop.citizens.filter((c) => !removed.has(c.homeBuildingId) || rng.chance(0.4));
  for (const c of pop.citizens) {
    if (removed.has(c.homeBuildingId)) {
      const homes = cityIds.filter((b) => b.districtId === c.districtId);
      c.homeBuildingId = (homes.length > 0 ? rng.pick(homes) : rng.pick(cityIds)).id;
    }
    if (c.workBuildingId !== null && removed.has(c.workBuildingId)) {
      c.workBuildingId = null;
      c.income = 0;
    }
    if (c.favorites.length > 0) c.favorites = c.favorites.filter((f) => !removed.has(f.venueId));
  }
  for (const key of Object.keys(pop.pendingVisits)) if (removed.has(Number(key))) delete pop.pendingVisits[Number(key)];
  generateCitizens(view, rng.fork('villagers'), new Set([id]));
  return true;
}
