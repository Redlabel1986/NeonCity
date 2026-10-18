import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, type NewGameOptions, SAVE_FORMAT_VERSION } from '../../src/sim/engine';
import { checkPlacement } from '../../src/sim/systems/construction';
import { generateCity } from '../../src/sim/world/generator';
import { migrate, serialize, type SaveFile } from '../../src/persistence/serializer';
import type { Facing } from '../../src/sim/state';

const options: NewGameOptions = { progression: false, seed: 'facing', playerName: 'Dreher', difficulty: 'sandbox', background: 'restaurateur', citySize: 48 };

const ALL: Facing[] = [0, 1, 2, 3];

describe('Phase 10: building facing', () => {
  it('every generated city building faces a road and prefers the visible edges', () => {
    const city = generateCity(4242, 64);
    let backFacing = 0;
    for (const b of Object.values(city.buildings)) {
      expect(city.grid.edgeTouchesRoad(b.x, b.y, b.w, b.h, b.facing)).toBe(true);
      const visible = ALL.slice(0, 2).some((f) => city.grid.edgeTouchesRoad(b.x, b.y, b.w, b.h, f));
      if (visible) expect(b.facing).toBeLessThan(2);
      else backFacing++;
    }
    expect(backFacing).toBeGreaterThan(0);
  });

  it('chooses a road-side entrance automatically and rejects an entrance away from the road', () => {
    const sim = new Simulation(createNewGame(options));
    const { grid } = sim.state;
    let found = false;
    for (let y = 0; y < grid.height && !found; y++) {
      for (let x = 0; x < grid.width && !found; x++) {
        const auto = checkPlacement(sim.state, 'ramen_bar', x, y);
        if (!auto.ok) continue;
        expect(grid.edgeTouchesRoad(x, y, 1, 1, auto.facing)).toBe(true);
        const off = ALL.find((f) => !grid.edgeTouchesRoad(x, y, 1, 1, f));
        if (off === undefined) continue;
        const rejected = checkPlacement(sim.state, 'ramen_bar', x, y, off);
        expect(rejected.ok).toBe(false);
        expect(rejected.error).toBe('entrance_off_road');
        expect(sim.apply({ type: 'placeBuilding', defId: 'ramen_bar', x, y, facing: off }).ok).toBe(false);
        const explicit = ALL.find((f) => f !== auto.facing && grid.edgeTouchesRoad(x, y, 1, 1, f)) ?? auto.facing;
        expect(sim.apply({ type: 'placeBuilding', defId: 'ramen_bar', x, y, facing: explicit }).ok).toBe(true);
        const placed = Object.values(sim.state.buildings).find((b) => b.owner === 'player')!;
        expect(placed.facing).toBe(explicit);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('migrates version 9 saves by deriving the facing from the road layout', () => {
    const sim = new Simulation(createNewGame(options));
    const file = JSON.parse(serialize(sim.state, 'x')) as SaveFile;
    const raw = file.state as unknown as { buildings: Record<string, Record<string, unknown>> };
    for (const b of Object.values(raw.buildings)) delete b.facing;
    const migrated = migrate({ ...file, version: 9 });
    expect(migrated.version).toBe(SAVE_FORMAT_VERSION);
    const buildings = (migrated.state as unknown as { buildings: Record<string, { x: number; y: number; w: number; h: number; facing: Facing }> }).buildings;
    const { grid } = sim.state;
    let count = 0;
    for (const b of Object.values(buildings)) {
      expect(typeof b.facing).toBe('number');
      expect(grid.edgeTouchesRoad(b.x, b.y, b.w, b.h, b.facing)).toBe(true);
      count++;
    }
    expect(count).toBeGreaterThan(50);
  });
});
