/**
 * Procedural art: every tile and building texture is drawn with vector
 * primitives at runtime and cached. No external image assets are used.
 *
 * Each generated texture comes with an offset (ox, oy) relative to the
 * isometric origin of the tile / building (its top corner in tile space).
 */

import { Container, Graphics, Text, Texture, type Renderer } from 'pixi.js';
import { FLOOR_H, HALF_H, HALF_W, TILE_H } from './iso';
import { RoadDir, TileKind } from '../sim/world/grid';
import { ParkVariant } from '../sim/world/generator';

export interface GeneratedTexture {
  texture: Texture;
  ox: number;
  oy: number;
}

export type ArtStyle = 'corporate' | 'market' | 'docks' | 'ghost' | 'old' | 'chrome' | 'undercity' | 'skyline' | 'player';

export interface BuildingArtKey {
  art: 'city' | 'ramen' | 'foodstand' | 'capsule_hotel' | 'taxi_depot' | 'kiosk' | 'diner' | 'security_hq' | 'lab' | 'factory';
  style: ArtStyle;
  w: number;
  h: number;
  floors: number;
  /** Small variation seed (0-3). */
  seed: number;
  construction: boolean;
}

interface Palette {
  wallLeft: number;
  wallRight: number;
  roof: number;
  trim: number;
  window: number;
  lit: number[];
  neon: number[];
  litRatio: number;
}

const PALETTES: Record<ArtStyle, Palette> = {
  corporate: { wallLeft: 0x27344e, wallRight: 0x344768, roof: 0x40557b, trim: 0x3a5a86, window: 0x0d1626, lit: [0x9fd8ff, 0xd6ecff, 0xd6ecff, 0x7fc8ff], neon: [0x19e6ff], litRatio: 0.42 },
  market: { wallLeft: 0x3d2e4a, wallRight: 0x513c60, roof: 0x554168, trim: 0x6a3f7a, window: 0x160f1c, lit: [0xffd08a, 0xffe6b0, 0xffe6b0, 0xff8ad6], neon: [0xff2bd6, 0x19e6ff, 0x8cff3a], litRatio: 0.45 },
  docks: { wallLeft: 0x513c2c, wallRight: 0x684e36, roof: 0x66513e, trim: 0x8a5a2a, window: 0x1c140d, lit: [0xffc070, 0xffe0b0], neon: [0xff8a1f], litRatio: 0.22 },
  ghost: { wallLeft: 0x2d2339, wallRight: 0x3c2f4b, roof: 0x342a43, trim: 0x4a2a66, window: 0x0e0a12, lit: [0xc08aff, 0xffd08a, 0xffe6b0], neon: [0x9b30ff, 0xff2bd6], litRatio: 0.18 },
  old: { wallLeft: 0x513f3c, wallRight: 0x68514b, roof: 0x544441, trim: 0x7a5a48, window: 0x1a1210, lit: [0xffd89a, 0xffe8c0, 0xffe8c0], neon: [0xffb020], litRatio: 0.38 },
  chrome: { wallLeft: 0x3c485b, wallRight: 0x516177, roof: 0x66788f, trim: 0x8ad6ea, window: 0x101820, lit: [0xd9f6ff, 0xb0e8f4, 0xffffff], neon: [0x19e6ff, 0xd9f6ff], litRatio: 0.4 },
  undercity: { wallLeft: 0x2a2f31, wallRight: 0x373f41, roof: 0x3c4446, trim: 0x4a6a3a, window: 0x0c1010, lit: [0xc8ff9a, 0xffd89a, 0xffd89a], neon: [0x8cff3a], litRatio: 0.28 },
  skyline: { wallLeft: 0x514939, wallRight: 0x685e49, roof: 0x7b6e5b, trim: 0xd4b872, window: 0x1a160e, lit: [0xffe8b0, 0xfff4d8, 0xffffff], neon: [0xffe08a], litRatio: 0.35 },
  player: { wallLeft: 0x512e34, wallRight: 0x683c43, roof: 0x5f3c46, trim: 0xff8a1f, window: 0x1a0e10, lit: [0xffd08a, 0xffb020], neon: [0xff2bd6, 0xffb020], litRatio: 0.9 },
};

export const LOT_TINT: Record<ArtStyle, number> = {
  corporate: 0x141a26,
  market: 0x1c1420,
  docks: 0x1e1812,
  ghost: 0x161020,
  old: 0x1c1816,
  chrome: 0x161c22,
  undercity: 0x121616,
  skyline: 0x1c1a14,
  player: 0x16121c,
};

