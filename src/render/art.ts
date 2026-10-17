/**
 * Procedural art: every tile and building texture is drawn with vector
 * primitives at runtime and cached. No external image assets are used.
 *
 * Each generated texture comes with an offset (ox, oy) relative to the
 * isometric origin of the tile / building (its top corner in tile space).
 *
 * Buildings never fill their footprint completely: BUILDING_INSET tiles of
 * pavement stay free on every side so neighbouring buildings read as
 * separate blocks with alleys between them. The entrance, shopfront and
 * signs sit on the wall selected by the building's facing (see Facing in
 * sim/state); facings 2 and 3 point away from the camera, those buildings
 * carry their sign on the roof instead.
 */

import { Container, Graphics, Text, Texture, type Renderer } from 'pixi.js';
import { FLOOR_H, HALF_H, HALF_W, TILE_H } from './iso';
import { RoadDir, TileKind } from '../sim/world/grid';
import { ParkVariant } from '../sim/world/generator';
import type { Facing } from '../sim/state';

export interface GeneratedTexture {
  texture: Texture;
  ox: number;
  oy: number;
}

export type ArtStyle = 'corporate' | 'market' | 'docks' | 'ghost' | 'old' | 'chrome' | 'undercity' | 'skyline' | 'player';

/** Number of visual variants a building seed can take. */
export const SEED_VARIANTS = 8;
/** Pavement kept free on every side of a building footprint (in tiles). */
export const BUILDING_INSET = 0.14;

export interface BuildingArtKey {
  art: 'city' | 'ramen' | 'foodstand' | 'capsule_hotel' | 'taxi_depot' | 'kiosk' | 'diner' | 'security_hq' | 'lab' | 'factory';
  style: ArtStyle;
  w: number;
  h: number;
  floors: number;
  /** Small variation seed (0..SEED_VARIANTS-1). */
  seed: number;
  facing: Facing;
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
  corporate: { wallLeft: 0x2e3c5c, wallRight: 0x3f547c, roof: 0x4c628c, trim: 0x7fb3e6, window: 0x16223a, lit: [0x9fd8ff, 0xd6ecff, 0xd6ecff, 0x7fc8ff, 0xffe8b0], neon: [0x19e6ff, 0xd9f6ff], litRatio: 0.5 },
  market: { wallLeft: 0x4c3a62, wallRight: 0x624c7c, roof: 0x6a5682, trim: 0x9a6ab0, window: 0x1e1528, lit: [0xffd08a, 0xffe6b0, 0xffe6b0, 0xff8ad6, 0x9fd8ff], neon: [0xff2bd6, 0x19e6ff, 0x8cff3a, 0xffb020], litRatio: 0.55 },
  docks: { wallLeft: 0x5c4634, wallRight: 0x765a40, roof: 0x725c48, trim: 0xb07a3a, window: 0x22180f, lit: [0xffc070, 0xffe0b0, 0xff8a1f], neon: [0xff8a1f, 0xffb020], litRatio: 0.3 },
  ghost: { wallLeft: 0x382c48, wallRight: 0x493a5c, roof: 0x413452, trim: 0x6a3f8c, window: 0x120d18, lit: [0xc08aff, 0xffd08a, 0xffe6b0], neon: [0x9b30ff, 0xff2bd6, 0xff3a5a], litRatio: 0.26 },
  old: { wallLeft: 0x5e4a46, wallRight: 0x785e57, roof: 0x62504c, trim: 0x9a7458, window: 0x1e1512, lit: [0xffd89a, 0xffe8c0, 0xffe8c0, 0xffb060], neon: [0xffb020, 0xff8a1f, 0x8cff3a], litRatio: 0.45 },
  chrome: { wallLeft: 0x46566e, wallRight: 0x5e708a, roof: 0x768aa0, trim: 0x8ad6ea, window: 0x141c28, lit: [0xd9f6ff, 0xb0e8f4, 0xffffff, 0x8cffd0], neon: [0x19e6ff, 0xd9f6ff, 0x8cff3a], litRatio: 0.48 },
  undercity: { wallLeft: 0x343a3c, wallRight: 0x444d4f, roof: 0x485254, trim: 0x5a7a4a, window: 0x0f1414, lit: [0xc8ff9a, 0xffd89a, 0xffd89a, 0x8cff3a], neon: [0x8cff3a, 0xffb020], litRatio: 0.36 },
  skyline: { wallLeft: 0x5e5646, wallRight: 0x776c58, roof: 0x887a68, trim: 0xd4b872, window: 0x1e1a12, lit: [0xffe8b0, 0xfff4d8, 0xffffff], neon: [0xffe08a, 0xd4b872], litRatio: 0.42 },
  player: { wallLeft: 0x5c3640, wallRight: 0x744650, roof: 0x684450, trim: 0xff8a1f, window: 0x1e1012, lit: [0xffd08a, 0xffb020], neon: [0xff2bd6, 0xffb020], litRatio: 0.9 },
};

export const LOT_TINT: Record<ArtStyle, number> = {
  corporate: 0x1a2030,
  market: 0x221a28,
  docks: 0x241e18,
  ghost: 0x1c1626,
  old: 0x221e1c,
  chrome: 0x1c222a,
  undercity: 0x181c1c,
  skyline: 0x22201a,
  player: 0x1c1822,
};

const NEON_COLORS = [0x19e6ff, 0xff2bd6, 0x8cff3a, 0xffb020, 0xff3a5a, 0xc08aff, 0xff8a1f, 0xffffff];

/** Short words for neon boards; narrow buildings use the first group, wider ones also the second. */
const SIGN_WORDS: Record<ArtStyle, { short: readonly string[]; long: readonly string[] }> = {
  corporate: { short: ['NEXUS', 'AXIOM', 'ORBIT', 'DATA'], long: ['KŌSEI CORP', 'NOVANET', 'HELIX BANK', 'ARCOLOGY'] },
  market: { short: ['BAR', '24h', 'VR', 'SUSHI', 'GAMES', 'TATTOO'], long: ['NOODLE HOUSE', 'PACHINKO', 'KARAOKE', 'NIGHT MARKET', 'CYBER CAFE'] },
  docks: { short: ['CARGO', 'FUEL', 'DOCK 7', 'STEEL'], long: ['CONTAINER DEPOT', 'SALVAGE YARD', 'FREIGHT LINE'] },
  ghost: { short: ['PAWN', 'MOTEL', 'BAR', 'REPAIR'], long: ['PAWN SHOP', 'ROOMS 24h', 'LAST CHANCE'] },
  old: { short: ['TEA', 'CAFE', 'BAR', 'MARKET'], long: ['TEAHOUSE', 'LAUNDRY', 'CORNER SHOP', 'OLD TOWN GRILL'] },
  chrome: { short: ['CYBER', 'BIO', 'NEURO', 'CLINIC'], long: ['IMPLANT STUDIO', 'CHROME CLINIC', 'NEURAL LINK'] },
  undercity: { short: ['SCRAP', 'NET', 'FOOD', 'H2O'], long: ['BLACK MARKET', 'WATER DEPOT', 'SALVAGE'] },
  skyline: { short: ['SPA', 'VISTA', 'LOUNGE', 'GALLERY'], long: ['SKY LOUNGE', 'GALLERY NOVA', 'PENTHOUSE CLUB'] },
  player: { short: ['OPEN'], long: ['OPEN'] },
};

function hash32(a: number, b: number, c: number, d: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519 + d * 3266489917) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mix(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}

function shade(c: number, f: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}

const SEED_BRIGHTNESS = [1, 1.08, 0.93, 1.14, 0.9, 1.04, 0.97, 1.1];

/** Palette of a style with a small per-building variation so neighbours do not look identical. */
function paletteFor(style: ArtStyle, seed: number): Palette {
  const base = PALETTES[style];
  const f = SEED_BRIGHTNESS[seed % SEED_BRIGHTNESS.length]!;
  const accent = base.neon[seed % base.neon.length]!;
  return {
    ...base,
    wallLeft: mix(shade(base.wallLeft, f), accent, 0.06),
    wallRight: mix(shade(base.wallRight, f), accent, 0.06),
    roof: mix(shade(base.roof, f), accent, 0.04),
  };
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
      const lamp = roadLamp(variant, x, y);
      if (lamp === 'none') return null;
      return this.generate(`gn:road:${lamp}`, (c) => drawStreetLight(c, lamp === 'intersection'));
    }
    if (kind === TileKind.Lot) return this.generate('gn:lot', (c) => drawLotMarkerNight(c));
    if (kind === TileKind.Park && variant === ParkVariant.Plaza) return this.generate('gn:plaza', (c) => drawPlazaNight(c));
    return null;
  }

  /** Day sprite of a street lamp post (drawn in the building layer so it is depth sorted). */
  lampPost(): GeneratedTexture {
    return this.generate('lamp', (c) => drawLampPost(c), 3);
  }

  // ------------------------------------------------------------- buildings

  building(key: BuildingArtKey, night: boolean): GeneratedTexture {
    const k = `b:${key.art}:${key.style}:${key.w}x${key.h}:${key.floors}:${key.seed}:${key.facing}:${key.construction ? 'c' : 'o'}:${night ? 'n' : 'd'}`;
    return this.generate(k, (c) => drawBuilding(c, key, night), key.w * key.h <= 1 ? 2 : 1.5);
  }
}

