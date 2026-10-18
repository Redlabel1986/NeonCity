import { toLegacy } from './legacy';
import { describe, expect, it } from 'vitest';
import type { GastronomyState } from '../../src/sim/state';
import { createNewGame, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { checkPlacement } from '../../src/sim/systems/construction';
import { canMake, placeOrder, quoteOrder, servingsPossible, spoilInventory, stockOf, storageCapacity, totalUnits } from '../../src/sim/systems/inventory';
import { effectiveCapacity, explainDemand } from '../../src/sim/systems/business';
import { expectedWage } from '../../src/sim/systems/staff';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';
import { serialize, deserialize, type SaveFile } from '../../src/persistence/serializer';
import { SAVE_FORMAT_VERSION } from '../../src/sim/engine';
import type { Building } from '../../src/sim/state';
import { Rng } from '../../src/sim/core/rng';

const options: NewGameOptions = { progression: false, seed: 'phase2', playerName: 'Chef', difficulty: 'sandbox', background: 'restaurateur', citySize: 48 };

function withRamenBar(opts: NewGameOptions = options): { sim: Simulation; b: Building } {
  const sim = new Simulation(createNewGame(opts));
  const { grid, districts } = sim.state;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (districts[grid.districtAt(x, y)]!.archetype !== 'neon_market') continue;
      if (!checkPlacement(sim.state, 'ramen_bar', x, y).ok) continue;
      sim.apply({ type: 'placeBuilding', defId: 'ramen_bar', x, y });
      const b = Object.values(sim.state.buildings).find((v) => v.owner === 'player')!;
      if (b.status === 'construction') sim.run(b.buildTime);
      return { sim, b };
    }
  }
  throw new Error('no lot');
}

describe('Inventory and supply', () => {
  it('starts with stock, consumes ingredients while serving and tracks cost of goods', () => {
    const { sim, b } = withRamenBar();
    const biz = b.business as GastronomyState;
    const before = totalUnits(biz);
    expect(before).toBeGreaterThan(0);
    sim.run(7 * 60); // -> 14:00
    expect(totalUnits(biz)).toBeLessThan(before);
    expect(biz.todayCogs).toBeGreaterThan(0);
    expect(Object.keys(biz.todayConsumed).length).toBeGreaterThan(0);
  });

  it('without ingredients no guest is served and lost guests are counted', () => {
    const { sim, b } = withRamenBar();
    const biz = b.business as GastronomyState;
    biz.inventory = [];
    biz.autoReorder = false;
    sim.run(7 * 60);
    expect(biz.todayGuests).toBe(0);
    expect(biz.todayLostNoIngredients).toBeGreaterThan(0);
    expect(biz.menu.every((m) => !canMake(biz, m.recipeId))).toBe(true);
    expect(sim.state.log.some((l) => l.message.includes('Keine Zutaten'))).toBe(true);
  });

  it('orders are paid immediately, respect minimum order and storage, and are delivered later', () => {
    const { sim, b } = withRamenBar({ ...options, difficulty: 'standard' });
    sim.state.ledger.balance = 5000;
    const biz = b.business as GastronomyState;
    const tooSmall = quoteOrder(sim.state, 'chrome_fresh', [{ ingredientId: 'noodles', units: 5 }]);
    expect(tooSmall.ok).toBe(false);
    const tooBig = placeOrder({ state: sim.state, events: sim.events, rng: new Rng(1) }, b, 'market_runner', [{ ingredientId: 'noodles', units: 5000 }]);
    expect(tooBig.ok).toBe(false);
    const stockBefore = stockOf(biz, 'noodles');
    const balance = sim.state.ledger.balance;
    const result = sim.apply({ type: 'placeOrder', buildingId: b.id, supplierId: 'market_runner', items: [{ ingredientId: 'noodles', units: 40 }, { ingredientId: 'broth', units: 30 }] });
    expect(result.ok).toBe(true);
    expect(sim.state.ledger.balance).toBeLessThan(balance);
    expect(biz.orders).toHaveLength(1);
    expect(biz.todayPurchases).toBeGreaterThan(0);
    sim.run(2 * 60);
    expect(stockOf(biz, 'noodles')).toBeLessThanOrEqual(stockBefore); // not yet delivered (4h+)
    sim.run(6 * 60);
    expect(biz.orders).toHaveLength(0);
    expect(stockOf(biz, 'noodles')).toBeGreaterThan(stockBefore - 40);
    expect(totalUnits(biz)).toBeLessThanOrEqual(storageCapacity(b));
  });

  it('rejects orders the player cannot afford and unknown suppliers', () => {
    const { sim, b } = withRamenBar({ ...options, difficulty: 'standard' });
    sim.state.ledger.balance = 10;
    expect(sim.apply({ type: 'placeOrder', buildingId: b.id, supplierId: 'market_runner', items: [{ ingredientId: 'noodles', units: 60 }] }).ok).toBe(false);
    expect(sim.state.ledger.balance).toBe(10);
    expect(sim.apply({ type: 'placeOrder', buildingId: b.id, supplierId: 'nope', items: [{ ingredientId: 'noodles', units: 60 }] }).ok).toBe(false);
    expect(sim.apply({ type: 'placeOrder', buildingId: b.id, supplierId: 'undercity_dealer', items: [{ ingredientId: 'drinks', units: 60 }] }).ok).toBe(false);
  });

  it('spoils old lots at day close and automatic reorders restore stock', () => {
    const { sim, b } = withRamenBar();
    const biz = b.business as GastronomyState;
    const waste = spoilInventory(b, 100);
    expect(waste).toBeGreaterThan(0);
    expect(totalUnits(biz)).toBe(0);
    expect(servingsPossible(biz, 'shoyu_ramen')).toBe(0);
    biz.autoReorder = true;
    sim.run(17 * 60); // day close triggers reorder
    expect(biz.orders.length + biz.inventory.length).toBeGreaterThan(0);
    sim.run(12 * 60);
    expect(totalUnits(biz)).toBeGreaterThan(0);
    expect(sim.state.tasks.find((t) => t.id === 'order_supplies')!.completedTick).not.toBeNull();
  });
});

