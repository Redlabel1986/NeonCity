/**
 * Weather effects: rain streaks, fog and lightning. Screen-space layer on
 * top of the world; cheap enough to run every frame.
 */

import { Container, Graphics, Sprite, Texture, type Renderer } from 'pixi.js';

interface Drop {
  sprite: Sprite;
  speed: number;
  x: number;
  y: number;
}

export class WeatherLayer {
  readonly container = new Container();
  private readonly rainLayer = new Container();
  private readonly fog = new Graphics();
  private readonly flash = new Graphics();
  private drops: Drop[] = [];
  private dropTex: Texture | null = null;
  private width = 1;
  private height = 1;
  private kind: 'clear' | 'rain' | 'fog' | 'storm' = 'clear';
  private intensity = 0;
  private flashTimer = 0;
  private flashAlpha = 0;
  private enabled = true;
  private reduced = false;

  init(renderer: Renderer): void {
    const g = new Graphics();
    g.rect(0, 0, 1.2, 14).fill({ color: 0xbfe8ff, alpha: 0.55 });
    this.dropTex = renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();
    this.container.addChild(this.fog, this.rainLayer, this.flash);
    this.container.eventMode = 'none';
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.fog.clear();
    this.fog.rect(0, 0, width, height).fill({ color: 0x8a90b0, alpha: 1 });
    this.flash.clear();
    this.flash.rect(0, 0, width, height).fill({ color: 0xffffff, alpha: 1 });
  }

  setEnabled(enabled: boolean, reduced: boolean): void {
    this.enabled = enabled;
    this.reduced = reduced;
    if (!enabled) this.clear();
  }

  setWeather(kind: 'clear' | 'rain' | 'fog' | 'storm', intensity: number): void {
    this.kind = kind;
    this.intensity = intensity;
  }

  private clear(): void {
    for (const d of this.drops) d.sprite.destroy();
    this.drops = [];
    this.fog.alpha = 0;
    this.flash.alpha = 0;
  }

  update(dt: number, rand: () => number): void {
    if (!this.enabled || !this.dropTex) {
      this.container.visible = false;
      return;
    }
    this.container.visible = true;
    const raining = this.kind === 'rain' || this.kind === 'storm';
    const target = raining && !this.reduced ? Math.round((this.kind === 'storm' ? 420 : 260) * this.intensity) : 0;
    while (this.drops.length < target) {
      const s = new Sprite(this.dropTex);
      s.rotation = 0.18;
      s.alpha = 0.5 + rand() * 0.4;
      s.scale.set(0.8 + rand() * 0.6);
      this.rainLayer.addChild(s);
      this.drops.push({ sprite: s, speed: 900 + rand() * 500, x: rand() * (this.width + 100) - 50, y: rand() * this.height });
    }
    while (this.drops.length > target) this.drops.pop()!.sprite.destroy();
    for (const d of this.drops) {
      d.y += d.speed * dt;
      d.x -= d.speed * 0.18 * dt;
      if (d.y > this.height + 20) {
        d.y = -20;
        d.x = rand() * (this.width + 100) - 50;
      }
      d.sprite.position.set(d.x, d.y);
    }
    const fogTarget = this.kind === 'fog' ? 0.28 * this.intensity : this.kind === 'storm' ? 0.12 : this.kind === 'rain' ? 0.06 * this.intensity : 0;
    this.fog.alpha += (fogTarget - this.fog.alpha) * Math.min(1, dt * 1.5);
    if (this.kind === 'storm' && !this.reduced) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.flashTimer = 3 + rand() * 9;
        this.flashAlpha = 0.5;
      }
    }
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.5);
    this.flash.alpha = this.flashAlpha;
  }
}
