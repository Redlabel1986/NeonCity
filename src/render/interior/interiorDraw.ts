/**
 * Drawing helpers for the interior view and the furniture of the city
 * building interiors (cityLayouts.ts). Everything is solid: no translucent
 * surfaces, only additive lamp glows on the separate light layer.
 */

import { Graphics } from 'pixi.js';
import type { Prop } from './layouts';

export const TW = 64;
export const TH = 32;
export const HW = TW / 2;
export const HH = TH / 2;
export const WALL_H = 76;

export function iso(x: number, y: number): [number, number] {
  return [(x - y) * HW, (x + y) * HH];
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function mix(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}

export function shade(c: number, f: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}

/** Isometric box with its base centred at the origin; `w`,`d` in tiles, `h` in pixels. */
export function box(g: Graphics, w: number, d: number, h: number, color: number, z = 0): void {
  const a = iso(-w / 2, -d / 2);
  const b = iso(w / 2, -d / 2);
  const c = iso(w / 2, d / 2);
  const dd = iso(-w / 2, d / 2);
  const up = (p: [number, number], dz: number): [number, number] => [p[0], p[1] - dz];
  const a1 = up(a, h + z);
  const b1 = up(b, h + z);
  const c1 = up(c, h + z);
  const d1 = up(dd, h + z);
  const b0 = up(b, z);
  const c0 = up(c, z);
  const d0 = up(dd, z);
  g.poly([d0[0], d0[1], c0[0], c0[1], c1[0], c1[1], d1[0], d1[1]]).fill(shade(color, 0.78));
  g.poly([c0[0], c0[1], b0[0], b0[1], b1[0], b1[1], c1[0], c1[1]]).fill(shade(color, 0.92));
  g.poly([a1[0], a1[1], b1[0], b1[1], c1[0], c1[1], d1[0], d1[1]]).fill(shade(color, 1.12));
  g.moveTo(d1[0], d1[1]).lineTo(c1[0], c1[1]).lineTo(b1[0], b1[1]).stroke({ width: 0.8, color: 0xffffff, alpha: 0.18 });
}

export function shadow(g: Graphics, rx: number, ry: number, alpha = 0.35): void {
  g.ellipse(0, 1, rx, ry).fill({ color: 0x000000, alpha });
}

export function glow(g: Graphics, x: number, y: number, r: number, color: number, alpha: number): void {
  g.circle(x, y, r * 2).fill({ color, alpha: alpha * 0.35 });
  g.circle(x, y, r).fill({ color, alpha });
}

/** Flat diamond-ish quad on the floor spanning w × h tiles around the origin. */
function floorQuad(g: Graphics, w: number, h: number, color: number): void {
  const a = iso(-w / 2, -h / 2);
  const b = iso(w / 2, -h / 2);
  const c = iso(w / 2, h / 2);
  const d = iso(-w / 2, h / 2);
  g.poly([a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]]).fill(color);
}

/** Line along the room's x axis at height z (pixels). */
function lineX(g: Graphics, x0: number, x1: number, y: number, z: number, width: number, color: number): void {
  const a = iso(x0, y);
  const b = iso(x1, y);
  g.moveTo(a[0], a[1] - z).lineTo(b[0], b[1] - z).stroke({ width, color });
}

function cylinder(g: Graphics, rx: number, h: number, color: number, z = 0): void {
  const ry = rx / 2;
  g.rect(-rx, -h - z, rx * 2, h).fill(shade(color, 0.9));
  g.rect(-rx, -h - z, rx * 0.7, h).fill(shade(color, 0.78));
  g.ellipse(0, -z, rx, ry).fill(shade(color, 0.85));
  g.ellipse(0, -h - z, rx, ry).fill(shade(color, 1.12));
}

/** Props that lie flat on the floor and are drawn below everything else. */
export const FLAT_PROPS = new Set(['lanes', 'pitch', 'tracks', 'pool', 'mat']);

/** Props drawn on the back-right wall (y = 0) at their x position. */
export const WALL_X_PROPS = new Set(['screenwall', 'toolwall']);

/**
 * Draws one of the city interior props; returns `undefined` when the kind is
 * not one of them (the renderer handles the classic business props), else
 * the lamp glow graphics or null.
 */
