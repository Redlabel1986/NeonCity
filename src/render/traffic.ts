/**
 * Street life: pedestrians and vehicles moving along road tiles. Purely
 * visual, but density follows the simulation (time of day, district
 * traffic, how many citizens are commuting).
 *
 * Vehicles are small isometric bodies (chassis, cabin, lights) drawn for
 * the two screen axes; movement along the y axis uses the mirrored sprite.
 * They keep to the right-hand lane of their road.
 */

import { Container, Graphics, Sprite, Texture, type Renderer } from 'pixi.js';
import { HALF_H, HALF_W, isoToScreen } from './iso';
import { TileKind } from '../sim/world/grid';
import type { GameState } from '../sim/state';

type Heading = 'px' | 'nx' | 'py' | 'ny';

interface Mover {
  sprite: Sprite;
  light: Sprite | null;
  kind: 'walker' | 'car';
  x: number; // tile space (continuous)
  y: number;
  tx: number; // target tile
  ty: number;
  px: number; // previous tile (avoid U-turns)
  py: number;
  heading: Heading;
  speed: number;
}

interface CarArt {
  body: Texture;
  night: Texture;
  anchor: { x: number; y: number };
  nightAnchor: { x: number; y: number };
}

const WALKER_COLORS = [0xd8d4e8, 0x8a849e, 0xff2bd6, 0x19e6ff, 0xffb020, 0x8cff3a, 0xc08aff];
const CAR_COLORS = [0x7a8098, 0x9a9fb8, 0xb05a7a, 0x4a8ab0, 0xc0aa5a, 0x5aaa8a, 0xe8e4f4, 0xff2bd6, 0xffb020, 0x3a3a48];
/** Lane offset in tiles, to the right of the driving direction. */
const LANE = 0.19;

export class TrafficLayer {
  private container: Container = new Container();
  private lights: Container = new Container();
  private movers: Mover[] = [];
  private walkerTex: Texture | null = null;
  private walkerAnchor = { x: 0.5, y: 1 };
  private carForward: CarArt | null = null;
  private carBackward: CarArt | null = null;
  private roads: { x: number; y: number }[] = [];
  private grid: GameState['grid'] | null = null;
  private time = 0;
  private enabled = true;

  init(renderer: Renderer, objects: Container, lights: Container): void {
    this.container = objects;
    this.lights = lights;
    const w = new Graphics();
    w.ellipse(0, 0, 2.4, 1.2).fill({ color: 0x000000, alpha: 0.45 });
    w.rect(-1.2, -3.5, 1, 3.5).fill(0x2a2a36);
    w.rect(0.3, -3.5, 1, 3.5).fill(0x2a2a36);
    w.rect(-1.9, -7.5, 3.8, 4.5).fill({ color: 0x000000, alpha: 0.5 });
    w.rect(-1.5, -7.2, 3, 4).fill(0xffffff);
    w.circle(0, -8.6, 1.9).fill({ color: 0x000000, alpha: 0.5 });
    w.circle(0, -8.6, 1.4).fill(0xffffff);
    const wb = w.getLocalBounds();
    this.walkerTex = renderer.generateTexture({ target: w, resolution: 3 });
    this.walkerAnchor = { x: -wb.minX / wb.width, y: -wb.minY / wb.height };
    w.destroy();
    this.carForward = buildCar(renderer, true);
    this.carBackward = buildCar(renderer, false);
  }

  get count(): number {
    return this.movers.length;
  }

