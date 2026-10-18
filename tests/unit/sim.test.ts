import { describe, expect, it } from 'vitest';
import type { GastronomyState } from '../../src/sim/state';
import { Rng, hashSeed } from '../../src/sim/core/rng';
import { tickToDate, MINUTES_PER_DAY, daylightFactor, isDayBoundary } from '../../src/sim/core/clock';
import { generateCity } from '../../src/sim/world/generator';
import { TileKind } from '../../src/sim/world/grid';
import { createNewGame, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { checkPlacement, quotePlacement } from '../../src/sim/systems/construction';
import { BUILDING_DEFINITIONS } from '../../src/sim/data/buildings';
import { explainDemand, isOpen } from '../../src/sim/systems/business';
import type { Building } from '../../src/sim/state';

const baseOptions: NewGameOptions = {
  progression: false,
  seed: 'test-seed',
  playerName: 'Tester',
  difficulty: 'standard',
  background: 'restaurateur',
  citySize: 48,
};

function findLot(sim: Simulation, defId = 'ramen_bar', districtArchetype?: string): { x: number; y: number } {
  const { grid, districts } = sim.state;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (districtArchetype && districts[grid.districtAt(x, y)]!.archetype !== districtArchetype) continue;
      if (checkPlacement(sim.state, defId, x, y).ok) return { x, y };
    }
  }
  throw new Error('no free lot found');
}

function playerBuildings(sim: Simulation): Building[] {
  return Object.values(sim.state.buildings).filter((b) => b.owner === 'player');
}

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng('abc');
    const b = new Rng('abc');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });

  it('resumes from serialized state', () => {
    const a = new Rng(42);
    a.next();
    a.next();
    const b = Rng.fromJSON(a.toJSON());
    expect(b.next()).toBe(a.next());
  });

  it('produces integers within bounds', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
});

describe('Clock', () => {
  it('starts at 07:00 on day 0 and rolls over days', () => {
    const d0 = tickToDate(0);
    expect(d0.hour).toBe(7);
    expect(d0.day).toBe(0);
    expect(d0.year).toBe(2187);
    const d1 = tickToDate(17 * 60);
    expect(d1.day).toBe(1);
    expect(d1.hour).toBe(0);
    expect(isDayBoundary(17 * 60)).toBe(true);
    expect(isDayBoundary(17 * 60 + 1)).toBe(false);
  });

  it('daylight is 1 at noon and 0 at midnight', () => {
    expect(daylightFactor(12 * 60)).toBe(1);
    expect(daylightFactor(0)).toBe(0);
    expect(daylightFactor(6 * 60)).toBeGreaterThan(0);
    expect(daylightFactor(6 * 60)).toBeLessThan(1);
  });
});

describe('City generator', () => {
  it('is deterministic for a seed', () => {
    const a = generateCity(1234, 48);
    const b = generateCity(1234, 48);
    expect(Array.from(a.grid.kind)).toEqual(Array.from(b.grid.kind));
    expect(Object.keys(a.buildings).length).toBe(Object.keys(b.buildings).length);
    const c = generateCity(99, 48);
    expect(Array.from(a.grid.kind)).not.toEqual(Array.from(c.grid.kind));
  });

  it('creates ten districts, roads, water and buildable lots', () => {
    const city = generateCity(555, 96);
    expect(city.districts).toHaveLength(10);
    const counts = new Map<number, number>();
    for (const k of city.grid.kind) counts.set(k, (counts.get(k) ?? 0) + 1);
    expect(counts.get(TileKind.Road)! > 200).toBe(true);
    expect(counts.get(TileKind.Water)! > 50).toBe(true);
    expect(counts.get(TileKind.Lot)! > 50).toBe(true);
    expect(counts.get(TileKind.Building)! > 500).toBe(true);
    for (const d of city.districts) expect(d.tileCount).toBeGreaterThan(0);
  });

  it('every city building occupies exactly its footprint', () => {
    const city = generateCity(42, 48);
    for (const b of Object.values(city.buildings)) {
      for (let dy = 0; dy < b.h; dy++)
        for (let dx = 0; dx < b.w; dx++) expect(city.grid.occupantAt(b.x + dx, b.y + dy)).toBe(b.id);
      expect(city.grid.footprintTouchesRoad(b.x, b.y, b.w, b.h)).toBe(true);
    }
  });
});

