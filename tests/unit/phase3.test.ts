import { toLegacy } from './legacy';
import { describe, expect, it } from 'vitest';
import type { GastronomyState } from '../../src/sim/state';
import { createNewGame, Simulation, SAVE_FORMAT_VERSION, type NewGameOptions } from '../../src/sim/engine';
import { checkPlacement } from '../../src/sim/systems/construction';
import { collectVenues } from '../../src/sim/systems/population';
import { MARKET_MAX, MARKET_MIN } from '../../src/sim/systems/market';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';
import { serialize, deserialize, type SaveFile } from '../../src/persistence/serializer';
import { quoteOrder } from '../../src/sim/systems/inventory';

const options: NewGameOptions = { progression: false, seed: 'phase3', playerName: 'Mayor', difficulty: 'sandbox', background: 'restaurateur', citySize: 48 };

function withBar(opts = options) {
  const sim = new Simulation(createNewGame(opts));
  const { grid, districts } = sim.state;
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++) {
      if (districts[grid.districtAt(x, y)]!.archetype !== 'neon_market') continue;
      if (!checkPlacement(sim.state, 'ramen_bar', x, y).ok) continue;
      sim.apply({ type: 'placeBuilding', defId: 'ramen_bar', x, y });
      const b = Object.values(sim.state.buildings).find((v) => v.owner === 'player')!;
      if (b.status === 'construction') sim.run(b.buildTime);
      return { sim, b };
    }
  throw new Error('no lot');
}

describe('Population', () => {
  it('generates citizens with homes, jobs and incomes, deterministically', () => {
    const a = createNewGame(options);
    const b = createNewGame(options);
    expect(a.population.citizens.length).toBeGreaterThan(100);
    expect(a.population.citizens.length).toBe(b.population.citizens.length);
    expect(a.population.citizens[10]!.name).toBe(b.population.citizens[10]!.name);
    const employed = a.population.citizens.filter((c) => c.workBuildingId !== null);
    expect(employed.length).toBeGreaterThan(a.population.citizens.length * 0.4);
    for (const c of a.population.citizens) {
      expect(a.buildings[c.homeBuildingId]).toBeDefined();
      if (c.workBuildingId !== null) expect(a.buildings[c.workBuildingId]).toBeDefined();
      expect(c.income >= 0).toBe(true);
    }
    for (const d of a.districts) expect(d.economy.citizens).toBeGreaterThan(0);
  });

  it('citizens follow a daily routine and visit venues at meal times', () => {
    const { sim, b } = withBar();
    sim.run(5 * 60); // 12:00
    const activities = new Set(sim.state.population.citizens.map((c) => c.activity));
    expect(activities.has('work')).toBe(true);
    sim.run(2 * 60); // 14:00
    expect((b.business as GastronomyState).todayCitizenVisits).toBeGreaterThan(0);
    expect((b.business as GastronomyState).todayGuests).toBeGreaterThan(0);
    const fans = sim.state.population.citizens.filter((c) => c.favorites.some((f) => f.venueId === b.id));
    expect(fans.length).toBeGreaterThan(0);
    sim.run(13 * 60); // 03:00 next day
    expect(sim.state.population.citizens.every((c) => c.activity === 'sleep')).toBe(true);
  });

  it('pays incomes and rents at day close and keeps a census per district', () => {
    const sim = new Simulation(createNewGame(options));
    sim.run(17 * 60 + 1);
    const wages = sim.state.districts.reduce((s, d) => s + d.economy.dailyWages, 0);
    const rent = sim.state.districts.reduce((s, d) => s + d.economy.dailyRent, 0);
    expect(wages).toBeGreaterThan(0);
    expect(rent).toBeGreaterThan(0);
    const totalCitizens = sim.state.districts.reduce((s, d) => s + d.economy.citizens, 0);
    expect(totalCitizens).toBe(sim.state.population.citizens.length);
  });

  it('simulates a full day of a 96x96 city fast enough', () => {
    const sim = new Simulation(createNewGame({ ...options, citySize: 96 }));
    expect(sim.state.population.citizens.length).toBeGreaterThan(1000);
    // Best of two days: vitest runs files in parallel workers, a single measurement is noisy.
    let ms = Infinity;
    for (let i = 0; i < 2; i++) {
      const start = performance.now();
      sim.run(MINUTES_PER_DAY);
      ms = Math.min(ms, performance.now() - start);
    }
    expect(ms).toBeLessThan(800);
  });
});

