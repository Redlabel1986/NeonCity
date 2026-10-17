import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { checkPlacement } from '../../src/sim/systems/construction';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';
import type { Building, HotelState, RetailState, TransportState, GastronomyState } from '../../src/sim/state';
import { hotelRooms } from '../../src/sim/systems/hotel';
import { fleetCapacity } from '../../src/sim/systems/transport';
import { dailyRent, isResidential, propertyPrice } from '../../src/sim/systems/property';
import { serialize, deserialize } from '../../src/persistence/serializer';

const options: NewGameOptions = { seed: 'phase4', playerName: 'Tycoon', difficulty: 'sandbox', background: 'heir', citySize: 48 };

function build(sim: Simulation, defId: string, archetype?: string): Building {
  const { grid, districts } = sim.state;
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++) {
      if (archetype && districts[grid.districtAt(x, y)]!.archetype !== archetype) continue;
      if (!checkPlacement(sim.state, defId, x, y).ok) continue;
      const before = new Set(Object.keys(sim.state.buildings));
      expect(sim.apply({ type: 'placeBuilding', defId, x, y }).ok).toBe(true);
      const b = Object.values(sim.state.buildings).find((v) => v.owner === 'player' && !before.has(String(v.id)))!;
      if (b.status === 'construction') sim.run(b.buildTime);
      return b;
    }
  throw new Error(`no lot for ${defId}`);
}

describe('Hotel', () => {
  it('takes check-ins, books revenue, pays room costs and rates guests', () => {
    const sim = new Simulation(createNewGame(options));
    const b = build(sim, 'capsule_hotel', 'corporate_heights');
    const biz = b.business as HotelState;
    expect(biz.kind).toBe('hotel');
    expect(hotelRooms(b)).toBe(24);
    const balance = sim.state.ledger.balance;
    sim.run(17 * 60 + 1);
    expect(biz.lifetimeGuests).toBeGreaterThan(0);
    expect(biz.history).toHaveLength(1);
    expect(biz.history[0]!.revenue).toBeGreaterThan(0);
    expect(sim.state.ledger.transactions.some((t) => t.description.includes('Zimmerkosten'))).toBe(true);
    expect(sim.state.ledger.balance).not.toBe(balance);
    sim.run(MINUTES_PER_DAY * 3);
    expect(biz.reviewCount).toBeGreaterThan(0);
    expect(biz.stays.length).toBeLessThanOrEqual(hotelRooms(b));
  });

  it('room price is clamped and raises or lowers demand; room upgrade adds rooms', () => {
    const sim = new Simulation(createNewGame(options));
    const b = build(sim, 'capsule_hotel');
    const biz = b.business as HotelState;
    sim.apply({ type: 'setRoomPrice', buildingId: b.id, price: 9999 });
    expect(biz.pricePerNight).toBe(95);
    sim.apply({ type: 'setRoomPrice', buildingId: b.id, price: 1 });
    expect(biz.pricePerNight).toBe(19);
    expect(sim.apply({ type: 'startUpgrade', buildingId: b.id, upgradeId: 'rooms' }).ok).toBe(true);
    expect(hotelRooms(b)).toBe(32);
    expect(sim.apply({ type: 'startUpgrade', buildingId: b.id, upgradeId: 'kitchen' }).ok).toBe(false);
  });
});

describe('Transport', () => {
  it('completes rides with drivers and vehicles, buys and sells vehicles', () => {
    const sim = new Simulation(createNewGame(options));
    const b = build(sim, 'taxi_depot', 'neon_market');
    const biz = b.business as TransportState;
    expect(biz.vehicles).toHaveLength(2);
    expect(fleetCapacity(b)!.ridesPerHour).toBeGreaterThan(0);
    sim.run(17 * 60 + 1);
    expect(biz.lifetimeRides).toBeGreaterThan(0);
    expect(biz.history[0]!.revenue).toBeGreaterThan(0);
    expect(sim.state.ledger.transactions.some((t) => t.description.includes('Energie'))).toBe(true);
    const before = sim.state.ledger.balance;
    expect(sim.apply({ type: 'buyVehicle', buildingId: b.id }).ok).toBe(true);
    expect(biz.vehicles).toHaveLength(3);
    expect(sim.state.ledger.balance).toBeLessThan(before);
    expect(sim.apply({ type: 'sellVehicle', buildingId: b.id, vehicleId: biz.vehicles[2]!.id }).ok).toBe(true);
    expect(biz.vehicles).toHaveLength(2);
    sim.apply({ type: 'setFare', buildingId: b.id, fare: 500 });
    expect(biz.fare).toBe(35);
  });

  it('without drivers no rides happen', () => {
    const sim = new Simulation(createNewGame(options));
    const b = build(sim, 'taxi_depot');
    const biz = b.business as TransportState;
    for (const e of [...biz.employees]) sim.apply({ type: 'fire', buildingId: b.id, employeeId: e.id });
    sim.run(12 * 60);
    expect(biz.todayRides).toBe(0);
    expect(biz.todayMissed).toBeGreaterThan(0);
  });
});