function hash32(a: number, b: number, c: number, d: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519 + d * 3266489917) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class ArtCache {
  private readonly renderer: Renderer;
  private readonly cache = new Map<string, GeneratedTexture>();

  constructor(renderer: Renderer) {
    this.renderer = renderer;
  }

  get size(): number {
    return this.cache.size;
  }

  destroy(): void {
    for (const t of this.cache.values()) t.texture.destroy(true);
    this.cache.clear();
  }

  private generate(key: string, draw: (c: Container) => void, resolution = 2): GeneratedTexture {
    const cached = this.cache.get(key);
    if (cached) return cached;
    const container = new Container();
    draw(container);
    const bounds = container.getLocalBounds();
    const texture = this.renderer.generateTexture({ target: container, resolution, antialias: true });
    const result = { texture, ox: bounds.minX, oy: bounds.minY };
    container.destroy({ children: true });
    this.cache.set(key, result);
    return result;
  }

  // ---------------------------------------------------------------- ground

  ground(kind: number, variant: number, style: ArtStyle): GeneratedTexture {
    return this.generate(`g:${kind}:${variant}:${style}`, (c) => drawGround(c, kind, variant, style));
  }

  /** Additive night layer for ground tiles (street lights, lot markers). Returns null when the tile emits nothing. */
  groundNight(kind: number, variant: number, x: number, y: number): GeneratedTexture | null {
    if (kind === TileKind.Road) {
      const intersection = variant === 15 || variant === 7 || variant === 11 || variant === 13 || variant === 14;
      const lamp = intersection || (x + y) % 3 === 0;
      if (!lamp) return null;
      return this.generate(`gn:road:${intersection ? 1 : 0}`, (c) => drawStreetLight(c, intersection));
    }
    if (kind === TileKind.Lot) return this.generate('gn:lot', (c) => drawLotMarkerNight(c));
    return null;
  }

  // ------------------------------------------------------------- buildings

  building(key: BuildingArtKey, night: boolean): GeneratedTexture {
    const k = `b:${key.art}:${key.style}:${key.w}x${key.h}:${key.floors}:${key.seed}:${key.construction ? 'c' : 'o'}:${night ? 'n' : 'd'}`;
    return this.generate(k, (c) => drawBuilding(c, key, night), key.w * key.h <= 1 ? 2 : 1.5);
  }
}

// ======================================================================
// Ground
// ======================================================================

function diamond(g: Graphics, inset = 0): Graphics {
  return g.poly([0, inset, HALF_W - inset * 2, HALF_H, 0, TILE_H - inset, -HALF_W + inset * 2, HALF_H]);
}

function drawGround(c: Container, kind: number, variant: number, style: ArtStyle): void {
  const g = new Graphics();
  c.addChild(g);
  switch (kind) {
    case TileKind.Road:
      drawRoad(g, variant);
      break;
    case TileKind.Lot:
      diamond(g).fill(LOT_TINT[style]);
      diamond(g, 3).stroke({ width: 1, color: 0x6a5a8a, alpha: 0.55 });
      g.poly([0, 10, 6, 13, 0, 16, -6, 13]).fill({ color: 0x8a7ab0, alpha: 0.35 });
      break;
    case TileKind.Park:
      drawPark(g, variant);
      break;
    case TileKind.Water:
      diamond(g).fill(0x071224);
      g.moveTo(-18, 12).lineTo(-6, 15).lineTo(6, 12).stroke({ width: 1, color: 0x1b3f6a, alpha: 0.8 });
      g.moveTo(-8, 20).lineTo(4, 23).lineTo(16, 20).stroke({ width: 1, color: 0x1b3f6a, alpha: 0.6 });
      break;
    case TileKind.Building:
      diamond(g).fill(0x0e0d14);
      break;
    default:
      diamond(g).fill(0x15131c);
  }
}

function drawRoad(g: Graphics, mask: number): void {
  diamond(g).fill(0x16161e);
  // Sidewalks on edges that do not continue into a road.
  const curb = 0x2a2834;
  const edge = 6;
  if (!(mask & RoadDir.N)) g.poly([0, 0, HALF_W, HALF_H, HALF_W - edge * 2, HALF_H + 0, 0, edge]).fill(curb);
  if (!(mask & RoadDir.E)) g.poly([HALF_W, HALF_H, 0, TILE_H, 0, TILE_H - edge, HALF_W - edge * 2, HALF_H]).fill(curb);
  if (!(mask & RoadDir.S)) g.poly([0, TILE_H, -HALF_W, HALF_H, -HALF_W + edge * 2, HALF_H, 0, TILE_H - edge]).fill(curb);
  if (!(mask & RoadDir.W)) g.poly([-HALF_W, HALF_H, 0, 0, 0, edge, -HALF_W + edge * 2, HALF_H]).fill(curb);
  // Lane markings towards connected neighbours.
  const cx = 0;
  const cy = HALF_H;
  const mark = { width: 1.2, color: 0xa08a3a, alpha: 0.55 };
  if (mask & RoadDir.N) g.moveTo(cx, cy).lineTo(HALF_W / 2, HALF_H / 2).stroke(mark);
  if (mask & RoadDir.E) g.moveTo(cx, cy).lineTo(HALF_W / 2, HALF_H * 1.5).stroke(mark);
  if (mask & RoadDir.S) g.moveTo(cx, cy).lineTo(-HALF_W / 2, HALF_H * 1.5).stroke(mark);
  if (mask & RoadDir.W) g.moveTo(cx, cy).lineTo(-HALF_W / 2, HALF_H / 2).stroke(mark);
  // Wet asphalt sheen
  g.poly([0, 4, 8, 8, 0, 12, -8, 8]).fill({ color: 0x3a3a4a, alpha: 0.18 });
}

