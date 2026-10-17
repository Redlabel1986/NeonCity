/**
 * PixiJS city renderer. Reads simulation state, never mutates it.
 *
 * Layers (bottom to top): ground, buildings (depth sorted), lights
 * (additive, faded by daylight), overlay (hover / selection / ghost),
 * labels (district names at macro zoom).
 */

import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { ArtCache, roadLamp, SEED_VARIANTS, type ArtStyle, type BuildingArtKey, type GeneratedTexture } from './art';
import { TrafficLayer } from './traffic';
import { WeatherLayer } from './weather';
import { InteriorRenderer } from './interior/InteriorRenderer';
import type { DashboardTab } from './interior/layouts';
import { depthOf, HALF_H, HALF_W, isoToScreen, screenToTile, TILE_H, TILE_W } from './iso';
import type { Building, Facing, GameState } from '../sim/state';
import { TileKind } from '../sim/world/grid';
import { DISTRICT_ARCHETYPES } from '../sim/data/districts';
import { BUILDING_DEFINITIONS } from '../sim/data/buildings';

export interface RendererCallbacks {
  onTileClick: (x: number, y: number, button: number) => void;
  onTileHover: (tile: { x: number; y: number } | null) => void;
  onCameraChange?: () => void;
  /** A zone inside the interior view was clicked. */
  onInteriorTab?: (tab: DashboardTab) => void;
}

export interface RenderSettings {
  effects: boolean;
  reducedMotion: boolean;
  traffic: boolean;
}

export interface GhostPlacement {
  defId: string;
  x: number;
  y: number;
  facing: Facing;
  tiles: { x: number; y: number; ok: boolean }[];
  ok: boolean;
}

export interface Selection {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Cullable {
  sprite: Sprite;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface BuildingVisual {
  day: Sprite;
  night: Sprite | null;
  status: Building['status'];
  cull: Cullable[];
}

export const MIN_ZOOM = 0.28;
export const MAX_ZOOM = 2.6;

const NIGHT_TINT = { r: 0x6a, g: 0x62, b: 0xa2 };
/** Sky colour behind the city, blended between night and day. */
const SKY_NIGHT = { r: 0x07, g: 0x06, b: 0x0b };
const SKY_DAY = { r: 0x1c, g: 0x1e, b: 0x30 };

export class CityRenderer {
  readonly app = new Application();
  private host: HTMLElement | null = null;
  private readonly world = new Container();
  private readonly groundLayer = new Container();
  private readonly buildingLayer = new Container();
  private readonly lightLayer = new Container();
  private readonly overlayLayer = new Container();
  private readonly labelLayer = new Container();
  private readonly hoverGfx = new Graphics();
  private readonly selectionGfx = new Graphics();
  private readonly ghostContainer = new Container();
  private art: ArtCache | null = null;
  private readonly callbacks: RendererCallbacks;
  private settings: RenderSettings = { effects: true, reducedMotion: false, traffic: true };
  private readonly traffic = new TrafficLayer();
  private readonly weather = new WeatherLayer();
  /** Interior view layer (screen space, above world and weather). */
  readonly interior = new InteriorRenderer({ onTab: (tab) => this.callbacks.onInteriorTab?.(tab) });
  private weatherKind: 'clear' | 'rain' | 'fog' | 'storm' = 'clear';
  private weatherIntensity = 0;
  private trafficDensity = 0.5;
  private seed = 1;

  private buildings = new Map<number, BuildingVisual>();
  private groundCull: Cullable[] = [];
  private cullDirty = true;
  private citySize = 0;
  private time = 0;
  private daylight = 1;
  private destroyed = false;
  private labels: Text[] = [];
  private flight: { x0: number; y0: number; s0: number; x1: number; y1: number; s1: number; t: number; duration: number } | null = null;

  // input
  private pointerDown: { x: number; y: number; wx: number; wy: number; button: number; dragging: boolean } | null = null;
  private lastHover: { x: number; y: number } | null = null;
  private readonly keys = new Set<string>();

  constructor(callbacks: RendererCallbacks) {
    this.callbacks = callbacks;
  }

  get zoom(): number {
    return this.world.scale.x;
  }

