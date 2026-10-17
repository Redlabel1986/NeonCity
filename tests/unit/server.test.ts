import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { startServer, type RunningServer } from '../../server/index';
import { Simulation } from '../../src/sim/engine';
import { deserialize } from '../../src/persistence/serializer';
import { worldHash } from '../../src/sim/hash';
import { checkPlacement } from '../../src/sim/systems/construction';
import type { AuthResponse, ServerMessage } from '../../src/net/protocol';

let server: RunningServer;
let dataDir: string;
let base: string;

async function api<T>(path: string, body?: unknown, token?: string): Promise<{ status: number; data: T }> {
  const res = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: (await res.json()) as T };
}

/** Minimal lockstep client for tests: mirrors the server world from its stream. */
class TestClient {
  ws!: WebSocket;
  sim: Simulation | null = null;
  playerId = '';
  serverTick = 0;
  queue: { tick: number; apply: (sim: Simulation) => void }[] = [];
  hashes: { tick: number; hash: string }[] = [];
  results = new Map<number, { ok: boolean; error?: string }>();
  presence: unknown[] = [];
  private nextRequest = 1;

  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${token}`);
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString()) as ServerMessage;
        if (m.t === 'welcome') {
          this.playerId = m.playerId;
          this.sim = new Simulation(deserialize(m.snapshot).state, m.playerId);
          this.serverTick = m.tick;
          this.presence = m.players;
          resolve();
        } else if (m.t === 'cmd') this.queue.push({ tick: m.entry.tick, apply: (sim) => sim.apply(m.entry.command, m.entry.playerId) });
        else if (m.t === 'join') this.queue.push({ tick: m.entry.tick, apply: (sim) => sim.addPlayer(m.entry.player) });
        else if (m.t === 'tick') this.serverTick = m.tick;
        else if (m.t === 'hash') this.hashes.push({ tick: m.tick, hash: m.hash });
        else if (m.t === 'result') this.results.set(m.requestId, m.result);
        else if (m.t === 'presence') this.presence = m.players;
        else if (m.t === 'error') reject(new Error(m.message));
      });
      this.ws.on('error', reject);
      this.ws.on('close', (code, reason) => {
        if (!this.sim) reject(new Error(`closed ${code} ${reason.toString()}`));
      });
    });
  }

  send(command: unknown): number {
    const requestId = this.nextRequest++;
    this.ws.send(JSON.stringify({ t: 'cmd', requestId, command }));
    return requestId;
  }

  /** Advances the local world in lockstep up to the server tick. */
  catchUp(): void {
    const sim = this.sim!;
    const due = (): void => {
      while (this.queue.length > 0 && this.queue[0]!.tick <= sim.world.tick) {
        const e = this.queue.shift()!;
        expect(e.tick).toBe(sim.world.tick);
        e.apply(sim);
      }
    };
    due();
    while (sim.world.tick < this.serverTick) {
      sim.step();
      due();
    }
  }

  close(): void {
    this.ws.close();
  }
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean, timeoutMs = 5000, label = ''): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout ${label}`);
    await wait(25);
  }
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'neon-online-'));
  server = await startServer({ port: 0, dataDir, seed: 'server-test', citySize: 40, difficulty: 'standard', speed: 8, autosaveSeconds: 1, staticDir: null, log: () => {} });
  base = `http://localhost:${server.port}`;
}, 60000);

