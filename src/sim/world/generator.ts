/**
 * Procedural generation of NOVA ECLIPSE from a seed.
 *
 * Steps:
 *  1. Assign every tile to one of the eight district archetypes (noisy Voronoi).
 *  2. Carve the water front on the eastern edge (Rust Docks).
 *  3. Lay a road grid; split blocks into smaller ones depending on district.
 *  4. Fill blocks with city-owned buildings, parks and empty lots.
 */

import { Rng } from '../core/rng';
import { CityGrid, TileKind } from './grid';
import { DISTRICT_ARCHETYPES, DISTRICT_ORDER, type DistrictArchetype, type DistrictArchetypeId } from '../data/districts';
import { CITY_BUILDING_LABELS } from '../data/buildings';
import type { Building, District } from '../state';

export interface GeneratedCity {
  grid: CityGrid;
  districts: District[];
  buildings: Record<number, Building>;
  nextBuildingId: number;
}

export const DEFAULT_CITY_SIZE = 96;
const ROAD_SPACING = 7;
const WATER_WIDTH = 4;

/** Park tile variants (stored in grid.variant for park tiles). */
export const ParkVariant = { Green: 0, Plaza: 1, Courtyard: 2 } as const;

/** Relative district centres (fractions of width / height). */
const DISTRICT_LAYOUT: Record<DistrictArchetypeId, readonly [number, number]> = {
  corporate_heights: [0.5, 0.42],
  skyline_gardens: [0.72, 0.22],
  chrome_district: [0.27, 0.28],
  neon_market: [0.52, 0.7],
  old_city: [0.2, 0.6],
  rust_docks: [0.86, 0.58],
  ghost_quarter: [0.76, 0.88],
  undercity: [0.18, 0.9],
};

const SPLIT_CHANCE: Record<DistrictArchetype['style'], number> = {
  corporate: 0.25,
  market: 0.8,
  docks: 0.35,
  ghost: 0.65,
  old: 0.75,
  chrome: 0.4,
  undercity: 0.85,
  skyline: 0.2,
};

export function generateCity(seed: number, size = DEFAULT_CITY_SIZE): GeneratedCity {
  const rng = new Rng(seed).fork('city');
  const grid = new CityGrid(size, size);
  const districts = assignDistricts(grid, rng.fork('districts'));
  carveWater(grid);
  layRoads(grid, districts, rng.fork('roads'));
  grid.recomputeRoadMasks();
  const { buildings, nextBuildingId } = fillBlocks(grid, districts, rng.fork('blocks'));
  finalizeDistricts(grid, districts, rng.fork('stats'));
  return { grid, districts, buildings, nextBuildingId };
}

function assignDistricts(grid: CityGrid, rng: Rng): District[] {
  const districts: District[] = DISTRICT_ORDER.map((archetype, id) => {
    const [fx, fy] = DISTRICT_LAYOUT[archetype];
    const jitter = 0.04;
    return {
      id,
      archetype,
      name: DISTRICT_ARCHETYPES[archetype].name,
      cx: Math.round((fx + rng.range(-jitter, jitter)) * grid.width),
      cy: Math.round((fy + rng.range(-jitter, jitter)) * grid.height),
      tileCount: 0,
      stats: { ...DISTRICT_ARCHETYPES[archetype].stats },
      economy: { citizens: 0, employed: 0, dailyWages: 0, dailyRent: 0, dailySpending: 0, dailyVisits: 0, venues: 0 },
    };
  });

  const noise = new ValueNoise(rng.fork('noise'), 12);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      let best = 0;
      let bestDist = Infinity;
      const n = noise.sample(x, y);
      for (const d of districts) {
        const dx = x - d.cx;
        const dy = y - d.cy;
        const dist = Math.sqrt(dx * dx + dy * dy) + (n - 0.5) * 14;
        if (dist < bestDist) {
          bestDist = dist;
          best = d.id;
        }
      }
      grid.district[grid.index(x, y)] = best;
    }
  }
  return districts;
}

function carveWater(grid: CityGrid): void {
  const docks = DISTRICT_ORDER.indexOf('rust_docks');
  for (let y = 0; y < grid.height; y++) {
    const wobble = Math.round(Math.sin(y * 0.35) * 1.2);
    for (let x = grid.width - WATER_WIDTH - wobble; x < grid.width; x++) {
      if (x < 0) continue;
      const i = grid.index(x, y);
      grid.kind[i] = TileKind.Water;
      grid.district[i] = docks;
    }
  }
}

