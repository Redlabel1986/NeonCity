import { describe, expect, it } from 'vitest';
import { createNewGame, Simulation, type NewGameOptions } from '../../src/sim/engine';
import { checkPlacement, quotePlacement } from '../../src/sim/systems/construction';
import { BUILDING_DEFINITIONS } from '../../src/sim/data/buildings';
import { PLAYER_LEVELS, REGIONS, XP_MILESTONES, regionOfArchetype } from '../../src/sim/data/regions';
import { awardMilestone, awardXp, isDistrictUnlocked, lockedDistrictIds, progressionStatus, regionOfDistrict } from '../../src/sim/systems/progression';
import { placeOrder } from '../../src/sim/systems/inventory';
import { deserialize, serialize } from '../../src/persistence/serializer';
import { generateCity } from '../../src/sim/world/generator';
import { ParkVariant } from '../../src/sim/world/generator';
import { TileKind } from '../../src/sim/world/grid';
import { DISTRICT_ARCHETYPES } from '../../src/sim/data/districts';
import { MINUTES_PER_DAY } from '../../src/sim/core/clock';
import { Rng } from '../../src/sim/core/rng';

const options: NewGameOptions = { seed: 'levels', playerName: 'Aufsteiger', difficulty: 'standard', background: 'restaurateur', citySize: 64 };

function lotIn(sim: Simulation, defId: string, pick: (districtId: number) => boolean): { x: number; y: number } {
  const { grid } = sim.state;
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++) {
      if (!pick(grid.districtAt(x, y))) continue;
      const def = BUILDING_DEFINITIONS[defId]!;
      let free = true;
      for (let dy = 0; dy < def.footprint.h && free; dy++) for (let dx = 0; dx < def.footprint.w; dx++) if (!grid.inBounds(x + dx, y + dy) || grid.kindAt(x + dx, y + dy) !== TileKind.Lot || grid.districtAt(x + dx, y + dy) !== grid.districtAt(x, y)) free = false;
      if (free && grid.footprintTouchesRoad(x, y, def.footprint.w, def.footprint.h)) return { x, y };
    }
  throw new Error(`no lot for ${defId}`);
}

describe('Regions: the city stretches from the countryside to the megacity', () => {
  it('generates ten districts incl. Greenhaven (rural, fields, forests, lakes) and Silverbrook (suburb), west to east', () => {
    const city = generateCity(42, 96);
    expect(city.districts).toHaveLength(10);
    const green = city.districts.find((d) => d.archetype === 'greenhaven')!;
    const nova = city.districts.find((d) => d.archetype === 'corporate_heights')!;
    expect(green.cx).toBeLessThan(nova.cx); // countryside west, megacity east
    let fields = 0;
    let forests = 0;
    let lakes = 0;
    let greenTiles = 0;
    for (let i = 0; i < city.grid.kind.length; i++) {
      if (city.grid.district[i] !== green.id) continue;
      greenTiles++;
      if (city.grid.kind[i] === TileKind.Park && city.grid.variant[i] === ParkVariant.Field) fields++;
      if (city.grid.kind[i] === TileKind.Park && city.grid.variant[i] === ParkVariant.Forest) forests++;
      if (city.grid.kind[i] === TileKind.Water) lakes++;
    }
    expect(fields).toBeGreaterThan(20);
    expect(forests).toBeGreaterThan(10);
    expect(lakes).toBeGreaterThan(5);
    expect(greenTiles).toBeGreaterThan(city.grid.kind.length / 20); // a real region, not a sliver
    const rural = Object.values(city.buildings).filter((b) => b.districtId === green.id);
    expect(rural.every((b) => b.floors <= 2)).toBe(true);
    expect(DISTRICT_ARCHETYPES.greenhaven.stats.landPrice).toBeLessThan(DISTRICT_ARCHETYPES.silverbrook.stats.landPrice);
    expect(DISTRICT_ARCHETYPES.silverbrook.stats.landPrice).toBeLessThan(DISTRICT_ARCHETYPES.corporate_heights.stats.landPrice);
    expect(regionOfArchetype('greenhaven')).toBe('greenhaven');
    expect(regionOfArchetype('old_city')).toBe('silverbrook');
    expect(regionOfArchetype('neon_market')).toBe('neon_central');
    expect(regionOfArchetype('skyline_gardens')).toBe('nova_eclipse');
  });
});

