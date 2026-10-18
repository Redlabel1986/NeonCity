import { toLegacy } from './legacy';
import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { checkPlacement } from '../../src/sim/systems/construction';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';
import { weatherFactors } from '../../src/sim/systems/weather';
import type { Building, GastronomyState } from '../../src/sim/state';
import { serialize, deserialize } from '../../src/persistence/serializer';

function build(sim: Simulation, defId: string, archetype?: string): Building {
  const { grid, districts } = sim.state;
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++) {
      if (archetype && districts[grid.districtAt(x, y)]!.archetype !== archetype) continue;
      if (!checkPlacement(sim.state, defId, x, y).ok) continue;
      const before = new Set(Object.keys(sim.state.buildings));
      sim.apply({ type: 'placeBuilding', defId, x, y });
      const b = Object.values(sim.state.buildings).find((v) => v.owner === 'player' && !before.has(String(v.id)))!;
      if (b.status === 'construction') sim.run(b.buildTime);
      return b;
    }
  throw new Error('no lot');
}

describe('Weather', () => {
  it('changes over time deterministically and affects demand', () => {
    const a = new Simulation(createNewGame({ progression: false, seed: 'w', playerName: 'x', difficulty: 'sandbox', background: 'restaurateur', citySize: 32 }));
    const b = new Simulation(createNewGame({ progression: false, seed: 'w', playerName: 'x', difficulty: 'sandbox', background: 'restaurateur', citySize: 32 }));
    const kinds = new Set<string>();
    for (let i = 0; i < 20; i++) {
      a.run(MINUTES_PER_DAY);
      b.run(MINUTES_PER_DAY);
      kinds.add(a.state.weather.kind);
      expect(a.state.weather.kind).toBe(b.state.weather.kind);
    }
    expect(kinds.size).toBeGreaterThan(1);
    a.state.weather = { kind: 'storm', untilTick: a.state.tick + 600, intensity: 1 };
    expect(weatherFactors(a.state).walkIns).toBeLessThan(0.7);
    expect(weatherFactors(a.state).taxi).toBeGreaterThan(1.3);
    a.state.weather = { kind: 'clear', untilTick: a.state.tick + 600, intensity: 0 };
    expect(weatherFactors(a.state).walkIns).toBe(1);
  });

  it('is saved, loaded and migrated', () => {
    const sim = new Simulation(createNewGame({ progression: false, seed: 'w2', playerName: 'x', difficulty: 'sandbox', background: 'restaurateur', citySize: 32 }));
    sim.state.weather = { kind: 'fog', untilTick: 999, intensity: 0.5 };
    const { state } = deserialize(serialize(sim.state, 'v8'));
    expect(state.weather.kind).toBe('fog');
    const file = toLegacy(JSON.parse(serialize(sim.state, 'v7')) as { version: number; state: Record<string, unknown> });
    delete file.state.weather;
    const migrated = deserialize(JSON.stringify({ ...file, version: 7 }));
    expect(migrated.state.weather.kind).toBe('clear');
  });
});

describe('Balancing', () => {
  const options: NewGameOptions = { progression: false, seed: 'balance', playerName: 'Avg', difficulty: 'standard', background: 'restaurateur', citySize: 96 };

  it('a standard ramen bar run is viable over 12 days without micro-management', () => {
    const sim = new Simulation(createNewGame(options));
    const start = sim.state.ledger.balance;
    const bar = build(sim, 'ramen_bar', 'neon_market');
    const biz = bar.business as GastronomyState;
    sim.run(MINUTES_PER_DAY * 12);
    const last5 = biz.history.slice(-5);
    const avgProfit = last5.reduce((s, h) => s + (h.revenue - h.costs), 0) / Math.max(1, last5.length);
    expect(biz.employees.length).toBeGreaterThan(0);
    expect(avgProfit).toBeGreaterThan(0);
    expect(sim.state.ledger.balance).toBeGreaterThan(start - bar.investment - 3000);
    expect(sim.state.ledger.balance).toBeGreaterThan(-1000);
  });

  it('hardcore is harder than story for the same play', () => {
    const run = (difficulty: NewGameOptions['difficulty']): number => {
      const sim = new Simulation(createNewGame({ ...options, difficulty }));
      const bar = build(sim, 'ramen_bar', 'neon_market');
      sim.run(MINUTES_PER_DAY * 8);
      return sim.state.ledger.balance + bar.investment;
    };
    expect(run('story')).toBeGreaterThan(run('hardcore'));
  });

  it('a kiosk and a capsule hotel are both profitable in a fitting district', () => {
    const sim = new Simulation(createNewGame({ ...options, difficulty: 'sandbox' }));
    const kiosk = build(sim, 'kiosk', 'neon_market');
    const hotel = build(sim, 'capsule_hotel', 'corporate_heights');
    sim.run(MINUTES_PER_DAY * 10);
    const profit = (b: Building): number => {
      const h = b.business!.history.slice(-5);
      return h.reduce((s, x) => s + (x.revenue - x.costs), 0) / Math.max(1, h.length);
    };
    expect(profit(kiosk)).toBeGreaterThan(0);
    expect(profit(hotel)).toBeGreaterThan(0);
  });
});