  async init(host: HTMLElement, settings?: Partial<RenderSettings>): Promise<void> {
    this.host = host;
    Object.assign(this.settings, settings);
    await this.app.init({
      resizeTo: host,
      backgroundColor: 0x07060b,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      preference: 'webgl',
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    host.appendChild(this.app.canvas);
    this.app.canvas.style.display = 'block';
    this.app.canvas.style.touchAction = 'none';
    this.art = new ArtCache(this.app.renderer);
    this.traffic.init(this.app.renderer, this.buildingLayer, this.lightLayer);
    this.traffic.setEnabled(this.settings.traffic);

    this.buildingLayer.sortableChildren = true;
    this.overlayLayer.addChild(this.selectionGfx, this.ghostContainer, this.hoverGfx);
    this.world.addChild(this.groundLayer, this.buildingLayer, this.lightLayer, this.overlayLayer, this.labelLayer);
    this.app.stage.addChild(this.world);
    this.weather.init(this.app.renderer);
    this.weather.resize(this.app.screen.width, this.app.screen.height);
    this.weather.setEnabled(this.settings.effects, this.settings.reducedMotion);
    this.app.stage.addChild(this.weather.container);
    this.interior.attach(this.app.canvas);
    this.interior.setReducedMotion(this.settings.reducedMotion);
    this.app.stage.addChild(this.interior.container);

    this.bindInput();
    this.app.ticker.add((ticker) => this.frame(ticker.deltaMS / 1000));
    this.app.renderer.on('resize', () => {
      this.cullDirty = true;
      this.weather.resize(this.app.screen.width, this.app.screen.height);
    });
  }

  setSettings(settings: Partial<RenderSettings>): void {
    Object.assign(this.settings, settings);
    this.traffic.setEnabled(this.settings.traffic);
    this.weather.setEnabled(this.settings.effects, this.settings.reducedMotion);
    this.interior.setReducedMotion(this.settings.reducedMotion);
  }

  setWeather(kind: 'clear' | 'rain' | 'fog' | 'storm', intensity: number): void {
    this.weatherKind = kind;
    this.weatherIntensity = intensity;
    this.weather.setWeather(kind, intensity);
  }

  get currentWeather(): { kind: string; intensity: number } {
    return { kind: this.weatherKind, intensity: this.weatherIntensity };
  }

  /** Debug: number of street movers currently alive. */
  get trafficCount(): number {
    return this.traffic.count;
  }

  debugTraffic(): unknown {
    return { sample: this.traffic.debugSample(), world: { x: this.world.position.x, y: this.world.position.y, s: this.world.scale.x }, layerTint: this.buildingLayer.tint, children: this.buildingLayer.children.length };
  }

  /** 0..1 how busy the streets are right now (set by the game loop from the simulation). */
  setTrafficDensity(density: number): void {
    this.trafficDensity = Math.max(0, Math.min(1, density));
  }

  destroy(): void {
    this.destroyed = true;
    // init() may still be awaiting Pixi; it checks `destroyed` and tears down itself.
    if (!this.app.renderer) return;
    this.unbindInput();
    this.art?.destroy();
    this.interior.destroy();
    this.app.destroy(true, { children: true });
  }

  // ------------------------------------------------------------ world load

  loadWorld(state: GameState): void {
    if (!this.art) return;
    this.clearWorld();
    const { grid } = state;
    this.citySize = Math.max(grid.width, grid.height);
    this.seed = state.seed;
    this.traffic.load(state);
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const i = grid.index(x, y);
        const kind = grid.kind[i]!;
        if (kind === TileKind.Building) continue; // covered by building sprites
        const district = state.districts[grid.district[i]!]!;
        const style = DISTRICT_ARCHETYPES[district.archetype].style;
        const variant = grid.variant[i]!;
        const tex = this.art.ground(kind, variant, style);
        const sprite = this.placeSprite(this.groundLayer, tex, x, y);
        this.groundCull.push(this.cullEntry(sprite, x, y, tex));
        const nightTex = this.settings.effects || kind === TileKind.Road ? this.art.groundNight(kind, variant, x, y) : null;
        if (nightTex) {
          const ns = this.placeSprite(this.lightLayer, nightTex, x, y);
          ns.blendMode = 'add';
          this.groundCull.push(this.cullEntry(ns, x, y, nightTex));
        }
        if (kind === TileKind.Road && roadLamp(variant, x, y) === 'lamp') {
          const lampTex = this.art.lampPost();
          const lamp = this.placeSprite(this.buildingLayer, lampTex, x, y);
          lamp.zIndex = depthOf(x, y, 1, 1) - 1;
          this.groundCull.push(this.cullEntry(lamp, x, y, lampTex));
        }
      }
    }
    for (const id in state.buildings) this.addBuilding(state, state.buildings[id]!);
    this.buildLabels(state);
    this.cullDirty = true;
  }