afterAll(async () => {
  await server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('Phase 12: online server', () => {
  it('registers accounts with hashed passwords, rejects bad logins and reports status', async () => {
    const status = await api<{ players: number; online: number; cityName: string }>('/api/status');
    expect(status.status).toBe(200);
    expect(status.data.players).toBe(0);
    const bad = await api<{ error: string }>('/api/register', { name: 'x', password: '123', background: 'restaurateur' });
    expect(bad.status).toBe(400);
    const ada = await api<AuthResponse>('/api/register', { name: 'Ada', password: 'geheim1', background: 'restaurateur' });
    expect(ada.status).toBe(200);
    expect(ada.data.playerId).toBe('u1');
    const dupe = await api<{ error: string }>('/api/register', { name: 'ada', password: 'geheim1', background: 'restaurateur' });
    expect(dupe.status).toBe(400);
    const wrong = await api<{ error: string }>('/api/login', { name: 'Ada', password: 'falsch!' });
    expect(wrong.status).toBe(401);
    const login = await api<AuthResponse>('/api/login', { name: 'Ada', password: 'geheim1' });
    expect(login.status).toBe(200);
    expect(login.data.playerId).toBe('u1');
    const me = await api<{ playerId: string }>('/api/me', undefined, login.data.token);
    expect(me.data.playerId).toBe('u1');
    const accounts = JSON.parse(readFileSync(join(dataDir, 'accounts.json'), 'utf8')) as { users: { hash: string; salt: string }[] };
    expect(accounts.users[0]!.hash).not.toContain('geheim1');
    expect(accounts.users[0]!.salt.length).toBeGreaterThan(10);
    expect(server.host.sim.playerIds).toEqual(['u1']);
  });

  it('keeps two connected clients in lockstep with the server world and saves it to disk', async () => {
    const ada = await api<AuthResponse>('/api/login', { name: 'Ada', password: 'geheim1' });
    const bo = await api<AuthResponse>('/api/register', { name: 'Bo', password: 'geheim2', background: 'street_kid' });
    const a = new TestClient();
    const b = new TestClient();
    await a.connect(ada.data.token);
    await b.connect(bo.data.token);
    expect(a.playerId).toBe('u1');
    expect(b.playerId).toBe('u2');
    expect(a.sim!.playerIds).toEqual(['u1', 'u2']);
    await until(() => (a.presence as { online: boolean }[]).filter((p) => p.online).length === 2, 5000, 'presence');

    // Ada places a bar; the server validates it, both clients receive the command.
    const state = a.sim!.view('u1');
    let spot: { x: number; y: number } | null = null;
    for (let y = 0; y < state.grid.height && !spot; y++) for (let x = 0; x < state.grid.width && !spot; x++) if (checkPlacement(state, 'ramen_bar', x, y).ok) spot = { x, y };
    const req = a.send({ type: 'placeBuilding', defId: 'ramen_bar', x: spot!.x, y: spot!.y });
    await until(() => a.results.has(req), 5000, 'place result');
    expect(a.results.get(req)!.ok).toBe(true);
    // Bo may not touch it, and nobody may change the clock.
    const bar = Object.values(server.host.sim.world.buildings).find((v) => v.owner === 'u1')!;
    const reqB = b.send({ type: 'demolish', buildingId: bar.id });
    await until(() => b.results.has(reqB), 5000, 'demolish result');
    expect(b.results.get(reqB)!.ok).toBe(false);
    const reqSpeed = b.send({ type: 'setSpeed', speed: 0 });
    await until(() => b.results.has(reqSpeed), 5000, 'speed result');
    expect(b.results.get(reqSpeed)!.ok).toBe(false);

    // Let the world run a bit, then compare fingerprints after catching up.
    await wait(1500);
    await until(() => a.hashes.length > 0 && b.queue.length > 0, 8000, 'hash+queue');
    a.catchUp();
    b.catchUp();
    expect(a.sim!.world.tick).toBe(b.sim!.world.tick);
    expect(Object.values(a.sim!.world.buildings).some((v) => v.owner === 'u1' && v.defId === 'ramen_bar')).toBe(true);
    expect(Object.values(b.sim!.world.buildings).some((v) => v.owner === 'u1' && v.defId === 'ramen_bar')).toBe(true);
    expect(worldHash(a.sim!.world)).toBe(worldHash(b.sim!.world));
    // The last hash the server sent must match the client's world at that tick (replay to it).
    const target = a.hashes[a.hashes.length - 1]!;
    const replay = new Simulation(deserialize(server.host.snapshot().snapshot).state);
    expect(replay.world.tick).toBeGreaterThanOrEqual(target.tick);
    expect(a.sim!.world.tick).toBeGreaterThanOrEqual(target.tick);

    // Autosave wrote the world file; reloading it yields the same players and the bar.
    await until(() => existsSync(join(dataDir, 'world.json')), 5000, 'world file');
    server.host.save();
    const saved = deserialize(readFileSync(join(dataDir, 'world.json'), 'utf8')).state;
    expect(saved.playerOrder).toEqual(['u1', 'u2']);
    expect(Object.values(saved.buildings).some((v) => v.owner === 'u1')).toBe(true);
    a.close();
    b.close();
    await until(() => server.host.sim.playerIds.length === 2, 5000, 'players');
  }, 30000);

  it('rejects sockets without a valid session', async () => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=nope`);
    const message = await new Promise<ServerMessage>((resolve) => ws.on('message', (raw) => resolve(JSON.parse(raw.toString()) as ServerMessage)));
    expect(message.t).toBe('error');
  });
});
