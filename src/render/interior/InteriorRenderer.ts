/**
 * Interior view: draws an InteriorScene (see layouts.ts) as an isometric
 * room with walls, furniture, staff and guests. It is a screen-space layer
 * inside the city's Pixi application (a second Application would share
 * Pixi's global pools and break the first one when destroyed); the
 * CityRenderer forwards pointer input and frame updates while it is active.
 *
 * Reads scenes, never touches the simulation. Zones are clickable and
 * report the dashboard tab they stand for.
 */

import { Container, Graphics, Text } from 'pixi.js';
import type { DashboardTab, Figure, FigureRole, InteriorScene, Prop, Zone } from './layouts';
import { FIGURE_LABELS } from './layouts';
import { FLAT_PROPS, HH, HW, TH, WALL_H, WALL_X_PROPS, box, drawCityProp, glow, hashStr, iso, mix, shade, shadow } from './interiorDraw';

export interface InteriorCallbacks {
  onTab: (tab: DashboardTab) => void;
  /** Click on a zone without a dashboard tab (city buildings). */
  onZone?: (zone: Zone) => void;
}

interface LiveFigure {
  node: Container;
  fig: Figure;
  phase: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait: number;
}

interface LiveZone {
  zone: Zone;
  gfx: Graphics;
}

interface LiveProp {
  prop: Prop;
  node: Container;
  lamp: Graphics | null;
}

const ROLE_COLORS: Record<FigureRole, number> = {
  cook: 0xf2f2f2,
  service: 0x19e6ff,
  manager: 0x3a3a58,
  reception: 0x19e6ff,
  housekeeping: 0x8cff3a,
  driver: 0xffb020,
  clerk: 0x8cff3a,
  security: 0xff3a5a,
  guard: 0xff3a5a,
  investigator: 0xc08aff,
  researcher: 0xd9f6ff,
  worker: 0xff8a1f,
  technician: 0xffb020,
  banker: 0xffd27a,
  analyst: 0x19e6ff,
  sommelier: 0xc08aff,
  concierge: 0xffffff,
  dispatcher: 0xffb020,
  guest: 0xd8a0c8,
  vip: 0xffd700,
  customer: 0xa0c8d8,
  resident: 0xc8b8a0,
};

const GUEST_COLORS = [0xd8a0c8, 0xa0c8d8, 0xc8d8a0, 0xffb0a0, 0xb0a0ff, 0xa0ffd8];

export class InteriorRenderer {
  /** Screen-space layer; added to the city stage above world and weather. */
  readonly container = new Container();
  private readonly root = new Container();
  private readonly backdrop = new Graphics();
  private readonly floorGfx = new Graphics();
  private readonly wallGfx = new Graphics();
  private readonly zoneLayer = new Container();
  private readonly objects = new Container();
  private readonly lights = new Container();
  private readonly labelLayer = new Container();
  private readonly tooltip = new Container();
  private readonly tooltipBg = new Graphics();
  private readonly tooltipText = new Text({ text: '', style: { fontFamily: 'Segoe UI, system-ui, sans-serif', fontSize: 12, fill: 0xffffff } });
  private scene: InteriorScene | null = null;
  private signature = '';
  private figures: LiveFigure[] = [];
  private zones: LiveZone[] = [];
  private props: LiveProp[] = [];
  private hoverZone: LiveZone | null = null;
  private pointer: { x: number; y: number } | null = null;
  private daylight = 1;
  private time = 0;
  private fade = 0;
  private reducedMotion = false;
  private readonly callbacks: InteriorCallbacks;
  private canvas: HTMLCanvasElement | null = null;
  /** Screen rectangle (canvas pixels) the room is centred in. */
  private viewport = { x: 0, y: 0, w: 1, h: 1 };
  private rng = 1;

  constructor(callbacks: InteriorCallbacks) {
    this.callbacks = callbacks;
    this.objects.sortableChildren = true;
    this.tooltip.addChild(this.tooltipBg, this.tooltipText);
    this.tooltip.visible = false;
    this.root.addChild(this.wallGfx, this.floorGfx, this.zoneLayer, this.objects, this.lights, this.labelLayer);
    this.container.addChild(this.backdrop, this.root, this.tooltip);
    this.container.visible = false;
    this.container.eventMode = 'none';
  }