export function drawCityProp(g: Graphics, prop: Prop, accent: number): Graphics | null | undefined {
  const color = prop.color ?? 0x6a6a7a;
  const w = prop.w ?? 1;
  const h = prop.h ?? 1;
  let lamp: Graphics | null = null;
  const light = (x: number, y: number, r: number, c: number, a: number): void => {
    lamp = lamp ?? new Graphics();
    glow(lamp, x, y, r, c, a);
  };
  switch (prop.kind) {
    case 'awning': {
      for (let i = 0; i < Math.max(2, Math.round(w * 2)); i++) {
        const x0 = -w / 2 + (i * w) / Math.max(2, Math.round(w * 2));
        const x1 = x0 + w / Math.max(2, Math.round(w * 2));
        const a = iso(x0, -0.2);
        const b = iso(x1, -0.2);
        const c = iso(x1, 0.5);
        const d = iso(x0, 0.5);
        g.poly([a[0], a[1] - 40, b[0], b[1] - 40, c[0], c[1] - 30, d[0], d[1] - 30]).fill(i % 2 === 0 ? color : 0xf2efe6);
      }
      break;
    }
    case 'sack':
      shadow(g, 7, 3.5, 0.3);
      g.roundRect(-6, -13, 12, 13, 4).fill(prop.color ?? 0xd8c8a0);
      g.roundRect(-6, -13, 5, 13, 3).fill(shade(prop.color ?? 0xd8c8a0, 0.82));
      g.rect(-3, -15, 6, 3).fill(shade(prop.color ?? 0xd8c8a0, 0.7));
      break;
    case 'espresso':
      box(g, 0.35, 0.3, 11, 0x9a9aa8, 14);
      g.rect(-3, -20, 6, 3).fill(0x2a2a30);
      if (prop.active) light(0, -27, 3, 0xff8a1f, 0.6);
      break;
    case 'display':
      box(g, 1, 0.5, 10, 0x3a3440);
      box(g, 0.94, 0.44, 9, 0xb8dce8, 10);
      for (let i = 0; i < 4; i++) {
        const p = iso(-0.35 + i * 0.22, 0);
        g.circle(p[0], p[1] - 14, 2.4).fill(i % 2 === 0 ? color : shade(color, 0.75));
      }
      if (prop.active) light(0, -16, 8, color, 0.25);
      break;
    case 'oven':
      box(g, 0.9, 0.7, 26, 0x5a5a62);
      g.rect(-8, -18, 16, 9).fill(prop.active ? 0xff8a3a : 0x2a2a30);
      g.rect(-8, -18, 16, 9).stroke({ width: 1, color: 0x2a2a30 });
      if (prop.active) light(0, -14, 7, 0xff8a1f, 0.45);
      break;
    case 'meetingtable': {
      const tw = prop.w ?? 1.8;
      for (const [sx, sy] of [
        [-tw / 2 - 0.2, 0],
        [tw / 2 + 0.2, 0],
        [-tw / 4, -0.65],
        [tw / 4, -0.65],
        [-tw / 4, 0.65],
        [tw / 4, 0.65],
      ] as const) {
        const p = iso(sx, sy);
        g.rect(p[0] - 4, p[1] - 8, 8, 6).fill(0x2a2a38);
      }
      box(g, tw, 0.9, 12, color);
      break;
    }
    case 'bed':
      shadow(g, 18, 9, 0.3);
      box(g, 0.8, 1.3, 7, 0x6a5040);
      box(g, 0.72, 0.9, 3, color, 7);
      box(g, 0.6, 0.3, 4, 0xf2f2f6, 7);
      break;
    case 'scanner':
      box(g, 0.8, 0.8, 8, 0xd8dce4);
      g.ellipse(0, -22, 13, 13).stroke({ width: 5, color: 0xe8ecf2 });
      g.ellipse(0, -22, 13, 13).stroke({ width: 1.5, color: prop.active ? color : 0x5a5a6a });
      if (prop.active) light(0, -22, 6, color, 0.35);
      break;
    case 'lamp': {
      const top = 34 + (w - 1) * 22;
      g.moveTo(0, 0).lineTo(0, -top).stroke({ width: 2, color: 0x6a6a76 });
      g.ellipse(0, -top, 6, 3).fill(0xe8e8ec);
      light(0, -top + 2, 6, 0xfff0c0, 0.55);
      break;
    }
    case 'tv':
      box(g, 0.5, 0.25, 8, 0x3a2a24);
      g.poly([-9, -10, 9, -19, 9, -31, -9, -22]).fill(prop.active ? color : 0x15151c);
      g.poly([-9, -10, 9, -19, 9, -31, -9, -22]).stroke({ width: 1, color: 0x15151c });
      if (prop.active) light(0, -20, 7, color, 0.25);
      break;
    case 'bathtub':
      box(g, 1, 0.55, 9, 0xf0f0f4);
      g.ellipse(0, -9, 15, 5).fill(0x7fc8e8);
      break;
    case 'toilet':
      box(g, 0.32, 0.4, 7, 0xf0f0f4);
      box(g, 0.32, 0.12, 9, 0xe0e0e6, 7);
      break;
    case 'mailbox':
      box(g, 0.3, 0.22, 20, prop.color ?? 0xffb020);
      g.rect(-3, -16, 5, 1.5).fill(0x2a2a30);
      break;
    case 'washer':
      box(g, 0.6, 0.6, 17, 0xe8e8f0);
      g.circle(-2, -10, 5).fill(0x3a5a7a);
      g.circle(-2, -10, 5).stroke({ width: 1.5, color: 0x9a9aa8 });
      break;
    case 'pipes':
      lineX(g, -w / 2, w / 2, 0, 26, 5, 0x6a6e78);
      lineX(g, -w / 2, w / 2, 0.15, 16, 4, 0x8a5a3a);
      for (let x = -w / 2; x <= w / 2; x += 1) {
        const p = iso(x, 0);
        g.rect(p[0] - 2, p[1] - 30, 4, 8).fill(0x9a9aa8);
      }
      break;
    case 'server':
      box(g, 0.5, 0.8, 34, 0x1a1a24);
      for (let i = 0; i < 6; i++) {
        const p = iso(0.25, -0.25);
        g.rect(p[0] - 1, p[1] - 30 + i * 4.5, 6, 1.6).fill(i % 3 === 0 ? 0x8cff3a : color);
      }
      if (prop.active) light(4, -20, 5, color, 0.4);
      break;
    case 'console':
      box(g, 1.2, 0.6, 12, 0x2a2a38);
      g.poly([-16, -16, 10, -29, 16, -26, -10, -13]).fill(prop.active ? color : 0x15151c);
      for (let i = 0; i < 3; i++) g.rect(-8 + i * 6, -12 - i * 3, 3, 1.6).fill(0xffd040);
      if (prop.active) light(0, -20, 8, color, 0.3);
      break;
    case 'tank': {
      const s = w;
      cylinder(g, 14 * s, 34 * s, color);
      g.rect(-14 * s, -18 * s, 28 * s, 2).fill(shade(color, 0.6));
      g.moveTo(10 * s, 0).lineTo(10 * s, -34 * s).stroke({ width: 1.5, color: 0x3a3a44 });
      break;
    }
    case 'pump':
      box(g, 0.6, 0.45, 9, 0x3a5a8a);
      cylinder(g, 5, 10, 0x4a6a9a, 9);
      if (prop.active) light(6, -12, 3, 0x8cff3a, 0.7);
      break;
    case 'screenwall': {
      const a = iso(-w / 2, 0);
      const b = iso(w / 2, 0);
      g.poly([a[0], a[1] - 22, b[0], b[1] - 22, b[0], b[1] - 58, a[0], a[1] - 58]).fill(0x15151c);
      g.poly([a[0] + 2, a[1] - 25, b[0] - 2, b[1] - 25, b[0] - 2, b[1] - 55, a[0] + 2, a[1] - 55]).fill(prop.active ? shade(color, 0.85) : color);
      if (prop.active) {
        for (let i = 0; i < 3; i++) {
          const p = iso(-w / 2 + (w * (i + 0.5)) / 3, 0);
          g.rect(p[0] - 5, p[1] - 46, 10, 3).fill(0xffffff);
        }
        const m = iso(0, 0);
        light(m[0], m[1] - 40, 14, color, 0.18);
      }
      break;
    }
    case 'generator':
      box(g, 1.2, 0.9, 22, 0x5a6068);
      g.circle(-6, -18, 7).fill(0x2a2e34);
      g.circle(-6, -18, 7).stroke({ width: 1.5, color: 0x8a8a96 });
      g.rect(4, -10, 14, 3).fill(0xffd040);
      if (prop.active) light(10, -26, 3, color, 0.8);
      break;
    case 'toolwall': {
      const a = iso(-w / 2, 0);
      const b = iso(w / 2, 0);
      g.poly([a[0], a[1] - 20, b[0], b[1] - 20, b[0], b[1] - 52, a[0], a[1] - 52]).fill(0x8a6a48);
      for (let i = 0; i < Math.round(w * 3); i++) {
        const p = iso(-w / 2 + (i + 0.5) / 3, 0);
        g.rect(p[0] - 1, p[1] - 46, 2, 14).fill([0xff3a5a, 0x9a9aa8, 0xffb020][i % 3]!);
      }
      break;
    }
    case 'conveyor':
      box(g, w, 0.5, 10, 0x3a3a44);
      lineX(g, -w / 2, w / 2, 0, 11, 1, 0x8a8a96);
      for (let x = -w / 2 + 0.4; x < w / 2; x += 0.9) {
        const p = iso(x, 0);
        g.rect(p[0] - 4, p[1] - 18, 8, 7).fill(0xc8a060);
      }
      if (prop.active) light(0, -14, 5, 0x8cff3a, 0.35);
      break;
    case 'forklift':
      box(g, 0.45, 0.7, 10, color);
      g.moveTo(10, -2).lineTo(10, -30).moveTo(14, -4).lineTo(14, -32).stroke({ width: 2, color: 0x2a2a30 });
      box(g, 0.35, 0.3, 8, 0x2a2a30, 10);
      break;
    case 'labbench':
      box(g, 1.1, 0.6, 14, color === 0x6a6a7a ? 0xe8e8f0 : color);
      g.rect(-10, -22, 3, 7).fill(0x8cff3a);
      g.rect(-4, -24, 3, 9).fill(0x19e6ff);
      g.rect(4, -26, 4, 10).fill(0x3a3a44);
      g.circle(6, -27, 2.5).fill(0x5a5a68);
      break;
    case 'animal':
      box(g, 1, 1, 3, 0x9a8a60);
      g.moveTo(-18, 0).lineTo(-18, -10).lineTo(0, -19).moveTo(18, 0).lineTo(18, -10).lineTo(0, -1).stroke({ width: 1.5, color: 0x6a4a2a });
      g.ellipse(0, -9, 9, 5).fill(color);
      g.circle(8, -12, 3.5).fill(shade(color, 0.8));
      g.rect(-5, -11, 4, 3).fill(0xf2f2f2);
      break;
    case 'crate':
      box(g, 0.55, 0.55, 9, 0x8a6a3a);
      g.ellipse(0, -10, 8, 3.5).fill(color);
      break;
    case 'tractor':
      shadow(g, 18, 9, 0.35);
      box(g, 0.55, 1, 10, color, 4);
      box(g, 0.45, 0.4, 14, shade(color, 0.85), 14);
      g.circle(-9, -2, 7).fill(0x1a1a1a);
      g.circle(10, 4, 4.5).fill(0x1a1a1a);
      break;
    case 'bookshelf':
      box(g, 0.4, 0.9, 32, 0x5a3a24);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 3; j++) {
          const p = iso(0.2, -0.3 + j * 0.3);
          g.rect(p[0] - 3, p[1] - 8 - i * 7, 3, 5).fill([0xa83a3a, 0x3a6aa8, 0xd8a050, 0x3a8a5a][(i + j) % 4]!);
        }
      break;
    case 'container':
      box(g, 0.9, 1.5, 26, color);
      for (let i = 1; i < 6; i++) {
        const a = iso(0.45, -0.75 + i * 0.25);
        g.moveTo(a[0], a[1]).lineTo(a[0], a[1] - 26).stroke({ width: 1, color: shade(color, 0.7) });
      }
      break;
    case 'press':
      box(g, 1.2, 1, 12, 0x4a4e58);
      box(g, 0.25, 0.25, 34, 0x6a6e78, 0);
      box(g, 0.9, 0.7, 6, color, 28);
      if (prop.active) light(0, -14, 6, 0xffb020, 0.35);
      break;
    case 'scale':
      box(g, 0.3, 0.3, 3, 0xe8e8f0, 14);
      g.ellipse(0, -18, 7, 3.5).fill(0xb0b0b8);
      break;
    case 'flowerstand':
      box(g, 0.9, 0.6, 9, 0x7a5a3c);
      for (let i = 0; i < 5; i++) {
        const p = iso(-0.35 + i * 0.17, (i % 2) * 0.15 - 0.05);
        g.circle(p[0], p[1] - 12, 3.4).fill(i % 2 === 0 ? color : shade(color, 0.8));
        g.circle(p[0] + 1, p[1] - 9, 1.6).fill(0x2a7a3a);
      }
      break;
    case 'bike':
      g.moveTo(0, 0).lineTo(0, -12).stroke({ width: 2, color: 0x3a3a44 });
      g.circle(-9, -12, 6).stroke({ width: 1.8, color: 0x1a1a1a });
      g.circle(9, -16, 6).stroke({ width: 1.8, color: 0x1a1a1a });
      g.moveTo(-9, -12).lineTo(0, -18).lineTo(9, -16).lineTo(2, -11).lineTo(-9, -12).stroke({ width: 2, color });
      break;
    case 'lanes':
      for (let y = -h / 2 + 1; y < h / 2; y += 2) lineX(g, -w / 2 + 0.2, w / 2 - 0.2, y, 0, 1.5, prop.color ?? 0xe8e8e8);
      break;
    case 'kiosk':
      box(g, 0.4, 0.4, 24, 0x3a3a48);
      g.rect(-5, -22, 8, 7).fill(prop.active ? color : 0x15151c);
      if (prop.active) light(-1, -18, 5, color, 0.4);
      break;
    case 'firetruck':
      shadow(g, 22, 11, 0.35);
      box(g, 0.7, 1.6, 14, 0xc82a2a, 3);
      box(g, 0.6, 0.45, 8, 0xd83a3a, 17);
      lineX(g, -0.2, 0.2, -0.3, 26, 2, 0xd8d8d8);
      g.circle(-8, 2, 4).fill(0x1a1a1a);
      g.circle(12, -6, 4).fill(0x1a1a1a);
      light(0, -28, 3, 0x3a8aff, 0.8);
      break;
    case 'bunk':
      box(g, 0.7, 1.2, 4, 0x6a7080, 4);
      box(g, 0.66, 1.1, 3, 0x5a7aa8, 8);
      box(g, 0.7, 1.2, 4, 0x6a7080, 22);
      box(g, 0.66, 1.1, 3, 0x5a7aa8, 26);
      for (const [px, py] of [
        [-0.35, -0.6],
        [0.35, 0.6],
      ] as const) {
        const p = iso(px, py);
        g.moveTo(p[0], p[1]).lineTo(p[0], p[1] - 30).stroke({ width: 2, color: 0x4a4e58 });
      }
      break;
    case 'fuelpump':
      box(g, 0.4, 0.55, 28, 0xe8e8ec);
      g.rect(-4, -20, 8, 6).fill(prop.active ? color : 0x15151c);
      g.rect(-6, -30, 12, 3).fill(color);
      g.moveTo(7, -14).bezierCurveTo(16, -8, 14, 0, 10, -2).stroke({ width: 1.5, color: 0x1a1a1a });
      if (prop.active) light(0, -17, 5, color, 0.4);
      break;
    case 'turnstile':
      box(g, 0.2, 0.5, 18, 0x8a8a96);
      g.moveTo(4, -14).lineTo(18, -8).stroke({ width: 2, color: 0xc8c8d0 });
      g.circle(0, -20, 2).fill(prop.active ? color : 0x3a3a44);
      if (prop.active) light(0, -20, 3, color, 0.6);
      break;
    case 'fence':
      for (let x = -w / 2; x <= w / 2 + 1e-6; x += 0.5) {
        const p = iso(x, 0);
        g.moveTo(p[0], p[1]).lineTo(p[0], p[1] - 18).stroke({ width: 1.6, color: 0x8a8a96 });
      }
      lineX(g, -w / 2, w / 2, 0, 16, 1.2, 0xa8a8b0);
      lineX(g, -w / 2, w / 2, 0, 6, 1.2, 0xa8a8b0);
      break;
    case 'flag':
      g.moveTo(0, 0).lineTo(0, -44).stroke({ width: 1.5, color: 0xc8c8d0 });
      g.poly([0, -44, 16, -40, 16, -30, 0, -34]).fill(color);
      break;
    case 'bars':
      box(g, 1, 0.9, 2, 0x4a4e58);
      box(g, 0.4, 0.8, 6, 0x5a6a8a, 2);
      for (let i = 0; i <= 8; i++) {
        const p = iso(-0.5 + i / 8, 0.45);
        g.moveTo(p[0], p[1]).lineTo(p[0], p[1] - 30).stroke({ width: 1.4, color: 0x9a9aa8 });
      }
      lineX(g, -0.5, 0.5, 0.45, 30, 2, 0x9a9aa8);
      break;
    case 'seats': {
      const n = Math.max(1, Math.round(w / 0.5));
      for (let i = 0; i < n; i++) {
        const p = iso(-w / 2 + (i + 0.5) * (w / n), 0);
        g.rect(p[0] - 5, p[1] - 9, 10, 6).fill(color === 0x6a6a7a ? 0x3a3a58 : color);
        g.rect(p[0] - 5, p[1] - 14, 10, 5).fill(shade(color === 0x6a6a7a ? 0x3a3a58 : color, 0.8));
      }
      break;
    }
    case 'popcorn':
      box(g, 0.4, 0.4, 14, 0xc82a2a, 14);
      g.ellipse(0, -30, 7, 3.5).fill(0xffe08a);
      if (prop.active) light(0, -26, 5, 0xffd040, 0.4);
      break;
    case 'stage':
      box(g, w, 1.4, 8, 0x2a2228);
      lineX(g, -w / 2, w / 2, 0.7, 8, 2, color);
      for (let x = -w / 2 + 0.6; x < w / 2; x += 1.4) {
        const p = iso(x, -0.4);
        light(p[0], p[1] - 14, 7, 0xfff0c0, 0.3);
      }
      break;
    case 'pedestal':
      box(g, 0.5, 0.5, 12, 0xd8d8e0);
      g.poly([0, -28, 6, -20, 0, -14, -6, -20]).fill(color);
      light(0, -21, 6, color, 0.25);
      break;
    case 'treadmill':
      box(g, 0.45, 1, 4, 0x2a2a30);
      lineX(g, -0.2, -0.2, 0, 0, 1, 0x2a2a30);
      g.moveTo(10, -4).lineTo(10, -22).moveTo(16, -1).lineTo(16, -19).stroke({ width: 1.6, color: 0x8a8a96 });
      g.rect(9, -26, 9, 5).fill(prop.active ? color : 0x15151c);
      break;
    case 'weights':
      box(g, 1, 0.4, 3, 0x2a2a30);
      lineX(g, -0.5, 0.5, 0, 16, 2, 0xc8c8d0);
      for (const x of [-0.42, 0.42]) {
        const p = iso(x, 0);
        g.circle(p[0], p[1] - 16, 6).fill(0x1a1a1a);
      }
      box(g, 0.35, 0.8, 6, 0x3a3a48, 0);
      break;
    case 'pitch': {
      floorQuad(g, w, h, prop.color ?? 0x3a8a3a);
      const a = iso(-w / 2 + 0.2, -h / 2 + 0.2);
      const b = iso(w / 2 - 0.2, -h / 2 + 0.2);
      const c = iso(w / 2 - 0.2, h / 2 - 0.2);
      const d = iso(-w / 2 + 0.2, h / 2 - 0.2);
      g.poly([a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]]).stroke({ width: 1.5, color: 0xf2f2f2 });
      const m0 = iso(0, -h / 2 + 0.2);
      const m1 = iso(0, h / 2 - 0.2);
      g.moveTo(m0[0], m0[1]).lineTo(m1[0], m1[1]).stroke({ width: 1.5, color: 0xf2f2f2 });
      g.ellipse(0, 0, 16, 8).stroke({ width: 1.5, color: 0xf2f2f2 });
      break;
    }
    case 'goal': {
      const a = iso(0, -0.5);
      const b = iso(0, 0.5);
      g.moveTo(a[0], a[1]).lineTo(a[0], a[1] - 16).lineTo(b[0], b[1] - 16).lineTo(b[0], b[1]).stroke({ width: 2, color: 0xf2f2f2 });
      break;
    }
    case 'tracks':
      for (let x = -w / 2; x < w / 2; x += 0.35) {
        const a = iso(x, -0.3);
        const b = iso(x, 0.3);
        g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 3, color: 0x5a4030 });
      }
      lineX(g, -w / 2, w / 2, -0.2, 1, 2, 0xb0b0b8);
      lineX(g, -w / 2, w / 2, 0.2, 1, 2, 0xb0b0b8);
      break;
    case 'escalator': {
      const a = iso(-0.3, -0.8);
      const b = iso(0.3, -0.8);
      const c = iso(0.3, 0.8);
      const d = iso(-0.3, 0.8);
      g.poly([d[0], d[1], c[0], c[1], b[0], b[1] - 36, a[0], a[1] - 36]).fill(0x8a8a96);
      for (let i = 1; i < 8; i++) {
        const t = i / 8;
        const l = [d[0] + (a[0] - d[0]) * t, d[1] + (a[1] - 36 - d[1]) * t];
        const r = [c[0] + (b[0] - c[0]) * t, c[1] + (b[1] - 36 - c[1]) * t];
        g.moveTo(l[0]!, l[1]!).lineTo(r[0]!, r[1]!).stroke({ width: 1, color: 0x4a4a54 });
      }
      g.moveTo(d[0], d[1] - 10).lineTo(a[0], a[1] - 46).stroke({ width: 2.5, color: 0x2a2a30 });
      break;
    }
    case 'shopfront':
      box(g, 1.3, 0.4, 26, 0x2a2a38);
      g.poly([-18, -6, 10, -20, 10, -36, -18, -22]).fill(shade(color, 0.55));
      g.poly([-18, -26, 14, -42, 14, -46, -18, -30]).fill(color);
      light(-2, -36, 8, color, 0.22);
      break;
    case 'crane': {
      const legs: [number, number][] = [
        [-0.8, -0.5],
        [0.8, -0.5],
        [-0.8, 0.5],
        [0.8, 0.5],
      ];
      for (const [lx, ly] of legs) {
        const p = iso(lx, ly);
        g.moveTo(p[0], p[1]).lineTo(p[0], p[1] - 70).stroke({ width: 3, color: 0xffb020 });
      }
      lineX(g, -1, 1.4, -0.5, 70, 4, 0xffb020);
      lineX(g, -1, 1.4, 0.5, 70, 4, 0xffb020);
      const hook = iso(0.3, 0);
      g.moveTo(hook[0], hook[1] - 70).lineTo(hook[0], hook[1] - 30).stroke({ width: 1, color: 0x2a2a30 });
      g.rect(hook[0] - 4, hook[1] - 30, 8, 5).fill(0x2a2a30);
      light(hook[0], hook[1] - 72, 3, 0xff8a1f, 0.8);
      break;
    }
    case 'hull': {
      const l = w;
      const a = iso(-l / 2, -0.6);
      const b = iso(l / 2 + 0.6, 0);
      const c = iso(-l / 2, 0.6);
      g.poly([a[0], a[1] - 6, b[0], b[1] - 10, c[0], c[1] - 6]).fill(0xa83a3a);
      g.poly([a[0], a[1] - 6, b[0], b[1] - 10, b[0], b[1] - 26, a[0], a[1] - 30]).fill(0x5a6a7a);
      g.poly([c[0], c[1] - 6, b[0], b[1] - 10, b[0], b[1] - 26, c[0], c[1] - 30]).fill(0x6a7a8a);
      for (let x = -l / 2; x <= l / 2; x += 1) {
        const p = iso(x, 0.9);
        g.moveTo(p[0], p[1]).lineTo(p[0], p[1] - 40).stroke({ width: 1.2, color: 0xc8a040 });
      }
      lineX(g, -l / 2, l / 2, 0.9, 40, 1.2, 0xc8a040);
      break;
    }
    case 'welder':
      box(g, 0.6, 0.5, 14, 0x3a4a5a);
      g.moveTo(8, -12).lineTo(18, -4).stroke({ width: 1.5, color: 0x1a1a1a });
      if (prop.active) light(18, -4, 4, color, 0.9);
      break;
    case 'pool':
      floorQuad(g, w + 0.3, h + 0.3, 0xb0b0b8);
      floorQuad(g, w, h, 0x2a7ab0);
      floorQuad(g, w * 0.6, h * 0.6, 0x3a8ac0);
      if (prop.active) {
        g.moveTo(0, 0).lineTo(0, -18).stroke({ width: 2, color: 0xbfe8ff });
        g.ellipse(0, -18, 5, 2.5).fill(0xbfe8ff);
      }
      break;
    case 'plantbed':
      box(g, w, 0.6, 5, 0x5a4030);
      for (let x = -w / 2 + 0.3; x < w / 2; x += 0.45) {
        const p = iso(x, 0);
        g.circle(p[0], p[1] - 9, 4).fill(0x3a9a4a);
        g.circle(p[0] + 2, p[1] - 11, 2.5).fill(0x5ac85a);
      }
      break;
    case 'cage':
      box(g, 0.7, 0.6, 3, 0x9a9aa8);
      g.ellipse(0, -7, 5, 3).fill(0xc8a070);
      for (let i = 0; i <= 5; i++) {
        const p = iso(-0.35 + i * 0.14, 0.3);
        g.moveTo(p[0], p[1] - 3).lineTo(p[0], p[1] - 18).stroke({ width: 1, color: 0x9a9aa8 });
      }
      box(g, 0.7, 0.6, 2, 0x8a8a96, 18);
      break;
    case 'vaultdoor':
      g.circle(0, -26, 18).fill(0x7a7a86);
      g.circle(0, -26, 13).fill(0x9a9aa8);
      g.circle(0, -26, 3).fill(0x3a3a44);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        g.moveTo(0, -26).lineTo(Math.cos(ang) * 10, -26 + Math.sin(ang) * 10).stroke({ width: 2, color: 0x5a5a66 });
      }
      break;
    case 'shuttle':
      shadow(g, 30, 14, 0.35);
      box(g, 0.8, 2.6, 14, color, 6);
      g.poly([-30, -6, 0, -12, 30, -6, 0, 4]).fill(shade(color, 0.7));
      box(g, 0.4, 0.5, 6, 0x19a0c8, 20);
      light(0, -16, 6, 0x19e6ff, 0.3);
      break;
    case 'turbine':
      g.poly([-3, 0, 3, 0, 1.5, -86, -1.5, -86]).fill(0xe8ecf2);
      g.circle(0, -86, 3.5).fill(0xd8dce4);
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * Math.PI * 2 - Math.PI / 2;
        g.moveTo(0, -86).lineTo(Math.cos(ang) * 36, -86 + Math.sin(ang) * 36).stroke({ width: 3, color: 0xf2f4f8 });
      }
      light(0, -88, 2, 0xff3a5a, 0.8);
      break;
    case 'solarpanel':
      g.moveTo(0, 0).lineTo(0, -10).stroke({ width: 2, color: 0x8a8a96 });
      g.poly([-16, -10, 6, -20, 16, -14, -6, -4]).fill(0x1a3a6a);
      for (let i = 1; i < 4; i++) g.moveTo(-16 + i * 5.5, -10 - i * 2.5).lineTo(-6 + i * 5.5, -4 - i * 2.5).stroke({ width: 0.8, color: 0x7fa8d8 });
      break;
    case 'tree':
      shadow(g, 12, 6, 0.3);
      g.rect(-2, -16, 4, 16).fill(0x5a3a24);
      g.circle(0, -24, 11).fill(0x2a7a3a);
      g.circle(-5, -28, 7).fill(0x3a8a4a);
      g.circle(5, -27, 6).fill(0x4a9a5a);
      break;
    case 'swing':
      g.moveTo(-14, 0).lineTo(-10, -30).lineTo(10, -40).lineTo(14, -10).stroke({ width: 2, color: 0xc83a3a });
      g.moveTo(-4, -33).lineTo(-4, -12).moveTo(4, -37).lineTo(4, -16).stroke({ width: 1, color: 0x3a3a44 });
      g.rect(-5, -14, 10, 3).fill(0x8a5a34);
      break;
    case 'barrel':
      cylinder(g, 6, 16, color === 0x6a6a7a ? [0x3a6aa8, 0xc83a3a, 0xffb020][Math.floor(hashStr(`${prop.x},${prop.y}`) * 3)]! : color);
      g.rect(-6, -10, 12, 1.5).fill(0x2a2a30);
      break;
    default:
      return undefined;
  }
  void accent;
  return lamp;
}