describe('Construction', () => {
  it('rejects placement on roads, water and occupied tiles', () => {
    const sim = new Simulation(createNewGame(baseOptions));
    const { grid } = sim.state;
    let road: [number, number] | null = null;
    let water: [number, number] | null = null;
    let occupied: [number, number] | null = null;
    for (let y = 0; y < grid.height && !(road && water && occupied); y++) {
      for (let x = 0; x < grid.width; x++) {
        const k = grid.kindAt(x, y);
        if (k === TileKind.Road && !road) road = [x, y];
        if (k === TileKind.Water && !water) water = [x, y];
        if (k === TileKind.Building && !occupied) occupied = [x, y];
      }
    }
    expect(checkPlacement(sim.state, 'ramen_bar', ...road!).error).toBe('tile_occupied');
    expect(checkPlacement(sim.state, 'ramen_bar', ...water!).error).toBe('tile_occupied');
    expect(checkPlacement(sim.state, 'ramen_bar', ...occupied!).error).toBe('tile_occupied');
    expect(checkPlacement(sim.state, 'ramen_bar', -1, 0).error).toBe('out_of_bounds');
    expect(checkPlacement(sim.state, 'ramen_bar', 1000, 0).error).toBe('out_of_bounds');
    expect(checkPlacement(sim.state, 'nope', 0, 0).error).toBe('unknown_building');
  });

  it('rejects buildings that are not yet available', () => {
    const sim = new Simulation(createNewGame(baseOptions));
    const lot = findLot(sim);
    BUILDING_DEFINITIONS.future_test = { ...BUILDING_DEFINITIONS.ramen_bar!, id: 'future_test', availability: 99 };
    try {
      expect(checkPlacement(sim.state, 'future_test', lot.x, lot.y).error).toBe('not_available');
      expect(sim.apply({ type: 'placeBuilding', defId: 'future_test', x: lot.x, y: lot.y }).ok).toBe(false);
    } finally {
      delete BUILDING_DEFINITIONS.future_test;
    }
  });

  it('rejects placement without funds and never creates a negative balance by building', () => {
    const sim = new Simulation(createNewGame(baseOptions));
    const lot = findLot(sim, 'food_stand');
    sim.state.ledger.balance = 100;
    const check = checkPlacement(sim.state, 'ramen_bar', lot.x, lot.y);
    expect(check.ok).toBe(false);
    expect(check.error).toBe('insufficient_funds');
    const result = sim.apply({ type: 'placeBuilding', defId: 'ramen_bar', x: lot.x, y: lot.y });
    expect(result.ok).toBe(false);
    expect(sim.state.ledger.balance).toBe(100);
    expect(playerBuildings(sim)).toHaveLength(0);
  });

  it('charges land and construction, then completes after the build time', () => {
    const sim = new Simulation(createNewGame(baseOptions));
    const lot = findLot(sim);
    const before = sim.state.ledger.balance;
    const quote = quotePlacement(sim.state, BUILDING_DEFINITIONS.ramen_bar!, sim.state.grid.districtAt(lot.x, lot.y));
    const result = sim.apply({ type: 'placeBuilding', defId: 'ramen_bar', x: lot.x, y: lot.y });
    expect(result.ok).toBe(true);
    expect(sim.state.ledger.balance).toBe(before - quote.total);
    const b = playerBuildings(sim)[0]!;
    expect(b.status).toBe('construction');
    expect(sim.state.grid.occupantAt(lot.x, lot.y)).toBe(b.id);
    sim.run(quote.buildTime - 1);
    expect(b.status).toBe('construction');
    sim.run(1);
    expect(b.status).toBe('operational');
    expect(sim.drainEvents().some((e) => e.type === 'building:completed')).toBe(true);
    expect(sim.state.tasks.find((t) => t.id === 'first_open')!.completedTick).not.toBeNull();
  });

  it('undo refunds a construction site completely, demolition does not', () => {
    const sim = new Simulation(createNewGame(baseOptions));
    const lot = findLot(sim);
    const before = sim.state.ledger.balance;
    sim.apply({ type: 'placeBuilding', defId: 'ramen_bar', x: lot.x, y: lot.y });
    expect(sim.apply({ type: 'undoPlacement' }).ok).toBe(true);
    expect(sim.state.ledger.balance).toBe(before);
    expect(sim.state.grid.kindAt(lot.x, lot.y)).toBe(TileKind.Lot);
    expect(sim.apply({ type: 'undoPlacement' }).ok).toBe(false);

    sim.apply({ type: 'placeBuilding', defId: 'ramen_bar', x: lot.x, y: lot.y });
    const b = playerBuildings(sim)[0]!;
    sim.run(b.buildTime);
    expect(sim.apply({ type: 'undoPlacement' }).ok).toBe(false);
    const beforeDemolish = sim.state.ledger.balance;
    expect(sim.apply({ type: 'demolish', buildingId: b.id }).ok).toBe(true);
    expect(sim.state.ledger.balance).toBeLessThan(beforeDemolish + b.investment);
    expect(sim.state.buildings[b.id]).toBeUndefined();
  });

  it('cannot demolish city buildings', () => {
    const sim = new Simulation(createNewGame(baseOptions));
    const city = Object.values(sim.state.buildings).find((b) => b.owner === 'city')!;
    expect(sim.apply({ type: 'demolish', buildingId: city.id }).ok).toBe(false);
  });

  it('sandbox builds instantly without money checks', () => {
    const sim = new Simulation(createNewGame({ ...baseOptions, difficulty: 'sandbox' }));
    sim.state.ledger.balance = 0;
    const lot = findLot(sim);
    expect(sim.apply({ type: 'placeBuilding', defId: 'ramen_bar', x: lot.x, y: lot.y }).ok).toBe(true);
    expect(playerBuildings(sim)[0]!.status).toBe('operational');
    // Instant builds are not undoable (no construction site to cancel).
    expect(sim.state.undoStack).toHaveLength(0);
    expect(sim.apply({ type: 'undoPlacement' }).ok).toBe(false);
  });
});