/** Which kind of street light a road tile carries. */
export function roadLamp(variant: number, x: number, y: number): 'none' | 'lamp' | 'intersection' {
  const arms = (variant & 1 ? 1 : 0) + (variant & 2 ? 1 : 0) + (variant & 4 ? 1 : 0) + (variant & 8 ? 1 : 0);
  if (arms >= 3) return 'intersection';
  return (x + y) % 3 === 0 ? 'lamp' : 'none';
}

/** Local position of the lamp post base inside a road tile. */
export const LAMP_POS = { x: -HALF_W * 0.48, y: HALF_H * 0.82 };

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
      diamond(g).fill(mix(LOT_TINT[style], 0x8a7ab0, 0.08));
      diamond(g, 3).stroke({ width: 1, color: 0x8a78b0, alpha: 0.5 });
      g.poly([0, 10, 6, 13, 0, 16, -6, 13]).fill({ color: 0x9a8ac0, alpha: 0.35 });
      break;
    case TileKind.Park:
      drawPark(g, variant);
      break;
    case TileKind.Water:
      diamond(g).fill(0x0a1a30);
      g.moveTo(-18, 12).lineTo(-6, 15).lineTo(6, 12).stroke({ width: 1, color: 0x245a8a, alpha: 0.8 });
      g.moveTo(-8, 20).lineTo(4, 23).lineTo(16, 20).stroke({ width: 1, color: 0x245a8a, alpha: 0.6 });
      break;
    case TileKind.Building:
      // Pavement around buildings (the building itself is inset inside its footprint).
      diamond(g).fill(mix(LOT_TINT[style], 0x9a9ab0, 0.3));
      diamond(g, 1).stroke({ width: 1, color: 0xffffff, alpha: 0.07 });
      g.moveTo(-HALF_W / 2, HALF_H / 2).lineTo(HALF_W / 2, HALF_H * 1.5).stroke({ width: 0.8, color: 0x000000, alpha: 0.12 });
      g.moveTo(HALF_W / 2, HALF_H / 2).lineTo(-HALF_W / 2, HALF_H * 1.5).stroke({ width: 0.8, color: 0x000000, alpha: 0.12 });
      break;
    default:
      diamond(g).fill(0x1a1822);
  }
}

function drawRoad(g: Graphics, mask: number): void {
  diamond(g).fill(0x1f1f29);
  // Sidewalks on edges that do not continue into a road.
  const curb = 0x3a3846;
  const edge = 6;
  if (!(mask & RoadDir.N)) g.poly([0, 0, HALF_W, HALF_H, HALF_W - edge * 2, HALF_H + 0, 0, edge]).fill(curb);
  if (!(mask & RoadDir.E)) g.poly([HALF_W, HALF_H, 0, TILE_H, 0, TILE_H - edge, HALF_W - edge * 2, HALF_H]).fill(curb);
  if (!(mask & RoadDir.S)) g.poly([0, TILE_H, -HALF_W, HALF_H, -HALF_W + edge * 2, HALF_H, 0, TILE_H - edge]).fill(curb);
  if (!(mask & RoadDir.W)) g.poly([-HALF_W, HALF_H, 0, 0, 0, edge, -HALF_W + edge * 2, HALF_H]).fill(curb);
  // Kerb highlight lines
  const kerb = { width: 0.8, color: 0xffffff, alpha: 0.1 };
  if (!(mask & RoadDir.N)) g.moveTo(0, edge).lineTo(HALF_W - edge * 2, HALF_H).stroke(kerb);
  if (!(mask & RoadDir.W)) g.moveTo(0, edge).lineTo(-HALF_W + edge * 2, HALF_H).stroke(kerb);
  if (!(mask & RoadDir.E)) g.moveTo(HALF_W - edge * 2, HALF_H).lineTo(0, TILE_H - edge).stroke(kerb);
  if (!(mask & RoadDir.S)) g.moveTo(-HALF_W + edge * 2, HALF_H).lineTo(0, TILE_H - edge).stroke(kerb);
  // Lane markings towards connected neighbours.
  const cx = 0;
  const cy = HALF_H;
  const mark = { width: 1.2, color: 0xb09a40, alpha: 0.5 };
  if (mask & RoadDir.N) g.moveTo(cx, cy).lineTo(HALF_W / 2, HALF_H / 2).stroke(mark);
  if (mask & RoadDir.E) g.moveTo(cx, cy).lineTo(HALF_W / 2, HALF_H * 1.5).stroke(mark);
  if (mask & RoadDir.S) g.moveTo(cx, cy).lineTo(-HALF_W / 2, HALF_H * 1.5).stroke(mark);
  if (mask & RoadDir.W) g.moveTo(cx, cy).lineTo(-HALF_W / 2, HALF_H / 2).stroke(mark);
  // Wet asphalt sheen
  g.poly([0, 4, 8, 8, 0, 12, -8, 8]).fill({ color: 0x4a4a5c, alpha: 0.18 });
}

function drawTree(g: Graphics, x: number, y: number, r: number, tone = 0): void {
  const dark = tone === 0 ? 0x1c5a38 : 0x1f5a4a;
  const light = tone === 0 ? 0x3a9a5a : 0x3a9a7a;
  g.ellipse(x + 1, y + 3, r * 1.1, r * 0.5).fill({ color: 0x000000, alpha: 0.3 });
  g.moveTo(x, y + 2).lineTo(x, y - 2).stroke({ width: 1.2, color: 0x4a3426 });
  g.circle(x, y - 3, r).fill(dark);
  g.circle(x - r * 0.3, y - 4.5, r * 0.65).fill(light);
  g.circle(x - r * 0.45, y - 5.5, r * 0.25).fill({ color: 0xc8ffb0, alpha: 0.5 });
}

function drawPark(g: Graphics, variant: number): void {
  if (variant === ParkVariant.Plaza) {
    diamond(g).fill(0x2a2936);
    g.moveTo(-HALF_W / 2, HALF_H / 2).lineTo(HALF_W / 2, HALF_H * 1.5).stroke({ width: 1, color: 0x3c3a4a, alpha: 0.9 });
    g.moveTo(HALF_W / 2, HALF_H / 2).lineTo(-HALF_W / 2, HALF_H * 1.5).stroke({ width: 1, color: 0x3c3a4a, alpha: 0.9 });
    // Planter and benches
    g.ellipse(0, HALF_H + 1, 6, 3).fill(0x3a3a48);
    g.circle(0, HALF_H - 2, 3.5).fill(0x2f8a52);
    g.rect(10, 18, 8, 2).fill(0x5a4a3a);
    g.rect(-18, 10, 8, 2).fill(0x5a4a3a);
    return;
  }
  if (variant === ParkVariant.Courtyard) {
    diamond(g).fill(0x1c1b24);
    g.rect(-8, 10, 10, 6).fill(0x32323e);
    g.rect(2, 16, 6, 4).fill(0x2c2c36);
    g.circle(12, 12, 2.5).fill(0x2f6a42);
    return;
  }
  diamond(g).fill(0x16382a);
  diamond(g, 2).stroke({ width: 1, color: 0x2a6a48, alpha: 0.35 });
  g.moveTo(-10, 18).lineTo(10, 10).stroke({ width: 2, color: 0x3a3a48, alpha: 0.6 });
  drawTree(g, -11, 12, 5.5, 0);
  drawTree(g, 9, 19, 5, 1);
  drawTree(g, 3, 9, 4, 0);
}

function drawStreetLight(c: Container, intersection: boolean): void {
  const g = new Graphics();
  c.addChild(g);
  if (intersection) {
    const color = 0x19e6ff;
    for (let i = 2; i >= 1; i--) g.ellipse(0, HALF_H, 9 * i, 4.5 * i).fill({ color, alpha: 0.06 });
    g.ellipse(0, HALF_H, 4, 2).fill({ color, alpha: 0.3 });
    return;
  }
  const color = 0xffc860;
  const hx = LAMP_POS.x + 3;
  const hy = LAMP_POS.y - 17;
  g.ellipse(LAMP_POS.x + 4, LAMP_POS.y + 1, 16, 8).fill({ color, alpha: 0.08 });
  g.ellipse(LAMP_POS.x + 4, LAMP_POS.y + 1, 8, 4).fill({ color, alpha: 0.14 });
  g.circle(hx, hy, 5).fill({ color, alpha: 0.25 });
  g.circle(hx, hy, 1.6).fill({ color: 0xfff0c0, alpha: 1 });
}

