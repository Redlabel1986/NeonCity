import { toLegacy } from './legacy';
import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { withPlayer } from '../../src/sim/players';
import { checkPlacement } from '../../src/sim/systems/construction';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';
import { FOUNDING_COST, successChance, wantedLevel } from '../../src/sim/systems/underworld';
import { isResidential } from '../../src/sim/systems/property';
import type { Building, GastronomyState, SecurityState } from '../../src/sim/state';
import { serialize, deserialize } from '../../src/persistence/serializer';

const options: NewGameOptions = { progression: false, seed: 'phase5', playerName: 'Don', difficulty: 'sandbox', background: 'street_kid', citySize: 48 };

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

function withOrg(opts = options): Simulation {
  const sim = new Simulation(createNewGame(opts));
  expect(sim.apply({ type: 'foundOrganisation', name: 'Neon Syndikat' }).ok).toBe(true);
  return sim;
}

function recruitRole(sim: Simulation, role: string): void {
  const org = sim.state.underworld.org!;
  let c = org.candidates.find((x) => x.role === role);
  if (!c) {
    c = org.candidates[0]!;
    c.role = role as typeof c.role;
  }
  expect(sim.apply({ type: 'recruitCrew', candidateId: c.id }).ok).toBe(true);
}

describe('Underworld organisation', () => {
  it('starts without an organisation but with rival families; founding costs money', () => {
    const sim = new Simulation(createNewGame({ ...options, difficulty: 'standard' }));
    expect(sim.state.underworld.org).toBeNull();
    expect(sim.state.underworld.rivals.length).toBe(3);
    expect(sim.state.player.wantedLevel).toBe(0);
    sim.state.ledger.balance = 100;
    expect(sim.apply({ type: 'foundOrganisation', name: 'X' }).ok).toBe(false);
    sim.state.ledger.balance = 20000;
    expect(sim.apply({ type: 'foundOrganisation', name: '' }).ok).toBe(false);
    expect(sim.apply({ type: 'foundOrganisation', name: 'Neon Syndikat' }).ok).toBe(true);
    expect(sim.state.ledger.balance).toBe(20000 - FOUNDING_COST);
    expect(sim.state.underworld.org!.candidates.length).toBe(4);
    expect(sim.apply({ type: 'foundOrganisation', name: 'Zweite' }).ok).toBe(false);
  });

  it('recruits crew, runs a job and earns dirty money that cannot be spent legally', () => {
    const sim = withOrg();
    recruitRole(sim, 'enforcer');
    recruitRole(sim, 'driver');
    const org = sim.state.underworld.org!;
    expect(org.members.length).toBe(2);
    // Smuggling needs 10 % control; presence job first.
    expect(sim.apply({ type: 'startOperation', operationId: 'smuggling_run', districtId: sim.state.player.homeDistrictId }).ok).toBe(false);
    expect(sim.apply({ type: 'startOperation', operationId: 'fencing', districtId: sim.state.player.homeDistrictId }).ok).toBe(true);
    expect(org.operations.length).toBe(1);
    // Member is busy, cannot be dismissed.
    const busy = org.members.find((m) => m.busyUntilTick > sim.state.tick)!;
    expect(sim.apply({ type: 'dismissCrew', memberId: busy.id }).ok).toBe(false);
    const legalBefore = sim.state.ledger.balance;
    let attempts = 0;
    while (org.lifetimeDirty === 0 && attempts < 6) {
      sim.run(6 * 60 + 1);
      if (org.operations.length === 0) sim.apply({ type: 'startOperation', operationId: 'fencing', districtId: sim.state.player.homeDistrictId });
      attempts++;
    }
    expect(org.lifetimeDirty).toBeGreaterThan(0);
    expect(sim.state.ledger.balance).toBeLessThanOrEqual(legalBefore); // dirty money is not legal credits
    expect(sim.state.underworld.heat).toBeGreaterThan(0);
  });

  it('launders dirty money through legal businesses with a fee', () => {
    const sim = withOrg();
    const bar = build(sim, 'ramen_bar');
    sim.state.ledger.dirtyBalance = 5000;
    sim.apply({ type: 'setLaunderingRate', rate: 0.4 });
    sim.run(17 * 60 + 1); // day close with bar revenue
    const org = sim.state.underworld.org!;
    expect((bar.business as GastronomyState).history[0]!.revenue).toBeGreaterThan(0);
    expect(org.lifetimeLaundered).toBeGreaterThan(0);
    expect(sim.state.ledger.dirtyBalance).toBeLessThan(5000);
    expect(sim.state.ledger.transactions.some((t) => t.description.startsWith('Geldwäsche'))).toBe(true);
    expect(sim.apply({ type: 'setLaunderingRate', rate: 2 }).ok).toBe(true);
    expect(org.launderingRate).toBe(0.4);
  });

  it('heat rises with operations, triggers wanted levels and raids, and bribes lower it', () => {
    const sim = withOrg();
    recruitRole(sim, 'enforcer');
    recruitRole(sim, 'enforcer');
    sim.state.underworld.heat = 70;
    expect(wantedLevel(sim.state)).toBe(4);
    sim.state.ledger.dirtyBalance = 4000;
    let raided = false;
    for (let i = 0; i < 20 && !raided; i++) {
      sim.state.underworld.heat = 70;
      sim.run(MINUTES_PER_DAY);
      raided = sim.state.log.some((l) => l.message.startsWith('Razzia'));
    }
    expect(raided).toBe(true);
    expect(sim.state.ledger.transactions.some((t) => t.category === 'fine' && t.description.startsWith('Razzia'))).toBe(true);
    sim.state.underworld.heat = 40;
    const before = sim.state.underworld.heat;
    expect(sim.apply({ type: 'bribe', amount: 100 }).ok).toBe(false);
    expect(sim.apply({ type: 'bribe', amount: 3000 }).ok).toBe(true);
    expect(sim.state.underworld.heat).toBeLessThan(before);
    expect(sim.state.player.wantedLevel).toBe(wantedLevel(sim.state));
  });

  it('city-wide operation blocks all operations for days', () => {
    const sim = withOrg();
    recruitRole(sim, 'enforcer');
    sim.state.underworld.heat = 95;
    sim.run(MINUTES_PER_DAY);
    expect(sim.state.underworld.lockdownUntilDay).toBeGreaterThan(0);
    expect(sim.apply({ type: 'startOperation', operationId: 'fencing', districtId: 0 }).ok).toBe(false);
    expect(sim.state.log.some((l) => l.message.includes('Stadtweite'))).toBe(true);
  });

  it('standing protection racket collects from competitors and needs territory', () => {
    const sim = withOrg();
    recruitRole(sim, 'enforcer');
    const org = sim.state.underworld.org!;
    const district = Object.values(sim.state.competitors)[0]!.districtId;
    expect(sim.apply({ type: 'startOperation', operationId: 'protection', districtId: district }).ok).toBe(false);
    org.control[district] = 50;
    expect(sim.apply({ type: 'startOperation', operationId: 'protection', districtId: district }).ok).toBe(true);
    sim.state.underworld.heat = 0;
    let collected = false;
    for (let i = 0; i < 6 && !collected; i++) {
      sim.state.underworld.heat = 0;
      sim.run(MINUTES_PER_DAY);
      collected = org.lifetimeDirty > 0;
    }
    expect(collected).toBe(true);
    expect(org.operations.some((o) => o.operationId === 'protection')).toBe(true);
    expect(sim.apply({ type: 'startOperation', operationId: 'protection', districtId: district }).ok).toBe(false); // already running
  });

  it('casino requires an owned commercial property in the district', () => {
    const sim = withOrg();
    recruitRole(sim, 'accountant');
    recruitRole(sim, 'enforcer');
    const org = sim.state.underworld.org!;
    const front = Object.values(sim.state.buildings).find((b) => b.owner === 'city' && !isResidential(b) && !sim.state.competitors[b.id])!;
    org.control[front.districtId] = 40;
    expect(sim.apply({ type: 'startOperation', operationId: 'casino', districtId: front.districtId }).ok).toBe(false);
    expect(sim.apply({ type: 'buyProperty', buildingId: front.id }).ok).toBe(true);
    expect(sim.apply({ type: 'startOperation', operationId: 'casino', districtId: front.districtId, frontBuildingId: front.id }).ok).toBe(true);
    expect(successChance(sim.state, org.operations[0]!)).toBeGreaterThan(0.3);
  });

  it('rivals contest territory and truces can be bought with dirty money', () => {
    const sim = withOrg();
    const org = sim.state.underworld.org!;
    const family = sim.state.underworld.rivals[0]!;
    const contested = Number(Object.keys(family.control)[0]);
    org.control[contested] = 40;
    expect(sim.apply({ type: 'negotiateTruce', familyIndex: 0, tribute: 2000 }).ok).toBe(false);
    sim.state.ledger.dirtyBalance = 3000;
    expect(sim.apply({ type: 'negotiateTruce', familyIndex: 0, tribute: 2000 }).ok).toBe(true);
    expect(family.truceUntilDay).toBeGreaterThan(0);
    expect(sim.state.ledger.dirtyBalance).toBe(1000);
    family.truceUntilDay = 0;
    sim.run(MINUTES_PER_DAY * 10);
    expect(sim.state.log.some((l) => l.message.includes('Revierkampf'))).toBe(true);
  });
});

