/** Deterministic NPC name generation. */

import type { Rng } from '../core/rng';

const FIRST = [
  'Kai', 'Mira', 'Jun', 'Sora', 'Lena', 'Dax', 'Yuki', 'Nadia', 'Ravi', 'Ines', 'Tomo', 'Zara', 'Ezra', 'Noor', 'Kenji', 'Vela',
  'Oskar', 'Hana', 'Ilya', 'Tess', 'Milo', 'Aiko', 'Bastian', 'Priya', 'Rico', 'Suki', 'Jalen', 'Freya', 'Nico', 'Mei',
];
const LAST = [
  'Moreno', 'Tanaka', 'Okafor', 'Voss', 'Ishikawa', 'Berg', 'Nakamura', 'Castillo', 'Haddad', 'Lindqvist', 'Sato', 'Kowalski',
  'Adeyemi', 'Petrov', 'Hayashi', 'Duarte', 'Novak', 'Mbeki', 'Schreiber', 'Yamamoto', 'Reyes', 'Farouk', 'Keller', 'Osei',
];

export function randomName(rng: Rng): string {
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}