function drawPark(g: Graphics, variant: number): void {
  if (variant === ParkVariant.Plaza) {
    diamond(g).fill(0x23222c);
    g.moveTo(-HALF_W / 2, HALF_H / 2).lineTo(HALF_W / 2, HALF_H * 1.5).stroke({ width: 1, color: 0x34323f, alpha: 0.9 });
    g.moveTo(HALF_W / 2, HALF_H / 2).lineTo(-HALF_W / 2, HALF_H * 1.5).stroke({ width: 1, color: 0x34323f, alpha: 0.9 });
    g.circle(0, HALF_H, 4).fill(0x2f4a5a);
    return;
  }
  if (variant === ParkVariant.Courtyard) {
    diamond(g).fill(0x141318);
    g.rect(-8, 10, 10, 6).fill(0x2a2a34);
    g.rect(2, 16, 6, 4).fill(0x25252e);
    return;
  }
  diamond(g).fill(0x0f2a1e);
  const trees: [number, number, number][] = [
    [-10, 12, 6],
    [8, 18, 5],
    [2, 8, 4],
  ];
  for (const [x, y, r] of trees) {
    g.circle(x, y + 2, r).fill({ color: 0x06140e, alpha: 0.8 });
    g.circle(x, y - 2, r).fill(0x1c5a38);
    g.circle(x - 1, y - 4, r * 0.6).fill(0x2f8a52);
  }
}

function drawStreetLight(c: Container, intersection: boolean): void {
  const g = new Graphics();
  c.addChild(g);
  const color = intersection ? 0x19e6ff : 0xffb020;
  const cx = 0;
  const cy = HALF_H;
  for (let i = 2; i >= 1; i--) {
    g.ellipse(cx, cy, 9 * i, 4.5 * i).fill({ color, alpha: 0.06 });
  }
  g.ellipse(cx, cy, 4, 2).fill({ color, alpha: 0.3 });
}

function drawLotMarkerNight(c: Container): void {
  const g = new Graphics();
  c.addChild(g);
  g.circle(0, 13, 6).fill({ color: 0x9b30ff, alpha: 0.12 });
  g.circle(0, 13, 2.5).fill({ color: 0xc08aff, alpha: 0.6 });
}

// ======================================================================
// Buildings
// ======================================================================

interface Box {
  w: number;
  h: number;
  H: number;
}

/** Corner points of the footprint diamond (local, origin at top corner). */
function corners(w: number, h: number): { p0: [number, number]; p1: [number, number]; p2: [number, number]; p3: [number, number] } {
  return {
    p0: [0, 0],
    p1: [w * HALF_W, w * HALF_H],
    p2: [(w - h) * HALF_W, (w + h) * HALF_H],
    p3: [-h * HALF_W, h * HALF_H],
  };
}

function drawBuilding(c: Container, key: BuildingArtKey, night: boolean): void {
  const g = new Graphics();
  c.addChild(g);
  if (key.construction) {
    if (!night) drawConstructionSite(g, key);
    else drawConstructionNight(g, key);
    return;
  }
  switch (key.art) {
    case 'foodstand':
      drawFoodStand(c, g, key, night);
      return;
    case 'ramen':
      drawRamenBar(c, g, key, night);
      return;
    case 'kiosk':
    case 'diner':
      drawShop(c, g, key, night, key.art === 'kiosk' ? 'KIOSK' : 'DINER', key.art === 'kiosk' ? 0x8cff3a : 0x19e6ff);
      return;
    case 'capsule_hotel':
      drawCityBuilding(g, { ...key, style: 'chrome' }, night);
      if (night) drawNeonStrip(g, { w: key.w, h: key.h, H: key.floors * FLOOR_H }, 0x19e6ff, 1, true, 0.1, 0.9);
      else drawNeonStrip(g, { w: key.w, h: key.h, H: key.floors * FLOOR_H }, 0x19e6ff, 1, false, 0.1, 0.9);
      return;
    case 'lab':
      drawCityBuilding(g, { ...key, style: 'chrome' }, night);
      drawNeonStrip(g, { w: key.w, h: key.h, H: key.floors * FLOOR_H }, 0x8cff3a, 2, night, 0.1, 0.9);
      return;
    case 'factory':
      drawCityBuilding(g, { ...key, style: 'docks' }, night);
      drawNeonStrip(g, { w: key.w, h: key.h, H: key.floors * FLOOR_H }, 0xff8a1f, 0, night, 0.05, 0.95);
      return;
    case 'security_hq':
      drawCityBuilding(g, { ...key, style: 'corporate' }, night);
      drawNeonStrip(g, { w: key.w, h: key.h, H: key.floors * FLOOR_H }, 0xff3a5a, 0, night, 0.05, 0.95);
      return;
    case 'taxi_depot':
      drawCityBuilding(g, { ...key, style: 'docks' }, night);
      drawNeonStrip(g, { w: key.w, h: key.h, H: key.floors * FLOOR_H }, 0xffb020, 0, night, 0.05, 0.95);
      return;
    default:
      drawCityBuilding(g, key, night);
  }
}

