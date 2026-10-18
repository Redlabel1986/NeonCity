/**
 * Procedural generation of NOVA ECLIPSE from a seed.
 *
 * Steps:
 *  1. Split the city into four separate maps (quadrants divided by a strip of
 *     blocked land), one per region: Greenhaven (countryside), Silverbrook
 *     (suburb), Neon Central (city) and Nova Eclipse (megacity and harbour).
 *     Within a map, tiles go to the region's districts (noisy Voronoi).
 *  2. Carve the harbour on Nova Eclipse's eastern edge and lakes in Greenhaven.
 *  3. Lay a road grid; split blocks into smaller ones depending on district.
 *  4. Fill blocks with city-owned buildings, parks and empty lots.
 */

import { Rng } from '../core/rng';
import { CityGrid, TileKind } from './grid';
import { DISTRICT_ARCHETYPES, DISTRICT_ORDER, type DistrictArchetype, type DistrictArchetypeId } from '../data/districts';
import { CITY_BUILDING_LABELS } from '../data/buildings';
import { regionOfArchetype, type RegionId } from '../data/regions';
import { MAP_TEMPLATES, MAP_TEMPLATE_SIZE } from '../data/mapTemplates';
import type { Building, District } from '../state';

export interface GeneratedCity {
  grid: CityGrid;
  districts: District[];
  buildings: Record<number, Building>;
  nextBuildingId: number;
}

export const DEFAULT_CITY_SIZE = 128;
/** Extra share of lots left as plazas or green so blocks do not fill up completely. */
const OPEN_SPACE = 0.06;

/** Park tile variants (stored in grid.variant for park tiles). */
export const ParkVariant = { Green: 0, Plaza: 1, Courtyard: 2, Field: 3, Forest: 4, Meadow: 5 } as const;

/** Map (quadrant) of each region: column and row in a 2x2 layout. */
export const MAP_QUADRANT: Record<RegionId, readonly [number, number]> = {
  greenhaven: [0, 0],
  silverbrook: [1, 0],
  neon_central: [0, 1],
  nova_eclipse: [1, 1],
};

/** District centres within their map (fractions of the map) and a size weight (smaller = larger area). */
const DISTRICT_LAYOUT: Record<DistrictArchetypeId, readonly [number, number, number]> = {
  greenhaven: [0.5, 0.5, 1],
  silverbrook: [0.35, 0.38, 1],
  old_city: [0.68, 0.72, 1],
  chrome_district: [0.28, 0.28, 1],
  neon_market: [0.32, 0.72, 1],
  ghost_quarter: [0.75, 0.25, 1.05],
  undercity: [0.74, 0.76, 1.05],
  corporate_heights: [0.35, 0.4, 0.95],
  skyline_gardens: [0.3, 0.82, 1],
  rust_docks: [0.78, 0.62, 1],
};

/** Tile rectangle of a region's map in the new four-map layout. */
export function mapRect(size: number, region: RegionId): { x0: number; y0: number; x1: number; y1: number } {
  const half = Math.floor(size / 2);
  const [qx, qy] = MAP_QUADRANT[region];
  return { x0: qx * half + (qx ? 1 : 0), y0: qy * half + (qy ? 1 : 0), x1: qx ? size - 1 : half - 2, y1: qy ? size - 1 : half - 2 };
}

function quadrantRegion(size: number, x: number, y: number): RegionId {
  const half = Math.floor(size / 2);
  const qx = x >= half ? 1 : 0;
  const qy = y >= half ? 1 : 0;
  return (Object.keys(MAP_QUADRANT) as RegionId[]).find((r) => MAP_QUADRANT[r][0] === qx && MAP_QUADRANT[r][1] === qy)!;
}