  /** Debug sample of the first movers. */
  debugSample(): unknown[] {
    return this.movers.slice(0, 3).map((m) => ({
      kind: m.kind,
      heading: m.heading,
      x: m.x,
      y: m.y,
      px: m.sprite.position.x,
      py: m.sprite.position.y,
      visible: m.sprite.visible,
      w: m.sprite.width,
      h: m.sprite.height,
      parent: m.sprite.parent?.label,
      z: m.sprite.zIndex,
    }));
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  load(state: GameState): void {
    this.clear();
    this.grid = state.grid;
    this.roads = [];
    for (let y = 0; y < state.grid.height; y++) {
      for (let x = 0; x < state.grid.width; x++) {
        if (state.grid.kindAt(x, y) === TileKind.Road) this.roads.push({ x, y });
      }
    }
  }

  clear(): void {
    for (const m of this.movers) {
      m.sprite.destroy();
      m.light?.destroy();
    }
    this.movers = [];
  }

  /**
   * Updates positions. `view` is the visible tile rectangle; movers spawn
   * inside it. `density` 0..1 scales how many movers exist.
   */
  update(
    dt: number,
    view: { x0: number; y0: number; x1: number; y1: number },
    density: number,
    night: number,
    rngSeed: number,
    onScreen: (sx: number, sy: number) => boolean,
  ): void {
    if (!this.enabled || !this.grid || !this.walkerTex || !this.carForward || !this.carBackward) return;
    this.time += dt;
    const area = Math.max(1, (view.x1 - view.x0) * (view.y1 - view.y0));
    const targetWalkers = Math.min(260, Math.round(area * 0.14 * density));
    const targetCars = Math.min(110, Math.round(area * 0.045 * (0.4 + density * 0.8)));
    const rand = mulberry(rngSeed + Math.floor(this.time * 7));
    const visibleRoads = this.roads.filter((r) => {
      if (r.x < view.x0 || r.x > view.x1 || r.y < view.y0 || r.y > view.y1) return false;
      const p = isoToScreen(r.x + 0.5, r.y + 0.5);
      return onScreen(p.sx, p.sy);
    });
    const walkers = this.movers.filter((m) => m.kind === 'walker').length;
    const cars = this.movers.length - walkers;
    if (visibleRoads.length > 0) {
      for (let i = walkers; i < targetWalkers; i++) this.spawn('walker', visibleRoads[Math.floor(rand() * visibleRoads.length)]!, rand);
      for (let i = cars; i < targetCars; i++) this.spawn('car', visibleRoads[Math.floor(rand() * visibleRoads.length)]!, rand);
    }
    const remaining: Mover[] = [];
    let walkerCount = 0;
    let carCount = 0;
    for (const m of this.movers) {
      const dx = m.tx - m.x;
      const dy = m.ty - m.y;
      const dist = Math.hypot(dx, dy);
      const step = m.speed * dt;
      if (dist <= step) {
        m.x = m.tx;
        m.y = m.ty;
        const next = this.nextRoad(Math.round(m.x), Math.round(m.y), m.px, m.py, rand);
        if (next) {
          m.px = m.tx;
          m.py = m.ty;
          m.tx = next.x;
          m.ty = next.y;
          this.setHeading(m, headingOf(m.tx - m.x, m.ty - m.y));
        }
      } else {
        m.x += (dx / dist) * step;
        m.y += (dy / dist) * step;
      }
      const screen = isoToScreen(m.x + 0.5, m.y + 0.5);
      const outside = !onScreen(screen.sx, screen.sy);
      const over = (m.kind === 'walker' && walkerCount >= targetWalkers) || (m.kind === 'car' && carCount >= targetCars);
      if (outside || over) {
        m.sprite.destroy();
        m.light?.destroy();
        continue;
      }
      if (m.kind === 'walker') walkerCount++;
      else carCount++;
      const [ox, oy] = laneOffset(m.kind, m.heading);
      const { sx, sy } = isoToScreen(m.x + 0.5 + ox, m.y + 0.5 + oy);
      m.sprite.position.set(sx, sy);
      m.sprite.zIndex = (m.x + m.y) * 4 + 2;
      if (m.light) {
        m.light.position.set(sx, sy);
        m.light.alpha = night;
      }
      remaining.push(m);
    }
    this.movers = remaining;
  }

  private setHeading(m: Mover, heading: Heading): void {
    if (m.kind !== 'car' || m.heading === heading) {
      m.heading = heading;
      return;
    }
    m.heading = heading;
    const art = heading === 'px' || heading === 'py' ? this.carForward! : this.carBackward!;
    const mirror = heading === 'py' || heading === 'ny';
    m.sprite.texture = art.body;
    m.sprite.anchor.set(art.anchor.x, art.anchor.y);
    m.sprite.scale.set(mirror ? -1 : 1, 1);
    if (m.light) {
      m.light.texture = art.night;
      m.light.anchor.set(art.nightAnchor.x, art.nightAnchor.y);
      m.light.scale.set(mirror ? -1 : 1, 1);
    }
  }

  private spawn(kind: Mover['kind'], at: { x: number; y: number }, rand: () => number): void {
    const next = this.nextRoad(at.x, at.y, -1, -1, rand) ?? at;
    const heading = headingOf(next.x - at.x, next.y - at.y);
    let sprite: Sprite;
    let light: Sprite | null = null;
    if (kind === 'walker') {
      sprite = new Sprite(this.walkerTex!);
      sprite.anchor.set(this.walkerAnchor.x, this.walkerAnchor.y);
      sprite.tint = WALKER_COLORS[Math.floor(rand() * WALKER_COLORS.length)]!;
    } else {
      const art = heading === 'px' || heading === 'py' ? this.carForward! : this.carBackward!;
      const mirror = heading === 'py' || heading === 'ny';
      sprite = new Sprite(art.body);
      sprite.anchor.set(art.anchor.x, art.anchor.y);
      sprite.scale.set(mirror ? -1 : 1, 1);
      sprite.tint = CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]!;
      light = new Sprite(art.night);
      light.anchor.set(art.nightAnchor.x, art.nightAnchor.y);
      light.scale.set(mirror ? -1 : 1, 1);
      light.blendMode = 'add';
      this.lights.addChild(light);
    }
    this.container.addChild(sprite);
    this.movers.push({
      sprite,
      light,
      kind,
      x: at.x,
      y: at.y,
      tx: next.x,
      ty: next.y,
      px: -1,
      py: -1,
      heading,
      speed: kind === 'walker' ? 0.35 + rand() * 0.25 : 1.6 + rand() * 1.2,
    });
  }