function drawLampPost(c: Container): void {
  const g = new Graphics();
  c.addChild(g);
  const { x, y } = LAMP_POS;
  g.ellipse(x, y + 1, 3, 1.5).fill({ color: 0x000000, alpha: 0.4 });
  g.moveTo(x, y).lineTo(x, y - 16).stroke({ width: 1.4, color: 0x9a9ab0 });
  g.moveTo(x, y - 16).lineTo(x + 3, y - 17).stroke({ width: 1.4, color: 0x9a9ab0 });
  g.circle(x + 3, y - 17, 1.4).fill(0xffe8b0);
}

function drawLotMarkerNight(c: Container): void {
  const g = new Graphics();
  c.addChild(g);
  g.circle(0, 13, 6).fill({ color: 0x9b30ff, alpha: 0.12 });
  g.circle(0, 13, 2.5).fill({ color: 0xc08aff, alpha: 0.6 });
}

function drawPlazaNight(c: Container): void {
  const g = new Graphics();
  c.addChild(g);
  g.ellipse(0, HALF_H, 14, 7).fill({ color: 0xffe0a0, alpha: 0.07 });
  g.circle(10, 16, 1.2).fill({ color: 0xfff0c0, alpha: 0.8 });
  g.circle(-14, 10, 1.2).fill({ color: 0xfff0c0, alpha: 0.8 });
}

// ======================================================================
// Buildings
// ======================================================================

type Pt = [number, number];

interface Box {
  w: number;
  h: number;
  H: number;
  /** Pavement margin on every side in tiles. */
  inset: number;
}

interface Corners {
  p0: Pt;
  p1: Pt;
  p2: Pt;
  p3: Pt;
}

/**
 * One visible wall. `left` is the y = h face (p3→p2, facing +y), `right` the
 * x = w face (p2→p1, facing +x). `out` is the screen-x direction pointing
 * away from the wall, `skew` the text skew that follows the wall.
 */
interface Wall {
  base: Pt;
  dir: Pt;
  /** Length in tiles. */
  len: number;
  out: 1 | -1;
  skew: number;
  id: 1 | 2;
}

function iso(x: number, y: number): Pt {
  return [(x - y) * HALF_W, (x + y) * HALF_H];
}

/** Corner points of the (inset) footprint diamond; origin is the top corner of the full footprint. */
function corners(w: number, h: number, inset = 0): Corners {
  return { p0: iso(inset, inset), p1: iso(w - inset, inset), p2: iso(w - inset, h - inset), p3: iso(inset, h - inset) };
}

const RIGHT_DIR: Pt = [HALF_W, -HALF_H];
const LEFT_DIR: Pt = [HALF_W, HALF_H];
const SKEW = Math.atan(0.5);

function walls(w: number, h: number, inset: number): { left: Wall; right: Wall } {
  const c = corners(w, h, inset);
  return {
    left: { base: c.p3, dir: LEFT_DIR, len: w - inset * 2, out: -1, skew: SKEW, id: 1 },
    right: { base: c.p2, dir: RIGHT_DIR, len: h - inset * 2, out: 1, skew: -SKEW, id: 2 },
  };
}

/** Wall that carries entrance and signs, or null when the facing points away from the camera. */
function facadeOf(ws: { left: Wall; right: Wall }, facing: Facing): Wall | null {
  if (facing === 0) return ws.right;
  if (facing === 1) return ws.left;
  return null;
}

/** Position along a wall measured `d` tiles away from the near corner (p2). */
function nearCorner(wall: Wall, d: number): number {
  return wall.out > 0 ? d : wall.len - d;
}

/** Point on a wall: `t` tiles along `dir` from `base`, `y` pixels above ground. */
function wp(base: Pt, dir: Pt, t: number, y: number): Pt {
  return [base[0] + dir[0] * t, base[1] + dir[1] * t - y];
}

function wallQuad(g: Graphics, wall: Wall, t0: number, t1: number, y0: number, y1: number): Graphics {
  const a = wp(wall.base, wall.dir, t0, y0);
  const b = wp(wall.base, wall.dir, t1, y0);
  const c = wp(wall.base, wall.dir, t1, y1);
  const d = wp(wall.base, wall.dir, t0, y1);
  return g.poly([a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]]);
}

function wallLine(g: Graphics, wall: Wall, t0: number, t1: number, y: number, style: { width: number; color: number; alpha: number }): void {
  const a = wp(wall.base, wall.dir, t0, y);
  const b = wp(wall.base, wall.dir, t1, y);
  g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke(style);
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
      drawFoodStand(g, night);
      return;
    case 'ramen':
      drawRamenBar(c, g, key, night);
      return;
    case 'kiosk':
    case 'diner':
      drawShop(c, g, key, night, key.art === 'kiosk' ? 'KIOSK' : 'DINER', key.art === 'kiosk' ? 0x8cff3a : 0x19e6ff);
      return;
    case 'capsule_hotel':
      drawCityBuilding(c, g, { ...key, style: 'chrome' }, night, { sign: 'HOTEL', color: 0x19e6ff });
      return;
    case 'lab':
      drawCityBuilding(c, g, { ...key, style: 'chrome' }, night, { sign: 'LAB', color: 0x8cff3a });
      return;
    case 'factory':
      drawCityBuilding(c, g, { ...key, style: 'docks' }, night, { sign: 'WERK', color: 0xff8a1f });
      return;
    case 'security_hq':
      drawCityBuilding(c, g, { ...key, style: 'corporate' }, night, { sign: 'SECURITY', color: 0xff3a5a });
      return;
    case 'taxi_depot':
      drawCityBuilding(c, g, { ...key, style: 'docks' }, night, { sign: 'TAXI', color: 0xffb020 });
      return;
    default:
      drawCityBuilding(c, g, key, night);
  }
}

function drawBox(g: Graphics, box: Box, pal: Palette): void {
  const { p0, p1, p2, p3 } = corners(box.w, box.h, box.inset);
  const H = box.H;
  // base shadow on the pavement
  g.poly([p0[0] - 2, p0[1] + 1, p1[0] + 5, p1[1] + 1, p2[0] + 1, p2[1] + 5, p3[0] - 5, p3[1] + 3]).fill({ color: 0x000000, alpha: 0.4 });
  // walls
  g.poly([p3[0], p3[1], p2[0], p2[1], p2[0], p2[1] - H, p3[0], p3[1] - H]).fill(pal.wallLeft);
  g.poly([p2[0], p2[1], p1[0], p1[1], p1[0], p1[1] - H, p2[0], p2[1] - H]).fill(pal.wallRight);
  // roof with a parapet rim
  g.poly([p0[0], p0[1] - H, p1[0], p1[1] - H, p2[0], p2[1] - H, p3[0], p3[1] - H]).fill(pal.roof);
  const inner = corners(box.w, box.h, box.inset + 0.1);
  g.poly([inner.p0[0], inner.p0[1] - H, inner.p1[0], inner.p1[1] - H, inner.p2[0], inner.p2[1] - H, inner.p3[0], inner.p3[1] - H]).fill({ color: 0x000000, alpha: 0.18 });
  // edges
  g.moveTo(p3[0], p3[1] - H).lineTo(p2[0], p2[1] - H).lineTo(p1[0], p1[1] - H).stroke({ width: 1, color: 0xffffff, alpha: 0.22 });
  g.moveTo(p0[0], p0[1] - H).lineTo(p1[0], p1[1] - H).stroke({ width: 1, color: 0xffffff, alpha: 0.1 });
  g.moveTo(p0[0], p0[1] - H).lineTo(p3[0], p3[1] - H).stroke({ width: 1, color: 0xffffff, alpha: 0.1 });
  g.moveTo(p2[0], p2[1]).lineTo(p2[0], p2[1] - H).stroke({ width: 1, color: 0xffffff, alpha: 0.14 });
  // ground line (plinth)
  g.moveTo(p3[0], p3[1] - 2).lineTo(p2[0], p2[1] - 2).lineTo(p1[0], p1[1] - 2).stroke({ width: 2, color: 0x000000, alpha: 0.2 });
}

interface WindowPattern {
  cols: number;
  w: number;
  h: number;
}