describe('Security firm', () => {
  it('patrols earn contracts and reduce crime and gang control; investigations weaken families', () => {
    const sim = new Simulation(createNewGame(options));
    const hq = build(sim, 'security_hq');
    const biz = hq.business as SecurityState;
    expect(biz.kind).toBe('security');
    const district = sim.state.districts.reduce((a, b) => (b.stats.crime > a.stats.crime ? b : a));
    const crimeBefore = district.stats.crime;
    expect(sim.apply({ type: 'assignPatrol', buildingId: hq.id, districtId: district.id, guards: 5 }).ok).toBe(false); // only 2 guards
    expect(sim.apply({ type: 'assignPatrol', buildingId: hq.id, districtId: district.id, guards: 2 }).ok).toBe(true);
    const family = sim.state.underworld.rivals[0]!;
    const strengthBefore = family.strength;
    expect(sim.apply({ type: 'startInvestigation', buildingId: hq.id, familyIndex: 0 }).ok).toBe(true);
    sim.run(MINUTES_PER_DAY * 3);
    expect(biz.history.length).toBe(3);
    expect(biz.history[0]!.revenue).toBeGreaterThan(0);
    expect(district.stats.crime).toBeLessThan(crimeBefore);
    sim.run(MINUTES_PER_DAY * 12);
    expect(family.strength).toBeLessThan(strengthBefore);
    expect(sim.state.log.some((l) => l.message.includes('Ermittlung gegen'))).toBe(true);
  });

  it('conflict of interest: being wanted damages the security firm', () => {
    const sim = new Simulation(createNewGame(options));
    const hq = build(sim, 'security_hq');
    const biz = hq.business as SecurityState;
    sim.apply({ type: 'assignPatrol', buildingId: hq.id, districtId: 0, guards: 1 });
    sim.apply({ type: 'foundOrganisation', name: 'Syndikat' });
    sim.state.underworld.heat = 80;
    const repBefore = biz.reputation;
    sim.run(MINUTES_PER_DAY);
    expect(biz.reputation).toBeLessThan(repBefore);
    expect(Object.keys(biz.patrols).length).toBe(0);
    expect(sim.state.log.some((l) => l.message.includes('Interne Ermittlungen'))).toBe(true);
  });
});

