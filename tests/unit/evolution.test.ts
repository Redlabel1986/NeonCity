import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { checkPlacement, quotePlacement } from '../../src/sim/systems/construction';
import { BUILDING_DEFINITIONS } from '../../src/sim/data/buildings';
import { EVOLUTION, stageEffects, stageOf, unlockedAlongPath } from '../../src/sim/data/evolution';
import { CANCEL_REFUND, checkEvolution, completeEvolution, franchiseFee, grantFranchise } from '../../src/sim/systems/evolution';
import { effectiveCapacity, isOpen } from '../../src/sim/systems/business';
import { hotelRooms } from '../../src/sim/systems/hotel';
import { fleetCapacity } from '../../src/sim/systems/transport';
import { deserialize, serialize } from '../../src/persistence/serializer';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';
import { Rng } from '../../src/sim/core/rng';
import type { Building, GastronomyState } from '../../src/sim/state';
import type { SimContext } from '../../src/sim/core/context';

const options: NewGameOptions = { progression: false, seed: 'evolve', playerName: 'Gründer', difficulty: 'standard', background: 'restaurateur', citySize: 64 };

function open(sim: Simulation, defId: string): Building {
  const { grid } = sim.state;
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++)
      if (checkPlacement(sim.state, defId, x, y).ok) {
        const quote = quotePlacement(sim.state, BUILDING_DEFINITIONS[defId]!, grid.districtAt(x, y));
        const known = new Set(Object.keys(sim.state.buildings));
        expect(sim.apply({ type: 'placeBuilding', defId, x, y }).ok).toBe(true);
        sim.run(quote.buildTime);
        const b = Object.values(sim.state.buildings).find((c) => !known.has(String(c.id)) && c.owner === 'player' && c.defId === defId)!;
        expect(b.status).toBe('operational');
        return b;
      }
  throw new Error(`no lot for ${defId}`);
}

function ctxOf(sim: Simulation): SimContext {
  return { state: sim.state, events: sim.events, rng: new Rng(7) };
}

describe('Evolution data', () => {
  it('every tree is a connected graph with unique ids, valid successors, ascending levels and known unlocks', () => {
    for (const tree of Object.values(EVOLUTION)) {
      expect(BUILDING_DEFINITIONS[tree.businessTypeId]).toBeDefined();
      expect(tree.stages[tree.initialStageId]!.level).toBe(1);
      for (const s of Object.values(tree.stages)) {
        expect(s.id.startsWith(s.id.split('.')[0]!)).toBe(true);
        for (const n of s.next) {
          expect(tree.stages[n]).toBeDefined();
          expect(tree.stages[n]!.level).toBeGreaterThan(s.level);
        }
        expect(s.cost).toBeGreaterThanOrEqual(0);
        expect(s.pros.length).toBeGreaterThan(0);
      }
      // Reachability: every stage lies on a path from the initial stage.
      const seen = new Set<string>();
      const walk = (id: string): void => {
        if (seen.has(id)) return;
        seen.add(id);
        for (const n of tree.stages[id]!.next) walk(n);
      };
      walk(tree.initialStageId);
      expect(seen.size).toBe(Object.keys(tree.stages).length);
    }
    expect(Object.keys(EVOLUTION).length).toBe(15);
  });
});