describe('Staff', () => {
  it('no cook means no capacity, hiring a cook restores it', () => {
    const { sim, b } = withRamenBar();
    const biz = b.business as GastronomyState;
    const cook = biz.employees.find((e) => e.role === 'cook')!;
    expect(effectiveCapacity(b)!.capacity).toBeGreaterThan(0);
    expect(sim.apply({ type: 'fire', buildingId: b.id, employeeId: cook.id }).ok).toBe(true);
    expect(effectiveCapacity(b)!.capacity).toBe(0);
    sim.run(7 * 60);
    expect(biz.todayGuests).toBe(0);
    const candidate = biz.candidates.find((c) => c.role === 'cook') ?? biz.candidates[0]!;
    candidate.role = 'cook';
    expect(sim.apply({ type: 'hire', buildingId: b.id, candidateId: candidate.id }).ok).toBe(true);
    expect(effectiveCapacity(b)!.capacity).toBeGreaterThan(0);
    expect(sim.apply({ type: 'hire', buildingId: b.id, candidateId: candidate.id }).ok).toBe(false);
    expect(sim.state.tasks.find((t) => t.id === 'hire_staff')!.completedTick).not.toBeNull();
  });

  it('pays each employee daily, severance on firing, and morale drops when underpaid', () => {
    const { sim, b } = withRamenBar();
    const biz = b.business as GastronomyState;
    const e = biz.employees[0]!;
    expect(sim.apply({ type: 'setWage', buildingId: b.id, employeeId: e.id, wage: 20 }).ok).toBe(true);
    expect(sim.apply({ type: 'setWage', buildingId: b.id, employeeId: e.id, wage: 5 }).ok).toBe(false);
    const wagesTotal = biz.employees.reduce((s, x) => s + x.wage, 0);
    const moraleBefore = e.morale;
    sim.run(17 * 60);
    const wages = sim.state.ledger.transactions.filter((t) => t.category === 'wages').reduce((s, t) => s + t.amount, 0);
    expect(-wages).toBe(wagesTotal);
    expect(e.morale).toBeLessThan(moraleBefore);
    expect(expectedWage('cook', 50)).toBeGreaterThan(expectedWage('service', 50));
    const other = biz.employees[1]!;
    const balance = sim.state.ledger.balance;
    expect(sim.apply({ type: 'fire', buildingId: b.id, employeeId: other.id }).ok).toBe(true);
    expect(sim.state.ledger.balance).toBe(balance - other.wage * 3);
  });

  it('employees with low morale eventually quit', () => {
    const { sim, b } = withRamenBar();
    const biz = b.business as GastronomyState;
    for (const e of biz.employees) {
      sim.apply({ type: 'setWage', buildingId: b.id, employeeId: e.id, wage: 20 });
      e.morale = 5;
    }
    sim.run(MINUTES_PER_DAY * 8);
    expect(biz.employees.length).toBeLessThan(2);
    expect(sim.state.log.some((l) => l.message.includes('gekündigt'))).toBe(true);
  });
});