function drawBox(g: Graphics, box: Box, pal: Palette): void {
  const { p0, p1, p2, p3 } = corners(box.w, box.h);
  const H = box.H;
  // base shadow
  g.poly([p0[0], p0[1] + 2, p1[0] + 3, p1[1] + 2, p2[0], p2[1] + 4, p3[0] - 3, p3[1] + 2]).fill({ color: 0x000000, alpha: 0.45 });
  // walls
  g.poly([p3[0], p3[1], p2[0], p2[1], p2[0], p2[1] - H, p3[0], p3[1] - H]).fill(pal.wallLeft);
  g.poly([p2[0], p2[1], p1[0], p1[1], p1[0], p1[1] - H, p2[0], p2[1] - H]).fill(pal.wallRight);
  // roof
  g.poly([p0[0], p0[1] - H, p1[0], p1[1] - H, p2[0], p2[1] - H, p3[0], p3[1] - H]).fill(pal.roof);
  // edges
  g.moveTo(p3[0], p3[1] - H).lineTo(p2[0], p2[1] - H).lineTo(p1[0], p1[1] - H).stroke({ width: 1, color: pal.trim, alpha: 0.5 });
  g.moveTo(p2[0], p2[1]).lineTo(p2[0], p2[1] - H).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
}

/** Draws window grids on both visible walls. `night` draws only lit windows (for the additive layer). */
function drawWindows(g: Graphics, box: Box, pal: Palette, key: BuildingArtKey, night: boolean): void {
  const { p2, p3 } = corners(box.w, box.h);
  const floors = key.floors;
  const colsPerTile = 2;
  const winW = 0.22;
  const winH = Math.min(5, FLOOR_H - 5);
  const draw = (
    base: [number, number],
    dir: [number, number],
    tiles: number,
    wallId: number,
  ): void => {
    for (let f = 0; f < floors; f++) {
      const yOff = f * FLOOR_H + 3;
      for (let col = 0; col < tiles * colsPerTile; col++) {
        const t = (col + 0.5) / colsPerTile - winW / 2;
        const r = hash32(key.seed * 7 + wallId, f, col, key.floors);
        const lit = r < pal.litRatio;
        if (night && !lit) continue;
        const x0 = base[0] + dir[0] * t;
        const y0 = base[1] + dir[1] * t - yOff;
        const x1 = base[0] + dir[0] * (t + winW);
        const y1 = base[1] + dir[1] * (t + winW) - yOff;
        const color = night ? pal.lit[Math.floor(r * 977) % pal.lit.length]! : pal.window;
        const nightAlpha = 0.22 + ((r * 7919) % 1) * 0.28;
        g.poly([x0, y0, x1, y1, x1, y1 - winH, x0, y0 - winH]).fill({ color, alpha: night ? nightAlpha : 1 });
        if (!night) {
          g.moveTo(x0, y0 - winH).lineTo(x1, y1 - winH).stroke({ width: 0.7, color: 0xffffff, alpha: 0.12 });
        }
      }
    }
  };
  draw(p3, [HALF_W, HALF_H], box.h, 1);
  draw(p2, [HALF_W, -HALF_H], box.w, 2);
}