describe('Retail', () => {
  it('sells goods from stock, books revenue and cost of goods, and reorders', () => {
    const sim = new Simulation(createNewGame(options));
    const b = build(sim, 'kiosk', 'neon_market');
    const biz = b.business as RetailState;
    sim.run(13 * 60); // 07 -> 20
    expect(biz.todayCustomers).toBeGreaterThan(0);
    expect(biz.todayRevenue).toBeGreaterThan(biz.todayCogs);
    expect(biz.todayCitizenVisits).toBeGreaterThanOrEqual(0);
    sim.run(4 * 60 + 1);
    expect(biz.history[0]!.customers).toBeGreaterThan(0);
    expect(biz.orders.length + biz.inventory.length).toBeGreaterThan(0);
  });

  it('empty shelves lose customers; prices are clamped', () => {
    const sim = new Simulation(createNewGame(options));
    const b = build(sim, 'kiosk');
    const biz = b.business as RetailState;
    biz.inventory = [];
    biz.autoReorder = false;
    sim.run(13 * 60);
    expect(biz.todayCustomers).toBe(0);
    expect(biz.todayLostNoStock).toBeGreaterThan(0);
    sim.apply({ type: 'setGoodPrice', buildingId: b.id, goodId: 'snacks', price: 100 });
    expect(biz.prices.snacks).toBeCloseTo(7.7, 1);
    expect(sim.apply({ type: 'setGoodPrice', buildingId: b.id, goodId: 'noodles', price: 2 }).ok).toBe(false);
  });
});

describe('Real estate', () => {
  it('buys a residential building, collects rent from tenants, renovates and sells', () => {
    const sim = new Simulation(createNewGame({ ...options, difficulty: 'standard' }));
    sim.state.ledger.balance = 500000;
    const target = Object.values(sim.state.buildings).find((b) => b.owner === 'city' && isResidential(b) && sim.state.population.citizens.some((c) => c.homeBuildingId === b.id))!;
    const price = propertyPrice(sim.state, target);
    expect(price).toBeGreaterThan(0);
    const before = sim.state.ledger.balance;
    expect(sim.apply({ type: 'buyProperty', buildingId: target.id }).ok).toBe(true);
    expect(sim.state.ledger.balance).toBe(before - price);
    expect(target.owner).toBe('player');
    expect(target.property).toBeDefined();
    expect(dailyRent(sim.state, target)).toBeGreaterThan(0);
    sim.run(17 * 60 + 1);
    expect(sim.state.ledger.transactions.some((t) => t.category === 'rent' && t.amount > 0)).toBe(true);
    expect(target.property!.lifetimeRent).toBeGreaterThan(0);
    expect(sim.apply({ type: 'setRentLevel', buildingId: target.id, level: 1.4 }).ok).toBe(true);
    expect(target.property!.rentLevel).toBe(1.4);
    target.property!.condition = 50;
    expect(sim.apply({ type: 'renovate', buildingId: target.id }).ok).toBe(true);
    expect(dailyRent(sim.state, target)).toBe(0); // during renovation
    sim.run(37 * 60);
    expect(dailyRent(sim.state, target)).toBeGreaterThan(0);
    expect(sim.apply({ type: 'sellProperty', buildingId: target.id }).ok).toBe(true);
    expect(target.owner).toBe('city');
    expect(target.property).toBeUndefined();
    expect(sim.state.tasks.find((t) => t.id === 'landlord')!.completedTick).not.toBeNull();
  });

  it('cannot buy without money and cannot buy twice', () => {
    const sim = new Simulation(createNewGame({ ...options, difficulty: 'standard' }));
    sim.state.ledger.balance = 10;
    const target = Object.values(sim.state.buildings).find((b) => b.owner === 'city')!;
    expect(sim.apply({ type: 'buyProperty', buildingId: target.id }).ok).toBe(false);
    sim.state.ledger.balance = 10_000_000;
    expect(sim.apply({ type: 'buyProperty', buildingId: target.id }).ok).toBe(true);
    expect(sim.apply({ type: 'buyProperty', buildingId: target.id }).ok).toBe(false);
  });

  it('takes over a competitor venue which becomes a player diner', () => {
    const sim = new Simulation(createNewGame(options));
    const c = Object.values(sim.state.competitors)[0]!;
    const before = Object.keys(sim.state.competitors).length;
    expect(sim.apply({ type: 'takeoverCompetitor', buildingId: c.buildingId }).ok).toBe(true);
    expect(Object.keys(sim.state.competitors).length).toBe(before - 1);
    const b = sim.state.buildings[c.buildingId]!;
    expect(b.owner).toBe('player');
    expect(b.defId).toBe('diner');
    expect((b.business as GastronomyState).kind).toBe('gastronomy');
    expect((b.business as GastronomyState).reputation).toBe(c.reputation);
    sim.run(8 * 60);
    expect((b.business as GastronomyState).todayGuests).toBeGreaterThan(0);
    expect(sim.apply({ type: 'takeoverCompetitor', buildingId: c.buildingId }).ok).toBe(false);
  });
});

describe('Save format v4', () => {
  it('round-trips all business kinds and properties', () => {
    const sim = new Simulation(createNewGame(options));
    build(sim, 'capsule_hotel');
    build(sim, 'taxi_depot');
    build(sim, 'kiosk');
    const house = Object.values(sim.state.buildings).find((b) => b.owner === 'city' && isResidential(b))!;
    sim.apply({ type: 'buyProperty', buildingId: house.id });
    sim.run(MINUTES_PER_DAY + 30);
    const { state } = deserialize(serialize(sim.state, 'v4'));
    const restored = new Simulation(state);
    sim.run(MINUTES_PER_DAY);
    restored.run(MINUTES_PER_DAY);
    expect(restored.state.ledger.balance).toBe(sim.state.ledger.balance);
    const kinds = new Set(Object.values(restored.state.buildings).filter((b) => b.owner === 'player' && b.business).map((b) => b.business!.kind));
    expect(kinds).toEqual(new Set(['hotel', 'transport', 'retail']));
    expect(restored.state.buildings[house.id]!.property).toBeDefined();
  });
});