  /** Binds the layer to the hosting canvas (for cursor changes). */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
  }

  get active(): boolean {
    return this.scene !== null;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  setDaylight(d: number): void {
    this.daylight = d;
  }

  /** Area of the canvas (in canvas pixels) that the interior may use. */
  setViewport(x: number, y: number, w: number, h: number): void {
    this.viewport = { x, y, w: Math.max(1, w), h: Math.max(1, h) };
    this.layout();
  }

  get currentSignature(): string {
    return this.signature;
  }

  /** Shows a scene; rebuilds only when something other than figure motion changed. */
  show(scene: InteriorScene): void {
    const sig = JSON.stringify(scene);
    if (sig === this.signature) return;
    const first = this.scene === null;
    this.signature = sig;
    this.scene = scene;
    this.container.visible = true;
    if (first) {
      this.fade = this.reducedMotion ? 1 : -0.35; // negative = delay before fading in
      this.container.alpha = this.reducedMotion ? 1 : 0;
    }
    this.rebuild(scene);
  }

  /** Hides the layer and frees the scene objects. */
  hide(): void {
    if (!this.scene) return;
    this.scene = null;
    this.signature = '';
    this.container.visible = false;
    this.tooltip.visible = false;
    this.hoverZone = null;
    this.pointer = null;
    if (this.canvas) this.canvas.style.cursor = 'default';
    this.objects.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.lights.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.zoneLayer.removeChildren().forEach((c) => c.destroy());
    this.labelLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.figures = [];
    this.zones = [];
    this.props = [];
  }

  destroy(): void {
    this.hide();
    this.container.destroy({ children: true });
  }

  // ---------------------------------------------------------------- build

  private rebuild(scene: InteriorScene): void {
    this.objects.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.lights.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.zoneLayer.removeChildren().forEach((c) => c.destroy());
    this.labelLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.figures = [];
    this.zones = [];
    this.props = [];
    this.hoverZone = null;
    this.rng = 1;
    this.drawFloor(scene);
    this.drawWalls(scene);
    this.drawLights(scene);
    for (const z of scene.zones) this.addZone(z);
    for (const p of scene.props) this.addProp(p, scene);
    for (const f of scene.figures) this.addFigure(f);
    this.layout();
  }

  private drawFloor(scene: InteriorScene): void {
    const g = this.floorGfx;
    g.clear();
    for (let y = 0; y < scene.height; y++) {
      for (let x = 0; x < scene.width; x++) {
        const [sx, sy] = iso(x, y);
        const tone = (x + y) % 2 === 0 ? 1 : 0.94;
        g.poly([sx, sy, sx + HW, sy + HH, sx, sy + TH, sx - HW, sy + HH]).fill(shade(scene.floorColor, tone));
        if (scene.floorPattern) this.floorDetail(g, scene, x, y, sx, sy);
      }
    }
    if (scene.hazard) {
      // Yellow-black safety markings along the two open edges
      for (let t = 0; t < scene.width; t += 0.5) {
        const a = iso(t, scene.height - 0.12);
        const b = iso(t + 0.5, scene.height - 0.12);
        g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 3, color: Math.round(t * 2) % 2 === 0 ? 0xffd040 : 0x1a1a1a });
      }
      for (let t = 0; t < scene.height; t += 0.5) {
        const a = iso(scene.width - 0.12, t);
        const b = iso(scene.width - 0.12, t + 0.5);
        g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 3, color: Math.round(t * 2) % 2 === 0 ? 0xffd040 : 0x1a1a1a });
      }
    }
    const [x0, y0] = iso(0, 0);
    const [x1, y1] = iso(scene.width, 0);
    const [x2, y2] = iso(scene.width, scene.height);
    const [x3, y3] = iso(0, scene.height);
    g.poly([x0, y0, x1, y1, x2, y2, x3, y3]).stroke({ width: 1, color: 0xffffff, alpha: 0.12 });
    // Dirt overlay when cleanliness is low
    const dirt = Math.max(0, 0.7 - scene.cleanliness);
    if (dirt > 0) {
      for (let i = 0; i < Math.round(dirt * 30); i++) {
        const px = this.rand() * scene.width;
        const py = this.rand() * scene.height;
        const [sx, sy] = iso(px, py);
        g.ellipse(sx, sy + HH, 6 + this.rand() * 8, 3 + this.rand() * 4).fill({ color: 0x1a140e, alpha: 0.35 });
      }
    }
    // Front edge glow (open side towards the street for visible facings)
    if (scene.facing === 0 || scene.facing === 1) {
      const a = scene.facing === 0 ? iso(scene.width, 0) : iso(0, scene.height);
      const b = iso(scene.width, scene.height);
      g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 3, color: scene.accent, alpha: 0.5 });
    }
  }

  /** Surface detail per floor material (planks, tiles, grating, grass ...). */
  private floorDetail(g: Graphics, scene: InteriorScene, x: number, y: number, sx: number, sy: number): void {
    const line = (x0: number, y0: number, x1: number, y1: number, color: number, width = 0.8): void => {
      const a = iso(x + x0, y + y0);
      const b = iso(x + x1, y + y1);
      g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width, color });
    };
    const dark = shade(scene.floorColor, 0.72);
    const light = shade(scene.floorColor, 1.25);
    switch (scene.floorPattern) {
      case 'planks': {
        for (const t of [0.33, 0.66]) line(0, t, 1, t, dark);
        const joint = (x * 7 + y * 3) % 3 === 0 ? 0.5 : 0.25;
        line(joint, 0, joint, 0.33, dark);
        break;
      }
      case 'tiles':
        g.poly([sx, sy, sx + HW, sy + HH, sx, sy + TH, sx - HW, sy + HH]).stroke({ width: 0.8, color: dark });
        line(0.5, 0, 0.5, 1, dark, 0.6);
        line(0, 0.5, 1, 0.5, dark, 0.6);
        break;
      case 'concrete':
        if (x % 3 === 0) line(0, 0, 0, 1, dark, 0.8);
        if (y % 3 === 0) line(0, 0, 1, 0, dark, 0.8);
        if ((x * 13 + y * 7) % 5 === 0) g.circle(sx + 4, sy + HH, 1.2).fill(dark);
        break;
      case 'terrazzo':
        for (let i = 0; i < 3; i++) g.circle(sx - 10 + ((x * 17 + y * 5 + i * 11) % 20), sy + 8 + ((x * 3 + y * 11 + i * 7) % 16), 1).fill(i % 2 ? light : dark);
        break;
      case 'metal':
        for (const t of [0.25, 0.5, 0.75]) {
          line(t, 0, t, 1, dark, 0.6);
          line(0, t, 1, t, dark, 0.6);
        }
        break;
      case 'grass':
      case 'straw':
        for (let i = 0; i < 3; i++) {
          const px = sx - 12 + ((x * 19 + y * 7 + i * 13) % 24);
          const py = sy + 8 + ((x * 5 + y * 17 + i * 5) % 16);
          g.moveTo(px, py).lineTo(px + 1.5, py - 4).stroke({ width: 1, color: scene.floorPattern === 'grass' ? light : shade(scene.floorColor, 1.35) });
        }
        break;
      case 'soil':
        line(0, 0.5, 1, 0.5, dark, 1.4);
        break;
      case 'carpet':
        if ((x + y) % 2 === 0) g.circle(sx, sy + HH, 2).fill(shade(scene.floorColor, 1.18));
        break;
      default:
        break;
    }
  }

  /** Ceiling light pools per region mood (warm, neutral, neon, cold work light). */
  private drawLights(scene: InteriorScene): void {
    if (!scene.lighting) return;
    const palette: Record<string, number[]> = {
      greenhaven: [0xffc070],
      silverbrook: [0xfff0d8],
      neon_central: [0xc08aff, 0x19e6ff],
      nova_eclipse: [0xbfe0ff, 0xff8a1f],
    };
    const colors = palette[scene.lighting] ?? [0xffffff];
    const g = new Graphics();
    let i = 0;
    for (let y = 1.5; y < scene.height; y += 3)
      for (let x = 1.5; x < scene.width; x += 3) {
        const [sx, sy] = iso(x, y);
        const c = colors[i++ % colors.length]!;
        g.ellipse(sx, sy + HH, 30, 15).fill({ color: c, alpha: 0.07 });
        g.ellipse(sx, sy + HH, 14, 7).fill({ color: c, alpha: 0.08 });
      }
    g.blendMode = 'add';
    this.lights.addChild(g);
  }

  private drawWalls(scene: InteriorScene): void {
    const g = this.wallGfx;
    g.clear();
    if (scene.openAir) {
      // Open ground: a kerb instead of walls
      const a = iso(0, scene.height);
      const b = iso(0, 0);
      const c = iso(scene.width, 0);
      g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).lineTo(c[0], c[1]).stroke({ width: 4, color: 0x8a8a90 });
      return;
    }
    const sky = mix(0x0b0a16, 0x7fa8d8, this.daylight);
    const W = scene.width;
    const H = scene.height;
    const p0 = iso(0, 0);
    const pL = iso(0, H);
    const pR = iso(W, 0);
    // back-left wall (x = 0)
    g.poly([p0[0], p0[1], pL[0], pL[1], pL[0], pL[1] - WALL_H, p0[0], p0[1] - WALL_H]).fill(shade(scene.wallColor, 0.85));
    // back-right wall (y = 0)
    g.poly([p0[0], p0[1], pR[0], pR[1], pR[0], pR[1] - WALL_H, p0[0], p0[1] - WALL_H]).fill(scene.wallColor);
    // skirting and wall edge
    g.moveTo(pL[0], pL[1]).lineTo(p0[0], p0[1]).lineTo(pR[0], pR[1]).stroke({ width: 2, color: 0x000000, alpha: 0.3 });
    g.moveTo(p0[0], p0[1]).lineTo(p0[0], p0[1] - WALL_H).stroke({ width: 1, color: 0xffffff, alpha: 0.15 });
    // windows every two tiles
    const win = (base: [number, number], dir: [number, number], t: number): void => {
      const a: [number, number] = [base[0] + dir[0] * t, base[1] + dir[1] * t];
      const b: [number, number] = [base[0] + dir[0] * (t + 1.1), base[1] + dir[1] * (t + 1.1)];
      const y0 = 26;
      const y1 = 56;
      g.poly([a[0], a[1] - y0, b[0], b[1] - y0, b[0], b[1] - y1, a[0], a[1] - y1]).fill(sky);
      g.poly([a[0], a[1] - y0, b[0], b[1] - y0, b[0], b[1] - y1, a[0], a[1] - y1]).stroke({ width: 1, color: 0xffffff, alpha: 0.25 });
      if (this.daylight < 0.5) {
        g.poly([a[0], a[1] - y0, b[0], b[1] - y0, b[0], b[1] - y1, a[0], a[1] - y1]).fill({ color: scene.accent, alpha: 0.25 * (1 - this.daylight) });
      }
    };
    const style = scene.wallStyle;
    const walls: [[number, number], number][] = [
      [[-HW, HH], H],
      [[HW, HH], W],
    ];
    if (style === 'brick' || style === 'wood') {
      for (const [dir, len] of walls) {
        const end: [number, number] = [p0[0] + dir[0] * len, p0[1] + dir[1] * len];
        for (let z = 7; z < WALL_H; z += style === 'brick' ? 7 : 10) g.moveTo(p0[0], p0[1] - z).lineTo(end[0], end[1] - z).stroke({ width: 0.8, color: shade(scene.wallColor, 0.7) });
      }
    } else if (style === 'metal') {
      for (const [dir, len] of walls)
        for (let t = 0.5; t < len; t += 0.5) {
          const x = p0[0] + dir[0] * t;
          const y = p0[1] + dir[1] * t;
          g.moveTo(x, y).lineTo(x, y - WALL_H).stroke({ width: 1, color: shade(scene.wallColor, 0.72) });
        }
    }
    if (style === 'brick') {
      for (const [dir, len] of walls)
        for (let t = 0.25; t < len; t += 0.5)
          for (let z = 7, row = 0; z < WALL_H; z += 7, row++) {
            const tt = t + (row % 2) * 0.25;
            const x = p0[0] + dir[0] * tt;
            const y = p0[1] + dir[1] * tt;
            g.moveTo(x, y - z).lineTo(x, y - z - 7).stroke({ width: 0.6, color: shade(scene.wallColor, 0.7) });
          }
    }
    if (style === 'glass') {
      // Floor-to-ceiling glazing: solid panes with mullions
      const pane = (dir: [number, number], t0: number, t1: number): void => {
        const a: [number, number] = [p0[0] + dir[0] * t0, p0[1] + dir[1] * t0];
        const b: [number, number] = [p0[0] + dir[0] * t1, p0[1] + dir[1] * t1];
        g.poly([a[0], a[1] - 10, b[0], b[1] - 10, b[0], b[1] - WALL_H + 6, a[0], a[1] - WALL_H + 6]).fill(mix(sky, scene.wallColor, 0.35));
        g.moveTo(b[0], b[1] - 10).lineTo(b[0], b[1] - WALL_H + 6).stroke({ width: 2, color: 0x1a1a24 });
      };
      for (const [dir, len] of walls) for (let t = 0.3; t + 1 < len; t += 1.2) pane(dir, t, t + 1.1);
    } else {
      for (let t = 0.6; t + 1.1 < H; t += 2.2) win(p0, [-HW, HH], t);
      for (let t = 0.6; t + 1.1 < W; t += 2.2) win(p0, [HW, HH], t);
    }
    // door in a back wall for facings that point away from the camera
    if (scene.facing === 2 || scene.facing === 3) {
      const base = p0;
      const dir: [number, number] = scene.facing === 2 ? [-HW, HH] : [HW, HH];
      const t = (scene.facing === 2 ? H : W) / 2 - 0.4;
      const a: [number, number] = [base[0] + dir[0] * t, base[1] + dir[1] * t];
      const b: [number, number] = [base[0] + dir[0] * (t + 0.8), base[1] + dir[1] * (t + 0.8)];
      g.poly([a[0], a[1], b[0], b[1], b[0], b[1] - 40, a[0], a[1] - 40]).fill(0x15131c);
      g.poly([a[0], a[1], b[0], b[1], b[0], b[1] - 40, a[0], a[1] - 40]).stroke({ width: 1.5, color: scene.accent, alpha: 0.8 });
    }
  }

  private addZone(zone: Zone): void {
    const gfx = new Graphics();
    this.paintZone(gfx, zone, false);
    this.zoneLayer.addChild(gfx);
    const live = { zone, gfx };
    this.zones.push(live);
    const [cx, cy] = iso(zone.x + zone.w / 2, zone.y + zone.h / 2);
    const label = new Container();
    const title = new Text({ text: zone.label, style: { fontFamily: 'Segoe UI, system-ui, sans-serif', fontSize: 11, fontWeight: '600', fill: 0xffffff, letterSpacing: 1 } });
    const status = new Text({ text: zone.status, style: { fontFamily: 'Segoe UI, system-ui, sans-serif', fontSize: 9, fill: 0xd8d4e8 } });
    status.position.set(0, 13);
    const w = Math.max(title.width, status.width) + 10;
    const bg = new Graphics();
    bg.roundRect(-5, -3, w, 27, 3).fill({ color: 0x0b0a12, alpha: 0.72 });
    bg.rect(-5, -3, 2, 27).fill(zone.color);
    label.addChild(bg, title, status);
    label.position.set(cx - w / 2 + 5, cy - zone.h * HH - 34);
    this.labelLayer.addChild(label);
  }

  private paintZone(gfx: Graphics, zone: Zone, hover: boolean): void {
    gfx.clear();
    if (zone.interactive === false) hover = false;
    const a = iso(zone.x, zone.y);
    const b = iso(zone.x + zone.w, zone.y);
    const c = iso(zone.x + zone.w, zone.y + zone.h);
    const d = iso(zone.x, zone.y + zone.h);
    gfx
      .poly([a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]])
      .fill({ color: zone.color, alpha: hover ? 0.2 : 0.07 })
      .stroke({ width: hover ? 2 : 1, color: zone.color, alpha: hover ? 0.95 : 0.35 });
  }

  private addProp(prop: Prop, scene: InteriorScene): void {
    const node = new Container();
    const g = new Graphics();
    node.addChild(g);
    const [sx, sy] = iso(prop.x, prop.y);
    node.position.set(sx, sy);
    node.zIndex = (prop.x + prop.y) * 10 + 1;
    let lamp: Graphics | null = null;
    const color = prop.color ?? 0x6a6a7a;
    const fill = prop.fill ?? 0;
    if (FLAT_PROPS.has(prop.kind) && prop.kind !== 'mat') node.zIndex = -5;
    if (WALL_X_PROPS.has(prop.kind)) {
      const [wx, wy] = iso(prop.x, 0);
      node.position.set(wx, wy);
      node.zIndex = -1;
    }
    if (prop.kind === 'vaultdoor') {
      const [wx, wy] = iso(0, prop.y);
      node.position.set(wx, wy);
      node.zIndex = -1;
    }
    const city = drawCityProp(g, prop, scene.accent);
    if (city !== undefined) {
      lamp = city;
    } else switch (prop.kind) {
      case 'table':
        shadow(g, 16, 8);
        g.moveTo(-10, 2).lineTo(-10, -10).moveTo(10, 2).lineTo(10, -10).stroke({ width: 1.5, color: 0x2a1c22 });
        g.ellipse(0, -12, 15, 7.5).fill(0x5a3a44);
        g.ellipse(0, -13, 15, 7.5).fill(0x6e4a56);
        g.ellipse(0, -13, 15, 7.5).stroke({ width: 1, color: 0xffffff, alpha: 0.2 });
        for (const [cx, cy] of [
          [-20, 0],
          [20, 0],
          [0, -10],
          [0, 10],
        ] as const) {
          g.rect(cx - 4, cy - 6, 8, 5).fill(0x3a2a34);
        }
        break;
      case 'barstool':
        shadow(g, 5, 2.5, 0.3);
        g.moveTo(0, 0).lineTo(0, -10).stroke({ width: 2, color: 0x8a8a96 });
        g.ellipse(0, -11, 5, 2.5).fill(0x7a4a56);
        break;
      case 'counter':
        box(g, 1, 0.6, 14, color);
        g.moveTo(-HW * 0.5, -14 + HH * 0.3).lineTo(HW * 0.5, -14 - HH * 0.3).stroke({ width: 1.5, color: scene.accent, alpha: 0.6 });
        break;
      case 'stove': {
        box(g, 0.8, 0.8, 12, 0x8a8a96);
        for (const [bx, by] of [
          [-6, -14],
          [6, -17],
        ] as const) {
          g.circle(bx, by, 3.5).fill(prop.active ? 0xff6a2a : 0x3a3a44);
          if (prop.active) {
            lamp = lamp ?? new Graphics();
            glow(lamp, bx, by, 5, 0xff8a1f, 0.5);
          }
        }
        break;
      }
      case 'sink':
        box(g, 0.6, 0.6, 11, 0x9a9aa8);
        g.ellipse(0, -12, 7, 3.5).fill(prop.active ? 0x19e6ff : 0x2a3a44);
        if (prop.active) {
          lamp = new Graphics();
          glow(lamp, 0, -12, 6, color, 0.4);
        }
        break;
      case 'shelf':
      case 'rack': {
        const h = prop.kind === 'rack' ? 36 : 30;
        box(g, 0.55, 0.9, h, 0x4a4a58);
        const boards = 3;
        for (let i = 0; i < boards; i++) {
          const z = 4 + (i * (h - 8)) / boards;
          const filled = fill > i / boards;
          const a = iso(-0.27, -0.45);
          const b = iso(-0.27, 0.45);
          g.moveTo(a[0], a[1] - z).lineTo(b[0], b[1] - z).stroke({ width: 1, color: 0x8a8a96, alpha: 0.6 });
          if (filled) {
            const m = iso(-0.3, -0.3 + i * 0.3);
            g.rect(m[0] - 4, m[1] - z - 6, 7, 6).fill(fill > 0.3 ? (color === 0x6a6a7a ? 0x8cff3a : color) : 0xffb020);
          }
        }
        break;
      }
      case 'coldcell':
        box(g, 0.6, 0.9, 34, 0x8aa0b0);
        g.moveTo(-6, -4).lineTo(-6, -28).stroke({ width: 1.5, color: 0x19e6ff, alpha: 0.9 });
        lamp = new Graphics();
        glow(lamp, -4, -16, 8, 0x19e6ff, 0.18);
        break;
      case 'neon': {
        const [wx, wy] = iso(prop.x, 0);
        node.position.set(wx, wy);
        node.zIndex = -1;
        g.moveTo(-10, -58 + 5).lineTo(30, -58 - 15).stroke({ width: 2.5, color, alpha: 0.95 });
        lamp = new Graphics();
        lamp.moveTo(-10, -58 + 5).lineTo(30, -58 - 15).stroke({ width: 8, color, alpha: 0.25 });
        break;
      }
      case 'hologram':
        shadow(g, 12, 6, 0.2);
        g.ellipse(0, 0, 12, 6).fill({ color, alpha: 0.35 });
        g.poly([-10, 0, 10, 0, 6, -44, -6, -44]).fill({ color, alpha: 0.14 });
        g.rect(-7, -40, 14, 30).fill({ color, alpha: 0.12 });
        if (prop.fill !== undefined) g.rect(-7, -40 + 30 * (1 - fill), 14, 30 * fill).fill({ color, alpha: 0.5 });
        lamp = new Graphics();
        glow(lamp, 0, -22, 10, color, 0.18);
        break;
      case 'plant':
        shadow(g, 7, 3.5, 0.3);
        g.poly([-6, 0, 6, 0, 4, -9, -4, -9]).fill(0x4a3a44);
        g.circle(0, -15, 7).fill(0x1f6a3a);
        g.circle(-4, -19, 5).fill(0x2a8a4a);
        g.circle(4, -18, 4).fill(0x3a9a5a);
        break;
      case 'desk':
        box(g, 1, 0.6, 14, color);
        break;
      case 'monitor':
        box(g, 0.3, 0.1, 10, 0x2a2a38, 10);
        g.rect(-7, -22, 14, 9).fill(prop.active ? color : 0x15151c);
        if (prop.active) {
          lamp = new Graphics();
          lamp.rect(-9, -24, 18, 13).fill({ color, alpha: 0.2 });
        }
        break;
      case 'roomdoor': {
        const [wx, wy] = iso(0, prop.y);
        node.position.set(wx - 2, wy);
        node.zIndex = (prop.x + prop.y) * 10;
        g.poly([-10, 2, 2, 8, 2, -28, -10, -34]).fill(prop.active ? 0x2a2a38 : 0x1c1c26);
        g.poly([-10, 2, 2, 8, 2, -28, -10, -34]).stroke({ width: 1, color: prop.active ? color : 0x5a5a6a, alpha: 0.9 });
        g.rect(-7, -24, 6, 2).fill(prop.active ? color : 0x3a3a48);
        if (prop.active) {
          lamp = new Graphics();
          lamp.poly([-10, 2, 2, 8, 2, -28, -10, -34]).fill({ color, alpha: 0.18 });
        }
        break;
      }
      case 'cart':
        box(g, 0.5, 0.4, 12, 0x5a5a6a);
        g.circle(-6, 2, 2).fill(0x111111);
        g.circle(6, 2, 2).fill(0x111111);
        if (prop.active) {
          lamp = new Graphics();
          glow(lamp, 0, -14, 4, color, 0.6);
        }
        break;
      case 'sofa':
        box(g, 1.2, 0.5, 9, 0x4a3458);
        box(g, 1.2, 0.15, 18, 0x5a4268, 0);
        break;
      case 'vehicle':
      case 'lift': {
        const lifted = prop.kind === 'lift';
        const z = lifted ? 14 : 0;
        if (lifted) {
          g.rect(-14, -4, 4, -z + 4).fill(0x8a8a96);
          g.rect(10, 2, 4, -z - 2).fill(0x8a8a96);
        }
        shadow(g, 18, 9, 0.35);
        const body = mix(0xff3a5a, 0xffb020, Math.min(1, fill));
        box(g, 0.5, 0.95, 8, body, z);
        box(g, 0.4, 0.5, 6, 0x182030, z + 8);
        if (lifted) {
          lamp = new Graphics();
          glow(lamp, 0, -z - 22, 3, 0xff3a5a, 0.8);
        }
        break;
      }
      case 'charger':
        box(g, 0.25, 0.25, 22, 0x4a4a58);
        g.circle(0, -24, 2.5).fill(prop.active ? 0x8cff3a : 0x3a3a44);
        lamp = new Graphics();
        glow(lamp, 0, -24, 4, 0x8cff3a, 0.5);
        break;
      case 'machine':
        box(g, 1.1, 0.8, 24, 0x5a5a68);
        g.rect(-12, -30, 4, 8).fill(0x8a8a96);
        g.circle(8, -28, 2.5).fill(prop.active ? color : 0x3a3a44);
        g.moveTo(-18, -8).lineTo(18, -26).stroke({ width: 3, color: 0x2a2a34 });
        if (prop.active) {
          lamp = new Graphics();
          glow(lamp, 8, -28, 4, color, 0.6);
        }
        break;
      case 'pallet': {
        box(g, 0.8, 0.8, 3, 0x7a5a3a);
        const crates = Math.max(1, Math.round(fill * 4));
        for (let i = 0; i < crates; i++) box(g, 0.5, 0.5, 9, color, 3 + i * 9);
        break;
      }
      case 'bench':
        box(g, 1.2, 0.6, 14, 0x6a7a8a);
        for (const [fx, fy] of [
          [-10, -18],
          [0, -21],
          [10, -24],
        ] as const) {
          g.poly([fx - 3, fy, fx + 3, fy, fx + 2, fy - 8, fx - 2, fy - 8]).fill(prop.active ? color : 0x4a5a6a);
        }
        if (prop.active) {
          lamp = new Graphics();
          glow(lamp, 0, -22, 8, color, 0.18);
        }
        break;
      case 'board': {
        const [wx, wy] = iso(0, prop.y);
        node.position.set(wx - 2, wy);
        g.poly([-14, 0, 14, 14, 14, -26, -14, -40]).fill(0x2a2a38);
        g.poly([-14, 0, 14, 14, 14, -26, -14, -40]).stroke({ width: 1, color, alpha: 0.8 });
        for (let i = 0; i < 4; i++) g.rect(-10 + i * 6, -30 + i * 3, 4, 3).fill(prop.active ? 0xffe08a : 0x6a6a7a);
        g.rect(-11, -8, 22 * fill, 2.5).fill(color);
        break;
      }
      case 'locker':
        box(g, 0.3, 0.3, 30, 0x6a7080);
        g.rect(-3, -26, 1.5, 6).fill(0x2a2a34);
        break;
      case 'filter':
        g.rect(-8, -26, 16, 26).fill(0x5a6a5a);
        g.ellipse(0, -26, 8, 4).fill(0x7a8a7a);
        g.ellipse(0, 0, 8, 4).fill(0x4a5a4a);
        g.circle(0, -14, 2.5).fill(prop.active ? color : 0x3a3a44);
        lamp = new Graphics();
        glow(lamp, 0, -14, 4, color, 0.5);
        break;
      case 'mat':
        g.poly([0, -HH * 0.6, HW * 0.6, 0, 0, HH * 0.6, -HW * 0.6, 0]).fill({ color: scene.accent, alpha: 0.2 }).stroke({ width: 1, color: scene.accent, alpha: 0.8 });
        break;
      default:
        box(g, 0.6, 0.6, 10, color);
    }
    if (lamp) {
      lamp.position.copyFrom(node.position);
      lamp.blendMode = 'add';
      this.lights.addChild(lamp);
    }
    this.objects.addChild(node);
    this.props.push({ prop, node, lamp });
  }

  private addFigure(fig: Figure): void {
    const node = new Container();
    const g = new Graphics();
    node.addChild(g);
    const color = fig.role === 'guest' || fig.role === 'customer' ? GUEST_COLORS[Math.floor(hashStr(fig.name) * GUEST_COLORS.length)]! : ROLE_COLORS[fig.role];
    const skin = [0xf1c9a5, 0xd9a47c, 0xa8744f, 0x6b4a33][Math.floor(hashStr(fig.name + 's') * 4)]!;
    shadow(g, 5, 2.5, 0.35);
    if (fig.lying) {
      g.roundRect(-7, -12, 13, 5, 2).fill(color);
      g.circle(-9, -11, 3).fill(skin);
      g.rect(-2, -13, 9, 3).fill(0xe8e8f0);
    } else if (fig.seated) {
      g.rect(-3.5, -12, 7, 8).fill(color);
      g.circle(0, -15, 3.2).fill(skin);
    } else {
      g.rect(-2.8, -7, 2.2, 7).fill(0x2a2a36);
      g.rect(0.6, -7, 2.2, 7).fill(0x2a2a36);
      g.rect(-3.8, -16, 7.6, 9.5).fill(color);
      g.circle(0, -19.5, 3.4).fill(skin);
      if (fig.role === 'cook') g.rect(-3, -25, 6, 3).fill(0xffffff);
      if (fig.role === 'guard' || fig.role === 'security') g.rect(-3.5, -23, 7, 2).fill(0x111111);
      if (fig.role === 'vip') g.poly([-3, -23, 3, -23, 2, -27, -2, -27]).fill(0xffd700);
      if (fig.role === 'researcher' || fig.role === 'technician') g.rect(-3.8, -16, 7.6, 9.5).stroke({ width: 0.8, color: 0xffffff, alpha: 0.5 });
      if (fig.morale !== undefined && fig.morale < 35) g.circle(4, -24, 1.5).fill(0xff3a5a);
    }
    const [sx, sy] = iso(fig.x, fig.y);
    node.position.set(sx, sy);
    node.zIndex = (fig.x + fig.y) * 10 + 2;
    this.objects.addChild(node);
    this.figures.push({ node, fig, phase: hashStr(fig.name) * 6.28, x: fig.x, y: fig.y, tx: fig.x, ty: fig.y, wait: hashStr(fig.name + 'w') * 3 });
  }

  // ---------------------------------------------------------------- frame

  private layout(): void {
    if (!this.scene) return;
    const W = this.scene.width;
    const H = this.scene.height;
    const roomW = (W + H) * HW;
    const roomH = (W + H) * HH + WALL_H;
    const { x, y, w, h } = this.viewport;
    const scale = Math.max(0.45, Math.min(1.5, (w - 60) / roomW, (h - 110) / roomH));
    this.root.scale.set(scale);
    const centreX = ((W - H) * HW) / 2;
    const centreY = ((W + H) * HH) / 2 - WALL_H / 2;
    this.root.position.set(x + w / 2 - centreX * scale, y + h / 2 - centreY * scale + 10 * scale);
    this.backdrop.clear();
    this.backdrop.rect(x, y, w, h).fill({ color: 0x07060b, alpha: 0.78 });
    this.backdrop.roundRect(x + 12, y + 12, w - 24, h - 24, 6).stroke({ width: 1, color: this.scene.accent, alpha: 0.35 });
  }

  /** Advances animations; called by the CityRenderer every frame. */
  frame(dt: number): void {
    if (!this.scene) return;
    this.time += dt;
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / 0.45);
      this.container.alpha = Math.max(0, this.fade);
    }
    this.lights.alpha = 0.55 + 0.45 * (1 - this.daylight);
    const motion = !this.reducedMotion;
    for (const f of this.figures) {
      if (motion && !f.fig.seated && !f.fig.lying && f.fig.wander > 0) {
        const dx = f.tx - f.x;
        const dy = f.ty - f.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.02) {
          f.wait -= dt;
          if (f.wait <= 0) {
            const a = this.rand() * Math.PI * 2;
            const r = this.rand() * f.fig.wander;
            f.tx = Math.min(this.scene.width - 0.3, Math.max(0.3, f.fig.x + Math.cos(a) * r));
            f.ty = Math.min(this.scene.height - 0.3, Math.max(0.3, f.fig.y + Math.sin(a) * r));
            f.wait = 1.5 + this.rand() * 4;
          }
        } else {
          const step = Math.min(dist, 0.55 * dt);
          f.x += (dx / dist) * step;
          f.y += (dy / dist) * step;
        }
      }
      const [sx, sy] = iso(f.x, f.y);
      const bob = motion && !f.fig.seated && !f.fig.lying ? Math.sin(this.time * 4 + f.phase) * 0.8 : 0;
      f.node.position.set(sx, sy + bob);
      f.node.zIndex = (f.x + f.y) * 10 + 2;
    }
    if (motion) {
      for (const p of this.props) {
        if (!p.lamp) continue;
        if (p.prop.kind === 'machine' && p.prop.active) p.lamp.alpha = 0.5 + 0.5 * Math.round((Math.sin(this.time * 6 + p.prop.x) + 1) / 2);
        else if (p.prop.kind === 'hologram') p.lamp.alpha = 0.7 + 0.3 * Math.sin(this.time * 2 + p.prop.y);
        else if (p.prop.kind === 'neon') p.lamp.alpha = 0.85 + 0.15 * Math.sin(this.time * 9 + p.prop.x * 3);
      }
    }
    this.updateHover();
  }

  private rand(): number {
    this.rng = (this.rng * 1664525 + 1013904223) >>> 0;
    return this.rng / 4294967296;
  }

  // ---------------------------------------------------------------- input

  private toRoom(px: number, py: number): { x: number; y: number } {
    const s = this.root.scale.x;
    const wx = (px - this.root.position.x) / s;
    const wy = (py - this.root.position.y) / s;
    return { x: (wx / HW + wy / HH) / 2, y: (wy / HH - wx / HW) / 2 };
  }

  /** Canvas point of a room position (for tests and overlays). */
  screenPointOf(x: number, y: number): { x: number; y: number } {
    const [sx, sy] = iso(x, y);
    const s = this.root.scale.x;
    return { x: this.root.position.x + sx * s, y: this.root.position.y + sy * s };
  }

  /** True when the canvas point lies inside the interior viewport. */
  contains(px: number, py: number): boolean {
    const { x, y, w, h } = this.viewport;
    return this.active && px >= x && px <= x + w && py >= y && py <= y + h;
  }

  pointerMove(px: number, py: number): void {
    this.pointer = { x: px, y: py };
  }

  pointerLeave(): void {
    this.pointer = null;
    this.tooltip.visible = false;
    if (this.hoverZone) {
      this.paintZone(this.hoverZone.gfx, this.hoverZone.zone, false);
      this.hoverZone = null;
    }
  }

  /** Handles a click; returns true when a zone was hit. */
  click(px: number, py: number): boolean {
    const t = this.toRoom(px, py);
    const zone = this.zoneAt(t.x, t.y);
    if (!zone) return false;
    if (zone.zone.tab) this.callbacks.onTab(zone.zone.tab);
    else this.callbacks.onZone?.(zone.zone);
    return true;
  }

  private zoneAt(x: number, y: number): LiveZone | null {
    for (const z of this.zones) {
      const zz = z.zone;
      if (zz.interactive === false) continue;
      if (x >= zz.x && x <= zz.x + zz.w && y >= zz.y && y <= zz.y + zz.h) return z;
    }
    return null;
  }

  private updateHover(): void {
    if (!this.pointer || !this.scene) return;
    const t = this.toRoom(this.pointer.x, this.pointer.y);
    let text: string | null = null;
    for (const p of this.props) {
      if (!p.prop.label) continue;
      if (Math.hypot(p.prop.x - t.x, p.prop.y - t.y) < 0.55) {
        text = p.prop.label;
        break;
      }
    }
    if (!text) {
      for (const f of this.figures) {
        if (Math.hypot(f.x - t.x, f.y - t.y) < 0.45) {
          text = `${f.fig.name} · ${FIGURE_LABELS[f.fig.role]}${f.fig.morale !== undefined ? ` · Moral ${Math.round(f.fig.morale)}` : ''}${f.fig.note ? ` · ${f.fig.note}` : ''}`;
          break;
        }
      }
    }
    const zone = this.zoneAt(t.x, t.y);
    if (zone !== this.hoverZone) {
      if (this.hoverZone) this.paintZone(this.hoverZone.gfx, this.hoverZone.zone, false);
      if (zone) this.paintZone(zone.gfx, zone.zone, true);
      this.hoverZone = zone;
    }
    if (this.canvas) this.canvas.style.cursor = zone ? 'pointer' : 'default';
    if (!text && zone) text = `${zone.zone.label}: ${zone.zone.status} · ${zone.zone.tab ? 'Klick öffnet den Reiter' : 'Klick zeigt Details'}`;
    if (text) {
      this.tooltipText.text = text;
      this.tooltipBg.clear();
      this.tooltipBg.roundRect(-6, -4, this.tooltipText.width + 12, this.tooltipText.height + 8, 3).fill({ color: 0x0b0a12, alpha: 0.9 }).stroke({ width: 1, color: this.scene.accent, alpha: 0.6 });
      const x = Math.min(this.pointer.x + 14, this.viewport.x + this.viewport.w - this.tooltipText.width - 16);
      const y = Math.max(8, this.pointer.y - this.tooltipText.height - 18);
      this.tooltip.position.set(x, y);
      this.tooltip.visible = true;
    } else {
      this.tooltip.visible = false;
    }
  }
}