describe('Menu, satisfaction and upgrades', () => {
  it('keeps at least one dish enabled and sells only enabled dishes', () => {
    const { sim, b } = withRamenBar();
    const biz = b.business as GastronomyState;
    const enabled = biz.menu.filter((m) => m.enabled);
    for (const m of enabled.slice(1)) expect(sim.apply({ type: 'toggleMenuItem', buildingId: b.id, recipeId: m.recipeId, enabled: false }).ok).toBe(true);
    expect(sim.apply({ type: 'toggleMenuItem', buildingId: b.id, recipeId: enabled[0]!.recipeId, enabled: false }).ok).toBe(false);
    sim.run(7 * 60);
    for (const m of biz.menu) if (!m.enabled) expect(m.soldToday).toBe(0);
    expect(biz.menu.find((m) => m.enabled)!.soldToday).toBeGreaterThan(0);
  });

  it('satisfaction drives reputation and ratings at day close', () => {
    const { sim, b } = withRamenBar();
    const biz = b.business as GastronomyState;
    sim.run(17 * 60);
    expect(biz.reviewCount).toBeGreaterThan(0);
    expect(biz.rating).toBeGreaterThanOrEqual(1);
    expect(biz.rating).toBeLessThanOrEqual(5);
    expect(biz.history[0]!.satisfaction).toBeGreaterThan(0);
    expect(biz.quality).toBeGreaterThan(0);
  });

  it('upgrades cost credits, take time, then change capacity and demand', () => {
    const { sim, b } = withRamenBar({ ...options, difficulty: 'standard' });
    sim.state.ledger.balance = 50000;
    const biz = b.business as GastronomyState;
    const capBefore = effectiveCapacity(b)!.seats;
    const drawBefore = explainDemand(sim.state, b)!.upgrades;
    const balance = sim.state.ledger.balance;
    expect(sim.apply({ type: 'startUpgrade', buildingId: b.id, upgradeId: 'seating' }).ok).toBe(true);
    expect(sim.state.ledger.balance).toBeLessThan(balance);
    expect(biz.upgradeInProgress?.id).toBe('seating');
    expect(sim.apply({ type: 'startUpgrade', buildingId: b.id, upgradeId: 'kitchen' }).ok).toBe(false);
    expect(effectiveCapacity(b)!.upgrading).toBe(true);
    sim.run(10 * 60);
    expect(biz.upgradeInProgress).toBeNull();
    expect(biz.upgrades.seating).toBe(1);
    expect(effectiveCapacity(b)!.seats).toBeGreaterThan(capBefore);
    expect(sim.apply({ type: 'startUpgrade', buildingId: b.id, upgradeId: 'marketing' }).ok).toBe(true);
    sim.run(6 * 60);
    expect(explainDemand(sim.state, b)!.upgrades).toBeGreaterThan(drawBefore);
    expect(sim.apply({ type: 'startUpgrade', buildingId: b.id, upgradeId: 'nope' }).ok).toBe(false);
    sim.state.ledger.balance = 0;
    expect(sim.apply({ type: 'startUpgrade', buildingId: b.id, upgradeId: 'kitchen' }).ok).toBe(false);
  });

  it('hygiene falls with guests and recovers at night', () => {
    const { sim, b } = withRamenBar();
    const biz = b.business as GastronomyState;
    const start = biz.hygiene;
    sim.run(12 * 60); // 07 -> 19, many guests
    expect(biz.hygiene).toBeLessThan(start);
    const evening = biz.hygiene;
    sim.run(5 * 60 + 1); // past midnight
    expect(biz.hygiene).toBeGreaterThan(evening);
  });
});

describe('Save compatibility', () => {
  it('migrates a version 1 save to the current format', () => {
    const { sim } = withRamenBar();
    const file = toLegacy(JSON.parse(serialize(sim.state, 'v1')) as SaveFile);
    const legacyState = JSON.parse(JSON.stringify(file.state)) as Record<string, unknown>;
    const buildings = legacyState.buildings as Record<string, Record<string, unknown>>;
    for (const b of Object.values(buildings)) {
      if (!b.business) continue;
      b.business = { kind: 'gastronomy', price: 22, quality: 60, reputation: 50, staff: 2, todayGuests: 0, todayRevenue: 0, todayCosts: 0, lifetimeGuests: 321, lifetimeRevenue: 5000, todayTurnedAway: 0, history: [] };
    }
    const legacy = { ...file, version: 1, state: legacyState };
    const { state } = deserialize(JSON.stringify(legacy));
    expect(state.version).toBe(SAVE_FORMAT_VERSION);
    const migrated = Object.values(state.buildings).find((b) => b.owner === 'player')!;
    const mb = migrated.business as GastronomyState;
    expect(mb.menu.length).toBeGreaterThan(0);
    expect(mb.employees.length).toBe(2);
    expect(mb.lifetimeGuests).toBe(321);
    expect(mb.reputation).toBe(50);
    // price ratio 22/18 applied
    expect(mb.menu.find((m) => m.recipeId === 'shoyu_ramen')!.price).toBe(22);
    const restored = new Simulation(state);
    restored.run(MINUTES_PER_DAY);
    expect(restored.state.tick).toBe(sim.state.tick + MINUTES_PER_DAY);
  });

  it('round-trips the version 2 state and stays deterministic', () => {
    const { sim } = withRamenBar();
    sim.run(MINUTES_PER_DAY + 60);
    const text = serialize(sim.state, 'x');
    const { state } = deserialize(text);
    const restored = new Simulation(state);
    sim.run(MINUTES_PER_DAY);
    restored.run(MINUTES_PER_DAY);
    expect(restored.state.ledger.balance).toBe(sim.state.ledger.balance);
    const a = Object.values(sim.state.buildings).find((b) => b.owner === 'player')!.business as GastronomyState;
    const r = Object.values(restored.state.buildings).find((b) => b.owner === 'player')!.business as GastronomyState;
    expect(r.lifetimeGuests).toBe(a.lifetimeGuests);
    expect(r.employees.map((e) => e.morale)).toEqual(a.employees.map((e) => e.morale));
  });
});