function drawRoofDetails(g: Graphics, box: Box, pal: Palette, key: BuildingArtKey, night: boolean): void {
  const { p0 } = corners(box.w, box.h);
  const H = box.H;
  const cx = p0[0] + ((box.w - box.h) * HALF_W) / 2;
  const cy = p0[1] + ((box.w + box.h) * HALF_H) / 2 - H;
  const r = hash32(key.seed, box.w, box.h, 99);
  if (night) {
    // Beacon light on tall buildings
    if (key.floors >= 10) {
      g.circle(cx, cy - 16, 5).fill({ color: 0xff2b4a, alpha: 0.35 });
      g.circle(cx, cy - 16, 1.8).fill({ color: 0xff6a7a, alpha: 0.9 });
    }
    return;
  }
  // AC unit
  const ax = cx - 8 + r * 6;
  const ay = cy + 2;
  g.poly([ax, ay, ax + 6, ay + 3, ax + 6, ay - 2, ax, ay - 5]).fill(0x3a3a46);
  g.poly([ax, ay - 5, ax + 6, ay - 2, ax, ay + 1, ax - 6, ay - 2]).fill(0x4a4a58);
  g.poly([ax - 6, ay - 2, ax, ay + 1, ax, ay + 4, ax - 6, ay + 1]).fill(0x2e2e38);
  // Antenna / spire
  if (key.floors >= 6 || key.style === 'corporate') {
    g.moveTo(cx + 6, cy - 2).lineTo(cx + 6, cy - 14 - (key.style === 'corporate' ? 10 : 0)).stroke({ width: 1, color: pal.trim, alpha: 0.9 });
  }
  if (key.style === 'docks') {
    g.rect(cx - 12, cy - 18, 4, 18).fill(0x5a4030);
    g.circle(cx - 10, cy - 22, 4).fill({ color: 0x777777, alpha: 0.25 });
  }
  if (key.style === 'skyline') {
    g.circle(cx - 6, cy + 4, 4).fill(0x1f6a3a);
    g.circle(cx + 10, cy + 2, 3).fill(0x2a8a4a);
  }
}

function drawNeonStrip(g: Graphics, box: Box, color: number, floor: number, night: boolean, fromT = 0.15, toT = 0.85): void {
  const { p2 } = corners(box.w, box.h);
  const dir: [number, number] = [HALF_W, -HALF_H];
  const yOff = floor * FLOOR_H + FLOOR_H - 2;
  const t0 = fromT * box.w;
  const t1 = toT * box.w;
  const x0 = p2[0] + dir[0] * t0;
  const y0 = p2[1] + dir[1] * t0 - yOff;
  const x1 = p2[0] + dir[0] * t1;
  const y1 = p2[1] + dir[1] * t1 - yOff;
  if (night) {
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 6, color, alpha: 0.14 });
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 2.5, color, alpha: 0.4 });
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 1, color: 0xffffff, alpha: 0.7 });
  } else {
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 1.6, color, alpha: 0.7 });
  }
}

function drawBillboard(g: Graphics, box: Box, key: BuildingArtKey, night: boolean): void {
  const { p0 } = corners(box.w, box.h);
  const H = box.H;
  const cx = p0[0] + ((box.w - box.h) * HALF_W) / 2 + 10;
  const cy = p0[1] + ((box.w + box.h) * HALF_H) / 2 - H - 6;
  const bw = 22;
  const bh = 12;
  const colors = [0x19e6ff, 0xff2bd6, 0x8cff3a, 0xffb020];
  const color = colors[(key.seed + key.floors) % colors.length]!;
  if (!night) {
    g.moveTo(cx, cy).lineTo(cx, cy + 8).stroke({ width: 1.5, color: 0x55556a });
    g.poly([cx - bw / 2, cy - bh / 2 - 6, cx + bw / 2, cy - bh / 2 - 6 - 5, cx + bw / 2, cy + bh / 2 - 6 - 5, cx - bw / 2, cy + bh / 2 - 6]).fill(0x1c1c28);
    return;
  }
  g.poly([cx - bw / 2, cy - bh / 2 - 6, cx + bw / 2, cy - bh / 2 - 6 - 5, cx + bw / 2, cy + bh / 2 - 6 - 5, cx - bw / 2, cy + bh / 2 - 6]).fill({ color, alpha: 0.55 });
  g.poly([cx - bw / 2 - 4, cy - bh / 2 - 10, cx + bw / 2 + 4, cy - bh / 2 - 17, cx + bw / 2 + 4, cy + bh / 2 - 7, cx - bw / 2 - 4, cy + bh / 2 - 2]).fill({ color, alpha: 0.12 });
}