export function generateCity(seed: number, size = DEFAULT_CITY_SIZE): GeneratedCity {
  const rng = new Rng(seed).fork('city');
  const grid = new CityGrid(size, size);
  const zones = new Uint8Array(size * size); // template class per tile (0 = none)
  // Everything starts as the blocked strip between maps; each map paints its own land.
  grid.kind.fill(TileKind.Blocked);
  for (const region of Object.keys(MAP_QUADRANT) as RegionId[]) paintTemplate(grid, zones, region);
  const districts = assignDistricts(grid, zones, rng.fork('districts'));
  layZoneRoads(grid, zones, districts);
  grid.recomputeRoadMasks();
  const { buildings, nextBuildingId } = fillBlocks(grid, districts, rng.fork('blocks'));
  finalizeDistricts(grid, districts, rng.fork('stats'));
  return { grid, districts, buildings, nextBuildingId };
}

const ZONE_CODE: Record<string, number> = { Z: 1, S: 2, B: 3, I: 4 };

/** Paints a region's map from its template: water, forest and building zones (scaled to the map's size). */
function paintTemplate(grid: CityGrid, zones: Uint8Array, region: RegionId): void {
  const rect = mapRect(grid.width, region);
  const rows = MAP_TEMPLATES[region];
  const w = rect.x1 - rect.x0 + 1;
  const h = rect.y1 - rect.y0 + 1;
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const tx = Math.min(MAP_TEMPLATE_SIZE - 1, Math.floor(((x - rect.x0) / w) * MAP_TEMPLATE_SIZE));
      const ty = Math.min(MAP_TEMPLATE_SIZE - 1, Math.floor(((y - rect.y0) / h) * MAP_TEMPLATE_SIZE));
      const c = rows[ty]![tx]!;
      const i = grid.index(x, y);
      if (c === 'W') grid.kind[i] = TileKind.Water;
      else if (c === 'F') {
        grid.kind[i] = TileKind.Park;
        grid.variant[i] = ParkVariant.Forest;
      } else {
        grid.kind[i] = TileKind.Lot;
        zones[i] = ZONE_CODE[c] ?? 1;
      }
    }
  }
}

/** Template classes a district prefers: its centre moves to the centroid of those zones. */
const DISTRICT_ZONES: Partial<Record<DistrictArchetypeId, readonly number[]>> = {
  silverbrook: [1],
  old_city: [2, 3, 4],
  skyline_gardens: [1],
  corporate_heights: [3, 2],
  rust_docks: [4, 2],
};

function assignDistricts(grid: CityGrid, zones: Uint8Array, rng: Rng): District[] {
  const districts: District[] = DISTRICT_ORDER.map((archetype, id) => {
    const [fx, fy] = DISTRICT_LAYOUT[archetype];
    const region = regionOfArchetype(archetype);
    const rect = mapRect(grid.width, region);
    const jitter = 0.04;
    let cx = Math.round(rect.x0 + (fx + rng.range(-jitter, jitter)) * (rect.x1 - rect.x0));
    let cy = Math.round(rect.y0 + (fy + rng.range(-jitter, jitter)) * (rect.y1 - rect.y0));
    const preferred = DISTRICT_ZONES[archetype];
    if (preferred) {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let y = rect.y0; y <= rect.y1; y++)
        for (let x = rect.x0; x <= rect.x1; x++)
          if (preferred.includes(zones[grid.index(x, y)]!)) {
            sx += x;
            sy += y;
            n++;
          }
      if (n > 20) {
        cx = Math.round(sx / n);
        cy = Math.round(sy / n);
      }
    }
    return {
      id,
      archetype,
      name: DISTRICT_ARCHETYPES[archetype].name,
      cx,
      cy,
      tileCount: 0,
      stats: { ...DISTRICT_ARCHETYPES[archetype].stats },
      economy: { citizens: 0, employed: 0, dailyWages: 0, dailyRent: 0, dailySpending: 0, dailyVisits: 0, venues: 0 },
    };
  });
  const noise = new ValueNoise(rng.fork('noise'), 12);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const region = quadrantRegion(grid.width, x, y);
      const n = noise.sample(x, y);
      let best = -1;
      let bestDist = Infinity;
      for (const d of districts) {
        if (regionOfArchetype(d.archetype) !== region) continue;
        const dist = Math.hypot(x - d.cx, y - d.cy) * DISTRICT_LAYOUT[d.archetype][2] + (n - 0.5) * 10;
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

/** Road spacing per map: the countryside has few lanes, the city a dense grid. */
const ROAD_SPACING_BY_REGION: Record<RegionId, number> = { greenhaven: 7, silverbrook: 6, neon_central: 5, nova_eclipse: 6 };

/** Roads run only through building zones, so each city keeps the outline of its plan. */
function layZoneRoads(grid: CityGrid, zones: Uint8Array, districts: District[]): void {
  void districts;
  for (const region of Object.keys(MAP_QUADRANT) as RegionId[]) {
    const rect = mapRect(grid.width, region);
    const sp = ROAD_SPACING_BY_REGION[region];
    for (let y = rect.y0; y <= rect.y1; y++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        const i = grid.index(x, y);
        if (!zones[i]) continue;
        if ((x - rect.x0) % sp === 0 || (y - rect.y0) % sp === 0) grid.kind[i] = TileKind.Road;
      }
    }
  }
}

