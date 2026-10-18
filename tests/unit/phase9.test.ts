import { toLegacy } from './legacy';
import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { withPlayer } from '../../src/sim/players';
import { checkPlacement } from '../../src/sim/systems/construction';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';
import { megacorpProgress, MEGACORP_VALUATION } from '../../src/sim/systems/corporate';
import type { Building, IndustryState } from '../../src/sim/state';
import { serialize, deserialize } from '../../src/persistence/serializer';

const options: NewGameOptions = { progression: false, seed: 'phase9', playerName: 'Chair', difficulty: 'sandbox', background: 'consultant', citySize: 96 };

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

describe('Megacorp', () => {
  it('status needs valuation, size and diversity; unlocks chain takeovers and supply contracts', () => {
    const sim = new Simulation(createNewGame(options));
    expect(megacorpProgress(sim.state).qualifies).toBe(false);
    expect(sim.apply({ type: 'chainTakeover', districtId: 0 }).ok).toBe(false);
    for (const id of ['ramen_bar', 'kiosk', 'capsule_hotel', 'taxi_depot', 'food_stand', 'diner']) build(sim, id);
    const factory = build(sim, 'food_factory');
    sim.state.ledger.balance = MEGACORP_VALUATION * 2;
    sim.run(MINUTES_PER_DAY);
    expect(megacorpProgress(sim.state).qualifies).toBe(true);
    expect(sim.state.corporate.megacorp).toBe(true);
    expect(sim.state.log.some((l) => l.message.includes('Megakonzern'))).toBe(true);
    const district = Object.values(sim.state.competitors)[0]!.districtId;
    const before = Object.values(sim.state.competitors).filter((c) => c.districtId === district).length;
    expect(before).toBeGreaterThan(0);
    expect(sim.apply({ type: 'chainTakeover', districtId: district }).ok).toBe(true);
    expect(Object.values(sim.state.competitors).filter((c) => c.districtId === district).length).toBe(0);
    expect(Object.values(sim.state.buildings).filter((b) => b.owner === 'player' && b.defId === 'diner').length).toBe(before + 1);
    expect(sim.apply({ type: 'chainTakeover', districtId: district }).ok).toBe(false); // cooldown / none left
    expect(sim.state.ledger.transactions.filter((t) => t.description.startsWith('Übernahme:')).length).toBe(0);
    expect(sim.state.ledger.transactions.some((t) => t.description.startsWith('Kettenübernahme'))).toBe(true);
    // Supply contracts: factory sells to competitors at 95 %.
    const biz = factory.business as IndustryState;
    biz.inventory.push({ ingredientId: 'noodles', units: 500, boughtDay: 0, quality: 60, unitCost: 0.5 });
    const before2 = Object.values(sim.state.competitors).map((c) => c.cash);
    sim.run(MINUTES_PER_DAY);
    // Competitors earn money too; the contract shows as factory revenue and as a wholesale booking.
    expect((factory.business as IndustryState).history[(factory.business as IndustryState).history.length - 1]!.revenue).toBeGreaterThan(0);
    expect(sim.state.ledger.transactions.some((t) => t.description.includes('Großhandelsverkauf'))).toBe(true);
    expect(before2.length).toBeGreaterThan(0);
  });
});

describe('Selling the company and new careers', () => {
  it('sells everything, repays loans, disbands the organisation and allows a fresh start', () => {
    const sim = new Simulation(createNewGame({ ...options, difficulty: 'standard' }));
    sim.state.ledger.balance = 100000;
    const bar = build(sim, 'ramen_bar');
    sim.apply({ type: 'takeLoan', amount: 3000 });
    sim.apply({ type: 'foundOrganisation', name: 'Crew' });
    sim.apply({ type: 'sellShares', share: 0.1 });
    expect(sim.apply({ type: 'sellCompany' }).ok).toBe(false); // investors first
    sim.apply({ type: 'buyBackShares', share: 0.1 });
    expect(sim.apply({ type: 'newCareer', background: 'hacker', name: 'Neo' }).ok).toBe(false); // assets still owned
    const balance = sim.state.ledger.balance;
    expect(sim.apply({ type: 'sellCompany' }).ok).toBe(true);
    expect(bar.owner).toBe('city');
    expect(bar.business).toBeUndefined();
    expect(sim.state.corporate.loans.length).toBe(0);
    expect(sim.state.underworld.org).toBeNull();
    expect(sim.state.ledger.balance).toBeGreaterThan(balance);
    expect(sim.apply({ type: 'sellCompany' }).ok).toBe(false);
    expect(sim.apply({ type: 'newCareer', background: 'hacker', name: 'Neo' }).ok).toBe(true);
    expect(sim.state.player.background).toBe('hacker');
    expect(sim.state.player.name).toBe('Neo');
    expect(sim.state.corporate.careers).toBe(2);
    expect(sim.state.factions.find((f) => f.id === 'nullsect')!.relation).toBe(40);
    sim.run(MINUTES_PER_DAY);
    expect(sim.state.ledger.balanceHistory.length).toBeGreaterThan(1);
  });
});

describe('Save format v9', () => {
  it('migrates v8 and round-trips megacorp fields', () => {
    const sim = new Simulation(createNewGame(options));
    sim.state.corporate.megacorp = true;
    const state = withPlayer(deserialize(serialize(sim.state, 'v9')).state, 'player');
    expect(state.corporate.megacorp).toBe(true);
    const file = toLegacy(JSON.parse(serialize(sim.state, 'v8')) as { version: number; state: { corporate: Record<string, unknown> } });
    delete file.state.corporate.megacorp;
    delete file.state.corporate.careers;
    const migrated = deserialize(JSON.stringify({ ...file, version: 8 }));
    expect(withPlayer(migrated.state, 'player').corporate.megacorp).toBe(false);
    expect(withPlayer(migrated.state, 'player').corporate.careers).toBe(1);
  });
});