function layRoads(grid: CityGrid, districts: District[], rng: Rng): void {
  const w = grid.width;
  const h = grid.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = grid.index(x, y);
      if (grid.kind[i] === TileKind.Water) continue;
      if (x % ROAD_SPACING === 0 || y % ROAD_SPACING === 0) grid.kind[i] = TileKind.Road;
    }
  }
  // Split blocks with a mid-block street depending on district style.
  for (let by = 0; by < h - 1; by += ROAD_SPACING) {
    for (let bx = 0; bx < w - 1; bx += ROAD_SPACING) {
      const cx = bx + Math.floor(ROAD_SPACING / 2);
      const cy = by + Math.floor(ROAD_SPACING / 2);
      if (!grid.inBounds(cx, cy)) continue;
      const district = districts[grid.districtAt(cx, cy)]!;
      const style = DISTRICT_ARCHETYPES[district.archetype].style;
      if (!rng.chance(SPLIT_CHANCE[style])) continue;
      const vertical = rng.chance(0.5);
      const split = bx + 1 + rng.int(2, 3);
      const splitY = by + 1 + rng.int(2, 3);
      for (let k = 1; k < ROAD_SPACING; k++) {
        const x = vertical ? split : bx + k;
        const y = vertical ? by + k : splitY;
        if (!grid.inBounds(x, y)) continue;
        const i = grid.index(x, y);
        if (grid.kind[i] === TileKind.Water) break;
        grid.kind[i] = TileKind.Road;
      }
    }
  }
}

function fillBlocks(
  grid: CityGrid,
  districts: District[],
  rng: Rng,
): { buildings: Record<number, Building>; nextBuildingId: number } {
  const buildings: Record<number, Building> = {};
  let nextId = 1;

  const reserved = new Set<number>();
  const isFreeLot = (x: number, y: number): boolean =>
    grid.inBounds(x, y) && grid.kind[grid.index(x, y)] === TileKind.Lot && grid.occupant[grid.index(x, y)] === 0 && !reserved.has(grid.index(x, y));

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (reserved.has(grid.index(x, y))) continue;
      if (!isFreeLot(x, y)) continue;
      const districtId = grid.districtAt(x, y);
      const district = districts[districtId]!;
      const arch = DISTRICT_ARCHETYPES[district.archetype];
      const roll = rng.next();
      // Occasionally keep a larger vacant plot (2x2 or 2x1) for bigger buildings.
      if (roll < arch.vacancy * 0.5) {
        const sizes: readonly [number, number][] = rng.chance(0.5) ? [[2, 2], [2, 1], [1, 2]] : [[2, 1], [1, 2], [2, 2]];
        let kept = false;
        for (const [pw, ph] of sizes) {
          if (!fitsFreeLots(isFreeLot, x, y, pw, ph, districtId, grid) || !grid.footprintTouchesRoad(x, y, pw, ph)) continue;
          for (let dy = 0; dy < ph; dy++) for (let dx = 0; dx < pw; dx++) reserved.add(grid.index(x + dx, y + dy));
          kept = true;
          break;
        }
        if (kept) continue;
      }
      if (roll < arch.greenery) {
        grid.kind[grid.index(x, y)] = TileKind.Park;
        grid.variant[grid.index(x, y)] = rng.chance(0.7) ? ParkVariant.Green : ParkVariant.Plaza;
        continue;
      }
      if (roll < arch.greenery + arch.vacancy) {
        // Leave as an empty lot, but only when a road is reachable; otherwise courtyard.
        if (!grid.footprintTouchesRoad(x, y, 1, 1)) {
          grid.kind[grid.index(x, y)] = TileKind.Park;
          grid.variant[grid.index(x, y)] = ParkVariant.Courtyard;
        }
        continue;
      }
      const footprint = pickFootprint(arch, rng);
      let placed = false;
      for (const [fw, fh] of [footprint, [1, 1] as const]) {
        if (!fitsFreeLots(isFreeLot, x, y, fw, fh, districtId, grid)) continue;
        if (!grid.footprintTouchesRoad(x, y, fw, fh)) continue;
        const id = nextId++;
        const floors = rng.int(arch.floors[0], arch.floors[1]);
        const labels = CITY_BUILDING_LABELS[arch.style];
        const b: Building = {
          id,
          defId: 'city',
          cityStyle: arch.style,
          label: rng.pick(labels),
          owner: 'city',
          x,
          y,
          w: fw,
          h: fh,
          floors,
          variant: rng.int(0, 255),
          districtId,
          status: 'operational',
          progress: 0,
          buildTime: 0,
          placedTick: 0,
          investment: 0,
        };
        buildings[id] = b;
        occupy(grid, b);
        placed = true;
        break;
      }
      if (!placed) {
        grid.kind[grid.index(x, y)] = TileKind.Park;
        grid.variant[grid.index(x, y)] = ParkVariant.Courtyard;
      }
    }
  }
  return { buildings, nextBuildingId: nextId };
}

