import { toLegacy } from './legacy';
import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { withPlayer } from '../../src/sim/players';
import { checkPlacement } from '../../src/sim/systems/construction';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';
import type { Building, GastronomyState, IndustryState, ResearchLabState } from '../../src/sim/state';
import { hasTech, techFactors } from '../../src/sim/systems/research';
import { factoryCapacity } from '../../src/sim/systems/industry';
import { stockOf } from '../../src/sim/systems/inventory';
import { loanLimit, valuation } from '../../src/sim/systems/corporate';
import { crisisFactors } from '../../src/sim/systems/crises';
import { serialize, deserialize } from '../../src/persistence/serializer';
import { RESEARCH } from '../../src/sim/data/research';

const options: NewGameOptions = { seed: 'phase7', playerName: 'Magnate', difficulty: 'sandbox', background: 'heir', citySize: 48 };

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
  throw new Error('no lot for ' + defId);
}

describe('Research', () => {
  it('needs a lab, costs money, accumulates points and unlocks effects', () => {
    const sim = new Simulation(createNewGame(options));
    const bar = build(sim, 'ramen_bar');
    const lab = build(sim, 'research_lab');
    const biz = lab.business as ResearchLabState;
    expect(biz.kind).toBe('lab');
    expect(sim.apply({ type: 'startResearch', buildingId: lab.id, nodeId: 'robotic_housekeeping' }).ok).toBe(false); // requires kitchen_automation
    expect(sim.apply({ type: 'startResearch', buildingId: lab.id, nodeId: 'synth_cuisine' }).ok).toBe(true);
    expect(sim.apply({ type: 'startResearch', buildingId: lab.id, nodeId: 'synth_cuisine' }).ok).toBe(false);
    expect(sim.state.ledger.transactions.some((t) => t.category === 'research')).toBe(true);
    const before = techFactors(sim.state);
    let days = 0;
    while (!hasTech(sim.state, 'synth_cuisine') && days < 20) {
      sim.run(MINUTES_PER_DAY);
      days++;
    }
    expect(hasTech(sim.state, 'synth_cuisine')).toBe(true);
    expect(days).toBeLessThan(20);
    expect((bar.business as GastronomyState).menu.some((m) => m.recipeId === 'synth_sushi')).toBe(true);
    expect(sim.apply({ type: 'startResearch', buildingId: lab.id, nodeId: 'kitchen_automation' }).ok).toBe(true);
    sim.state.research.progress.kitchen_automation = RESEARCH.kitchen_automation!.points;
    sim.run(MINUTES_PER_DAY);
    expect(techFactors(sim.state).cookRate).toBeGreaterThan(before.cookRate);
  });
});

describe('Industry', () => {
  it('produces goods from raw materials, supplies own venues and sells surplus', () => {
    const sim = new Simulation(createNewGame(options));
    const bar = build(sim, 'ramen_bar');
    const factory = build(sim, 'food_factory');
    const biz = factory.business as IndustryState;
    expect(biz.lines.length).toBe(1);
    expect(factoryCapacity(sim.state, factory)!.machineUnits).toBeGreaterThan(0);
    expect(sim.apply({ type: 'setLine', buildingId: factory.id, lineId: null, recipeId: 'synthmeat_plant', targetPerDay: 150 }).ok).toBe(true);
    expect(sim.apply({ type: 'setLine', buildingId: factory.id, lineId: null, recipeId: 'parts_assembly', targetPerDay: 10 }).ok).toBe(false);
    const grain = stockOf(biz, 'grain');
    const barNoodles = stockOf(bar.business as GastronomyState, 'noodles');
    (bar.business as GastronomyState).reorderTargets.noodles = 200;
    sim.run(17 * 60 + 1);
    expect(biz.history[0]!.produced).toBeGreaterThan(0);
    expect(stockOf(biz, 'grain')).toBeLessThan(grain);
    expect(stockOf(bar.business as GastronomyState, 'noodles')).toBeGreaterThan(barNoodles - 60); // supplied internally
    expect(sim.state.ledger.transactions.some((t) => t.description.includes('Großhandelsverkauf'))).toBe(true);
    expect(sim.state.ledger.transactions.some((t) => t.description.includes(`${factory.label}: Energie`))).toBe(true);
    expect(sim.apply({ type: 'removeLine', buildingId: factory.id, lineId: biz.lines[0]!.id }).ok).toBe(true);
  });

  it('without workers nothing is produced', () => {
    const sim = new Simulation(createNewGame(options));
    const factory = build(sim, 'food_factory');
    const biz = factory.business as IndustryState;
    for (const e of [...biz.employees]) sim.apply({ type: 'fire', buildingId: factory.id, employeeId: e.id });
    sim.run(17 * 60 + 1);
    expect(biz.history[0]!.produced).toBe(0);
    expect(sim.state.log.some((l) => l.message.includes('Keine Produktion'))).toBe(true);
  });
});