function drawCityBuilding(g: Graphics, key: BuildingArtKey, night: boolean): void {
  const pal = PALETTES[key.style];
  const box: Box = { w: key.w, h: key.h, H: key.floors * FLOOR_H };
  if (!night) {
    drawBox(g, box, pal);
    drawWindows(g, box, pal, key, false);
    drawRoofDetails(g, box, pal, key, false);
    // Ground-floor shopfront for commercial styles
    if (key.style === 'market' || key.style === 'old' || key.style === 'ghost' || key.style === 'undercity') {
      drawNeonStrip(g, box, pal.neon[key.seed % pal.neon.length]!, 0, false);
    }
    if ((key.style === 'corporate' || key.style === 'market' || key.style === 'chrome') && key.w >= 2 && key.seed % 2 === 0) {
      drawBillboard(g, box, key, false);
    }
    return;
  }
  drawWindows(g, box, pal, key, true);
  drawRoofDetails(g, box, pal, key, true);
  if (key.style === 'market' || key.style === 'old' || key.style === 'ghost' || key.style === 'undercity') {
    drawNeonStrip(g, box, pal.neon[key.seed % pal.neon.length]!, 0, true);
  }
  if (key.style === 'market' && key.floors >= 3) {
    drawNeonStrip(g, box, pal.neon[(key.seed + 1) % pal.neon.length]!, 1, true, 0.3, 0.7);
  }
  if ((key.style === 'corporate' || key.style === 'market' || key.style === 'chrome') && key.w >= 2 && key.seed % 2 === 0) {
    drawBillboard(g, box, key, true);
  }
  if (key.style === 'corporate' || key.style === 'skyline') {
    // Roof edge light line
    const { p1, p2, p3 } = corners(box.w, box.h);
    g.moveTo(p3[0], p3[1] - box.H).lineTo(p2[0], p2[1] - box.H).lineTo(p1[0], p1[1] - box.H).stroke({ width: 1.2, color: pal.neon[0]!, alpha: 0.6 });
  }
}

function drawRamenBar(c: Container, g: Graphics, key: BuildingArtKey, night: boolean): void {
  const pal = PALETTES.player;
  const box: Box = { w: 1, h: 1, H: 2 * FLOOR_H + 4 };
  const { p1, p2, p3 } = corners(1, 1);
  if (!night) {
    drawBox(g, box, pal);
    // Awning along the right wall
    const yA = FLOOR_H + 2;
    g.poly([p2[0], p2[1] - yA, p1[0], p1[1] - yA, p1[0] + 4, p1[1] - yA + 5, p2[0] + 4, p2[1] - yA + 5]).fill(0xc0282e);
    g.poly([p2[0], p2[1] - yA, p1[0], p1[1] - yA, p1[0] + 4, p1[1] - yA + 5, p2[0] + 4, p2[1] - yA + 5]).stroke({ width: 1, color: 0xffd0a0, alpha: 0.5 });
    // Door and window on the right wall
    g.poly([p2[0] + 6, p2[1] - 3, p2[0] + 11, p2[1] - 5.5, p2[0] + 11, p2[1] - 14, p2[0] + 6, p2[1] - 11.5]).fill(0x2a1a1c);
    g.poly([p2[0] + 16, p2[1] - 8, p2[0] + 26, p2[1] - 13, p2[0] + 26, p2[1] - 19, p2[0] + 16, p2[1] - 14]).fill(0x3c2628);
    // Windows left wall upper floor
    drawWindows(g, box, pal, { ...key, floors: 2 }, false);
    // Lanterns
    g.circle(p2[0] + 14, p2[1] - FLOOR_H - 9, 2.2).fill(0xd84a2a);
    g.circle(p2[0] + 22, p2[1] - FLOOR_H - 13, 2.2).fill(0xd84a2a);
    // Sign board
    const sign = new Text({ text: 'RAMEN', style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 10, fontWeight: '900', fill: 0xffb020, letterSpacing: 1 } });
    sign.position.set(p2[0] + 7, p2[1] - box.H + 2);
    sign.skew.y = -0.4636;
    c.addChild(sign);
    // Steam vent
    g.circle(p3[0] + 8, p3[1] - box.H - 4, 3).fill({ color: 0xaaaaaa, alpha: 0.18 });
    g.circle(p3[0] + 10, p3[1] - box.H - 8, 2.2).fill({ color: 0xaaaaaa, alpha: 0.12 });
    return;
  }
  // Night: warm window light, neon sign glow, lanterns
  g.poly([p2[0] + 16, p2[1] - 8, p2[0] + 26, p2[1] - 13, p2[0] + 26, p2[1] - 19, p2[0] + 16, p2[1] - 14]).fill({ color: 0xffb020, alpha: 0.75 });
  g.poly([p2[0] + 6, p2[1] - 3, p2[0] + 11, p2[1] - 5.5, p2[0] + 11, p2[1] - 14, p2[0] + 6, p2[1] - 11.5]).fill({ color: 0xffd27a, alpha: 0.5 });
  drawWindows(g, box, pal, { ...key, floors: 2 }, true);
  for (const [lx, ly] of [
    [p2[0] + 14, p2[1] - FLOOR_H - 9],
    [p2[0] + 22, p2[1] - FLOOR_H - 13],
  ] as const) {
    g.circle(lx, ly, 7).fill({ color: 0xff4a2a, alpha: 0.18 });
    g.circle(lx, ly, 2.4).fill({ color: 0xffa070, alpha: 0.95 });
  }
  const sign = new Text({ text: 'RAMEN', style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 10, fontWeight: '900', fill: 0xffe08a, letterSpacing: 1, dropShadow: { color: 0xff2bd6, blur: 6, distance: 0, alpha: 0.9 } } });
  sign.position.set(p2[0] + 7, p2[1] - box.H + 2);
  sign.skew.y = -0.4636;
  c.addChild(sign);
  g.poly([p2[0], p2[1] + 2, p1[0] + 10, p1[1] - 3, p1[0] + 10, p1[1] + 8, p2[0], p2[1] + 12]).fill({ color: 0xffb020, alpha: 0.1 });
}

