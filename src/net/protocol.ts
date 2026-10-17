/**
 * Wire protocol between the online server and clients. The world is shared
 * in lockstep: every client runs the same deterministic simulation and
 * applies the same commands at the same ticks; the server is authoritative
 * (it validates commands, owns the clock and saves the world).
 */

import type { Command, CommandResult } from '../sim/engine';
import type { BackgroundId, DifficultyId } from '../sim/data/difficulty';

export interface OnlinePlayer {
  id: string;
  name: string;
  online: boolean;
}

/** A command the server applied; clients apply it when their simulation reaches `tick`. */
export interface CommandEntry {
  seq: number;
  tick: number;
  playerId: string;
  command: Command;
}

export interface JoinEntry {
  seq: number;
  tick: number;
  player: { id: string; name: string; background: BackgroundId; difficulty: DifficultyId };
}

export type ServerMessage =
  | { t: 'welcome'; playerId: string; tick: number; speed: number; seq: number; snapshot: string; players: OnlinePlayer[] }
  | { t: 'cmd'; entry: CommandEntry }
  | { t: 'join'; entry: JoinEntry }
  | { t: 'tick'; tick: number }
  | { t: 'hash'; tick: number; hash: string }
  | { t: 'result'; requestId: number; result: CommandResult }
  | { t: 'presence'; players: OnlinePlayer[] }
  | { t: 'snapshot'; tick: number; seq: number; snapshot: string }
  | { t: 'error'; message: string };

export type ClientMessage = { t: 'cmd'; requestId: number; command: Command } | { t: 'resync' } | { t: 'ping' };

export interface RegisterRequest {
  name: string;
  password: string;
  background: BackgroundId;
}

export interface LoginRequest {
  name: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  playerId: string;
  name: string;
}

export interface StatusResponse {
  tick: number;
  speed: number;
  players: number;
  online: number;
  cityName: string;
  version: string;
}

/** Commands that only the server may issue (world clock). */
export const SERVER_ONLY_COMMANDS: ReadonlySet<Command['type']> = new Set(['setSpeed']);
