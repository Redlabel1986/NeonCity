/** Isometric projection helpers (2:1 diamond tiles). */

export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;
/** Pixel height of one building floor. */
export const FLOOR_H = 11;

/** Screen position of a tile-space point (tile corners are integers, centres are +0.5). */
export function isoToScreen(x: number, y: number): { sx: number; sy: number } {
  return { sx: (x - y) * HALF_W, sy: (x + y) * HALF_H };
}

/** Inverse projection to continuous tile space. */
export function screenToIso(sx: number, sy: number): { x: number; y: number } {
  const x = (sx / HALF_W + sy / HALF_H) / 2;
  const y = (sy / HALF_H - sx / HALF_W) / 2;
  return { x, y };
}

/** Tile index under a world-space point. */
export function screenToTile(sx: number, sy: number): { x: number; y: number } {
  const p = screenToIso(sx, sy);
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
}

/** Depth value for painter's ordering of a footprint. */
export function depthOf(x: number, y: number, w: number, h: number): number {
  return (x + w + y + h) * 4;
}