function windowPattern(style: ArtStyle, seed: number): WindowPattern {
  switch (style) {
    case 'corporate':
      return seed % 2 === 0 ? { cols: 3, w: 0.3, h: 5.5 } : { cols: 3, w: 0.2, h: 6.5 };
    case 'chrome':
      return seed % 3 === 0 ? { cols: 2, w: 0.24, h: 6 } : { cols: 3, w: 0.3, h: 4.5 };
    case 'skyline':
      return { cols: 2, w: 0.26, h: 7 };
    case 'docks':
      return { cols: 1, w: 0.5, h: 3 };
    case 'ghost':
    case 'undercity':
      return { cols: 3, w: 0.16, h: 3.8 };
    default:
      return seed % 2 === 0 ? { cols: 2, w: 0.22, h: 5 } : { cols: 3, w: 0.17, h: 5 };
  }
}

/** Draws window grids on both visible walls. `night` draws only lit windows (for the additive layer). */
function drawWindows(g: Graphics, ws: { left: Wall; right: Wall }, pal: Palette, key: BuildingArtKey, night: boolean, facade: Wall | null): void {
  const floors = key.floors;
  const pat = windowPattern(key.style, key.seed);
  const winH = Math.min(pat.h, FLOOR_H - 4);
  const glass = mix(pal.window, 0x7f93b8, 0.3);
  const floorLines = key.style !== 'corporate' && key.style !== 'chrome';
  for (const wall of [ws.left, ws.right]) {
    const skipGround = facade?.id === wall.id;
    const tiles = wall.len;
    for (let f = 0; f < floors; f++) {
      const yOff = f * FLOOR_H + 3;
      if (!night && floorLines && f > 0) wallLine(g, wall, 0, tiles, f * FLOOR_H, { width: 0.8, color: 0x000000, alpha: 0.14 });
      if (f === 0 && skipGround) continue;
      const n = Math.max(1, Math.round(tiles * pat.cols));
      const ww = (pat.w * tiles) / n;
      for (let col = 0; col < n; col++) {
        const t = ((col + 0.5) / n) * tiles - ww / 2;
        const r = hash32(key.seed * 7 + wall.id, f, col, key.floors);
        const lit = r < pal.litRatio;
        if (night && !lit) continue;
        const color = night ? pal.lit[Math.floor(r * 977) % pal.lit.length]! : glass;
        const nightAlpha = 0.26 + ((r * 7919) % 1) * 0.3;
        wallQuad(g, wall, t, t + ww, yOff, yOff + winH).fill({ color, alpha: night ? nightAlpha : 1 });
        if (night) {
          if ((r * 131) % 1 < 0.3) wallQuad(g, wall, t - 0.04, t + ww + 0.04, yOff - 1.5, yOff + winH + 1.5).fill({ color, alpha: 0.1 });
        } else {
          wallLine(g, wall, t, t + ww, yOff + winH, { width: 0.8, color: 0xffffff, alpha: 0.22 });
          if ((r * 53) % 1 < 0.18) wallQuad(g, wall, t, t + ww, yOff, yOff + winH * 0.45).fill({ color: 0xffd8a0, alpha: 0.22 });
        }
      }
    }
  }
}

/** Warm light pool on the pavement in front of a wall point. */
function drawLightPool(g: Graphics, wall: Wall, t: number, color: number, alpha: number): void {
  const m = wp(wall.base, wall.dir, t, 0);
  g.ellipse(m[0] + 5 * wall.out, m[1] + 4, 13, 6).fill({ color, alpha });
}

/** Ground floor treatment on the facade: lobby, shop with awning or industrial gate. */
function drawShopfront(g: Graphics, f: Wall, pal: Palette, key: BuildingArtKey, night: boolean): void {
  const lw = f.len;
  const r = hash32(key.seed, 3, key.floors, 7);
  const style = key.style;
  if (style === 'corporate' || style === 'skyline' || style === 'chrome') {
    const t0 = lw * 0.12;
    const t1 = lw * 0.88;
    const door0 = lw * 0.42;
    const door1 = lw * 0.58;
    if (!night) {
      wallQuad(g, f, t0, t1, 1.5, FLOOR_H - 1.5).fill(mix(pal.window, 0x9fd8ff, 0.25));
      wallQuad(g, f, door0, door1, 1.5, FLOOR_H - 2.5).fill(mix(pal.window, 0xffffff, 0.12));
      wallLine(g, f, t0 - 0.04, t1 + 0.04, FLOOR_H - 0.5, { width: 2, color: pal.trim, alpha: 0.6 });
      return;
    }
    wallQuad(g, f, t0, t1, 1.5, FLOOR_H - 1.5).fill({ color: 0x9fd8ff, alpha: 0.35 });
    wallQuad(g, f, door0, door1, 1.5, FLOOR_H - 2.5).fill({ color: 0xffffff, alpha: 0.4 });
    drawLightPool(g, f, (door0 + door1) / 2, 0xbfe8ff, 0.1);
    return;
  }
  if (style === 'docks') {
    const t0 = lw * 0.2;
    const t1 = lw * 0.8;
    if (!night) {
      wallQuad(g, f, t0, t1, 1, FLOOR_H - 2).fill(0x2a2420);
      for (let i = 0; i < 4; i++) wallLine(g, f, t0, t1, 2 + i * 2.2, { width: 0.7, color: 0x000000, alpha: 0.35 });
      wallQuad(g, f, t0, t1, 0.5, 2).fill(0xffb020);
      return;
    }
    const m = wp(f.base, f.dir, (t0 + t1) / 2, FLOOR_H);
    g.circle(m[0], m[1], 7).fill({ color: 0xff8a1f, alpha: 0.2 });
    g.circle(m[0], m[1], 1.6).fill({ color: 0xffd0a0, alpha: 0.9 });
    drawLightPool(g, f, (t0 + t1) / 2, 0xff8a1f, 0.08);
    return;
  }
  // Shop: door, display window and (for market/old) a coloured awning.
  const door0 = lw * 0.1;
  const door1 = door0 + Math.min(0.18, lw * 0.22);
  const win0 = door1 + lw * 0.08;
  const win1 = lw * 0.9;
  const awningColors = [0xc0282e, 0x1f7a8c, 0xd08a2a, 0x7a3a8c, 0x2a8a4a];
  const awning = (style === 'market' || style === 'old') && r < 0.8;
  const aColor = awningColors[(key.seed + key.floors) % awningColors.length]!;
  if (!night) {
    wallQuad(g, f, door0, door1, 1, FLOOR_H - 2).fill(mix(pal.window, 0x000000, 0.3));
    wallQuad(g, f, win0, win1, 2.5, FLOOR_H - 2).fill(mix(pal.window, 0x9fd8ff, 0.2));
    wallLine(g, f, win0, win1, FLOOR_H - 2, { width: 0.8, color: 0xffffff, alpha: 0.2 });
    if (awning) drawAwning(g, f, door0 - 0.03, win1 + 0.03, FLOOR_H + 1, aColor, true);
    return;
  }
  wallQuad(g, f, win0, win1, 2.5, FLOOR_H - 2).fill({ color: pal.lit[0]!, alpha: 0.55 });
  wallQuad(g, f, door0, door1, 1, FLOOR_H - 2).fill({ color: pal.lit[0]!, alpha: 0.35 });
  drawLightPool(g, f, (win0 + win1) / 2, pal.lit[0]!, 0.12);
}

/** Striped fabric awning sticking out of a wall. */
function drawAwning(g: Graphics, f: Wall, t0: number, t1: number, y: number, color: number, striped: boolean): void {
  const ox = 4 * f.out;
  const a0 = wp(f.base, f.dir, t0, y);
  const a1 = wp(f.base, f.dir, t1, y);
  g.poly([a0[0], a0[1], a1[0], a1[1], a1[0] + ox, a1[1] + 5, a0[0] + ox, a0[1] + 5]).fill(color);
  if (striped) {
    const stripes = Math.max(2, Math.round((t1 - t0) * 6));
    for (let i = 0; i < stripes; i += 2) {
      const s0 = t0 + ((t1 - t0) * i) / stripes;
      const s1 = t0 + ((t1 - t0) * (i + 1)) / stripes;
      const q0 = wp(f.base, f.dir, s0, y);
      const q1 = wp(f.base, f.dir, s1, y);
      g.poly([q0[0], q0[1], q1[0], q1[1], q1[0] + ox, q1[1] + 5, q0[0] + ox, q0[1] + 5]).fill({ color: 0xffffff, alpha: 0.3 });
    }
  }
  g.poly([a0[0], a0[1], a1[0], a1[1], a1[0] + ox, a1[1] + 5, a0[0] + ox, a0[1] + 5]).stroke({ width: 0.8, color: 0xffffff, alpha: 0.3 });
}

interface SignPlan {
  vertical: boolean;
  verticalOther: boolean;
  board: boolean;
  logo: boolean;
  screen: boolean;
  billboard: boolean;
  roofLine: boolean;
  flicker: boolean;
}

