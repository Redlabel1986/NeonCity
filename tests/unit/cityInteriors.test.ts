import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createNewGame, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { CITY_INTERIOR_IDS, cityInterior } from '../../src/render/interior/cityCatalog';
import { cityInteriorScene } from '../../src/render/interior/cityLayouts';
import { buildInteriorScene } from '../../src/render/interior/layouts';
import type { Building, GameState } from '../../src/sim/state';

const options: NewGameOptions = { progression: false, seed: 'interiors', playerName: 'Innen', difficulty: 'standard', background: 'restaurateur', citySize: 96 };

function cityBuilding(state: GameState): Building {
  const b = Object.values(state.buildings).find((x) => x.owner === 'city' && !state.competitors[x.id]);
  if (!b) throw new Error('no city building');
  return b;
}

const sprites = JSON.parse(readFileSync('public/sprites/catalog.json', 'utf-8')) as { buildings: { id: string; w: number; h: number }[] };

describe('City building interiors (Innenansichten-Katalog)', () => {
  it('covers every pre-rendered building and keeps the catalogue zones', () => {
    expect(CITY_INTERIOR_IDS.length).toBe(236);
    for (const s of sprites.buildings) expect(cityInterior(s.id), s.id).not.toBeNull();
  });

  it('builds a furnished scene for each of the 236 entries, zones and props inside the room', () => {
    const state = new Simulation(createNewGame(options)).state;
    const base = cityBuilding(state);
    for (const s of sprites.buildings) {
      const entry = cityInterior(s.id)!;
      const b = { ...base, w: s.w, h: s.h };
      const scene = cityInteriorScene(b, state, s.id);
      expect(scene, s.id).not.toBeNull();
      expect(scene!.zones.map((z) => z.label), s.id).toEqual(entry.zones.map((z) => z.name));
      expect(scene!.props.length, s.id).toBeGreaterThan(0);
      for (const z of scene!.zones) {
        expect(z.x).toBeGreaterThanOrEqual(0);
        expect(z.y).toBeGreaterThanOrEqual(0);
        expect(z.x + z.w).toBeLessThanOrEqual(scene!.width + 1e-6);
        expect(z.y + z.h).toBeLessThanOrEqual(scene!.height + 1e-6);
        expect(z.tab).toBeUndefined();
        expect(z.details?.length ?? 0).toBeGreaterThan(0);
      }
      for (const p of scene!.props) {
        expect(p.x, `${s.id} ${p.kind}`).toBeGreaterThanOrEqual(-0.01);
        expect(p.x, `${s.id} ${p.kind}`).toBeLessThanOrEqual(scene!.width + 0.01);
        expect(p.y, `${s.id} ${p.kind}`).toBeLessThanOrEqual(scene!.height + 0.01);
      }
      if (entry.technical) {
        expect(scene!.openAir).toBe(true);
        expect(scene!.zones).toHaveLength(1);
        expect(scene!.zones[0]!.interactive).toBe(false);
      }
    }
  });

  it('gives every archetype its own furniture instead of one generic layout', () => {
    const state = new Simulation(createNewGame(options)).state;
    const base = cityBuilding(state);
    const signatures = new Map<string, string>();
    for (const id of CITY_INTERIOR_IDS) {
      const entry = cityInterior(id)!;
      if (entry.technical || entry.archetype === 'outdoor' || signatures.has(entry.archetype)) continue;
      const scene = cityInteriorScene({ ...base, w: 2, h: 2 }, state, id)!;
      signatures.set(entry.archetype, [...new Set(scene.props.map((p) => p.kind))].sort().join(','));
    }
    expect(signatures.size).toBeGreaterThanOrEqual(40);
    expect(new Set(signatures.values()).size).toBe(signatures.size);
  });

  it('shows the citizens the simulation places there and no invented people', () => {
    const state = new Simulation(createNewGame(options)).state;
    const b = cityBuilding(state);
    const houseId = CITY_INTERIOR_IDS.find((x) => cityInterior(x)!.archetype === 'house')!;
    for (const c of state.population.citizens) {
      if (c.homeBuildingId === b.id) c.homeBuildingId = -1;
      if (c.workBuildingId === b.id) c.workBuildingId = null;
    }
    const empty = cityInteriorScene(b, state, houseId)!;
    expect(empty.figures).toHaveLength(0);
    const [a, z, w] = state.population.citizens;
    a!.homeBuildingId = b.id;
    a!.activity = 'sleep';
    z!.homeBuildingId = b.id;
    z!.activity = 'work'; // lives here but is away
    w!.workBuildingId = b.id;
    w!.activity = 'work';
    const scene = cityInteriorScene(b, state, houseId)!;
    const names = scene.figures.map((f) => f.name);
    expect(names).toContain(a!.name);
    expect(names).not.toContain(z!.name);
    expect(names).toContain(w!.name);
    expect(scene.figures.find((f) => f.name === a!.name)!.lying).toBe(true);
    const living = scene.zones.find((zz) => zz.status.includes('Bewohnern'))!;
    expect(living.status).toBe('1 von 2 Bewohnern zu Hause');
  });

  it('competitor venues seat exactly the guests registered this hour', () => {
    const state = new Simulation(createNewGame(options)).state;
    const venueId = Number(Object.keys(state.competitors)[0]);
    const b = state.buildings[venueId]!;
    state.population.pendingVisits[venueId] = 3;
    const restaurant = CITY_INTERIOR_IDS.find((x) => cityInterior(x)!.archetype === 'restaurant')!;
    const scene = cityInteriorScene(b, state, restaurant)!;
    expect(scene.figures.filter((f) => f.role === 'guest')).toHaveLength(3);
    expect(scene.zones.some((zz) => zz.status.startsWith('3 Gäste diese Stunde'))).toBe(true);
  });

  it('buildInteriorScene falls back to the catalogue for city buildings only', () => {
    const state = new Simulation(createNewGame(options)).state;
    const b = cityBuilding(state);
    expect(buildInteriorScene(b, state)).toBeNull();
    expect(buildInteriorScene(b, state, 'unknown.id')).toBeNull();
    expect(buildInteriorScene(b, state, CITY_INTERIOR_IDS[0])).not.toBeNull();
  });
});