  /** Reconciles building sprites with the simulation state. */
  syncBuildings(state: GameState): void {
    if (!this.art) return;
    for (const [id, visual] of this.buildings) {
      const b = state.buildings[id];
      if (!b) {
        this.removeBuildingVisual(id, visual);
        continue;
      }
      if (b.status !== visual.status) {
        this.removeBuildingVisual(id, visual);
        this.addBuilding(state, b);
      }
    }
    for (const id in state.buildings) {
      const b = state.buildings[id]!;
      if (!this.buildings.has(b.id)) this.addBuilding(state, b);
    }
    this.cullDirty = true;
  }

  /** Rebuilds the ground tiles of a footprint (after a building was removed). */
  refreshGround(state: GameState, x: number, y: number, w: number, h: number): void {
    if (!this.art) return;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        // remove existing ground sprites at that tile
        this.groundCull = this.groundCull.filter((c) => {
          const hit = c.sprite.label === `t:${tx},${ty}`;
          if (hit) c.sprite.destroy();
          return !hit;
        });
        const i = state.grid.index(tx, ty);
        const kind = state.grid.kind[i]!;
        if (kind === TileKind.Building) continue;
        const district = state.districts[state.grid.district[i]!]!;
        const style = DISTRICT_ARCHETYPES[district.archetype].style;
        const tex = this.art.ground(kind, state.grid.variant[i]!, style);
        const sprite = this.placeSprite(this.groundLayer, tex, tx, ty);
        this.groundCull.push(this.cullEntry(sprite, tx, ty, tex));
        const nightTex = this.art.groundNight(kind, state.grid.variant[i]!, tx, ty);
        if (nightTex) {
          const ns = this.placeSprite(this.lightLayer, nightTex, tx, ty);
          ns.blendMode = 'add';
          this.groundCull.push(this.cullEntry(ns, tx, ty, nightTex));
        }
      }
    }
    this.cullDirty = true;
  }

  private clearWorld(): void {
    this.traffic.clear();
    this.groundLayer.removeChildren().forEach((c) => c.destroy());
    this.lightLayer.removeChildren().forEach((c) => c.destroy());
    this.buildingLayer.removeChildren().forEach((c) => c.destroy());
    this.labelLayer.removeChildren().forEach((c) => c.destroy());
    this.buildings.clear();
    this.groundCull = [];
    this.labels = [];
  }

  private addBuilding(state: GameState, b: Building): void {
    if (!this.art) return;
    const key = artKeyFor(state, b);
    const dayTex = this.art.building(key, false);
    const day = this.placeSprite(this.buildingLayer, dayTex, b.x, b.y);
    day.zIndex = depthOf(b.x, b.y, b.w, b.h);
    const cull: Cullable[] = [this.cullEntry(day, b.x, b.y, dayTex)];
    let night: Sprite | null = null;
    const nightTex = this.art.building(key, true);
    night = this.placeSprite(this.lightLayer, nightTex, b.x, b.y);
    night.blendMode = 'add';
    cull.push(this.cullEntry(night, b.x, b.y, nightTex));
    this.buildings.set(b.id, { day, night, status: b.status, cull });
  }

  private removeBuildingVisual(id: number, visual: BuildingVisual): void {
    visual.day.destroy();
    visual.night?.destroy();
    this.buildings.delete(id);
  }