function planSigns(key: BuildingArtKey): SignPlan {
  const r = (n: number): number => hash32(key.seed, n, key.floors, key.w * 10 + key.h);
  const tall = key.floors >= 2;
  const wide = key.w >= 2;
  switch (key.style) {
    case 'market':
      return { vertical: tall && r(1) < 0.55, verticalOther: key.h >= 2 && r(6) < 0.3, board: r(7) < 0.85, logo: false, screen: key.floors >= 5 && r(2) < 0.22, billboard: wide && r(3) < 0.35, roofLine: false, flicker: false };
    case 'old':
      return { vertical: tall && r(1) < 0.45, verticalOther: false, board: r(7) < 0.85, logo: false, screen: false, billboard: wide && r(3) < 0.25, roofLine: false, flicker: false };
    case 'ghost':
      return { vertical: tall && r(1) < 0.7, verticalOther: false, board: r(2) < 0.45, logo: false, screen: false, billboard: false, roofLine: false, flicker: true };
    case 'undercity':
      return { vertical: tall && r(1) < 0.4, verticalOther: false, board: r(2) < 0.8, logo: false, screen: false, billboard: false, roofLine: false, flicker: r(4) < 0.5 };
    case 'chrome':
      return { vertical: tall && r(1) < 0.3, verticalOther: false, board: r(7) < 0.8, logo: r(2) < 0.6 && key.floors >= 3, screen: key.floors >= 6 && r(5) < 0.3, billboard: wide && r(3) < 0.3, roofLine: true, flicker: false };
    case 'corporate':
      return { vertical: false, verticalOther: false, board: r(2) < 0.35, logo: key.floors >= 3, screen: key.floors >= 8 && r(5) < 0.45, billboard: wide && r(3) < 0.4, roofLine: true, flicker: false };
    case 'skyline':
      return { vertical: false, verticalOther: false, board: r(2) < 0.5, logo: r(1) < 0.4 && key.floors >= 3, screen: false, billboard: false, roofLine: true, flicker: false };
    case 'docks':
      return { vertical: false, verticalOther: false, board: true, logo: false, screen: false, billboard: wide && r(3) < 0.25, roofLine: false, flicker: r(4) < 0.3 };
    default:
      return { vertical: tall, verticalOther: false, board: true, logo: false, screen: false, billboard: false, roofLine: false, flicker: false };
  }
}

function signColor(key: BuildingArtKey, n: number): number {
  const pal = PALETTES[key.style];
  const pool = key.style === 'market' || key.style === 'ghost' ? NEON_COLORS : pal.neon;
  return pool[Math.floor(hash32(key.seed, 40 + n, key.floors, key.w) * pool.length)]!;
}

/** Vertical hanging sign with glyph blocks, mounted near the near corner of a wall. */
function drawVerticalSign(g: Graphics, wall: Wall, floors: number, color: number, key: BuildingArtKey, night: boolean, flicker: boolean, n: number): void {
  const anchor = wp(wall.base, wall.dir, nearCorner(wall, wall.len * 0.06), 0);
  const sw = 7;
  const top = Math.min(floors, 3) * FLOOR_H - 1;
  const bottom = FLOOR_H * 0.75;
  const x = wall.out > 0 ? anchor[0] + 2 : anchor[0] - 2 - sw;
  const y0 = anchor[1] - top;
  const sh = top - bottom;
  const cells = Math.max(2, Math.floor(sh / 8));
  const glyph = (cx: number, cy: number, i: number, fill: number, alpha: number): void => {
    const v = hash32(key.seed, 60 + n, i, floors);
    const k = Math.floor(v * 5);
    if (k === 0) {
      g.rect(cx + 1, cy + 1.5, 5, 1.6).fill({ color: fill, alpha });
      g.rect(cx + 2.5, cy + 4, 2, 2.5).fill({ color: fill, alpha });
    } else if (k === 1) {
      g.rect(cx + 1, cy + 1, 1.6, 5.5).fill({ color: fill, alpha });
      g.rect(cx + 3.5, cy + 2.5, 2.5, 1.6).fill({ color: fill, alpha });
    } else if (k === 2) {
      g.circle(cx + 3.5, cy + 3.7, 2.2).stroke({ width: 1.3, color: fill, alpha });
    } else if (k === 3) {
      g.rect(cx + 1, cy + 1, 5, 1.6).fill({ color: fill, alpha });
      g.rect(cx + 1, cy + 4.2, 5, 1.6).fill({ color: fill, alpha });
    } else {
      g.moveTo(cx + 1, cy + 6).lineTo(cx + 3.5, cy + 1).lineTo(cx + 6, cy + 6).stroke({ width: 1.3, color: fill, alpha });
    }
  };
  const alphaMul = flicker ? 0.6 : 1;
  const bracketX = wall.out > 0 ? x + sw / 2 : x + sw / 2;
  if (!night) {
    g.moveTo(anchor[0], y0 + 2).lineTo(bracketX, y0 + 2).stroke({ width: 1, color: 0x8a8aa0 });
    g.moveTo(anchor[0], y0 + sh - 2).lineTo(bracketX, y0 + sh - 2).stroke({ width: 1, color: 0x8a8aa0 });
    g.rect(x, y0, sw, sh).fill(0x15131c).stroke({ width: 1, color, alpha: 0.85 * alphaMul });
    for (let i = 0; i < cells; i++) glyph(x, y0 + 1 + (i * (sh - 2)) / cells, i, color, 0.95 * alphaMul);
    return;
  }
  g.rect(x - 3, y0 - 3, sw + 6, sh + 6).fill({ color, alpha: 0.11 * alphaMul });
  g.rect(x - 1, y0 - 1, sw + 2, sh + 2).fill({ color, alpha: 0.12 * alphaMul });
  g.rect(x, y0, sw, sh).stroke({ width: 1.4, color, alpha: 0.9 * alphaMul });
  for (let i = 0; i < cells; i++) {
    glyph(x, y0 + 1 + (i * (sh - 2)) / cells, i, color, 0.55 * alphaMul);
    glyph(x, y0 + 1 + (i * (sh - 2)) / cells, i, 0xffffff, 0.85 * alphaMul);
  }
}

function neonText(text: string, color: number, night: boolean, fontSize: number, alpha = 1): Text {
  return new Text({
    text,
    style: night
      ? { fontFamily: 'Arial, Helvetica, sans-serif', fontSize, fontWeight: '900', fill: 0xffffff, letterSpacing: 0.8, dropShadow: { color, blur: 5, distance: 0, alpha: 0.95 * alpha } }
      : { fontFamily: 'Arial, Helvetica, sans-serif', fontSize, fontWeight: '900', fill: color, letterSpacing: 0.8 },
  });
}

/** Horizontal sign box above the ground floor of a wall with a short neon word. */
function drawBoardSign(c: Container, g: Graphics, f: Wall, text: string, color: number, night: boolean, flicker: boolean, reserveNearCorner: number): void {
  const lw = f.len;
  const near = reserveNearCorner;
  const t0 = f.out > 0 ? Math.min(lw * 0.08 + near, lw * 0.5) : lw * 0.06;
  const t1 = f.out > 0 ? lw * 0.94 : Math.max(lw * 0.5, lw * 0.92 - near);
  if (t1 - t0 < 0.3) return;
  const yBot = FLOOR_H + 1.5;
  const yTop = FLOOR_H + 9;
  const alphaMul = flicker ? 0.65 : 1;
  if (!night) {
    wallQuad(g, f, t0, t1, yBot, yTop).fill(0x15131c).stroke({ width: 1, color, alpha: 0.8 * alphaMul });
  } else {
    wallQuad(g, f, t0 - 0.05, t1 + 0.05, yBot - 2.5, yTop + 2.5).fill({ color, alpha: 0.14 * alphaMul });
    wallQuad(g, f, t0, t1, yBot, yTop).fill({ color, alpha: 0.12 * alphaMul }).stroke({ width: 1.3, color, alpha: 0.9 * alphaMul });
  }
  const label = neonText(text, color, night, 7, alphaMul);
  const start = wp(f.base, f.dir, t0 + 0.04, yTop - 1);
  const avail = (t1 - t0 - 0.08) * Math.hypot(HALF_W, HALF_H);
  const scale = Math.min(1, avail / Math.max(1, label.width));
  label.scale.set(scale);
  label.position.set(start[0], start[1]);
  label.skew.y = f.skew;
  if (night) label.alpha = alphaMul;
  c.addChild(label);
}