export function carveLakes(grid: CityGrid, districts: District[], rng: Rng, only?: (i: number) => boolean): void {
  const rural = new Set(districts.filter((d) => DISTRICT_ARCHETYPES[d.archetype].style === 'rural').map((d) => d.id));
  if (rural.size === 0) return;
  const noise = new ValueNoise(rng, 9);
  for (let y = 2; y < grid.height - 2; y++) {
    for (let x = 2; x < grid.width - 2; x++) {
      const i = grid.index(x, y);
      if (!rural.has(grid.district[i]!) || (only && !only(i))) continue;
      if (grid.kind[i] === TileKind.Road) continue;
      if (noise.sample(x * 1.6, y * 1.6) > 0.8) grid.kind[i] = TileKind.Water;
    }
  }
}

/** Fills free lots with city buildings, parks and vacant plots (optionally only tiles `only` allows, ids from `startId`). */
export function fillBlocks(
  grid: CityGrid,
  districts: District[],
  rng: Rng,
  only?: (i: number) => boolean,
  startId = 1,
): { buildings: Record<number, Building>; nextBuildingId: number } {
  const buildings: Record<number, Building> = {};
  let nextId = startId;

  const reserved = new Set<number>();
  const isFreeLot = (x: number, y: number): boolean =>
    grid.inBounds(x, y) && grid.kind[grid.index(x, y)] === TileKind.Lot && grid.occupant[grid.index(x, y)] === 0 && !reserved.has(grid.index(x, y)) && (!only || only(grid.index(x, y)));

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
      if (roll < arch.greenery + OPEN_SPACE) {
        grid.kind[grid.index(x, y)] = TileKind.Park;
        if (arch.style === 'rural') {
          // Countryside: fields, forests and flower meadows instead of plazas.
          const r = rng.next();
          grid.variant[grid.index(x, y)] = r < 0.45 ? ParkVariant.Field : r < 0.75 ? ParkVariant.Forest : ParkVariant.Meadow;
        } else if (arch.style === 'suburb') {
          grid.variant[grid.index(x, y)] = rng.chance(0.8) ? ParkVariant.Green : ParkVariant.Plaza;
        } else {
          grid.variant[grid.index(x, y)] = rng.chance(arch.greenery > 0.05 ? 0.7 : 0.35) ? ParkVariant.Green : ParkVariant.Plaza;
        }
        continue;
      }
      if (roll < arch.greenery + OPEN_SPACE + arch.vacancy) {
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
          facing: grid.pickFacing(x, y, fw, fh) ?? 0,
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