  private placeSprite(layer: Container, tex: GeneratedTexture, x: number, y: number): Sprite {
    const sprite = new Sprite(tex.texture);
    const { sx, sy } = isoToScreen(x, y);
    sprite.position.set(sx + tex.ox, sy + tex.oy);
    sprite.label = `t:${x},${y}`;
    layer.addChild(sprite);
    return sprite;
  }

  private cullEntry(sprite: Sprite, x: number, y: number, tex: GeneratedTexture): Cullable {
    const { sx, sy } = isoToScreen(x, y);
    return { sprite, x0: sx + tex.ox, y0: sy + tex.oy, x1: sx + tex.ox + tex.texture.width, y1: sy + tex.oy + tex.texture.height };
  }

  private buildLabels(state: GameState): void {
    for (const d of state.districts) {
      const arch = DISTRICT_ARCHETYPES[d.archetype];
      const text = new Text({
        text: d.name,
        style: {
          fontFamily: 'Segoe UI, system-ui, sans-serif',
          fontSize: 20,
          fontWeight: '600',
          fill: arch.color,
          letterSpacing: 2,
          dropShadow: { color: 0x000000, blur: 6, distance: 0, alpha: 0.9 },
        },
      });
      text.anchor.set(0.5);
      const { sx, sy } = isoToScreen(d.cx + 0.5, d.cy + 0.5);
      text.position.set(sx, sy);
      text.alpha = 0;
      this.labelLayer.addChild(text);
      this.labels.push(text);
    }
  }

  // ------------------------------------------------------------- lighting

  setDaylight(daylight: number): void {
    this.daylight = daylight;
  }

  private applyLighting(): void {
    const d = this.daylight;
    const r = Math.round(NIGHT_TINT.r + (255 - NIGHT_TINT.r) * d);
    const g = Math.round(NIGHT_TINT.g + (255 - NIGHT_TINT.g) * d);
    const b = Math.round(NIGHT_TINT.b + (255 - NIGHT_TINT.b) * d);
    const tint = (r << 16) | (g << 8) | b;
    this.groundLayer.tint = tint;
    this.buildingLayer.tint = tint;
    const sr = Math.round(SKY_NIGHT.r + (SKY_DAY.r - SKY_NIGHT.r) * d);
    const sg = Math.round(SKY_NIGHT.g + (SKY_DAY.g - SKY_NIGHT.g) * d);
    const sb = Math.round(SKY_NIGHT.b + (SKY_DAY.b - SKY_NIGHT.b) * d);
    this.app.renderer.background.color = (sr << 16) | (sg << 8) | sb;
    const flicker = this.settings.effects && !this.settings.reducedMotion ? 0.94 + 0.06 * Math.sin(this.time * 2.7) : 1;
    const wet = this.weatherKind === 'rain' || this.weatherKind === 'storm' ? 1 + 0.15 * this.weatherIntensity : 1; // neon reflects on wet streets
    this.lightLayer.alpha = Math.min(1, (1 - d) * flicker * wet);
    this.lightLayer.visible = this.lightLayer.alpha > 0.01;
  }

  // -------------------------------------------------------------- overlays

  setHover(tile: { x: number; y: number } | null): void {
    this.hoverGfx.clear();
    if (!tile) return;
    const { sx, sy } = isoToScreen(tile.x, tile.y);
    this.hoverGfx.poly([sx, sy, sx + HALF_W, sy + HALF_H, sx, sy + TILE_H, sx - HALF_W, sy + HALF_H]).stroke({ width: 1.5, color: 0x19e6ff, alpha: 0.8 });
  }

  setSelection(sel: Selection | null): void {
    this.selectionGfx.clear();
    if (!sel) return;
    const p0 = isoToScreen(sel.x, sel.y);
    const p1 = isoToScreen(sel.x + sel.w, sel.y);
    const p2 = isoToScreen(sel.x + sel.w, sel.y + sel.h);
    const p3 = isoToScreen(sel.x, sel.y + sel.h);
    this.selectionGfx
      .poly([p0.sx, p0.sy, p1.sx, p1.sy, p2.sx, p2.sy, p3.sx, p3.sy])
      .fill({ color: 0xff2bd6, alpha: 0.12 })
      .stroke({ width: 2, color: 0xff2bd6, alpha: 0.95 });
  }