/** Round logo high on a wall. */
function drawLogo(g: Graphics, wall: Wall, key: BuildingArtKey, color: number, night: boolean): void {
  const radius = key.w * key.h >= 2 ? 7 : 5;
  const m = wp(wall.base, wall.dir, wall.len * 0.5, Math.min(key.floors - 0.5, Math.max(2.5, key.floors * 0.62)) * FLOOR_H);
  const kind = Math.floor(hash32(key.seed, 70, key.floors, key.w) * 3);
  const inner = (fill: number): void => {
    if (kind === 0) g.circle(m[0], m[1], radius * 0.4).fill({ color: fill, alpha: 0.9 });
    else if (kind === 1) g.moveTo(m[0] - radius * 0.5, m[1] + radius * 0.4).lineTo(m[0], m[1] - radius * 0.5).lineTo(m[0] + radius * 0.5, m[1] + radius * 0.4).stroke({ width: 1.5, color: fill, alpha: 0.9 });
    else g.rect(m[0] - radius * 0.45, m[1] - radius * 0.45, radius * 0.9, radius * 0.9).stroke({ width: 1.5, color: fill, alpha: 0.9 });
  };
  if (!night) {
    g.circle(m[0], m[1], radius + 1.5).fill(0x15131c);
    g.circle(m[0], m[1], radius).stroke({ width: 1.5, color, alpha: 0.9 });
    inner(color);
    return;
  }
  g.circle(m[0], m[1], radius * 2.2).fill({ color, alpha: 0.12 });
  g.circle(m[0], m[1], radius + 1).fill({ color, alpha: 0.12 });
  g.circle(m[0], m[1], radius).stroke({ width: 1.8, color, alpha: 0.9 });
  g.circle(m[0], m[1], radius).stroke({ width: 0.8, color: 0xffffff, alpha: 0.7 });
  inner(0xffffff);
}

/** Large LED wall with colour bands. */
function drawScreen(g: Graphics, wall: Wall, key: BuildingArtKey, night: boolean): void {
  const t0 = wall.len * 0.15;
  const t1 = wall.len * 0.85;
  const yBot = FLOOR_H * 2.4;
  const yTop = Math.min(key.floors - 1, 4.6) * FLOOR_H;
  if (yTop - yBot < FLOOR_H) return;
  const bands = [0x19e6ff, 0xff2bd6, 0xffb020, 0x8cff3a];
  const offset = Math.floor(hash32(key.seed, 80, key.floors, 1) * bands.length);
  const n = 4;
  if (!night) wallQuad(g, wall, t0 - 0.03, t1 + 0.03, yBot - 1, yTop + 1).fill(0x101018);
  else wallQuad(g, wall, t0 - 0.08, t1 + 0.08, yBot - 3, yTop + 3).fill({ color: bands[offset]!, alpha: 0.1 });
  for (let i = 0; i < n; i++) {
    const a = yBot + ((yTop - yBot) * i) / n;
    const b = yBot + ((yTop - yBot) * (i + 1)) / n;
    const color = bands[(i + offset) % bands.length]!;
    wallQuad(g, wall, t0, t1, a, b).fill({ color, alpha: night ? 0.42 : 0.32 });
    if (night) wallQuad(g, wall, t0 + (t1 - t0) * 0.2, t0 + (t1 - t0) * 0.6, a + 1, b - 1).fill({ color: 0xffffff, alpha: 0.08 });
  }
}

/** Rooftop billboard; with `own` it shows the building's own sign text (used for facings pointing away). */
function drawBillboard(c: Container, g: Graphics, box: Box, key: BuildingArtKey, night: boolean, own?: { text: string; color: number }): void {
  const { p0 } = corners(box.w, box.h, box.inset);
  const H = box.H;
  const cx = p0[0] + ((box.w - box.h) * HALF_W) / 2 + (own ? 0 : 10);
  const cy = p0[1] + ((box.w + box.h) * HALF_H) / 2 - H - 6;
  const bw = own ? 28 : 24;
  const bh = 12;
  const color = own ? own.color : signColor(key, 5);
  const color2 = own ? mix(own.color, 0xffffff, 0.4) : signColor(key, 6);
  const pts = [cx - bw / 2, cy - bh / 2 - 6, cx + bw / 2, cy - bh / 2 - 6 - 5, cx + bw / 2, cy + bh / 2 - 6 - 5, cx - bw / 2, cy + bh / 2 - 6];
  if (!night) {
    g.moveTo(cx - 6, cy).lineTo(cx - 6, cy + 8).stroke({ width: 1.5, color: 0x6a6a80 });
    g.moveTo(cx + 6, cy - 3).lineTo(cx + 6, cy + 5).stroke({ width: 1.5, color: 0x6a6a80 });
    g.poly(pts).fill(0x1c1c28).stroke({ width: 1, color: own ? color : 0x8a8aa0, alpha: 0.7 });
    if (!own) {
      g.poly([cx - bw / 2 + 2, cy - bh / 2 - 4, cx + 1, cy - bh / 2 - 6, cx + 1, cy + bh / 2 - 8, cx - bw / 2 + 2, cy + bh / 2 - 8]).fill({ color, alpha: 0.7 });
      g.poly([cx + 2, cy - bh / 2 - 6.5, cx + bw / 2 - 2, cy - bh / 2 - 9, cx + bw / 2 - 2, cy + bh / 2 - 13, cx + 2, cy + bh / 2 - 8.5]).fill({ color: color2, alpha: 0.5 });
    }
  } else {
    g.poly(pts).fill({ color, alpha: own ? 0.25 : 0.55 }).stroke({ width: 1.2, color, alpha: 0.9 });
    if (!own) g.poly([cx + 2, cy - bh / 2 - 6.5, cx + bw / 2 - 2, cy - bh / 2 - 9, cx + bw / 2 - 2, cy + bh / 2 - 13, cx + 2, cy + bh / 2 - 8.5]).fill({ color: color2, alpha: 0.6 });
    g.poly([cx - bw / 2 - 4, cy - bh / 2 - 10, cx + bw / 2 + 4, cy - bh / 2 - 17, cx + bw / 2 + 4, cy + bh / 2 - 7, cx - bw / 2 - 4, cy + bh / 2 - 2]).fill({ color, alpha: 0.12 });
  }
  const words = SIGN_WORDS[key.style].short;
  const text = own
    ? neonText(own.text, color, night, 7)
    : new Text({
        text: words[Math.floor(hash32(key.seed, 90, key.floors, 2) * words.length)]!,
        style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 6, fontWeight: '900', fill: 0xffffff, letterSpacing: 0.5, ...(night ? { dropShadow: { color, blur: 4, distance: 0, alpha: 0.9 } } : {}) },
      });
  text.scale.set(Math.min(1, (bw - 4) / Math.max(1, text.width)));
  text.position.set(cx - bw / 2 + 2, cy - bh / 2 - 4);
  text.skew.y = -SKEW;
  text.alpha = night ? 1 : 0.85;
  c.addChild(text);
}

