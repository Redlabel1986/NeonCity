/**
 * Hosts the one shared world: loads or creates it, advances the clock in
 * real time, applies player commands, broadcasts them in lockstep and
 * saves the world to disk automatically.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createWorld, Simulation, type Command, type CommandResult } from '../src/sim/engine';
import { deserialize, serialize } from '../src/persistence/serializer';
import { worldHash } from '../src/sim/hash';
import type { BackgroundId, DifficultyId } from '../src/sim/data/difficulty';
import { SERVER_ONLY_COMMANDS, type CommandEntry, type JoinEntry } from '../src/net/protocol';

export interface WorldHostOptions {
  file: string;
  seed: string;
  citySize: number;
  difficulty: DifficultyId;
  /** World speed (1 = two game minutes per real second). */
  speed: number;
  autosaveSeconds: number;
  cityName?: string;
}

export type Broadcast = (message: { t: 'cmd'; entry: CommandEntry } | { t: 'join'; entry: JoinEntry } | { t: 'tick'; tick: number } | { t: 'hash'; tick: number; hash: string }) => void;

const MINUTES_PER_SECOND = 2;
const HASH_EVERY_TICKS = 60;
const MAX_TICKS_PER_STEP = 600;

export class WorldHost {
  readonly sim: Simulation;
  readonly options: WorldHostOptions;
  private seq = 0;
  private accumulator = 0;
  private lastStep = Date.now();
  private timer: NodeJS.Timeout | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private broadcast: Broadcast = () => {};
  private dirty = false;
  /** Set when the world was loaded from disk rather than created. */
  readonly loadedFromDisk: boolean;

  constructor(options: WorldHostOptions) {
    this.options = options;
    if (existsSync(options.file)) {
      const { state } = deserialize(readFileSync(options.file, 'utf8'));
      this.sim = new Simulation(state);
      this.loadedFromDisk = true;
    } else {
      const world = createWorld({ seed: options.seed, citySize: options.citySize });
      if (options.cityName) world.meta.cityName = options.cityName;
      this.sim = new Simulation(world);
      this.loadedFromDisk = false;
      this.save();
    }
    this.sim.world.speed = options.speed;
  }

  get tick(): number {
    return this.sim.world.tick;
  }

  get currentSeq(): number {
    return this.seq;
  }

  onBroadcast(fn: Broadcast): void {
    this.broadcast = fn;
  }

  /** Full snapshot for a joining client (the command stream continues from `seq`). */
  snapshot(): { tick: number; seq: number; snapshot: string } {
    return { tick: this.tick, seq: this.seq, snapshot: serialize(this.sim.world, this.sim.world.meta.cityName) };
  }

  hash(): string {
    return worldHash(this.sim.world);
  }

  /** Adds a player to the world (on registration) and tells every client. */
  join(player: { id: string; name: string; background: BackgroundId; difficulty: DifficultyId }): CommandResult {
    if (this.sim.world.players[player.id]) return { ok: true };
    const result = this.sim.addPlayer(player);
    if (!result.ok) return result;
    const entry: JoinEntry = { seq: ++this.seq, tick: this.tick, player };
    this.broadcast({ t: 'join', entry });
    this.dirty = true;
    return result;
  }

  /** Validates and applies a player's command; on success it is broadcast with its tick. */
  apply(playerId: string, command: Command): CommandResult {
    if (!command || typeof command !== 'object' || typeof (command as { type?: unknown }).type !== 'string') return { ok: false, error: 'Ungültiges Kommando.' };
    if (SERVER_ONLY_COMMANDS.has(command.type)) return { ok: false, error: 'Die Zeit läuft online für alle gleich; Geschwindigkeit und Pause setzt der Server.' };
    if (!this.sim.world.players[playerId]) return { ok: false, error: 'Du bist dieser Welt noch nicht beigetreten.' };
    const result = this.sim.apply(command, playerId);
    if (result.ok) {
      const entry: CommandEntry = { seq: ++this.seq, tick: this.tick, playerId, command };
      this.broadcast({ t: 'cmd', entry });
      this.dirty = true;
    }
    return result;
  }

  /** Advances the world by the real time that passed; called from a timer. */
  step(now = Date.now()): number {
    const dt = Math.max(0, (now - this.lastStep) / 1000);
    this.lastStep = now;
    this.accumulator += dt * this.sim.world.speed * MINUTES_PER_SECOND;
    let ticks = Math.floor(this.accumulator);
    if (ticks <= 0) return 0;
    if (ticks > MAX_TICKS_PER_STEP) {
      ticks = MAX_TICKS_PER_STEP;
      this.accumulator = 0;
    } else {
      this.accumulator -= ticks;
    }
    const before = this.tick;
    this.sim.run(ticks);
    this.sim.drainEvents();
    this.dirty = true;
    this.broadcast({ t: 'tick', tick: this.tick });
    if (Math.floor(this.tick / HASH_EVERY_TICKS) !== Math.floor(before / HASH_EVERY_TICKS)) this.broadcast({ t: 'hash', tick: this.tick, hash: this.hash() });
    return ticks;
  }

  start(): void {
    if (this.timer) return;
    this.lastStep = Date.now();
    this.timer = setInterval(() => this.step(), 250);
    this.saveTimer = setInterval(() => {
      if (this.dirty) this.save();
    }, this.options.autosaveSeconds * 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.timer = null;
    this.saveTimer = null;
    this.save();
  }

  /** Writes the world atomically (temp file + rename). */
  save(): void {
    mkdirSync(dirname(this.options.file), { recursive: true });
    const tmp = `${this.options.file}.tmp`;
    writeFileSync(tmp, serialize(this.sim.world, this.sim.world.meta.cityName), 'utf8');
    renameSync(tmp, this.options.file);
    this.dirty = false;
  }
}
