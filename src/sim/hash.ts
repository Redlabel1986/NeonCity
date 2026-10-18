/**
 * Cheap fingerprint of a world used to detect lockstep divergence between
 * server and clients. Not cryptographic; it only has to change when the
 * simulation state differs.
 */

import type { WorldState } from './state';

export function worldHash(world: WorldState): string {
  let h = 2166136261;
  const mixNumber = (n: number): void => {
    const s = String(Math.round(n * 100));
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  };
  mixNumber(world.tick);
  mixNumber(world.nextBuildingId);
  mixNumber(world.rng.state);
  mixNumber(Object.keys(world.buildings).length);
  mixNumber(world.population.citizens.length);
  mixNumber(Object.keys(world.competitors).length);
  for (const id of world.playerOrder) {
    const p = world.players[id]!;
    mixNumber(p.ledger.balance);
    mixNumber(p.ledger.dirtyBalance);
    mixNumber(p.player.reputation);
    mixNumber(p.underworld.heat);
    mixNumber(p.progression?.level ?? 1);
    mixNumber(p.progression?.xp ?? 0);
  }
  for (const d of world.districts) {
    mixNumber(d.stats.crime);
    mixNumber(d.stats.purchasingPower);
  }
  return (h >>> 0).toString(16);
}