describe('Save format v5', () => {
  it('round-trips underworld state and migrates v4 saves', () => {
    const sim = withOrg();
    recruitRole(sim, 'enforcer');
    sim.state.ledger.dirtyBalance = 1234;
    sim.run(6 * 60);
    const world = deserialize(serialize(sim.state, 'v5')).state;
    const state = withPlayer(world, 'player');
    expect(state.underworld.org!.name).toBe('Neon Syndikat');
    expect(state.ledger.dirtyBalance).toBe(1234);
    const restored = new Simulation(world);
    sim.run(MINUTES_PER_DAY);
    restored.run(MINUTES_PER_DAY);
    expect(restored.state.underworld.heat).toBe(sim.state.underworld.heat);
    // v4 migration
    const file = toLegacy(JSON.parse(serialize(sim.state, 'v4')) as { version: number; state: Record<string, unknown> });
    delete file.state.underworld;
    delete (file.state.ledger as Record<string, unknown>).dirtyBalance;
    const migrated = deserialize(JSON.stringify({ ...file, version: 4 }));
    expect(withPlayer(migrated.state, 'player').underworld.org).toBeNull();
    expect(withPlayer(migrated.state, 'player').underworld.rivals.length).toBe(3);
    expect(withPlayer(migrated.state, 'player').ledger.dirtyBalance).toBe(0);
  });
});