/** Small single-storey shop with a sign (kiosk, diner). */
function drawShop(c: Container, g: Graphics, key: BuildingArtKey, night: boolean, label: string, neon: number): void {
  const pal = PALETTES.player;
  const box: Box = { w: key.w, h: key.h, H: Math.max(1, Math.min(key.floors, 3)) * FLOOR_H + 6 };
  const { p1, p2 } = corners(key.w, key.h);
  if (!night) {
    drawBox(g, box, { ...pal, wallLeft: 0x2a3038, wallRight: 0x3a4250, roof: 0x3c4452 });
    g.poly([p2[0] + 4, p2[1] - 3, p2[0] + 12, p2[1] - 7, p2[0] + 12, p2[1] - 15, p2[0] + 4, p2[1] - 11]).fill(0x101418);
    g.poly([p2[0] + 16, p2[1] - 9, p2[0] + 28, p2[1] - 15, p2[0] + 28, p2[1] - 21, p2[0] + 16, p2[1] - 15]).fill(0x1c2a30);
    drawNeonStrip(g, box, neon, 0, false, 0.1, 0.9);
    const sign = new Text({ text: label, style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 8, fontWeight: '900', fill: neon, letterSpacing: 1 } });
    sign.position.set(p2[0] + 6, p2[1] - box.H + 1);
    sign.skew.y = -0.4636;
    c.addChild(sign);
    void key;
    return;
  }
  g.poly([p2[0] + 16, p2[1] - 9, p2[0] + 28, p2[1] - 15, p2[0] + 28, p2[1] - 21, p2[0] + 16, p2[1] - 15]).fill({ color: 0xd9f6ff, alpha: 0.6 });
  drawNeonStrip(g, box, neon, 0, true, 0.1, 0.9);
  const sign = new Text({ text: label, style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 8, fontWeight: '900', fill: 0xffffff, letterSpacing: 1, dropShadow: { color: neon, blur: 6, distance: 0, alpha: 0.9 } } });
  sign.position.set(p2[0] + 6, p2[1] - box.H + 1);
  sign.skew.y = -0.4636;
  c.addChild(sign);
  g.poly([p2[0], p2[1] + 2, p1[0] + 10, p1[1] - 3, p1[0] + 10, p1[1] + 8, p2[0], p2[1] + 12]).fill({ color: neon, alpha: 0.08 });
}

function drawFoodStand(c: Container, g: Graphics, _key: BuildingArtKey, night: boolean): void {
  const { p0, p1, p2, p3 } = corners(1, 1);
  const cx = (p1[0] + p3[0]) / 2;
  const cy = (p0[1] + p2[1]) / 2;
  const H = 12;
  if (!night) {
    // Small cart body in the tile centre
    g.poly([cx - 14, cy + 2, cx + 2, cy + 10, cx + 2, cy + 10 - H, cx - 14, cy + 2 - H]).fill(0x3a2a2a);
    g.poly([cx + 2, cy + 10, cx + 16, cy + 3, cx + 16, cy + 3 - H, cx + 2, cy + 10 - H]).fill(0x4c3634);
    g.poly([cx - 14, cy + 2 - H, cx + 2, cy + 10 - H, cx + 16, cy + 3 - H, cx, cy - 5 - H]).fill(0x5a4440);
    // Awning (striped)
    const ay = cy - H - 8;
    g.poly([cx - 18, ay + 4, cx + 4, ay + 14, cx + 20, ay + 6, cx - 2, ay - 4]).fill(0xff8a1f);
    g.poly([cx - 12, ay + 7, cx - 6, ay + 10, cx - 2, ay - 1, cx - 8, ay - 4 + 2]).fill(0xffe08a);
    g.poly([cx + 2, ay + 13, cx + 8, ay + 11, cx + 12, ay + 2, cx + 6, ay + 4]).fill(0xffe08a);
    // Poles
    g.moveTo(cx - 14, cy + 2 - H).lineTo(cx - 14, ay + 4).stroke({ width: 1, color: 0x8a8a9a });
    g.moveTo(cx + 16, cy + 3 - H).lineTo(cx + 16, ay + 6).stroke({ width: 1, color: 0x8a8a9a });
    // Grill smoke
    g.circle(cx + 4, ay - 8, 3).fill({ color: 0xcccccc, alpha: 0.15 });
    return;
  }
  // Night glow: hanging bulbs along the awning and a warm pool of light
  g.ellipse(cx + 2, cy + 8, 22, 11).fill({ color: 0xffb020, alpha: 0.14 });
  for (let i = 0; i < 4; i++) {
    const bx = cx - 14 + i * 9;
    const by = cy - H - 2 + i * 1.5;
    g.circle(bx, by, 4).fill({ color: 0xffb020, alpha: 0.25 });
    g.circle(bx, by, 1.4).fill({ color: 0xfff0c0, alpha: 1 });
  }
  void c;
}