describe('Competitors', () => {
  it('exist from the start, serve citizens and adjust prices', () => {
    const sim = new Simulation(createNewGame(options));
    const ids = Object.keys(sim.state.competitors);
    expect(ids.length).toBeGreaterThan(5);
    const venues = collectVenues(sim.state, 12);
    expect(venues.filter((v) => !v.isPlayer).length).toBe(ids.length);
    sim.run(17 * 60 + 1);
    const served = Object.values(sim.state.competitors).reduce((s, c) => s + (c.history[0]?.served ?? 0), 0);
    expect(served).toBeGreaterThan(0);
    const before = Object.fromEntries(Object.values(sim.state.competitors).map((c) => [c.buildingId, c.priceLevel]));
    sim.run(MINUTES_PER_DAY * 6);
    const changed = Object.values(sim.state.competitors).filter((c) => before[c.buildingId] !== undefined && before[c.buildingId] !== c.priceLevel);
    expect(changed.length).toBeGreaterThan(0);
  });

  it('close when broke and expand into underserved districts', () => {
    const sim = new Simulation(createNewGame(options));
    const victim = Object.values(sim.state.competitors)[0]!;
    victim.cash = -5000;
    sim.run(17 * 60 + 1);
    expect(sim.state.competitors[victim.buildingId]).toBeUndefined();
    expect(sim.state.buildings[victim.buildingId]!.label).toBe('Leerstand');
    expect(sim.state.log.some((l) => l.message.includes('Insolvenz'))).toBe(true);
    const count = Object.keys(sim.state.competitors).length;
    sim.run(MINUTES_PER_DAY * 12);
    expect(Object.keys(sim.state.competitors).length).toBeGreaterThanOrEqual(count);
    expect(sim.state.log.some((l) => l.message.includes('eröffnet'))).toBe(true);
  });
});

describe('Market', () => {
  it('keeps the index within bounds and applies it to supplier prices', () => {
    const { sim } = withBar();
    sim.run(MINUTES_PER_DAY * 10);
    for (const v of Object.values(sim.state.market.index)) {
      expect(v).toBeGreaterThanOrEqual(MARKET_MIN);
      expect(v).toBeLessThanOrEqual(MARKET_MAX);
    }
    sim.state.market.index.noodles = 1.5;
    const expensive = quoteOrder(sim.state, 'market_runner', [{ ingredientId: 'noodles', units: 100 }]);
    sim.state.market.index.noodles = 1.0;
    const normal = quoteOrder(sim.state, 'market_runner', [{ ingredientId: 'noodles', units: 100 }]);
    expect(expensive.ok && normal.ok && expensive.cost > normal.cost).toBe(true);
  });
});

describe('Save format v3', () => {
  it('migrates a v2 save by generating citizens, competitors and market', () => {
    const { sim } = withBar();
    const file = toLegacy(JSON.parse(serialize(sim.state, 'v2')) as SaveFile);
    const raw = JSON.parse(JSON.stringify(file.state)) as Record<string, unknown>;
    delete raw.population;
    delete raw.competitors;
    delete raw.market;
    delete raw.lastCompetitorExpansionDay;
    for (const d of raw.districts as Record<string, unknown>[]) delete d.economy;
    for (const b of Object.values(raw.buildings as Record<string, Record<string, unknown>>)) {
      if (b.business) delete (b.business as Record<string, unknown>).todayCitizenVisits;
    }
    const { state } = deserialize(JSON.stringify({ ...file, version: 2, state: raw }));
    expect(state.version).toBe(SAVE_FORMAT_VERSION);
    expect(state.population.citizens.length).toBeGreaterThan(0);
    expect(Object.keys(state.competitors).length).toBeGreaterThan(0);
    expect(state.market.index.noodles).toBe(1);
    const restored = new Simulation(state);
    restored.run(MINUTES_PER_DAY);
    expect(restored.state.ledger.balanceHistory.length).toBeGreaterThan(1);
  });

  it('round-trips v3 deterministically', () => {
    const { sim } = withBar();
    sim.run(6 * 60);
    const { state } = deserialize(serialize(sim.state, 'x'));
    const restored = new Simulation(state);
    sim.run(MINUTES_PER_DAY);
    restored.run(MINUTES_PER_DAY);
    expect(restored.state.ledger.balance).toBe(sim.state.ledger.balance);
    expect(restored.state.population.citizens[5]!.wealth).toBe(sim.state.population.citizens[5]!.wealth);
  });
});