  setGhost(ghost: GhostPlacement | null, state: GameState | null): void {
    this.ghostContainer.removeChildren().forEach((c) => c.destroy());
    if (!ghost || !this.art || !state) return;
    const g = new Graphics();
    for (const t of ghost.tiles) {
      const { sx, sy } = isoToScreen(t.x, t.y);
      g.poly([sx, sy, sx + HALF_W, sy + HALF_H, sx, sy + TILE_H, sx - HALF_W, sy + HALF_H])
        .fill({ color: t.ok && ghost.ok ? 0x8cff3a : 0xff3a5a, alpha: 0.35 })
        .stroke({ width: 1.5, color: t.ok && ghost.ok ? 0x8cff3a : 0xff3a5a, alpha: 0.9 });
    }
    this.ghostContainer.addChild(g);
    const def = BUILDING_DEFINITIONS[ghost.defId];
    if (def) {
      const key: BuildingArtKey = { art: def.art, style: 'player', w: def.footprint.w, h: def.footprint.h, floors: def.floors, seed: 0, facing: ghost.facing, construction: false };
      const tex = this.art.building(key, false);
      const sprite = this.placeSprite(this.ghostContainer, tex, ghost.x, ghost.y);
      sprite.alpha = ghost.ok ? 0.75 : 0.4;
      if (!ghost.ok) sprite.tint = 0xff8090;
    }
  }

  // ---------------------------------------------------------------- camera

  focusTile(x: number, y: number, zoom?: number): void {
    const { sx, sy } = isoToScreen(x + 0.5, y + 0.5);
    if (zoom !== undefined) this.world.scale.set(clamp(zoom, MIN_ZOOM, MAX_ZOOM));
    const s = this.world.scale.x;
    this.world.position.set(this.app.screen.width / 2 - sx * s, this.app.screen.height / 2 - sy * s);
    this.clampCamera();
    this.cullDirty = true;
    this.callbacks.onCameraChange?.();
  }

  /** Animates the camera so that tile (x, y) ends up centred at `zoom`. */
  flyTo(x: number, y: number, zoom: number, duration = 0.6): void {
    const target = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const { sx, sy } = isoToScreen(x + 0.5, y + 0.5);
    const x1 = this.app.screen.width / 2 - sx * target;
    const y1 = this.app.screen.height / 2 - sy * target;
    if (this.settings.reducedMotion || duration <= 0) {
      this.focusTile(x, y, target);
      return;
    }
    this.flight = { x0: this.world.position.x, y0: this.world.position.y, s0: this.world.scale.x, x1, y1, s1: target, t: 0, duration };
  }

  private stepFlight(dt: number): void {
    const f = this.flight;
    if (!f) return;
    f.t = Math.min(f.duration, f.t + dt);
    const k = f.t / f.duration;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    this.world.scale.set(f.s0 + (f.s1 - f.s0) * e);
    this.world.position.set(f.x0 + (f.x1 - f.x0) * e, f.y0 + (f.y1 - f.y0) * e);
    this.cullDirty = true;
    this.callbacks.onCameraChange?.();
    if (f.t >= f.duration) {
      this.flight = null;
      this.clampCamera();
    }
  }

  panBy(dx: number, dy: number): void {
    this.flight = null;
    this.world.position.x += dx;
    this.world.position.y += dy;
    this.clampCamera();
    this.cullDirty = true;
    this.callbacks.onCameraChange?.();
  }

  zoomBy(factor: number, cx?: number, cy?: number): void {
    const px = cx ?? this.app.screen.width / 2;
    const py = cy ?? this.app.screen.height / 2;
    const old = this.world.scale.x;
    const next = clamp(old * factor, MIN_ZOOM, MAX_ZOOM);
    if (next === old) return;
    const wx = (px - this.world.position.x) / old;
    const wy = (py - this.world.position.y) / old;
    this.world.scale.set(next);
    this.world.position.set(px - wx * next, py - wy * next);
    this.clampCamera();
    this.cullDirty = true;
    this.callbacks.onCameraChange?.();
  }

