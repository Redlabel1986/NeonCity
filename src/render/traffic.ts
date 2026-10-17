/**
 * Street life: pedestrians and vehicles moving along road tiles. Purely
 * visual, but density follows the simulation (time of day, district
 * traffic, how many citizens are commuting).
 */

import { Container, Graphics, Sprite, Texture, type Renderer } from 'pixi.js';
import { HALF_H, HALF_W, isoToScreen } from './iso';
import { TileKind } from '../sim/world/grid';
import type { GameState } from '../sim/state';

interface Mover {
  sprite: Sprite;
  light: Sprite | null;
  kind: 'walker' | 'car';
  x: number; // tile space (continuous)
  y: number;
  tx: number; // target tile
  ty: number;
  speed: number;
  color: number;
}

const WALKER_COLORS = [0xd8d4e8, 0x8a849e, 0xff2bd6, 0x19e6ff, 0xffb020, 0x8cff3a, 0xc08aff];
const CAR_COLORS = [0x6a7088, 0x8a8fa8, 0x9a4a6a, 0x3a7a9a, 0xb09a4a, 0x4a9a7a, 0xd8d4e8, 0xff2bd6];

export class TrafficLayer {
  private container: Container = new Container();
  private lights: Container = new Container();
  private movers: Mover[] = [];
  private walkerTex: Texture | null = null;
  private carTex: Texture | null = null;
  private lightTex: Texture | null = null;
  private roads: { x: number; y: number }[] = [];
  private grid: GameState['grid'] | null = null;
  private time = 0;
  private enabled = true;

  init(renderer: Renderer, objects: Container, lights: Container): void {
    this.container = objects;
    this.lights = lights;
    const w = new Graphics();
    w.ellipse(0, 0, 2.2, 1.2).fill({ color: 0x000000, alpha: 0.45 });
    w.rect(-1.9, -7, 3.8, 7.5).fill({ color: 0x000000, alpha: 0.6 });
    w.rect(-1.3, -6.5, 2.6, 6.5).fill(0xffffff);
    w.circle(0, -8, 1.9).fill({ color: 0x000000, alpha: 0.6 });
    w.circle(0, -8, 1.4).fill(0xffffff);
    this.walkerTex = renderer.generateTexture({ target: w, resolution: 3 });
    const c = new Graphics();
    c.poly([-9, 0, 0, 4.5, 9, 0, 0, -4.5]).fill(0xffffff);
    c.poly([-9, 0, 0, 4.5, 0, 9, -9, 4.5]).fill({ color: 0x000000, alpha: 0.35 });
    c.poly([0, 4.5, 9, 0, 9, 4.5, 0, 9]).fill({ color: 0x000000, alpha: 0.2 });
    c.poly([-5, -1, 0, 1.5, 5, -1, 0, -3.5]).fill({ color: 0x19e6ff, alpha: 0.5 });
    this.carTex = renderer.generateTexture({ target: c, resolution: 3 });
    const l = new Graphics();
    l.ellipse(0, 0, 14, 6).fill({ color: 0xffe8b0, alpha: 0.25 });
    l.ellipse(0, 0, 6, 3).fill({ color: 0xffe8b0, alpha: 0.5 });
    this.lightTex = renderer.generateTexture({ target: l, resolution: 2 });
    w.destroy();
    c.destroy();
    l.destroy();
  }

  get count(): number {
    return this.movers.length;
  }

  /** Debug sample of the first movers. */
  debugSample(): unknown[] {
    return this.movers.slice(0, 3).map((m) => ({
      kind: m.kind,
      x: m.x,
      y: m.y,
      px: m.sprite.position.x,
      py: m.sprite.position.y,
      visible: m.sprite.visible,
      alpha: m.sprite.alpha,
      w: m.sprite.width,
      h: m.sprite.height,
      tex: [m.sprite.texture.width, m.sprite.texture.height],
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
    if (!this.enabled || !this.grid || !this.walkerTex || !this.carTex || !this.lightTex) return;
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
        const next = this.nextRoad(Math.round(m.x), Math.round(m.y), rand);
        if (next) {
          m.tx = next.x;
          m.ty = next.y;
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
      const offset = m.kind === 'walker' ? 0.28 : 0;
      const { sx, sy } = isoToScreen(m.x + 0.5 + (m.kind === 'walker' ? offset : 0), m.y + 0.5 + (m.kind === 'walker' ? -offset : 0));
      m.sprite.position.set(sx, sy + HALF_H * 0.1);
      m.sprite.zIndex = (m.x + m.y) * 4 + 2;
      if (m.light) {
        m.light.position.set(sx, sy + HALF_H * 0.1);
        m.light.alpha = night;
      }
      remaining.push(m);
    }
    this.movers = remaining;
  }

  private spawn(kind: Mover['kind'], at: { x: number; y: number }, rand: () => number): void {
    const next = this.nextRoad(at.x, at.y, rand) ?? at;
    const sprite = new Sprite(kind === 'walker' ? this.walkerTex! : this.carTex!);
    sprite.anchor.set(0.5, kind === 'walker' ? 1 : 0.5);
    sprite.tint = kind === 'walker' ? WALKER_COLORS[Math.floor(rand() * WALKER_COLORS.length)]! : CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]!;
    sprite.scale.set(kind === 'walker' ? 1 : 1.1);
    this.container.addChild(sprite);
    let light: Sprite | null = null;
    if (kind === 'car') {
      light = new Sprite(this.lightTex!);
      light.anchor.set(0.5);
      light.blendMode = 'add';
      this.lights.addChild(light);
    }
    this.movers.push({
      sprite,
      light,
      kind,
      x: at.x,
      y: at.y,
      tx: next.x,
      ty: next.y,
      speed: kind === 'walker' ? 0.35 + rand() * 0.25 : 1.6 + rand() * 1.2,
      color: 0,
    });
  }

  private nextRoad(x: number, y: number, rand: () => number): { x: number; y: number } | null {
    const grid = this.grid!;
    const options: { x: number; y: number }[] = [];
    if (grid.isRoad(x + 1, y)) options.push({ x: x + 1, y });
    if (grid.isRoad(x - 1, y)) options.push({ x: x - 1, y });
    if (grid.isRoad(x, y + 1)) options.push({ x, y: y + 1 });
    if (grid.isRoad(x, y - 1)) options.push({ x, y: y - 1 });
    if (options.length === 0) return null;
    return options[Math.floor(rand() * options.length)]!;
  }
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