function drawRoofDetails(g: Graphics, box: Box, pal: Palette, key: BuildingArtKey, night: boolean): void {
  const { p0 } = corners(box.w, box.h, box.inset);
  const H = box.H;
  const cx = p0[0] + ((box.w - box.h) * HALF_W) / 2;
  const cy = p0[1] + ((box.w + box.h) * HALF_H) / 2 - H;
  const r = (n: number): number => hash32(key.seed, box.w, box.h, 99 + n);
  const spanX = Math.min(box.w, box.h) * HALF_W * 0.45;
  const spanY = Math.min(box.w, box.h) * HALF_H * 0.45;
  const antenna = key.floors >= 6 || key.style === 'corporate';
  if (night) {
    if (key.floors >= 10 || (antenna && r(1) < 0.4)) {
      const ax = cx + spanX * 0.4;
      g.circle(ax, cy - 16 - (key.style === 'corporate' ? 10 : 0), 5).fill({ color: 0xff2b4a, alpha: 0.35 });
      g.circle(ax, cy - 16 - (key.style === 'corporate' ? 10 : 0), 1.8).fill({ color: 0xff6a7a, alpha: 0.9 });
    }
    if ((key.style === 'corporate' || key.style === 'skyline') && key.floors >= 10 && r(2) < 0.5) {
      g.circle(cx, cy + 1, 7).stroke({ width: 1, color: 0xffb020, alpha: 0.5 });
    }
    return;
  }
  // Roof access hut
  if (r(3) < 0.6) {
    const hx = cx - spanX * 0.5;
    const hy = cy - spanY * 0.2;
    g.poly([hx, hy + 2, hx + 7, hy + 5.5, hx + 7, hy - 1, hx, hy - 4.5]).fill(shade(pal.wallRight, 0.9));
    g.poly([hx, hy + 2, hx - 7, hy - 1.5, hx - 7, hy - 8, hx, hy - 4.5]).fill(shade(pal.wallLeft, 0.9));
    g.poly([hx - 7, hy - 8, hx, hy - 4.5, hx + 7, hy - 1, hx, hy - 4.5 - 3.5]).fill(shade(pal.roof, 1.1));
  }
  // AC units
  const units = 1 + Math.floor(r(4) * 3);
  for (let i = 0; i < units; i++) {
    const ax = cx + (r(10 + i) - 0.5) * spanX * 1.6;
    const ay = cy + (r(20 + i) - 0.5) * spanY * 1.6 + 2;
    g.poly([ax, ay, ax + 5, ay + 2.5, ax + 5, ay - 1.5, ax, ay - 4]).fill(0x3a3a46);
    g.poly([ax, ay - 4, ax + 5, ay - 1.5, ax, ay + 1, ax - 5, ay - 1.5]).fill(0x5a5a68);
    g.poly([ax - 5, ay - 1.5, ax, ay + 1, ax, ay + 3.5, ax - 5, ay + 1]).fill(0x2e2e38);
  }
  // Water tank for older styles
  if ((key.style === 'old' || key.style === 'ghost' || key.style === 'undercity' || key.style === 'docks') && r(5) < 0.6) {
    const tx = cx + spanX * 0.5;
    const ty = cy + spanY * 0.3;
    g.rect(tx - 4, ty - 10, 8, 10).fill(0x5a4a40);
    g.ellipse(tx, ty, 4, 2).fill(0x4a3c34);
    g.ellipse(tx, ty - 10, 4, 2).fill(0x7a6a5c);
    g.moveTo(tx - 4, ty - 7).lineTo(tx + 4, ty - 7).stroke({ width: 0.7, color: 0x000000, alpha: 0.3 });
  }
  // Rooftop garden
  if ((key.style === 'skyline' || (key.style === 'corporate' && r(6) < 0.35)) && box.w * box.h >= 2) {
    g.circle(cx - spanX * 0.3, cy + spanY * 0.5, 4).fill(0x1f6a3a);
    g.circle(cx - spanX * 0.3 - 1, cy + spanY * 0.5 - 1.5, 2.5).fill(0x3a9a5a);
    g.circle(cx + spanX * 0.7, cy + spanY * 0.1, 3).fill(0x2a8a4a);
  }
  // Helipad
  if ((key.style === 'corporate' || key.style === 'skyline') && key.floors >= 10 && r(2) < 0.5) {
    g.ellipse(cx, cy + 1, 9, 4.5).stroke({ width: 1, color: 0xffb020, alpha: 0.8 });
    g.moveTo(cx - 3, cy - 1).lineTo(cx - 3, cy + 3).moveTo(cx + 3, cy - 1).lineTo(cx + 3, cy + 3).moveTo(cx - 3, cy + 1).lineTo(cx + 3, cy + 1).stroke({ width: 1, color: 0xffb020, alpha: 0.8 });
  }
  // Antenna / spire
  if (antenna) {
    const ax = cx + spanX * 0.4;
    g.moveTo(ax, cy - 2).lineTo(ax, cy - 14 - (key.style === 'corporate' ? 10 : 0)).stroke({ width: 1, color: pal.trim, alpha: 0.9 });
  }
  if (key.style === 'docks') {
    g.rect(cx - 12, cy - 18, 4, 18).fill(0x5a4030);
    g.circle(cx - 10, cy - 22, 4).fill({ color: 0x777777, alpha: 0.25 });
  }
}

function drawNeonStrip(g: Graphics, wall: Wall, color: number, floor: number, night: boolean, fromT = 0.15, toT = 0.85): void {
  const yOff = floor * FLOOR_H + FLOOR_H - 2;
  const a = wp(wall.base, wall.dir, fromT * wall.len, yOff);
  const b = wp(wall.base, wall.dir, toT * wall.len, yOff);
  if (night) {
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 6, color, alpha: 0.14 });
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 2.5, color, alpha: 0.4 });
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 1, color: 0xffffff, alpha: 0.7 });
  } else {
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 1.6, color, alpha: 0.8 });
  }
}

function drawRoofLine(g: Graphics, box: Box, color: number): void {
  const { p1, p2, p3 } = corners(box.w, box.h, box.inset);
  g.moveTo(p3[0], p3[1] - box.H).lineTo(p2[0], p2[1] - box.H).lineTo(p1[0], p1[1] - box.H).stroke({ width: 3, color, alpha: 0.18 });
  g.moveTo(p3[0], p3[1] - box.H).lineTo(p2[0], p2[1] - box.H).lineTo(p1[0], p1[1] - box.H).stroke({ width: 1.2, color, alpha: 0.7 });
}

interface OwnSign {
  sign: string;
  color: number;
}

function drawCityBuilding(c: Container, g: Graphics, key: BuildingArtKey, night: boolean, own?: OwnSign): void {
  const pal = own ? { ...paletteFor(key.style, key.seed), litRatio: 0.7 } : paletteFor(key.style, key.seed);
  const box: Box = { w: key.w, h: key.h, H: key.floors * FLOOR_H, inset: BUILDING_INSET };
  const ws = walls(key.w, key.h, BUILDING_INSET);
  const facade = facadeOf(ws, key.facing);
  const other = facade === ws.left ? ws.right : ws.left;
  const plan = planSigns(key);
  const neonStripStyle = key.style === 'undercity' || key.style === 'ghost' || (key.style === 'market' && key.floors >= 3);
  const words = SIGN_WORDS[key.style];
  const wordPool = key.w >= 2 ? [...words.short, ...words.long] : words.short;
  const boardText = own ? own.sign : wordPool[Math.floor(hash32(key.seed, 30, key.floors, key.w) * wordPool.length)]!;
  const boardColor = own ? own.color : signColor(key, 1);
  const verticalColor = own ? own.color : signColor(key, 2);
  const logoColor = own ? own.color : signColor(key, 3);
  const roofColor = own ? own.color : pal.neon[0]!;
  const signWall = facade ?? ws.right;
  const hasBoard = plan.board || !!own;

  if (!night) {
    drawBox(g, box, pal);
    drawWindows(g, ws, pal, key, false, facade);
    if (facade) drawShopfront(g, facade, pal, key, false);
    drawRoofDetails(g, box, pal, key, false);
    if (neonStripStyle) drawNeonStrip(g, signWall, pal.neon[key.seed % pal.neon.length]!, key.style === 'market' ? 1 : 0, false, 0.1, 0.9);
    if (plan.screen) drawScreen(g, other, key, false);
    if (hasBoard && facade) drawBoardSign(c, g, facade, boardText, boardColor, false, plan.flicker, plan.vertical ? 0.22 : 0);
    if (hasBoard && !facade) drawBillboard(c, g, box, key, false, { text: boardText, color: boardColor });
    if (plan.vertical) drawVerticalSign(g, signWall, key.floors, verticalColor, key, false, plan.flicker, 1);
    if (plan.verticalOther) drawVerticalSign(g, other, key.floors, signColor(key, 4), key, false, plan.flicker, 2);
    if (plan.logo) drawLogo(g, signWall, key, logoColor, false);
    if (plan.billboard && (facade || !hasBoard)) drawBillboard(c, g, box, key, false);
    return;
  }
  drawWindows(g, ws, pal, key, true, facade);
  if (facade) drawShopfront(g, facade, pal, key, true);
  drawRoofDetails(g, box, pal, key, true);
  if (neonStripStyle) drawNeonStrip(g, signWall, pal.neon[key.seed % pal.neon.length]!, key.style === 'market' ? 1 : 0, true, 0.1, 0.9);
  if (plan.screen) drawScreen(g, other, key, true);
  if (hasBoard && facade) drawBoardSign(c, g, facade, boardText, boardColor, true, plan.flicker, plan.vertical ? 0.22 : 0);
  if (hasBoard && !facade) drawBillboard(c, g, box, key, true, { text: boardText, color: boardColor });
  if (plan.vertical) drawVerticalSign(g, signWall, key.floors, verticalColor, key, true, plan.flicker, 1);
  if (plan.verticalOther) drawVerticalSign(g, other, key.floors, signColor(key, 4), key, true, plan.flicker, 2);
  if (plan.logo) drawLogo(g, signWall, key, logoColor, true);
  if (plan.billboard && (facade || !hasBoard)) drawBillboard(c, g, box, key, true);
  if (plan.roofLine || own) drawRoofLine(g, box, roofColor);
}

/** Places a skewed sign text at the top of a wall near its near corner. */
function wallSign(c: Container, wall: Wall, text: string, color: number, night: boolean, yTop: number, fontSize: number): void {
  const label = neonText(text, color, night, fontSize);
  const t0 = wall.out > 0 ? 0.08 : Math.max(0.08, wall.len * 0.92 - (label.width / Math.hypot(HALF_W, HALF_H)) * 0.9);
  const s = wp(wall.base, wall.dir, t0, yTop);
  label.position.set(s[0], s[1]);
  label.skew.y = wall.skew;
  c.addChild(label);
}

