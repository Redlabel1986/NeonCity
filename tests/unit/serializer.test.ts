import { toLegacy } from './legacy';
import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, SAVE_FORMAT_VERSION } from '../../src/sim/engine';
import { withPlayer } from '../../src/sim/players';
import { deserialize, serialize, migrate, MIGRATIONS, SaveValidationError, tryRepair, type SaveFile } from '../../src/persistence/serializer';
import { checkPlacement } from '../../src/sim/systems/construction';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';

function makeSim(): Simulation {
  const sim = new Simulation(createNewGame({ progression: false, seed: 'save-test', playerName: 'Saver', difficulty: 'standard', background: 'ex_corporate', citySize: 40 }));
  outer: for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      if (checkPlacement(sim.state, 'food_stand', x, y).ok) {
        sim.apply({ type: 'placeBuilding', defId: 'food_stand', x, y });
        break outer;
      }
    }
  }
  sim.run(MINUTES_PER_DAY + 30);
  return sim;
}

describe('Serializer', () => {
  it('round-trips a game state and continues identically', () => {
    const sim = makeSim();
    const text = serialize(sim.state, 'Test');
    const { state: world, name } = deserialize(text);
    const state = withPlayer(world, 'player');
    expect(name).toBe('Test');
    expect(state.tick).toBe(sim.state.tick);
    expect(state.ledger.balance).toBe(sim.state.ledger.balance);
    expect(Array.from(state.grid.kind)).toEqual(Array.from(sim.state.grid.kind));

    const restored = new Simulation(world);
    sim.run(MINUTES_PER_DAY);
    restored.run(MINUTES_PER_DAY);
    expect(restored.state.ledger.balance).toBe(sim.state.ledger.balance);
    expect(restored.state.rng).toEqual(sim.state.rng);
  });

  it('rejects garbage, foreign files and structurally broken saves', () => {
    expect(() => deserialize('not json')).toThrow(SaveValidationError);
    expect(() => deserialize('{"hello":1}')).toThrow(SaveValidationError);
    const sim = makeSim();
    const file = JSON.parse(serialize(sim.state, 'x')) as SaveFile;
    const broken = { ...file, state: { ...file.state, grid: { ...file.state.grid, kind: [1, 2, 3] } } };
    expect(() => deserialize(JSON.stringify(broken))).toThrow(/grid\.kind/);
    const outOfMap = { ...file, state: { ...file.state, buildings: { 1: { ...file.state.buildings[1], x: 999 } } } };
    expect(() => deserialize(JSON.stringify(outOfMap))).toThrow(/außerhalb/);
    const me = file.state.players.player!;
    const badDifficulty = { ...file, state: { ...file.state, players: { player: { ...me, player: { ...me.player, difficulty: 'cheat' } } } } };
    expect(() => deserialize(JSON.stringify(badDifficulty))).toThrow(/Schwierigkeitsgrad/);
  });

  it('refuses saves from a newer version and runs migrations for older ones', () => {
    const sim = makeSim();
    const file = JSON.parse(serialize(sim.state, 'x')) as SaveFile;
    expect(() => migrate({ ...file, version: SAVE_FORMAT_VERSION + 1 })).toThrow(/neueren Version/);
    const legacy = toLegacy(file);
    MIGRATIONS[0] = (s) => ({ ...s, migratedMarker: true });
    try {
      const migrated = migrate({ ...legacy, version: 0 });
      expect(migrated.version).toBe(SAVE_FORMAT_VERSION);
      expect((migrated.state as unknown as Record<string, unknown>).migratedMarker).toBe(true);
    } finally {
      delete MIGRATIONS[0];
    }
    expect(() => migrate({ ...legacy, version: -5 })).toThrow(/Keine Migration/);
  });

  it('repairs saves with missing transient fields', () => {
    const sim = makeSim();
    const file = JSON.parse(serialize(sim.state, 'x')) as SaveFile;
    const damaged = JSON.parse(JSON.stringify(file)) as { state: { players: Record<string, Record<string, unknown>> } };
    delete damaged.state.players.player!.log;
    delete damaged.state.players.player!.undoStack;
    expect(() => deserialize(JSON.stringify(damaged))).toThrow(SaveValidationError);
    const repaired = tryRepair(JSON.stringify(damaged));
    expect(repaired).not.toBeNull();
    expect(repaired!.repaired.length).toBeGreaterThan(0);
    expect(repaired!.state.tick).toBe(sim.state.tick);
    expect(tryRepair('{"state": 5}')).toBeNull();
  });
});