function pickFootprint(arch: DistrictArchetype, rng: Rng): readonly [number, number] {
  const total = arch.footprints.reduce((s, f) => s + f[2], 0);
  let r = rng.next() * total;
  for (const [w, h, weight] of arch.footprints) {
    r -= weight;
    if (r <= 0) return [w, h];
  }
  const last = arch.footprints[arch.footprints.length - 1]!;
  return [last[0], last[1]];
}

function fitsFreeLots(
  isFreeLot: (x: number, y: number) => boolean,
  x: number,
  y: number,
  w: number,
  h: number,
  districtId: number,
  grid: CityGrid,
): boolean {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (!isFreeLot(x + dx, y + dy)) return false;
      if (grid.districtAt(x + dx, y + dy) !== districtId) return false;
    }
  }
  return true;
}

/** Marks the footprint tiles as occupied by the building. */
export function occupy(grid: CityGrid, b: Building): void {
  for (let dy = 0; dy < b.h; dy++) {
    for (let dx = 0; dx < b.w; dx++) {
      const i = grid.index(b.x + dx, b.y + dy);
      grid.kind[i] = TileKind.Building;
      grid.occupant[i] = b.id;
    }
  }
}

/** Frees the footprint tiles, turning them back into empty lots. */
export function vacate(grid: CityGrid, b: Building): void {
  for (let dy = 0; dy < b.h; dy++) {
    for (let dx = 0; dx < b.w; dx++) {
      const i = grid.index(b.x + dx, b.y + dy);
      grid.kind[i] = TileKind.Lot;
      grid.occupant[i] = 0;
      grid.variant[i] = 0;
    }
  }
}

function finalizeDistricts(grid: CityGrid, districts: District[], rng: Rng): void {
  const counts = new Array<number>(districts.length).fill(0);
  for (let i = 0; i < grid.district.length; i++) {
    if (grid.kind[i] === TileKind.Water) continue;
    counts[grid.district[i]!]!++;
  }
  const averageTiles = counts.reduce((a, b) => a + b, 0) / districts.length;
  for (const d of districts) {
    d.tileCount = counts[d.id]!;
    const sizeFactor = averageTiles > 0 ? d.tileCount / averageTiles : 1;
    const s = d.stats;
    s.population = Math.round(s.population * sizeFactor * rng.range(0.9, 1.1));
    for (const key of Object.keys(s) as (keyof typeof s)[]) {
      if (key === 'population') continue;
      const jitter = rng.range(0.93, 1.07);
      const value = s[key] * jitter;
      s[key] = key === 'rentIndex' || key === 'landPrice' ? Math.round(value) : clamp(Math.round(value), 0, 100);
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Small smooth value-noise helper for organic district borders. */
class ValueNoise {
  private readonly values: Float32Array;
  private readonly size: number;
  constructor(rng: Rng, size: number) {
    this.size = size;
    this.values = new Float32Array(size * size);
    for (let i = 0; i < this.values.length; i++) this.values[i] = rng.next();
  }
  sample(x: number, y: number): number {
    const fx = (x / 10) % this.size;
    const fy = (y / 10) % this.size;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const v = (ix: number, iy: number): number =>
      this.values[((iy + this.size) % this.size) * this.size + ((ix + this.size) % this.size)]!;
    const a = lerp(v(x0, y0), v(x0 + 1, y0), tx);
    const b = lerp(v(x0, y0 + 1), v(x0 + 1, y0 + 1), tx);
    return lerp(a, b, ty);
  }
}

function lerp(a: number, b: number, t: number): number {
  const s = t * t * (3 - 2 * t);
  return a + (b - a) * s;
}