function drawRamenBar(c: Container, g: Graphics, key: BuildingArtKey, night: boolean): void {
  const pal = PALETTES.player;
  const inset = 0.1;
  const box: Box = { w: 1, h: 1, H: 2 * FLOOR_H + 4, inset };
  const ws = walls(1, 1, inset);
  const facade = facadeOf(ws, key.facing);
  const { p1, p2, p3 } = corners(1, 1, inset);
  const f = facade ?? ws.right;
  const lw = f.len;
  const door: [number, number] = [lw * 0.12, lw * 0.3];
  const win: [number, number] = [lw * 0.42, lw * 0.86];
  if (!night) {
    drawBox(g, box, pal);
    drawWindows(g, ws, pal, { ...key, floors: 2 }, false, facade);
    if (facade) {
      drawAwning(g, facade, 0, lw, FLOOR_H + 2, 0xc0282e, false);
      wallQuad(g, facade, door[0], door[1], 1, FLOOR_H - 1).fill(0x2a1a1c);
      wallQuad(g, facade, win[0], win[1], 3, FLOOR_H - 1).fill(0x3c2628);
      for (const t of [0.4, 0.7]) {
        const l = wp(facade.base, facade.dir, lw * t, FLOOR_H + 9);
        g.circle(l[0], l[1], 2.2).fill(0xd84a2a);
      }
      wallSign(c, facade, 'RAMEN', 0xffb020, false, box.H - 2, 9);
    } else {
      drawBillboard(c, g, box, key, false, { text: 'RAMEN', color: 0xffb020 });
    }
    // Steam vent
    g.circle(p3[0] + 8, p3[1] - box.H - 4, 3).fill({ color: 0xaaaaaa, alpha: 0.18 });
    g.circle(p3[0] + 10, p3[1] - box.H - 8, 2.2).fill({ color: 0xaaaaaa, alpha: 0.12 });
    return;
  }
  drawWindows(g, ws, pal, { ...key, floors: 2 }, true, facade);
  if (facade) {
    wallQuad(g, facade, win[0], win[1], 3, FLOOR_H - 1).fill({ color: 0xffb020, alpha: 0.75 });
    wallQuad(g, facade, door[0], door[1], 1, FLOOR_H - 1).fill({ color: 0xffd27a, alpha: 0.5 });
    for (const t of [0.4, 0.7]) {
      const l = wp(facade.base, facade.dir, lw * t, FLOOR_H + 9);
      g.circle(l[0], l[1], 7).fill({ color: 0xff4a2a, alpha: 0.18 });
      g.circle(l[0], l[1], 2.4).fill({ color: 0xffa070, alpha: 0.95 });
    }
    wallSign(c, facade, 'RAMEN', 0xff2bd6, true, box.H - 2, 9);
    drawLightPool(g, facade, lw * 0.5, 0xffb020, 0.12);
  } else {
    drawBillboard(c, g, box, key, true, { text: 'RAMEN', color: 0xffb020 });
  }
  g.poly([p2[0], p2[1] + 2, p1[0] + 10, p1[1] - 3, p1[0] + 10, p1[1] + 8, p2[0], p2[1] + 12]).fill({ color: 0xffb020, alpha: 0.06 });
}

/** Small single-storey shop with a sign (kiosk, diner). */
function drawShop(c: Container, g: Graphics, key: BuildingArtKey, night: boolean, label: string, neon: number): void {
  const pal = PALETTES.player;
  const inset = 0.1;
  const box: Box = { w: key.w, h: key.h, H: Math.max(1, Math.min(key.floors, 3)) * FLOOR_H + 6, inset };
  const ws = walls(key.w, key.h, inset);
  const facade = facadeOf(ws, key.facing);
  const f = facade ?? ws.right;
  const lw = f.len;
  const door: [number, number] = [lw * 0.1, lw * 0.28];
  const win: [number, number] = [lw * 0.4, lw * 0.9];
  if (!night) {
    drawBox(g, box, { ...pal, wallLeft: 0x323a44, wallRight: 0x444e5c, roof: 0x46505e });
    if (facade) {
      wallQuad(g, facade, door[0], door[1], 1, FLOOR_H - 1).fill(0x101418);
      wallQuad(g, facade, win[0], win[1], 3, FLOOR_H - 1).fill(0x1c2a30);
      drawNeonStrip(g, facade, neon, 0, false, 0.05, 0.95);
      wallSign(c, facade, label, neon, false, box.H - 2, 8);
    } else {
      drawBillboard(c, g, box, key, false, { text: label, color: neon });
    }
    return;
  }
  if (facade) {
    wallQuad(g, facade, win[0], win[1], 3, FLOOR_H - 1).fill({ color: 0xd9f6ff, alpha: 0.6 });
    drawNeonStrip(g, facade, neon, 0, true, 0.05, 0.95);
    wallSign(c, facade, label, neon, true, box.H - 2, 8);
    drawLightPool(g, facade, lw * 0.6, neon, 0.08);
  } else {
    drawBillboard(c, g, box, key, true, { text: label, color: neon });
  }
}

function drawFoodStand(g: Graphics, night: boolean): void {
  const { p0, p1, p2, p3 } = corners(1, 1);
  const cx = (p1[0] + p3[0]) / 2;
  const cy = (p0[1] + p2[1]) / 2;
  const H = 12;
  if (!night) {
    // Small cart body in the tile centre
    g.ellipse(cx + 1, cy + 7, 18, 8).fill({ color: 0x000000, alpha: 0.3 });
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
}

function drawConstructionSite(g: Graphics, key: BuildingArtKey): void {
  const H = Math.max(2, Math.min(key.floors, 6)) * FLOOR_H;
  const { p0, p1, p2, p3 } = corners(key.w, key.h);
  // Ground: fenced site
  g.poly([p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]]).fill(0x1d1a22);
  g.poly([p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]]).stroke({ width: 1.5, color: 0xffb020, alpha: 0.9 });
  // Hazard stripes along front edges
  for (let i = 0; i < key.w * 4; i++) {
    const t = i / 4;
    const x = p3[0] + HALF_W * t;
    const y = p3[1] + HALF_H * t;
    g.rect(x, y - 1, 5, 2).fill(i % 2 === 0 ? 0xffb020 : 0x111111);
  }
  // Scaffold frame (inset like the finished building)
  const ic = corners(key.w, key.h, BUILDING_INSET);
  const frame = { width: 1, color: 0x8a8a9a, alpha: 0.8 };
  g.moveTo(ic.p3[0], ic.p3[1]).lineTo(ic.p3[0], ic.p3[1] - H).stroke(frame);
  g.moveTo(ic.p2[0], ic.p2[1]).lineTo(ic.p2[0], ic.p2[1] - H).stroke(frame);
  g.moveTo(ic.p1[0], ic.p1[1]).lineTo(ic.p1[0], ic.p1[1] - H).stroke(frame);
  g.moveTo(ic.p0[0], ic.p0[1]).lineTo(ic.p0[0], ic.p0[1] - H).stroke({ ...frame, alpha: 0.35 });
  for (let f = 1; f <= Math.round(H / FLOOR_H); f++) {
    const y = f * FLOOR_H;
    g.moveTo(ic.p3[0], ic.p3[1] - y).lineTo(ic.p2[0], ic.p2[1] - y).lineTo(ic.p1[0], ic.p1[1] - y).stroke({ width: 1, color: 0x8a8a9a, alpha: 0.5 });
  }
  g.moveTo(ic.p0[0], ic.p0[1] - H).lineTo(ic.p1[0], ic.p1[1] - H).lineTo(ic.p2[0], ic.p2[1] - H).lineTo(ic.p3[0], ic.p3[1] - H).closePath().stroke(frame);
  // Partially built core
  const coreH = H * 0.45;
  g.poly([ic.p3[0], ic.p3[1], ic.p2[0], ic.p2[1], ic.p2[0], ic.p2[1] - coreH, ic.p3[0], ic.p3[1] - coreH]).fill({ color: 0x3a3a44, alpha: 0.9 });
  g.poly([ic.p2[0], ic.p2[1], ic.p1[0], ic.p1[1], ic.p1[0], ic.p1[1] - coreH, ic.p2[0], ic.p2[1] - coreH]).fill({ color: 0x4a4a56, alpha: 0.9 });
  // Entrance marker on the facing edge
  const ws = walls(key.w, key.h, BUILDING_INSET);
  const facade = facadeOf(ws, key.facing);
  if (facade) wallQuad(g, facade, facade.len * 0.4, facade.len * 0.6, 0, 3).fill({ color: 0x8cff3a, alpha: 0.8 });
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
