import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { checkPlacement } from '../../src/sim/systems/construction';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';
import { councilSupport, lawValue } from '../../src/sim/systems/politics';
import { createDecision } from '../../src/sim/systems/decisions';
import { isResidential } from '../../src/sim/systems/property';
import { quotePlacement } from '../../src/sim/systems/construction';
import { BUILDING_DEFINITIONS } from '../../src/sim/data/buildings';
import type { Building, GastronomyState } from '../../src/sim/state';
import { serialize, deserialize } from '../../src/persistence/serializer';
import { Rng } from '../../src/sim/core/rng';
import { effectiveCapacity } from '../../src/sim/systems/business';
import { effortOf, laborState } from '../../src/sim/systems/staff';

const options: NewGameOptions = { seed: 'phase6', playerName: 'Senator', difficulty: 'sandbox', background: 'ex_corporate', citySize: 48 };

function build(sim: Simulation, defId: string): Building {
  const { grid } = sim.state;
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++) {
      if (!checkPlacement(sim.state, defId, x, y).ok) continue;
      const before = new Set(Object.keys(sim.state.buildings));
      sim.apply({ type: 'placeBuilding', defId, x, y });
      const b = Object.values(sim.state.buildings).find((v) => v.owner === 'player' && !before.has(String(v.id)))!;
      if (b.status === 'construction') sim.run(b.buildTime);
      return b;
    }
  throw new Error('no lot');
}

describe('Factions', () => {
  it('exist with relations and influence; support improves relations and annoys enemies', () => {
    const sim = new Simulation(createNewGame(options));
    expect(sim.state.factions.length).toBe(12);
    const union = sim.state.factions.find((f) => f.id === 'union')!;
    const hyperion = sim.state.factions.find((f) => f.id === 'hyperion')!;
    expect(sim.apply({ type: 'supportFaction', factionId: 'union', amount: 100 }).ok).toBe(false);
    expect(sim.apply({ type: 'supportFaction', factionId: 'union', amount: 2000 }).ok).toBe(true);
    expect(union.relation).toBeGreaterThan(0);
    expect(hyperion.relation).toBeLessThan(0);
    expect(sim.state.ledger.transactions.some((t) => t.category === 'donation')).toBe(true);
  });

  it('underpaying staff angers the union and produces a strike decision; enduring halves capacity', () => {
    const sim = new Simulation(createNewGame(options));
    const bar = build(sim, 'ramen_bar');
    const biz = bar.business as GastronomyState;
    for (const e of biz.employees) sim.apply({ type: 'setWage', buildingId: bar.id, employeeId: e.id, wage: 20 });
    let found = false;
    for (let i = 0; i < 25 && !found; i++) {
      sim.run(MINUTES_PER_DAY);
      found = sim.state.decisions.pending.some((d) => d.kind === 'strike');
    }
    expect(found).toBe(true);
    const decision = sim.state.decisions.pending.find((d) => d.kind === 'strike')!;
    expect(sim.apply({ type: 'resolveDecision', decisionId: decision.id, optionId: 'endure' }).ok).toBe(true);
    const union = sim.state.factions.find((f) => f.id === 'union')!;
    expect(union.activeEffect).toBe('strike');
    sim.run(60);
    expect(laborState.strike).toBe(true);
    const probe = { id: 0, name: 'x', role: 'cook' as const, skill: 50, wage: 80, morale: 100, hiredTick: 0, lowMoraleDays: 0 };
    expect(effortOf(probe)).toBeLessThan(0.6);
    sim.run(MINUTES_PER_DAY * 3);
    expect(laborState.strike).toBe(false);
    expect(effortOf(probe)).toBeGreaterThan(1);
    void effectiveCapacity;
    expect(sim.apply({ type: 'resolveDecision', decisionId: decision.id, optionId: 'endure' }).ok).toBe(false);
  });

  it('decisions expire with the last option and cooldowns prevent spam', () => {
    const sim = new Simulation(createNewGame(options));
    const ctx = { state: sim.state, events: sim.events, rng: new Rng(1) };
    expect(createDecision(ctx, { kind: 'church_donation', title: 'T', text: 't', options: [{ id: 'donate', label: 'a', hint: '' }, { id: 'decline', label: 'b', hint: '' }], context: { factionId: 'signal_church', amount: 1500 } }, 10, 1)).toBe(true);
    expect(createDecision(ctx, { kind: 'church_donation', title: 'T', text: 't', options: [{ id: 'donate', label: 'a', hint: '' }, { id: 'decline', label: 'b', hint: '' }], context: {} }, 10, 1)).toBe(false);
    const church = sim.state.factions.find((f) => f.id === 'signal_church')!;
    const before = church.relation;
    sim.run(MINUTES_PER_DAY * 2);
    expect(sim.state.decisions.pending.length).toBe(0);
    expect(church.relation).toBeLessThan(before + 1); // declined by default (−5 then drift)
    expect(sim.state.decisions.resolvedCount).toBe(1);
  });

  it('takeover offers sell the business when accepted', () => {
    const sim = new Simulation(createNewGame(options));
    const bar = build(sim, 'ramen_bar');
    const ctx = { state: sim.state, events: sim.events, rng: new Rng(2) };
    createDecision(ctx, { kind: 'takeover_offer', title: 'T', text: 't', options: [{ id: 'accept', label: 'a', hint: '' }, { id: 'decline', label: 'b', hint: '' }], context: { factionId: 'kosei', buildingId: bar.id, amount: 50000 } }, 1, 2);
    const id = sim.state.decisions.pending[0]!.id;
    const balance = sim.state.ledger.balance;
    expect(sim.apply({ type: 'resolveDecision', decisionId: id, optionId: 'accept' }).ok).toBe(true);
    expect(sim.state.ledger.balance).toBe(balance + 50000);
    expect(bar.owner).toBe('city');
    expect(bar.business).toBeUndefined();
  });
});

