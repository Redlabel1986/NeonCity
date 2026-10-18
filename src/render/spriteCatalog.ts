/**
 * Pre-rendered building sprites (public/sprites, made by
 * tools/sprites/render_buildings.py in the game's own projection).
 *
 * City buildings pick a sprite of their region whose footprint matches for
 * their facing; buildings without a match keep the procedural drawing
 * (the "dummy"). The choice is a pure function of the building, so every
 * client and every reload shows the same sprite.
 */

export interface SpriteFacing {
  day: string;
  night: string | null;
  /** Offset of the sprite's top-left corner from the footprint's top tile corner, in game pixels. */
  ox: number;
  oy: number;
  width: number;
  height: number;
  /** World footprint for this facing. */
  w: number;
  h: number;
}

export interface SpriteEntry {
  id: string;
  region: string;
  name: string;
  kind: string;
  w: number;
  h: number;
  decor: boolean;
  facings: Record<string, SpriteFacing>;
}

export interface SpriteCatalog {
  version: number;
  scale: number;
  buildings: SpriteEntry[];
}

export const SPRITE_BASE = 'sprites/';

/** Sprite kinds that read as open ground, not as a building; never used for city buildings. */
const NOT_A_BUILDING = new Set(['decor', 'park', 'fountain', 'parking', 'solar']);

/** Deterministic choice of a sprite for a city building, or null (procedural fallback). */
export function pickCitySprite(catalog: SpriteCatalog, region: string, w: number, h: number, facing: number, variant: number): { entry: SpriteEntry; facing: SpriteFacing } | null {
  const key = String(facing);
  const candidates = catalog.buildings.filter((b) => b.region === region && !b.decor && !NOT_A_BUILDING.has(b.kind) && b.facings[key]?.w === w && b.facings[key]?.h === h);
  if (candidates.length === 0) return null;
  const entry = candidates[variant % candidates.length]!;
  return { entry, facing: entry.facings[key]! };
}

export async function loadSpriteCatalog(): Promise<SpriteCatalog | null> {
  try {
    const res = await fetch(`${SPRITE_BASE}catalog.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as SpriteCatalog;
    return Array.isArray(data.buildings) ? data : null;
  } catch {
    return null;
  }
}