describe('Player levels and regions', () => {
  it('starts in Greenhaven at level 1 with the other regions locked for building and buying', () => {
    const sim = new Simulation(createNewGame(options));
    const state = sim.state;
    expect(state.progression.enabled).toBe(true);
    expect(state.progression.level).toBe(1);
    expect(state.districts[state.player.homeDistrictId]!.archetype).toBe('greenhaven');
    expect(state.progression.unlockedRegions).toEqual(['greenhaven']);
    const locked = lockedDistrictIds(state);
    expect(locked.length).toBe(9);
    const suburb = lotIn(sim, 'food_stand', (d) => regionOfDistrict(state, d) === 'silverbrook');
    expect(checkPlacement(state, 'food_stand', suburb.x, suburb.y).error).toBe('district_locked');
    const home = lotIn(sim, 'food_stand', (d) => d === state.player.homeDistrictId);
    expect(checkPlacement(state, 'food_stand', home.x, home.y).ok).toBe(true);
    // Level gates and region restrictions on building types.
    const farmLot = lotIn(sim, 'farm', (d) => d === state.player.homeDistrictId);
    expect(checkPlacement(state, 'farm', farmLot.x, farmLot.y).ok).toBe(true);
    const hotelLot = lotIn(sim, 'capsule_hotel', (d) => d === state.player.homeDistrictId);
    expect(checkPlacement(state, 'capsule_hotel', hotelLot.x, hotelLot.y).error).toBe('tier_required');
    // A property in a locked region cannot be bought.
    const cityBuilding = Object.values(state.buildings).find((b) => b.owner === 'city' && regionOfDistrict(state, b.districtId) === 'neon_central')!;
    expect(sim.apply({ type: 'buyProperty', buildingId: cityBuilding.id }).ok).toBe(false);
  });

  it('awards XP once per milestone id, promotes automatically and opens the next region', () => {
    const sim = new Simulation(createNewGame(options));
    const state = sim.state;
    expect(awardMilestone(state, sim.events, 'first_open')).toBe(XP_MILESTONES.first_open!.xp);
    expect(awardMilestone(state, sim.events, 'first_open')).toBe(0); // never twice
    expect(awardXp(state, sim.events, 'stage:asia.ramen', 80, 'Test')).toBe(80);
    expect(awardXp(state, sim.events, 'stage:asia.ramen', 80, 'Test')).toBe(0);
    expect(state.progression.xp).toBe(XP_MILESTONES.first_open!.xp + 80);
    expect(state.progression.level).toBe(1);
    const status = progressionStatus(state);
    expect(status.nextThreshold).toBe(PLAYER_LEVELS[1]!.xp);
    expect(status.progress).toBeGreaterThan(0);
    // Enough XP for level 2: Silverbrook opens, a level-up is pending.
    awardXp(state, sim.events, 'cheat', PLAYER_LEVELS[1]!.xp, 'Cheat');
    expect(state.progression.level).toBe(2);
    expect(state.progression.unlockedRegions).toContain('silverbrook');
    expect(state.progression.pendingLevelUp).toEqual({ level: 2, region: 'silverbrook' });
    expect(sim.drainEvents().some((e) => e.type === 'level:up' && e.level === 2)).toBe(true);
    const suburb = lotIn(sim, 'food_stand', (d) => regionOfDistrict(state, d) === 'silverbrook');
    expect(checkPlacement(state, 'food_stand', suburb.x, suburb.y).ok).toBe(true);
    expect(isDistrictUnlocked(state, state.districts.find((d) => d.archetype === 'corporate_heights')!.id)).toBe(false);
    expect(sim.apply({ type: 'ackLevelUp' }).ok).toBe(true);
    expect(state.progression.pendingLevelUp).toBeNull();
    // A single big award jumps several levels and opens every region on the way.
    awardXp(state, sim.events, 'cheat2', PLAYER_LEVELS[3]!.xp, 'Cheat');
    expect(state.progression.level).toBe(4);
    expect(state.progression.unlockedRegions).toEqual(['greenhaven', 'silverbrook', 'neon_central', 'nova_eclipse']);
  });

  it('tasks, day results and regions entered grant XP through the simulation, never twice', () => {
    const sim = new Simulation(createNewGame(options));
    const state = sim.state;
    const lot = lotIn(sim, 'food_stand', (d) => d === state.player.homeDistrictId);
    const quote = quotePlacement(state, BUILDING_DEFINITIONS.food_stand!, state.grid.districtAt(lot.x, lot.y));
    expect(sim.apply({ type: 'placeBuilding', defId: 'food_stand', x: lot.x, y: lot.y }).ok).toBe(true);
    sim.run(quote.buildTime + 30);
    expect(state.progression.milestones).toContain('first_build');
    expect(state.progression.milestones).toContain('first_open');
    const xpAfterOpen = state.progression.xp;
    sim.run(MINUTES_PER_DAY);
    expect(state.progression.milestones).toContain('region:greenhaven');
    expect(state.progression.xp).toBeGreaterThan(xpAfterOpen);
    // Selling and rebuilding does not pay again: the ids stay granted.
    const before = state.progression.xp;
    const b = Object.values(state.buildings).find((x) => x.owner === state.playerId)!;
    expect(sim.apply({ type: 'demolish', buildingId: b.id }).ok).toBe(true);
    const lot2 = lotIn(sim, 'food_stand', (d) => d === state.player.homeDistrictId);
    expect(sim.apply({ type: 'placeBuilding', defId: 'food_stand', x: lot2.x, y: lot2.y }).ok).toBe(true);
    sim.run(quote.buildTime + MINUTES_PER_DAY);
    const gained = state.progression.milestones.filter((m) => ['first_build', 'first_open', 'region:greenhaven'].includes(m));
    expect(gained).toHaveLength(3);
    expect(state.progression.xp - before).toBeLessThan(XP_MILESTONES.first_open!.xp + XP_MILESTONES.first_build!.xp + 150);
  });

  it('free play has every region open and no XP; the level system is a per-game choice', () => {
    const sim = new Simulation(createNewGame({ ...options, progression: false }));
    const state = sim.state;
    expect(state.progression.enabled).toBe(false);
    expect(lockedDistrictIds(state)).toEqual([]);
    expect(awardMilestone(state, sim.events, 'first_open')).toBe(0);
    expect(progressionStatus(state).level).toBe(PLAYER_LEVELS.length);
    expect(state.districts[state.player.homeDistrictId]!.archetype).not.toBe('greenhaven');
  });

  it('round-trips progression through the save file and migrates older saves to the regions they already use', () => {
    const sim = new Simulation(createNewGame(options));
    awardXp(sim.state, sim.events, 'x', 1200, 'Test');
    const text = serialize(sim.world, 'Level');
    const back = deserialize(text).state;
    const slice = back.players[sim.state.playerId]!;
    expect(slice.progression.level).toBe(2);
    expect(slice.progression.xp).toBe(1200);
    expect(slice.progression.milestones).toEqual(['x']);
    expect(slice.progression.unlockedRegions).toEqual(['greenhaven', 'silverbrook']);
    // An older save (v13) has no progression; a player with a building in Nova Eclipse starts at level 4 so nothing locks.
    const raw = JSON.parse(text) as { version: number; state: { version: number; players: Record<string, Record<string, unknown>>; buildings: Record<string, { owner: string; districtId: number }>; districts: { id: number; archetype: string }[] } };
    raw.version = 13;
    raw.state.version = 13;
    delete raw.state.players[sim.state.playerId]!.progression;
    const nova = raw.state.districts.find((d) => d.archetype === 'corporate_heights')!;
    const some = Object.values(raw.state.buildings)[0]!;
    some.owner = sim.state.playerId;
    some.districtId = nova.id;
    const migrated = deserialize(JSON.stringify(raw)).state.players[sim.state.playerId]!;
    expect(migrated.progression.enabled).toBe(true);
    expect(migrated.progression.level).toBe(4);
    expect(migrated.progression.unlockedRegions).toHaveLength(4);
    expect(migrated.progression.xp).toBe(PLAYER_LEVELS[3]!.xp);
  });

  it('deliveries to the countryside take longer than to the city (suppliers ship from Neon Central)', () => {
    const sim = new Simulation(createNewGame(options));
    const state = sim.state;
    const lot = lotIn(sim, 'ramen_bar', (d) => d === state.player.homeDistrictId);
    expect(sim.apply({ type: 'placeBuilding', defId: 'ramen_bar', x: lot.x, y: lot.y }).ok).toBe(true);
    const b = Object.values(state.buildings).find((x) => x.owner === state.playerId)!;
    const result = placeOrder({ state, events: sim.events, rng: new Rng(1) }, b, 'chrome_fresh', [{ ingredientId: 'noodles', units: 150 }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const hours = (result.order.arrivesTick - state.tick) / 60;
      // chrome_fresh ships in 6 h; Greenhaven is two regions away from Neon Central: +4 h (plus a possible 2 h delay).
      expect(hours === 10 || hours === 12).toBe(true);
    }
    expect(REGIONS.greenhaven.requiredLevel).toBe(1);
  });
});