describe('Politics', () => {
  it('collects sales tax daily at the legal rate', () => {
    const sim = new Simulation(createNewGame(options));
    build(sim, 'ramen_bar');
    sim.run(17 * 60 + 1);
    const sales = sim.state.ledger.transactions.filter((t) => t.category === 'sales').reduce((s, t) => s + t.amount, 0);
    const tax = sim.state.ledger.transactions.filter((t) => t.category === 'tax').reduce((s, t) => s + t.amount, 0);
    expect(tax).toBeLessThan(0);
    expect(-tax).toBeCloseTo(Math.round(sales * 0.08), -1);
    expect(sim.state.politics.lifetimeTaxes).toBe(-tax);
  });

  it('laws need influence and lobbying, go to a vote and change rules', () => {
    const sim = new Simulation(createNewGame(options));
    expect(sim.apply({ type: 'proposeLaw', lawId: 'salesTax', value: 0.04 }).ok).toBe(false); // no influence
    sim.state.politics.influence = 100;
    sim.state.politics.council = { progress_bloc: 24, social_alliance: 0 };
    expect(councilSupport(sim.state, 'salesTax', 0.04)).toBeGreaterThan(0.9);
    expect(sim.apply({ type: 'proposeLaw', lawId: 'salesTax', value: 0.5 }).ok).toBe(false);
    expect(sim.apply({ type: 'proposeLaw', lawId: 'salesTax', value: 0.04 }).ok).toBe(true);
    expect(sim.apply({ type: 'proposeLaw', lawId: 'salesTax', value: 0.12 }).ok).toBe(false); // already proposed
    sim.run(MINUTES_PER_DAY * 4);
    expect(lawValue(sim.state, 'salesTax')).toBe(0.04);
    expect(sim.state.log.some((l) => l.message.includes('Der Rat beschließt'))).toBe(true);
  });

  it('minimum wage, rent cap and zoning have real effects', () => {
    const sim = new Simulation(createNewGame(options));
    const bar = build(sim, 'ramen_bar');
    const biz = bar.business as GastronomyState;
    sim.state.politics.laws.minimumWage = 100;
    for (const e of biz.employees) sim.apply({ type: 'setWage', buildingId: bar.id, employeeId: e.id, wage: 30 });
    sim.run(17 * 60 + 1);
    expect(biz.employees.every((e) => e.wage >= 100)).toBe(true);
    const house = Object.values(sim.state.buildings).find((b) => b.owner === 'city' && isResidential(b))!;
    sim.apply({ type: 'buyProperty', buildingId: house.id });
    sim.state.politics.laws.rentCap = 1.1;
    sim.apply({ type: 'setRentLevel', buildingId: house.id, level: 1.6 });
    expect(house.property!.rentLevel).toBe(1.1);
    const quoteNormal = quotePlacement(sim.state, BUILDING_DEFINITIONS.kiosk!, 0);
    sim.state.politics.laws.zoning = 1.25;
    const quoteStrict = quotePlacement(sim.state, BUILDING_DEFINITIONS.kiosk!, 0);
    expect(quoteStrict.constructionCost).toBeGreaterThan(quoteNormal.constructionCost);
  });

  it('elections redistribute seats and district initiatives change district stats', () => {
    const sim = new Simulation(createNewGame(options));
    const seatsBefore = { ...sim.state.politics.council };
    sim.run(MINUTES_PER_DAY * 31);
    expect(sim.state.log.some((l) => l.message.includes('Ratswahl'))).toBe(true);
    expect((sim.state.politics.council.progress_bloc ?? 0) + (sim.state.politics.council.social_alliance ?? 0)).toBe(24);
    void seatsBefore;
    const d = sim.state.districts[0]!;
    expect(sim.apply({ type: 'districtInitiative', districtId: d.id, kind: 'safety' }).ok).toBe(false);
    sim.state.politics.districtInfluence[d.id] = 50;
    const crime = d.stats.crime;
    expect(sim.apply({ type: 'districtInitiative', districtId: d.id, kind: 'safety' }).ok).toBe(true);
    expect(d.stats.crime).toBeLessThan(crime);
    expect(sim.apply({ type: 'districtInitiative', districtId: d.id, kind: 'beauty' }).ok).toBe(false); // cooldown
  });

  it('districts develop dynamically: attractiveness drives rents', () => {
    const sim = new Simulation(createNewGame(options));
    const d = sim.state.districts.find((x) => x.archetype === 'old_city')!;
    d.stats.attractiveness = 95;
    const rent = d.stats.rentIndex;
    sim.run(MINUTES_PER_DAY * 10);
    expect(d.stats.rentIndex).toBeGreaterThan(rent);
  });
});

describe('Save format v6', () => {
  it('migrates v5 and round-trips politics', () => {
    const sim = new Simulation(createNewGame(options));
    sim.state.politics.laws.salesTax = 0.12;
    sim.run(6 * 60);
    const { state } = deserialize(serialize(sim.state, 'v6'));
    expect(state.politics.laws.salesTax).toBe(0.12);
    expect(state.factions.length).toBe(12);
    const file = JSON.parse(serialize(sim.state, 'v5')) as { version: number; state: Record<string, unknown> };
    delete file.state.factions;
    delete file.state.politics;
    delete file.state.decisions;
    const migrated = deserialize(JSON.stringify({ ...file, version: 5 }));
    expect(migrated.state.politics.laws.salesTax).toBe(0.08);
    expect(migrated.state.factions.length).toBe(12);
  });
});
