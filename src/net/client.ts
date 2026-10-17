/**
 * Online client: talks to the game server over WebSocket and keeps the
 * local simulation in lockstep with it. The local Simulation only advances
 * to ticks the server has announced and applies the server's command
 * stream at the exact ticks the server applied it, so every client and the
 * server compute the same world.
 */

import type { Command, CommandResult, Simulation } from '../sim/engine';
import { deserialize } from '../persistence/serializer';
import { worldHash } from '../sim/hash';
import type { WorldState } from '../sim/state';
import type { ClientMessage, CommandEntry, JoinEntry, OnlinePlayer, ServerMessage } from './protocol';

export interface OnlineHandlers {
  /** A full world arrived (on connect and after a resync). */
  onWorld: (world: WorldState, playerId: string, tick: number) => void;
  onPresence: (players: OnlinePlayer[]) => void;
  onDisconnect: (reason: string) => void;
  onNotice: (level: 'info' | 'warning' | 'danger', message: string) => void;
  /** A building footprint is about to disappear (ground tiles need redrawing). */
  onBuildingRemoved?: (x: number, y: number, w: number, h: number) => void;
}

type Entry = { kind: 'cmd'; entry: CommandEntry } | { kind: 'join'; entry: JoinEntry };

export class OnlineClient {
  readonly url: string;
  readonly token: string;
  playerId = '';
  serverTick = 0;
  speed = 1;
  players: OnlinePlayer[] = [];
  connected = false;
  private ws: WebSocket | null = null;
  private seq = 0;
  private queue: Entry[] = [];
  private pending = new Map<number, (result: CommandResult) => void>();
  private nextRequest = 1;
  private expectedHash: { tick: number; hash: string } | null = null;
  private resyncing = false;
  private readonly handlers: OnlineHandlers;
  private closedByUser = false;