describe('Economy', () => {
  it('charges apartment rent at every day boundary', () => {
    const sim = new Simulation(createNewGame(baseOptions));
    const rent = sim.state.player.apartmentRent;
    expect(rent).toBeGreaterThan(0);
    const before = sim.state.ledger.balance;
    sim.run(17 * 60); // 07:00 -> 00:00
    expect(sim.state.ledger.balance).toBe(before - rent);
    expect(sim.state.ledger.transactions.some((t) => t.category === 'rent')).toBe(true);
    expect(sim.state.ledger.balanceHistory).toHaveLength(2);
  });

  it('ramen bar serves guests only during opening hours and books revenue', () => {
    const sim = new Simulation(createNewGame({ ...baseOptions, difficulty: 'sandbox' }));
    const lot = findLot(sim, 'ramen_bar', 'neon_market');
    sim.apply({ type: 'placeBuilding', defId: 'ramen_bar', x: lot.x, y: lot.y });
    const b = playerBuildings(sim)[0]!;
    const model = BUILDING_DEFINITIONS.ramen_bar!.business as import('../../src/sim/data/buildings').GastronomyModel;
    expect(isOpen(model, 12)).toBe(true);
    expect(isOpen(model, 1)).toBe(true);
    expect(isOpen(model, 5)).toBe(false);

    const balanceStart = sim.state.ledger.balance;
    sim.run(3 * 60); // 07:00 -> 10:00, closed
    expect((b.business as GastronomyState).todayGuests).toBe(0);
    sim.run(4 * 60); // -> 14:00, lunch served
    expect((b.business as GastronomyState).todayGuests).toBeGreaterThan(0);
    const sales = sim.state.ledger.transactions.filter((t) => t.category === 'sales');
    expect(sales.length).toBeGreaterThan(0);
    const sumSales = sales.reduce((s, t) => s + t.amount, 0);
    expect(sumSales).toBeCloseTo((b.business as GastronomyState).todayRevenue, 5);
    expect(sim.state.ledger.balance).toBeCloseTo(balanceStart + sumSales, 5);
    expect((b.business as GastronomyState).todayCogs).toBeGreaterThan(0);
  });

  it('day close books wages and upkeep and records history', () => {
    const sim = new Simulation(createNewGame({ ...baseOptions, difficulty: 'sandbox' }));
    const lot = findLot(sim, 'ramen_bar', 'neon_market');
    sim.apply({ type: 'placeBuilding', defId: 'ramen_bar', x: lot.x, y: lot.y });
    const b = playerBuildings(sim)[0]!;
    sim.run(17 * 60);
    expect((b.business as GastronomyState).history).toHaveLength(1);
    expect((b.business as GastronomyState).history[0]!.guests).toBeGreaterThan(0);
    expect(sim.state.ledger.transactions.some((t) => t.category === 'wages')).toBe(true);
    expect(sim.state.ledger.transactions.some((t) => t.category === 'upkeep')).toBe(true);
    expect((b.business as GastronomyState).todayGuests).toBe(0);
  });

  it('higher menu prices reduce demand and prices are clamped', () => {
    const sim = new Simulation(createNewGame({ ...baseOptions, difficulty: 'sandbox' }));
    const market = findLot(sim, 'ramen_bar', 'neon_market');
    sim.apply({ type: 'placeBuilding', defId: 'ramen_bar', x: market.x, y: market.y });
    const b = playerBuildings(sim)[0]!;
    const base = explainDemand(sim.state, b)!.expectedPeakGuests;
    for (const m of (b.business as GastronomyState).menu) sim.apply({ type: 'setMenuPrice', buildingId: b.id, recipeId: m.recipeId, price: m.price * 2 });
    const expensive = explainDemand(sim.state, b)!.expectedPeakGuests;
    expect(expensive).toBeLessThan(base);
    sim.apply({ type: 'setMenuPrice', buildingId: b.id, recipeId: 'shoyu_ramen', price: 1000 });
    expect((b.business as GastronomyState).menu.find((m) => m.recipeId === 'shoyu_ramen')!.price).toBe(45);
    sim.apply({ type: 'setMenuPrice', buildingId: b.id, recipeId: 'shoyu_ramen', price: 1 });
    expect((b.business as GastronomyState).menu.find((m) => m.recipeId === 'shoyu_ramen')!.price).toBe(9);
  });

  it('running costs can push the balance negative and the debt counter grows', () => {
    const sim = new Simulation(createNewGame({ ...baseOptions, difficulty: 'hardcore' }));
    sim.state.ledger.balance = 10;
    sim.run(MINUTES_PER_DAY * 2);
    expect(sim.state.ledger.balance).toBeLessThan(0);
    expect(sim.state.ledger.daysInDebt).toBe(2);
    expect(sim.state.log.some((l) => l.level === 'danger')).toBe(true);
  });

  it('is fully deterministic: same seed and commands give identical state', () => {
    const run = () => {
      const sim = new Simulation(createNewGame(baseOptions));
      const lot = findLot(sim);
      sim.apply({ type: 'placeBuilding', defId: 'food_stand', x: lot.x, y: lot.y });
      sim.run(MINUTES_PER_DAY * 3);
      return JSON.stringify({ ...sim.state, grid: sim.state.grid.toJSON(), meta: null });
    };
    expect(run()).toBe(run());
  });
});