describe('Evolution: conversions', () => {
  it('upgrades along a valid path: money is booked, the stage applies after the duration, the look, name, menu and capacity change', () => {
    const sim = new Simulation(createNewGame(options));
    const b = open(sim, 'ramen_bar');
    sim.state.ledger.balance = 1_000_000;
    const seatsBefore = effectiveCapacity(b, sim.state)!.seats;
    const check = checkEvolution(sim.state, b, 'asia.ramen');
    expect(check.reachable).toBe(true);
    expect(check.ok).toBe(true);
    const balance = sim.state.ledger.balance;
    expect(sim.apply({ type: 'startEvolution', buildingId: b.id, stageId: 'asia.ramen' }).ok).toBe(true);
    expect(sim.state.ledger.balance).toBe(balance - check.cost);
    expect(b.stageUpgrade?.toStageId).toBe('asia.ramen');
    expect(effectiveCapacity(b, sim.state)!.upgrading).toBe(true);
    sim.run(check.minutes + 15);
    expect(b.stageUpgrade).toBeUndefined();
    expect(b.stageId).toBe('asia.ramen');
    expect(stageOf(b)!.name).toBe('Ramenbar');
    expect(b.label).toBe('Ramenbar'); // default name follows the stage
    expect(b.floors).toBe(stageOf(b)!.art.floors);
    expect(b.stageHistory).toEqual(['asia.imbiss']);
    expect((b.business as GastronomyState).menu.some((m) => m.recipeId === 'tonkotsu_ramen' && !m.enabled)).toBe(true);
    expect(effectiveCapacity(b, sim.state)!.seats).toBeGreaterThan(seatsBefore);
    expect(stageEffects(b).upkeep).toBeGreaterThan(1);
    expect(sim.drainEvents().some((e) => e.type === 'log' && e.message.includes('Ramenbar'))).toBe(true);
  });

  it('refuses unreachable stages, missing prerequisites and missing capital, each with a reason', () => {
    const sim = new Simulation(createNewGame(options));
    const b = open(sim, 'ramen_bar');
    sim.state.ledger.balance = 0;
    const far = checkEvolution(sim.state, b, 'asia.restaurant');
    expect(far.ok).toBe(false);
    expect(far.reachable).toBe(false);
    expect(far.unmet.some((u) => u.includes('folgt nicht'))).toBe(true);
    const poor = checkEvolution(sim.state, b, 'asia.ramen');
    expect(poor.ok).toBe(false);
    expect(poor.unmet.some((u) => u.includes('Credits'))).toBe(true);
    expect(sim.apply({ type: 'startEvolution', buildingId: b.id, stageId: 'asia.ramen' }).ok).toBe(false);
    // Robot ramen needs research; sushi needs a skilled cook.
    completeEvolution(ctxOf(sim), b, 'asia.neon_ramen');
    sim.state.ledger.balance = 1_000_000;
    const robot = checkEvolution(sim.state, b, 'asia.robot_ramen');
    expect(robot.ok).toBe(false);
    expect(robot.unmet.some((u) => u.includes('Forschung'))).toBe(true);
    const b2 = open(sim, 'ramen_bar');
    completeEvolution(ctxOf(sim), b2, 'asia.ramen');
    completeEvolution(ctxOf(sim), b2, 'asia.izakaya');
    (b2.business as GastronomyState).reputation = 80;
    for (const e of (b2.business as GastronomyState).employees) e.skill = 40;
    sim.state.ledger.balance = 1_000_000;
    const sushi = checkEvolution(sim.state, b2, 'asia.sushi');
    expect(sushi.ok).toBe(false);
    expect(sushi.unmet.some((u) => u.includes('Koch') && u.includes('65'))).toBe(true);
    expect(sim.apply({ type: 'startEvolution', buildingId: b2.id, stageId: 'asia.sushi' }).ok).toBe(false);
    expect(sim.state.ledger.balance).toBe(1_000_000); // nothing was charged for refused conversions
  });

  it('cancels a running conversion with a partial refund and keeps money consistent', () => {
    const sim = new Simulation(createNewGame(options));
    const b = open(sim, 'diner');
    sim.state.ledger.balance = 500_000;
    const check = checkEvolution(sim.state, b, 'imbiss.burger');
    expect(sim.apply({ type: 'startEvolution', buildingId: b.id, stageId: 'imbiss.burger' }).ok).toBe(true);
    const paid = b.stageUpgrade!.paid;
    expect(paid).toBe(check.cost);
    sim.run(30);
    const before = sim.state.ledger.balance;
    expect(sim.apply({ type: 'cancelEvolution', buildingId: b.id }).ok).toBe(true);
    expect(sim.state.ledger.balance).toBe(before + Math.round(paid * CANCEL_REFUND));
    expect(b.stageUpgrade).toBeUndefined();
    expect(b.stageId).toBeUndefined();
    expect(sim.apply({ type: 'cancelEvolution', buildingId: b.id }).ok).toBe(false);
    sim.run(check.minutes + 30);
    expect(stageOf(b)!.id).toBe('imbiss.bude');
  });

  it('survives saving during a conversion and loads old saves without stage ids as the initial stage', () => {
    const sim = new Simulation(createNewGame(options));
    const b = open(sim, 'kiosk');
    sim.state.ledger.balance = 500_000;
    expect(sim.apply({ type: 'startEvolution', buildingId: b.id, stageId: 'shop.store' }).ok).toBe(true);
    const minutes = b.stageUpgrade!.readyTick - sim.state.tick;
    const text = serialize(sim.world, 'Mitten im Umbau');
    const loaded = new Simulation(deserialize(text).state);
    const lb = loaded.state.buildings[b.id]!;
    expect(lb.stageUpgrade?.toStageId).toBe('shop.store');
    loaded.run(minutes + 15);
    expect(loaded.state.buildings[b.id]!.stageId).toBe('shop.store');
    // Old save: no stage fields at all.
    const raw = JSON.parse(text) as { state: { buildings: Record<string, Record<string, unknown>> } };
    for (const x of Object.values(raw.state.buildings)) {
      delete x.stageId;
      delete x.stageUpgrade;
      delete x.stageHistory;
    }
    const old = deserialize(JSON.stringify(raw)).state;
    const ob = old.buildings[b.id]!;
    expect(stageOf(ob)!.id).toBe('shop.kiosk');
    expect(stageEffects(ob).capacity).toBe(1);
  });

  it('specialisations differ in real effects: an izakaya opens at night, a drive-in around the clock, omakase has few seats and high prices', () => {
    const sim = new Simulation(createNewGame(options));
    const a = open(sim, 'ramen_bar');
    const c = open(sim, 'ramen_bar');
    completeEvolution(ctxOf(sim), a, 'asia.ramen');
    completeEvolution(ctxOf(sim), a, 'asia.izakaya');
    completeEvolution(ctxOf(sim), c, 'asia.noodle');
    completeEvolution(ctxOf(sim), c, 'asia.china');
    const model = BUILDING_DEFINITIONS.ramen_bar!.business!;
    if (model.kind !== 'gastronomy') throw new Error('model');
    expect(isOpen(model, 12, a)).toBe(false);
    expect(isOpen(model, 23, a)).toBe(true);
    expect(isOpen(model, 12, c)).toBe(true);
    expect(stageEffects(c).capacity).toBeGreaterThan(stageEffects(a).capacity);
    expect(unlockedAlongPath(a).recipes).toContain('yakitori');
    expect(unlockedAlongPath(c).recipes).toContain('dim_sum');
    expect(unlockedAlongPath(a).recipes).not.toContain('dim_sum');
    const d = open(sim, 'diner');
    completeEvolution(ctxOf(sim), d, 'imbiss.burger');
    completeEvolution(ctxOf(sim), d, 'imbiss.fastfood');
    completeEvolution(ctxOf(sim), d, 'imbiss.drivein');
    const dinerModel = BUILDING_DEFINITIONS.diner!.business!;
    if (dinerModel.kind !== 'gastronomy') throw new Error('model');
    expect(isOpen(dinerModel, 4, d)).toBe(true);
    const omakase = EVOLUTION.ramen_bar!.stages['asia.omakase']!;
    const chain = EVOLUTION.diner!.stages['imbiss.franchise']!;
    expect(omakase.effects.price).toBeGreaterThan(chain.effects.price * 2);
    expect(chain.effects.capacity).toBeGreaterThan(omakase.effects.capacity * 3);
  });

  it('hotels and taxis evolve too: rooms, extra revenue per stay, driverless fleets', () => {
    const sim = new Simulation(createNewGame(options));
    sim.state.ledger.balance = 2_000_000;
    const h = open(sim, 'capsule_hotel');
    const rooms = hotelRooms(h);
    completeEvolution(ctxOf(sim), h, 'hotel.budget');
    completeEvolution(ctxOf(sim), h, 'hotel.business');
    completeEvolution(ctxOf(sim), h, 'hotel.luxury');
    expect(hotelRooms(h)).toBeGreaterThan(rooms);
    expect(stageEffects(h).extraPerStay).toBe(25);
    const t = open(sim, 'taxi_depot');
    const biz = t.business!;
    if (biz.kind !== 'transport') throw new Error('kind');
    biz.employees = []; // no drivers at all
    expect(fleetCapacity(t, sim.state)!.ridesPerHour).toBe(0);
    completeEvolution(ctxOf(sim), t, 'taxi.fleet');
    completeEvolution(ctxOf(sim), t, 'taxi.autonomous');
    expect(fleetCapacity(t, sim.state)!.ridesPerHour).toBeGreaterThan(0); // vehicles drive themselves
  });

  it('selling the company kills a running conversion; two branches convert in parallel; unlocks are never duplicated', () => {
    const sim = new Simulation(createNewGame(options));
    const a = open(sim, 'ramen_bar');
    const c = open(sim, 'ramen_bar');
    sim.state.ledger.balance = 2_000_000;
    expect(sim.apply({ type: 'startEvolution', buildingId: a.id, stageId: 'asia.ramen' }).ok).toBe(true);
    expect(sim.apply({ type: 'startEvolution', buildingId: c.id, stageId: 'asia.korean_street' }).ok).toBe(true);
    const minutes = Math.max(a.stageUpgrade!.readyTick, c.stageUpgrade!.readyTick) - sim.state.tick;
    sim.run(minutes + 15);
    expect(a.stageId).toBe('asia.ramen');
    expect(c.stageId).toBe('asia.korean_street');
    // Completing a stage twice adds its recipes once.
    completeEvolution(ctxOf(sim), a, 'asia.ramen');
    const menu = (a.business as GastronomyState).menu.filter((m) => m.recipeId === 'tonkotsu_ramen');
    expect(menu).toHaveLength(1);
    expect(a.stageHistory).toEqual(['asia.imbiss']);
    // Sale during a conversion.
    (a.business as GastronomyState).reputation = 80;
    expect(sim.apply({ type: 'startEvolution', buildingId: a.id, stageId: 'asia.izakaya' }).ok).toBe(true);
    expect(sim.apply({ type: 'sellCompany' }).ok).toBe(true);
    expect(a.owner).toBe('city');
    expect(a.stageUpgrade).toBeUndefined();
    sim.run(MINUTES_PER_DAY);
    expect(a.stageId).toBe('asia.ramen');
  });

  it('franchise contracts pay daily fees once the brand stage allows them; critics hand out stars', () => {
    const sim = new Simulation(createNewGame(options));
    const b = open(sim, 'diner');
    const biz = b.business as GastronomyState;
    expect(grantFranchise(ctxOf(sim), b).ok).toBe(false);
    for (const id of ['imbiss.burger', 'imbiss.fastfood', 'imbiss.drivein', 'imbiss.franchise']) completeEvolution(ctxOf(sim), b, id);
    biz.reputation = 70;
    expect(grantFranchise(ctxOf(sim), b).ok).toBe(true);
    expect(b.franchises).toBe(1);
    const fee = franchiseFee(b);
    expect(fee).toBeGreaterThan(0);
    sim.run(MINUTES_PER_DAY);
    expect(sim.state.ledger.transactions.some((t) => t.description.startsWith('Franchise-Gebühren') && t.amount > 0)).toBe(true);
    // Stars: a star restaurant with excellent quality collects stars over a few weeks.
    const s = open(sim, 'ramen_bar');
    for (const id of ['asia.ramen', 'asia.restaurant', 'asia.premium', 'asia.star']) completeEvolution(ctxOf(sim), s, id);
    const sb = s.business as GastronomyState;
    sb.quality = 92;
    sb.hygiene = 95;
    sb.history.push({ day: 0, guests: 50, revenue: 5000, costs: 3000, cogs: 1000, wages: 1500, purchases: 500, satisfaction: 88, turnedAway: 0, lostNoIngredients: 0, waste: 0 });
    let stars = 0;
    for (let day = 0; day < 40 && stars === 0; day++) {
      sim.run(MINUTES_PER_DAY);
      sb.quality = 92;
      sb.hygiene = 95;
      const last = sb.history[sb.history.length - 1];
      if (last) last.satisfaction = 88;
      stars = s.stars ?? 0;
    }
    expect(stars).toBeGreaterThan(0);
  });
});