  constructor(url: string, token: string, handlers: OnlineHandlers) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
    this.handlers = handlers;
  }

  /** Opens the socket; resolves once the world snapshot has been loaded. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.url.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(this.token)}`;
      let settled = false;
      const ws = new WebSocket(wsUrl);
      this.ws = ws;
      ws.onopen = () => {
        this.connected = true;
      };
      ws.onmessage = (ev) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          return;
        }
        this.handle(message);
        if (message.t === 'welcome' && !settled) {
          settled = true;
          resolve();
        }
        if (message.t === 'error' && !settled) {
          settled = true;
          reject(new Error(message.message));
        }
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Verbindung zum Server fehlgeschlagen.'));
        }
      };
      ws.onclose = (ev) => {
        this.connected = false;
        if (!settled) {
          settled = true;
          reject(new Error(ev.reason || 'Verbindung geschlossen.'));
          return;
        }
        if (!this.closedByUser) this.handlers.onDisconnect(ev.reason || 'Verbindung zum Server verloren.');
      };
    });
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close(1000, 'client closed');
    this.ws = null;
    this.connected = false;
  }

  /** Sends a command; resolves with the server's verdict. The command itself arrives through the stream. */
  send(command: Command): Promise<CommandResult> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.resolve({ ok: false, error: 'Nicht mit dem Server verbunden.' });
    const requestId = this.nextRequest++;
    const message: ClientMessage = { t: 'cmd', requestId, command };
    this.ws.send(JSON.stringify(message));
    return new Promise((resolve) => {
      this.pending.set(requestId, resolve);
      setTimeout(() => {
        if (this.pending.delete(requestId)) resolve({ ok: false, error: 'Der Server hat nicht geantwortet.' });
      }, 10000);
    });
  }

  resync(): void {
    if (this.resyncing || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.resyncing = true;
    const message: ClientMessage = { t: 'resync' };
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Applies every queued entry the server applied at the simulation's
   * current tick. Returns true when something structural happened.
   */
  applyDue(sim: Simulation): boolean {
    let structural = false;
    while (this.queue.length > 0) {
      const next = this.queue[0]!;
      const tick = next.entry.tick;
      if (tick > sim.world.tick) break;
      if (tick < sim.world.tick) {
        // We ran past a command: the stream and our clock disagree; take a fresh snapshot.
        this.queue = [];
        this.handlers.onNotice('warning', 'Zeitversatz zum Server, Welt wird neu geladen.');
        this.resync();
        return structural;
      }
      this.queue.shift();
      if (next.kind === 'join') {
        sim.addPlayer(next.entry.player);
        structural = true;
      } else {
        const cmd = next.entry.command;
        if (cmd.type === 'demolish' || cmd.type === 'undoPlacement') {
          const id = cmd.type === 'demolish' ? cmd.buildingId : sim.view(next.entry.playerId).undoStack.at(-1)?.buildingId;
          const b = id !== undefined ? sim.world.buildings[id] : undefined;
          if (b) this.handlers.onBuildingRemoved?.(b.x, b.y, b.w, b.h);
        }
        const result = sim.apply(cmd, next.entry.playerId);
        if (!result.ok) {
          this.handlers.onNotice('warning', `Kommando vom Server konnte lokal nicht angewendet werden (${result.error}). Welt wird neu geladen.`);
          this.queue = [];
          this.resync();
          return structural;
        }
        const type = next.entry.command.type;
        if (type === 'placeBuilding' || type === 'undoPlacement' || type === 'demolish' || type === 'buyProperty' || type === 'sellProperty' || type === 'takeoverCompetitor' || type === 'chainTakeover' || type === 'sellCompany') structural = true;
      }
    }
    return structural;
  }

  /** Compares the local world with the server's fingerprint once the tick is reached. */
  checkHash(sim: Simulation): void {
    const expected = this.expectedHash;
    if (!expected || sim.world.tick < expected.tick) return;
    this.expectedHash = null;
    if (sim.world.tick !== expected.tick) return;
    if (worldHash(sim.world) !== expected.hash) {
      this.handlers.onNotice('warning', 'Die Welt ist vom Server abgewichen und wird neu geladen.');
      this.queue = [];
      this.resync();
    }
  }

  private handle(message: ServerMessage): void {
    switch (message.t) {
      case 'welcome': {
        this.playerId = message.playerId;
        this.speed = message.speed;
        this.players = message.players;
        this.loadSnapshot(message.snapshot, message.tick, message.seq);
        break;
      }
      case 'snapshot':
        this.resyncing = false;
        this.loadSnapshot(message.snapshot, message.tick, message.seq);
        break;
      case 'cmd':
        if (message.entry.seq > this.seq) {
          this.seq = message.entry.seq;
          this.queue.push({ kind: 'cmd', entry: message.entry });
        }
        break;
      case 'join':
        if (message.entry.seq > this.seq) {
          this.seq = message.entry.seq;
          this.queue.push({ kind: 'join', entry: message.entry });
        }
        break;
      case 'tick':
        this.serverTick = Math.max(this.serverTick, message.tick);
        break;
      case 'hash':
        this.expectedHash = { tick: message.tick, hash: message.hash };
        break;
      case 'result': {
        const resolve = this.pending.get(message.requestId);
        if (resolve) {
          this.pending.delete(message.requestId);
          resolve(message.result);
        }
        break;
      }
      case 'presence':
        this.players = message.players;
        this.handlers.onPresence(message.players);
        break;
      case 'error':
        this.handlers.onNotice('danger', message.message);
        break;
      default:
        break;
    }
  }

  private loadSnapshot(snapshot: string, tick: number, seq: number): void {
    const { state } = deserialize(snapshot);
    this.seq = seq;
    this.serverTick = Math.max(tick, state.tick);
    this.queue = this.queue.filter((e) => e.entry.seq > seq);
    this.expectedHash = null;
    this.handlers.onWorld(state, this.playerId, tick);
  }
}

/** REST helpers for the account endpoints. */
export async function onlineRequest<T>(url: string, path: string, body?: unknown, token?: string): Promise<T> {
  const response = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Server antwortet mit ${response.status}.`);
  return data;
}