  private clampCamera(): void {
    if (this.citySize === 0) return;
    const s = this.world.scale.x;
    const halfW = (this.citySize * TILE_W) / 2;
    const worldH = this.citySize * TILE_H;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const margin = 120;
    // world x range: [-halfW, halfW], y range: [0, worldH]
    const minX = sw - (halfW + margin) * s;
    const maxX = (halfW + margin) * s;
    const minY = sh - (worldH + margin) * s;
    const maxY = margin * s;
    this.world.position.x = clamp(this.world.position.x, Math.min(minX, maxX), Math.max(minX, maxX));
    this.world.position.y = clamp(this.world.position.y, Math.min(minY, maxY), Math.max(minY, maxY));
  }

  /** Visible world rectangle in tile space corners (for the minimap). */
  getViewTiles(): { x: number; y: number }[] {
    const s = this.world.scale.x;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const toTile = (px: number, py: number) => {
      const wx = (px - this.world.position.x) / s;
      const wy = (py - this.world.position.y) / s;
      const x = (wx / HALF_W + wy / HALF_H) / 2;
      const y = (wy / HALF_H - wx / HALF_W) / 2;
      return { x, y };
    };
    return [toTile(0, 0), toTile(sw, 0), toTile(sw, sh), toTile(0, sh)];
  }

  screenToTile(px: number, py: number): { x: number; y: number } {
    const s = this.world.scale.x;
    const wx = (px - this.world.position.x) / s;
    const wy = (py - this.world.position.y) / s;
    return screenToTile(wx, wy);
  }

  // ----------------------------------------------------------------- frame