  private nextRoad(x: number, y: number, px: number, py: number, rand: () => number): { x: number; y: number } | null {
    const grid = this.grid!;
    const options: { x: number; y: number }[] = [];
    if (grid.isRoad(x + 1, y)) options.push({ x: x + 1, y });
    if (grid.isRoad(x - 1, y)) options.push({ x: x - 1, y });
    if (grid.isRoad(x, y + 1)) options.push({ x, y: y + 1 });
    if (grid.isRoad(x, y - 1)) options.push({ x, y: y - 1 });
    if (options.length === 0) return null;
    const ahead = options.filter((o) => o.x !== px || o.y !== py);
    const pool = ahead.length > 0 ? ahead : options;
    return pool[Math.floor(rand() * pool.length)]!;
  }
}

function headingOf(dx: number, dy: number): Heading {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'px' : 'nx';
  return dy >= 0 ? 'py' : 'ny';
}

/** Offset in tile space that keeps a mover on its side of the road. */
function laneOffset(kind: Mover['kind'], heading: Heading): [number, number] {
  const d = kind === 'walker' ? 0.34 : LANE;
  switch (heading) {
    case 'px':
      return [0, d];
    case 'nx':
      return [0, -d];
    case 'py':
      return [-d, 0];
    default:
      return [d, 0];
  }
}

/**
 * Builds the car textures for movement along the +x screen axis.
 * `forward` = the visible end face is the front (headlights), otherwise
 * it is the rear (tail lights).
 */
