import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { serialize, deserialize } from '../../src/persistence/serializer';
import { checkPlacement } from '../../src/sim/systems/construction';
import { TileKind } from '../../src/sim/world/grid';
import { ParkVariant } from '../../src/sim/world/generator';
import { COUNTRYSIDE_SHARE } from '../../src/sim/world/countryside';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';

const options: NewGameOptions = { progression: false, seed: 'old-city', playerName: 'Altspieler', difficulty: 'standard', background: 'restaurateur', citySize: 64 };

/** A save as it looked before 0.18: version 14 and no Greenhaven district. */
function oldSave(): { text: string; westBuildingId: number; balance: number } {
  const sim = new Simulation(createNewGame(options));
  const state = sim.state;
  // A player business in the far west, where the countryside will appear.
  let west = -1;
  outer: for (let x = 0; x < 8; x++)
    for (let y = 0; y < state.grid.height; y++)
      if (checkPlacement(state, 'food_stand', x, y).ok) {
        expect(sim.apply({ type: 'placeBuilding', defId: 'food_stand', x, y }).ok).toBe(true);
        west = Object.values(state.buildings).find((b) => b.owner === state.playerId)!.id;
        break outer;
      }
  expect(west).toBeGreaterThan(0);
  sim.run(MINUTES_PER_DAY);
  const raw = JSON.parse(serialize(sim.world, 'Alt')) as { version: number; state: { version: number; districts: { archetype: string }[] } };
  raw.version = 14;
  raw.state.version = 14;
  for (const d of raw.state.districts) if (d.archetype === 'greenhaven') d.archetype = 'old_city';
  return { text: JSON.stringify(raw), westBuildingId: west, balance: sim.state.ledger.balance };
}

describe('Old cities get the countryside (save v14 → v15)', () => {
  it('adds Greenhaven on the western edge with fields, forests and villages, keeps the player buildings and money, and keeps running', () => {
    const { text, westBuildingId, balance } = oldSave();
    const world = deserialize(text).state;
    const green = world.districts.find((d) => d.archetype === 'greenhaven')!;
    expect(green).toBeDefined();
    expect(green.id).toBe(world.districts.length - 1);
    expect(green.tileCount).toBeGreaterThan(world.grid.width * world.grid.height * COUNTRYSIDE_SHARE * 0.6);
    // Player building and money unchanged; the building now belongs to Greenhaven.
    const b = world.buildings[westBuildingId]!;
    expect(b.owner).toBe('player');
    expect(b.districtId).toBe(green.id);
    expect(world.players.player!.ledger.balance).toBe(balance);
    // Countryside content in the strip.
    let fields = 0;
    let forests = 0;
    for (let i = 0; i < world.grid.kind.length; i++) {
      if (world.grid.district[i] !== green.id || world.grid.kind[i] !== TileKind.Park) continue;
      if (world.grid.variant[i] === ParkVariant.Field) fields++;
      if (world.grid.variant[i] === ParkVariant.Forest) forests++;
    }
    expect(fields).toBeGreaterThan(5);
    expect(forests).toBeGreaterThan(3);
    const villages = Object.values(world.buildings).filter((x) => x.owner === 'city' && x.districtId === green.id);
    expect(villages.length).toBeGreaterThan(5);
    expect(villages.every((x) => x.cityStyle === 'rural' && x.floors <= 2)).toBe(true);
    // Every reference points at an existing building.
    for (const c of world.population.citizens) {
      expect(world.buildings[c.homeBuildingId]).toBeDefined();
      if (c.workBuildingId !== null) expect(world.buildings[c.workBuildingId]).toBeDefined();
    }
    for (const id of Object.keys(world.competitors)) expect(world.buildings[Number(id)]).toBeDefined();
    expect(world.population.citizens.some((c) => c.districtId === green.id)).toBe(true);
    // Occupancy grid matches the buildings.
    for (const x of Object.values(world.buildings)) expect(world.grid.occupantAt(x.x, x.y)).toBe(x.id);
    // The simulation keeps going and the conversion happens only once.
    const sim = new Simulation(world);
    sim.run(MINUTES_PER_DAY);
    expect(sim.world.districts.filter((d) => d.archetype === 'greenhaven')).toHaveLength(1);
    const again = deserialize(serialize(sim.world, 'Neu')).state;
    expect(again.districts.length).toBe(world.districts.length);
  });
});
