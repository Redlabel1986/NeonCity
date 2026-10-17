import { describe, expect, it } from 'vitest';
import { createNewGame, createWorld, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { checkPlacement } from '../../src/sim/systems/construction';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';
import { serialize, deserialize } from '../../src/persistence/serializer';
import { withPlayer } from '../../src/sim/players';
import type { Building } from '../../src/sim/state';

const options: NewGameOptions = { seed: 'shared-city', playerName: 'Solo', difficulty: 'standard', background: 'restaurateur', citySize: 48 };

function placeFor(sim: Simulation, playerId: string, defId: string, skip = 0): Building {
  const state = sim.view(playerId);
  const { grid } = state;
  let seen = 0;
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++) {
      if (!checkPlacement(state, defId, x, y).ok) continue;
      if (seen++ < skip) continue;
      const before = new Set(Object.keys(state.buildings));
      expect(sim.apply({ type: 'placeBuilding', defId, x, y }, playerId).ok).toBe(true);
      const b = Object.values(state.buildings).find((v) => v.owner === playerId && !before.has(String(v.id)))!;
      if (b.status === 'construction') sim.run(b.buildTime);
      return b;
    }
  throw new Error('no lot');
}

describe('Phase 12: shared world with several players', () => {
  it('keeps finances, buildings, logs and relations apart while the city is shared', () => {
    const world = createWorld({ seed: 'shared-city', citySize: 48 });
    const sim = new Simulation(world);
    expect(sim.addPlayer({ id: 'u1', name: 'Ada', background: 'restaurateur', difficulty: 'standard' }).ok).toBe(true);
    expect(sim.addPlayer({ id: 'u2', name: 'Bo', background: 'street_kid', difficulty: 'standard' }).ok).toBe(true);
    expect(sim.addPlayer({ id: 'u1', name: 'Dupe', background: 'restaurateur', difficulty: 'standard' }).ok).toBe(false);
    const ada = sim.view('u1');
    const bo = sim.view('u2');
    expect(ada.player.name).toBe('Ada');
    expect(bo.player.name).toBe('Bo');
    expect(ada.buildings).toBe(bo.buildings); // the same city
    expect(ada.ledger).not.toBe(bo.ledger);

    const adaBalance = ada.ledger.balance;
    const bar = placeFor(sim, 'u1', 'ramen_bar');
    expect(bar.owner).toBe('u1');
    expect(ada.ledger.balance).toBeLessThan(adaBalance);
    // Bo paid nothing for Ada's bar (only his own apartment rent at the day boundary).
    expect(bo.ledger.transactions.filter((t) => t.category !== 'rent')).toEqual([]);
    expect(ada.ledger.transactions.some((t) => t.category === 'construction' && t.buildingId === bar.id)).toBe(true);
    // Bo cannot manage Ada's bar, Ada can.
    expect(sim.apply({ type: 'rename', buildingId: bar.id, label: 'Bos Bar' }, 'u2').ok).toBe(false);
    expect(sim.apply({ type: 'rename', buildingId: bar.id, label: 'Adas Bar' }, 'u1').ok).toBe(true);
    expect(sim.apply({ type: 'demolish', buildingId: bar.id }, 'u2').ok).toBe(false);
    // Bo builds a stand of his own at a different lot.
    const stand = placeFor(sim, 'u2', 'food_stand', 1);
    expect(stand.owner).toBe('u2');

    sim.run(MINUTES_PER_DAY * 2);
    // Each player pays their own rent and earns from their own venue only.
    const adaSales = ada.ledger.transactions.filter((t) => t.category === 'sales');
    const boSales = bo.ledger.transactions.filter((t) => t.category === 'sales');
    expect(adaSales.every((t) => t.buildingId === bar.id)).toBe(true);
    expect(boSales.every((t) => t.buildingId === stand.id)).toBe(true);
    expect(ada.ledger.transactions.some((t) => t.category === 'rent')).toBe(true);
    expect(bo.ledger.transactions.some((t) => t.category === 'rent')).toBe(true);
    // Logs are routed: Ada's log mentions her bar, Bo's does not.
    expect(ada.log.some((l) => l.message.includes('Adas Bar'))).toBe(true);
    expect(bo.log.some((l) => l.message.includes('Adas Bar'))).toBe(false);
    // Shared things are identical objects, player things are not.
    expect(ada.factions[0]!.influence).toBe(bo.factions[0]!.influence);
    ada.factions[0]!.relation = 42;
    expect(bo.factions[0]!.relation).not.toBe(42);
    expect(ada.underworld.rivals).toBe(bo.underworld.rivals);
    expect(ada.politics.laws).toBe(bo.politics.laws);
    ada.politics.influence = 77;
    expect(bo.politics.influence).not.toBe(77);
    // Tasks progress per player.
    expect(ada.tasks.find((t) => t.id === 'first_build')!.completedTick).not.toBeNull();
    expect(bo.tasks.find((t) => t.id === 'first_build')!.completedTick).not.toBeNull();
  });

  it('replays the same commands deterministically on another copy of the world (lockstep)', () => {
    const a = new Simulation(createNewGame(options));
    const b = new Simulation(deserialize(serialize(a.world, 'copy')).state);
    a.addPlayer({ id: 'u2', name: 'Bo', background: 'hacker', difficulty: 'standard' });
    b.addPlayer({ id: 'u2', name: 'Bo', background: 'hacker', difficulty: 'standard' });
    const bar = placeFor(a, 'player', 'ramen_bar');
    const barB = placeFor(b, 'player', 'ramen_bar');
    expect(barB.id).toBe(bar.id);
    expect(a.apply({ type: 'setMenuPrice', buildingId: bar.id, recipeId: 'shoyu_ramen', price: 25 }, 'player').ok).toBe(true);
    expect(b.apply({ type: 'setMenuPrice', buildingId: bar.id, recipeId: 'shoyu_ramen', price: 25 }, 'player').ok).toBe(true);
    expect(a.apply({ type: 'foundOrganisation', name: 'Null' }, 'u2').ok).toBe(true);
    expect(b.apply({ type: 'foundOrganisation', name: 'Null' }, 'u2').ok).toBe(true);
    a.run(MINUTES_PER_DAY * 3);
    b.run(MINUTES_PER_DAY * 3);
    const strip = (text: string): string => text.replace(/"savedAt":\d+/, '');
    expect(strip(serialize(a.world, 'x'))).toBe(strip(serialize(b.world, 'x')));
    expect(a.view('u2').ledger.balance).toBe(b.view('u2').ledger.balance);
  });

  it('migrates a single-player save into a world with one player and keeps playing', () => {
    const sim = new Simulation(createNewGame(options));
    placeFor(sim, 'player', 'ramen_bar');
    sim.run(MINUTES_PER_DAY);
    const restored = new Simulation(deserialize(serialize(sim.world, 'x')).state);
    expect(restored.playerIds).toEqual(['player']);
    expect(restored.state.ledger.balance).toBe(sim.state.ledger.balance);
    expect(withPlayer(restored.world, 'player').player.name).toBe('Solo');
    restored.run(MINUTES_PER_DAY);
    sim.run(MINUTES_PER_DAY);
    expect(restored.state.ledger.balance).toBe(sim.state.ledger.balance);
  });
});