  private frame(dt: number): void {
    if (this.destroyed) return;
    this.time += dt;
    this.handleKeys(dt);
    this.stepFlight(dt);
    this.applyLighting();
    this.interior.setDaylight(this.daylight);
    this.interior.frame(dt);
    this.weather.update(dt, Math.random);
    if (this.cullDirty) {
      this.cull();
      this.cullDirty = false;
    }
    if (this.citySize > 0 && !this.settings.reducedMotion) {
      const corners = this.getViewTiles();
      const view = {
        x0: Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x)))),
        y0: Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y)))),
        x1: Math.min(this.citySize - 1, Math.ceil(Math.max(...corners.map((c) => c.x)))),
        y1: Math.min(this.citySize - 1, Math.ceil(Math.max(...corners.map((c) => c.y)))),
      };
      const zoomFactor = clamp((this.world.scale.x - 0.45) / 0.4, 0, 1);
      const s = this.world.scale.x;
      const wx = this.world.position.x;
      const wy = this.world.position.y;
      const sw = this.app.screen.width;
      const sh = this.app.screen.height;
      const margin = 80;
      const onScreen = (sx: number, sy: number): boolean => {
        const px = wx + sx * s;
        const py = wy + sy * s;
        return px >= -margin && px <= sw + margin && py >= -margin && py <= sh + margin;
      };
      this.traffic.update(dt, view, this.trafficDensity * zoomFactor, 1 - this.daylight, this.seed, onScreen);
    }
    const zoom = this.world.scale.x;
    const labelAlpha = clamp((0.75 - zoom) / 0.3, 0, 1);
    for (const label of this.labels) {
      label.alpha = labelAlpha;
      label.scale.set(1 / zoom);
      label.visible = labelAlpha > 0.02;
    }
  }

  private cull(): void {
    const s = this.world.scale.x;
    const vx0 = -this.world.position.x / s - 64;
    const vy0 = -this.world.position.y / s - 64;
    const vx1 = (this.app.screen.width - this.world.position.x) / s + 64;
    const vy1 = (this.app.screen.height - this.world.position.y) / s + 64;
    const test = (c: Cullable): void => {
      c.sprite.visible = c.x1 >= vx0 && c.x0 <= vx1 && c.y1 >= vy0 && c.y0 <= vy1;
    };
    for (const c of this.groundCull) test(c);
    for (const v of this.buildings.values()) for (const c of v.cull) test(c);
  }

  // ----------------------------------------------------------------- input

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.host) return;
    if (this.interior.active) return; // the map stays put behind the interior
    this.app.canvas.setPointerCapture?.(e.pointerId);
    this.pointerDown = { x: e.clientX, y: e.clientY, wx: this.world.position.x, wy: this.world.position.y, button: e.button, dragging: false };
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const rect = this.app.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (this.interior.active) {
      this.interior.pointerMove(px, py);
      if (this.lastHover) {
        this.lastHover = null;
        this.callbacks.onTileHover(null);
      }
      return;
    }
    if (this.pointerDown) {
      const dx = e.clientX - this.pointerDown.x;
      const dy = e.clientY - this.pointerDown.y;
      if (this.pointerDown.dragging || Math.hypot(dx, dy) > 4) {
        this.pointerDown.dragging = true;
        this.world.position.set(this.pointerDown.wx + dx, this.pointerDown.wy + dy);
        this.clampCamera();
        this.cullDirty = true;
        this.callbacks.onCameraChange?.();
        return;
      }
    }
    const tile = this.screenToTile(px, py);
    const inside = tile.x >= 0 && tile.y >= 0 && tile.x < this.citySize && tile.y < this.citySize;
    const next = inside ? tile : null;
    if (next?.x !== this.lastHover?.x || next?.y !== this.lastHover?.y) {
      this.lastHover = next;
      this.callbacks.onTileHover(next);
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (this.interior.active) {
      const rect = this.app.canvas.getBoundingClientRect();
      if (e.button === 0) this.interior.click(e.clientX - rect.left, e.clientY - rect.top);
      return;
    }
    if (!down || down.dragging) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const tile = this.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
    if (tile.x >= 0 && tile.y >= 0 && tile.x < this.citySize && tile.y < this.citySize) {
      this.callbacks.onTileClick(tile.x, tile.y, down.button);
    } else if (down.button === 0) {
      this.callbacks.onTileClick(-1, -1, 0);
    }
  };

  private readonly onPointerLeave = (): void => {
    this.interior.pointerLeave();
    this.lastHover = null;
    this.callbacks.onTileHover(null);
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (this.interior.active) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * 0.0012);
    this.zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top);
  };

  private readonly onContextMenu = (e: Event): void => e.preventDefault();

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      this.keys.add(k);
      e.preventDefault();
    }
    if (k === '+' || k === '=') this.zoomBy(1.2);
    if (k === '-' || k === '_') this.zoomBy(1 / 1.2);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private readonly onBlur = (): void => this.keys.clear();

  private handleKeys(dt: number): void {
    if (this.keys.size === 0 || this.interior.active) return;
    const speed = 700 * dt;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy += speed;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy -= speed;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx += speed;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx -= speed;
    if (dx !== 0 || dy !== 0) this.panBy(dx, dy);
  }

  private bindInput(): void {
    const c = this.app.canvas;
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('pointerleave', this.onPointerLeave);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  private unbindInput(): void {
    const c = this.app.renderer ? this.app.canvas : null;
    if (c) {
      c.removeEventListener('pointerdown', this.onPointerDown);
      c.removeEventListener('pointermove', this.onPointerMove);
      c.removeEventListener('pointerup', this.onPointerUp);
      c.removeEventListener('pointerleave', this.onPointerLeave);
      c.removeEventListener('wheel', this.onWheel);
      c.removeEventListener('contextmenu', this.onContextMenu);
    }
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}

export function artKeyFor(state: GameState, b: Building): BuildingArtKey {
  if (b.owner === 'city') {
    const style = (b.cityStyle ?? DISTRICT_ARCHETYPES[state.districts[b.districtId]!.archetype].style) as ArtStyle;
    return { art: 'city', style, w: b.w, h: b.h, floors: bucketFloors(b.floors), seed: b.variant % SEED_VARIANTS, facing: b.facing, construction: false };
  }
  const def = BUILDING_DEFINITIONS[b.defId];
  return {
    art: def?.art ?? 'city',
    style: 'player',
    w: b.w,
    h: b.h,
    floors: b.floors,
    seed: b.variant % SEED_VARIANTS,
    facing: b.facing,
    construction: b.status === 'construction',
  };
}

function bucketFloors(floors: number): number {
  return floors <= 4 ? floors : Math.round(floors / 2) * 2;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