describe('Corporate finance', () => {
  it('loans respect the limit, charge interest and instalments, and can be repaid', () => {
    const sim = new Simulation(createNewGame({ ...options, difficulty: 'standard' }));
    build(sim, 'ramen_bar');
    const limit = loanLimit(sim.state);
    expect(limit).toBeGreaterThan(0);
    expect(sim.apply({ type: 'takeLoan', amount: limit + 1000 }).ok).toBe(false);
    const balance = sim.state.ledger.balance;
    expect(sim.apply({ type: 'takeLoan', amount: 4000 }).ok).toBe(true);
    expect(sim.state.ledger.balance).toBe(balance + 4000);
    sim.run(MINUTES_PER_DAY);
    expect(sim.state.ledger.transactions.some((t) => t.category === 'interest')).toBe(true);
    expect(sim.state.corporate.loans[0]!.remaining).toBeLessThan(4000);
    expect(sim.apply({ type: 'repayLoan', loanId: sim.state.corporate.loans[0]!.id, amount: 100000 }).ok).toBe(true);
    expect(sim.state.corporate.loans.length).toBe(0);
  });

  it('investors buy shares, receive dividends; insurance pays claims', () => {
    const sim = new Simulation(createNewGame(options));
    build(sim, 'ramen_bar');
    sim.run(MINUTES_PER_DAY);
    expect(valuation(sim.state)).toBeGreaterThan(10000);
    expect(sim.apply({ type: 'sellShares', share: 0.6 }).ok).toBe(false);
    const balance = sim.state.ledger.balance;
    expect(sim.apply({ type: 'sellShares', share: 0.2 }).ok).toBe(true);
    expect(sim.state.ledger.balance).toBeGreaterThan(balance);
    expect(sim.state.corporate.sharesSold).toBe(0.2);
    // Dividends are only due on days with a positive operating result; run until one occurs.
    let paid = false;
    for (let i = 0; i < 12 && !paid; i++) {
      sim.run(MINUTES_PER_DAY);
      paid = sim.state.ledger.transactions.some((t) => t.category === 'dividend');
    }
    expect(paid).toBe(true);
    expect(sim.apply({ type: 'buyBackShares', share: 0.2 }).ok).toBe(true);
    expect(sim.state.corporate.sharesSold).toBe(0);
    expect(sim.apply({ type: 'setInsurance', policyId: 'liability', active: true }).ok).toBe(true);
    sim.run(MINUTES_PER_DAY);
    expect(sim.state.ledger.transactions.some((t) => t.description === 'Versicherungsprämien')).toBe(true);
  });

  it('deep debt leads to forced sales and finally bankruptcy', () => {
    const sim = new Simulation(createNewGame({ ...options, difficulty: 'standard' }));
    const bar = build(sim, 'food_stand');
    sim.state.ledger.balance = -500000;
    sim.run(MINUTES_PER_DAY * 5);
    expect(bar.owner).toBe('city');
    expect(sim.state.log.some((l) => l.message.startsWith('Zwangsverkauf'))).toBe(true);
    expect(sim.state.corporate.bankrupt).toBe(true);
    expect(sim.state.speed).toBe(0);
    expect(sim.apply({ type: 'takeLoan', amount: 2000 }).ok).toBe(false);
  });
});

describe('Crises', () => {
  it('start, apply effects, and end with the effects undone', () => {
    const sim = new Simulation(createNewGame(options));
    sim.state.crisis.active = { id: 'recession', startDay: 1, endDay: 3, severity: 1 };
    for (const d of sim.state.districts) d.stats.purchasingPower *= 0.85;
    const during = sim.state.districts.map((d) => d.stats.purchasingPower);
    expect(crisisFactors(sim.state).demand).toBeLessThan(1);
    sim.run(MINUTES_PER_DAY * 3);
    expect(sim.state.crisis.active).toBeNull();
    expect(sim.state.crisis.history[0]!.id).toBe('recession');
    expect(crisisFactors(sim.state).demand).toBe(1);
    sim.state.districts.forEach((d, i) => expect(d.stats.purchasingPower).toBeGreaterThan(during[i]! * 1.1));
    expect(sim.state.log.some((l) => l.message.includes('Krise vorbei'))).toBe(true);
  });

  it('crises start on their own over time', { timeout: 60000 }, () => {
    const sim = new Simulation(createNewGame({ ...options, citySize: 32 }));
    let seen = 0;
    for (let i = 0; i < 120 && seen === 0; i++) {
      sim.run(MINUTES_PER_DAY);
      seen = sim.state.crisis.history.length + (sim.state.crisis.active ? 1 : 0);
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('Save format v7', () => {
  it('migrates v6 and round-trips corporate, research and crisis state', () => {
    const sim = new Simulation(createNewGame(options));
    build(sim, 'research_lab');
    sim.state.research.unlocked.push('prefab');
    sim.apply({ type: 'takeLoan', amount: 3000 });
    sim.run(6 * 60);
    const state = withPlayer(deserialize(serialize(sim.state, 'v7')).state, 'player');
    expect(state.research.unlocked).toContain('prefab');
    expect(state.corporate.loans.length).toBe(1);
    const file = toLegacy(JSON.parse(serialize(sim.state, 'v6')) as { version: number; state: Record<string, unknown> });
    delete file.state.corporate;
    delete file.state.research;
    delete file.state.crisis;
    const migrated = deserialize(JSON.stringify({ ...file, version: 6 }));
    expect(withPlayer(migrated.state, 'player').corporate.loans.length).toBe(0);
    expect(withPlayer(migrated.state, 'player').research.unlocked.length).toBe(0);
  });
});
