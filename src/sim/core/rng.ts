/**
 * Deterministic seeded pseudo random number generator (mulberry32).
 *
 * The whole simulation must be reproducible from a seed, therefore every
 * random decision inside the simulation layer has to go through an Rng
 * instance that is part of the serialized game state.
 */

export interface RngState {
  readonly seed: number;
  state: number;
}

/** Converts an arbitrary string into a 32 bit unsigned seed (FNV-1a). */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  private s: number;
  readonly seed: number;

  constructor(seed: number | string, state?: number) {
    this.seed = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
    this.s = state === undefined ? this.seed : state >>> 0;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Approximate gaussian noise around 0 with std deviation 1 (Box-Muller). */
  gaussian(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /** Creates an independent sub-stream, e.g. for world generation. */
  fork(label: string): Rng {
    return new Rng(hashSeed(`${this.seed}:${label}:${this.int(0, 0xffffffff)}`));
  }

  toJSON(): RngState {
    return { seed: this.seed, state: this.s };
  }

  static fromJSON(json: RngState): Rng {
    return new Rng(json.seed, json.state);
  }
}