function drawConstructionSite(g: Graphics, key: BuildingArtKey): void {
  const H = Math.max(2, Math.min(key.floors, 6)) * FLOOR_H;
  const { p0, p1, p2, p3 } = corners(key.w, key.h);
  // Ground: fenced site
  g.poly([p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]]).fill(0x1d1a22);
  g.poly([p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]]).stroke({ width: 1.5, color: 0xffb020, alpha: 0.9 });
  // Hazard stripes along front edges
  for (let i = 0; i < key.h * 4; i++) {
    const t = i / 4;
    const x = p3[0] + HALF_W * t;
    const y = p3[1] + HALF_H * t;
    g.rect(x, y - 1, 5, 2).fill(i % 2 === 0 ? 0xffb020 : 0x111111);
  }
  // Scaffold frame
  const frame = { width: 1, color: 0x8a8a9a, alpha: 0.8 };
  g.moveTo(p3[0], p3[1]).lineTo(p3[0], p3[1] - H).stroke(frame);
  g.moveTo(p2[0], p2[1]).lineTo(p2[0], p2[1] - H).stroke(frame);
  g.moveTo(p1[0], p1[1]).lineTo(p1[0], p1[1] - H).stroke(frame);
  g.moveTo(p0[0], p0[1]).lineTo(p0[0], p0[1] - H).stroke({ ...frame, alpha: 0.35 });
  for (let f = 1; f <= Math.round(H / FLOOR_H); f++) {
    const y = f * FLOOR_H;
    g.moveTo(p3[0], p3[1] - y).lineTo(p2[0], p2[1] - y).lineTo(p1[0], p1[1] - y).stroke({ width: 1, color: 0x8a8a9a, alpha: 0.5 });
  }
  g.moveTo(p0[0], p0[1] - H).lineTo(p1[0], p1[1] - H).lineTo(p2[0], p2[1] - H).lineTo(p3[0], p3[1] - H).closePath().stroke(frame);
  // Partially built core
  const coreH = H * 0.45;
  g.poly([p3[0], p3[1], p2[0], p2[1], p2[0], p2[1] - coreH, p3[0], p3[1] - coreH]).fill({ color: 0x3a3a44, alpha: 0.9 });
  g.poly([p2[0], p2[1], p1[0], p1[1], p1[0], p1[1] - coreH, p2[0], p2[1] - coreH]).fill({ color: 0x4a4a56, alpha: 0.9 });
  // Crane
  const cx = p1[0] + 6;
  const cy = p1[1] - 2;
  g.moveTo(cx, cy).lineTo(cx, cy - H - 22).stroke({ width: 2, color: 0xffb020 });
  g.moveTo(cx - 30, cy - H - 22).lineTo(cx + 10, cy - H - 22).stroke({ width: 2, color: 0xffb020 });
  g.moveTo(cx - 22, cy - H - 22).lineTo(cx - 22, cy - H - 4).stroke({ width: 1, color: 0xcccccc, alpha: 0.8 });
  g.rect(cx - 25, cy - H - 4, 6, 4).fill(0x8a8a9a);
}

function drawConstructionNight(g: Graphics, key: BuildingArtKey): void {
  const H = Math.max(2, Math.min(key.floors, 6)) * FLOOR_H;
  const { p1 } = corners(key.w, key.h);
  const cx = p1[0] + 6;
  const cy = p1[1] - 2;
  g.circle(cx, cy - H - 22, 5).fill({ color: 0xff2b4a, alpha: 0.4 });
  g.circle(cx, cy - H - 22, 1.5).fill({ color: 0xff8090, alpha: 1 });
  const { p3, p2 } = corners(key.w, key.h);
  g.circle((p3[0] + p2[0]) / 2, (p3[1] + p2[1]) / 2 - 6, 10).fill({ color: 0xffb020, alpha: 0.12 });
}