function buildCar(renderer: Renderer, forward: boolean): CarArt {
  const L = 0.52;
  const W = 0.27;
  const H = 6;
  // Point `t` tiles along the x axis, `s` across (y axis), `z` pixels up.
  const P = (t: number, s: number, z = 0): [number, number] => [(t - s) * HALF_W, (t + s) * HALF_H - z];
  const quad = (g: Graphics, pts: [number, number][]): Graphics => g.poly(pts.flat());
  const l = L / 2;
  const w = W / 2;
  const g = new Graphics();
  // Shadow
  g.ellipse(0, 1, 16, 7).fill({ color: 0x000000, alpha: 0.35 });
  // Chassis
  quad(g, [P(-l, w), P(l, w), P(l, w, H), P(-l, w, H)]).fill(0xffffff);
  quad(g, [P(-l, w), P(l, w), P(l, w, H), P(-l, w, H)]).fill({ color: 0x000000, alpha: 0.24 });
  quad(g, [P(l, w), P(l, -w), P(l, -w, H), P(l, w, H)]).fill(0xffffff);
  quad(g, [P(l, w), P(l, -w), P(l, -w, H), P(l, w, H)]).fill({ color: 0x000000, alpha: 0.4 });
  quad(g, [P(-l, -w, H), P(l, -w, H), P(l, w, H), P(-l, w, H)]).fill(0xffffff);
  // Cabin (slightly narrower, set back from the front)
  const c0 = -l * 0.7;
  const c1 = l * 0.3;
  const cw = w * 0.8;
  const CH = H + 4.5;
  quad(g, [P(c0, cw, H), P(c1, cw, H), P(c1, cw, CH), P(c0, cw, CH)]).fill({ color: 0x182030, alpha: 0.95 });
  quad(g, [P(c1, cw, H), P(c1, -cw, H), P(c1, -cw, CH), P(c1, cw, CH)]).fill({ color: 0x101820, alpha: 0.95 });
  quad(g, [P(c0, -cw, CH), P(c1, -cw, CH), P(c1, cw, CH), P(c0, cw, CH)]).fill(0xffffff);
  quad(g, [P(c0, -cw, CH), P(c1, -cw, CH), P(c1, cw, CH), P(c0, cw, CH)]).fill({ color: 0x000000, alpha: 0.08 });
  // Highlight line along the roof edge
  const r0 = P(-l, w, H);
  const r1 = P(l, w, H);
  g.moveTo(r0[0], r0[1]).lineTo(r1[0], r1[1]).stroke({ width: 0.8, color: 0xffffff, alpha: 0.5 });
  // Lights on the visible end face
  for (const s of [-w * 0.55, w * 0.55]) {
    const p = P(l, s, H * 0.45);
    g.circle(p[0], p[1], 1.1).fill(forward ? 0xfff6d0 : 0xff5a5a);
  }
  const bounds = g.getLocalBounds();
  const body = renderer.generateTexture({ target: g, resolution: 3 });
  const anchor = { x: -bounds.minX / bounds.width, y: -bounds.minY / bounds.height };
  g.destroy();

  const n = new Graphics();
  if (forward) {
    const beam = P(l + 0.42, 0, 2);
    n.ellipse(beam[0], beam[1], 15, 7).fill({ color: 0xffe8b0, alpha: 0.22 });
    n.ellipse(beam[0] - 4, beam[1] - 1, 8, 4).fill({ color: 0xffe8b0, alpha: 0.3 });
    for (const s of [-w * 0.55, w * 0.55]) {
      const p = P(l, s, H * 0.45);
      n.circle(p[0], p[1], 2.6).fill({ color: 0xfff6d0, alpha: 0.5 });
      n.circle(p[0], p[1], 1.2).fill({ color: 0xffffff, alpha: 1 });
    }
  } else {
    for (const s of [-w * 0.55, w * 0.55]) {
      const p = P(l, s, H * 0.45);
      n.circle(p[0], p[1], 3).fill({ color: 0xff3a3a, alpha: 0.45 });
      n.circle(p[0], p[1], 1.2).fill({ color: 0xffb0b0, alpha: 1 });
    }
    const beam = P(-l - 0.38, 0, 2);
    n.ellipse(beam[0], beam[1], 13, 6).fill({ color: 0xffe8b0, alpha: 0.16 });
  }
  const nb = n.getLocalBounds();
  const night = renderer.generateTexture({ target: n, resolution: 2 });
  const nightAnchor = { x: -nb.minX / nb.width, y: -nb.minY / nb.height };
  n.destroy();
  return { body, night, anchor, nightAnchor };
}

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { HALF_W };
