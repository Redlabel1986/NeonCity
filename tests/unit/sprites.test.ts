import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickCitySprite, type SpriteCatalog } from '../../src/render/spriteCatalog';
import { generateCity } from '../../src/sim/world/generator';
import { regionOfArchetype } from '../../src/sim/data/regions';

const root = join(__dirname, '..', '..', 'public', 'sprites');
const catalog = JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8')) as SpriteCatalog;

describe('Building sprites', () => {
  it('the catalog lists every rendered file with four facings and swapped footprints for the side facings', () => {
    expect(catalog.buildings.length).toBe(236);
    expect(catalog.scale).toBe(2);
    for (const b of catalog.buildings) {
      expect(['greenhaven', 'silverbrook', 'neon_central', 'nova_eclipse']).toContain(b.region);
      for (const f of ['0', '1', '2', '3']) {
        const facing = b.facings[f]!;
        expect(existsSync(join(root, facing.day))).toBe(true);
        if (facing.night) expect(existsSync(join(root, facing.night))).toBe(true);
        expect(facing.width).toBeGreaterThan(10);
        expect(facing.height).toBeGreaterThan(5);
        if (f === '1' || f === '3') expect([facing.w, facing.h]).toEqual([b.w, b.h]);
        else expect([facing.w, facing.h]).toEqual([b.h, b.w]);
      }
    }
  });

  it('picks a matching sprite per region, footprint and facing deterministically, and none when nothing fits (procedural fallback)', () => {
    const a = pickCitySprite(catalog, 'greenhaven', 2, 1, 1, 7)!;
    expect(a.entry.region).toBe('greenhaven');
    expect([a.facing.w, a.facing.h]).toEqual([2, 1]);
    expect(pickCitySprite(catalog, 'greenhaven', 2, 1, 1, 7)!.entry.id).toBe(a.entry.id);
    const side = pickCitySprite(catalog, 'greenhaven', 1, 2, 0, 3)!;
    expect([side.facing.w, side.facing.h]).toEqual([1, 2]);
    expect(pickCitySprite(catalog, 'neon_central', 2, 3, 0, 1)).toBeNull(); // no 2x3 sprites: the game draws it itself
    for (let v = 0; v < 40; v++) {
      const p = pickCitySprite(catalog, 'nova_eclipse', 1, 1, v % 4, v);
      if (p) expect(['decor', 'park', 'fountain', 'parking', 'solar']).not.toContain(p.entry.kind);
    }
  });

  it('covers most city buildings of a generated city with a sprite', () => {
    const city = generateCity(42, 96);
    let covered = 0;
    const all = Object.values(city.buildings);
    for (const b of all) {
      const region = regionOfArchetype(city.districts[b.districtId]!.archetype);
      if (pickCitySprite(catalog, region, b.w, b.h, b.facing, b.variant)) covered++;
    }
    expect(covered / all.length).toBeGreaterThan(0.8);
  });
});
