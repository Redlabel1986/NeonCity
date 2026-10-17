/**
 * Neon Dynasty online server: accounts, one persistent shared world and a
 * WebSocket feed that keeps every client in lockstep. Serves the built
 * client from dist/ when present.
 *
 *   npm run server   (entry: server/main.ts; env variables in DEPLOY.md)
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { Accounts } from './accounts';
import { WorldHost } from './world';
import { BACKGROUNDS, type BackgroundId, type DifficultyId } from '../src/sim/data/difficulty';
import type { AuthResponse, ClientMessage, LoginRequest, OnlinePlayer, RegisterRequest, ServerMessage, StatusResponse } from '../src/net/protocol';

export interface ServerOptions {
  port: number;
  dataDir: string;
  seed: string;
  citySize: number;
  difficulty: DifficultyId;
  speed: number;
  autosaveSeconds: number;
  staticDir: string | null;
  log?: (line: string) => void;
}

export interface RunningServer {
  port: number;
  host: WorldHost;
  accounts: Accounts;
  close: () => Promise<void>;
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
      if (data.length > 64 * 1024) {
        reject(new Error('Anfrage zu groß.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolvePromise(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Ungültiges JSON.'));
      }
    });
    req.on('error', reject);
  });
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const log = options.log ?? ((line: string) => console.log(line));
  const accounts = new Accounts(join(options.dataDir, 'accounts.json'));
  const host = new WorldHost({ file: join(options.dataDir, 'world.json'), seed: options.seed, citySize: options.citySize, difficulty: options.difficulty, speed: options.speed, autosaveSeconds: options.autosaveSeconds });
  log(`${host.loadedFromDisk ? 'Welt geladen' : 'Neue Welt erzeugt'}: Tag ${Math.floor((host.tick + 7 * 60) / 1440) + 1}, ${host.sim.playerIds.length} Spieler, Geschwindigkeit ${options.speed}×`);
  // Players registered before a crash are re-added to a fresh world.
  for (const user of accounts.list()) host.join({ id: user.id, name: user.name, background: user.background, difficulty: options.difficulty });

  const sockets = new Map<WebSocket, { playerId: string; name: string }>();
  const send = (ws: WebSocket, message: ServerMessage): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };
  const presence = (): OnlinePlayer[] => {
    const online = new Set([...sockets.values()].map((s) => s.playerId));
    return host.sim.playerIds.map((id) => ({ id, name: host.sim.world.players[id]!.player.name, online: online.has(id) }));
  };
  const broadcastPresence = (): void => {
    const players = presence();
    for (const ws of sockets.keys()) send(ws, { t: 'presence', players });
  };
  host.onBroadcast((message) => {
    const text = JSON.stringify(message);
    for (const ws of sockets.keys()) if (ws.readyState === ws.OPEN) ws.send(text);
  });

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (req.method === 'OPTIONS') return json(res, 204, {});
      if (url.pathname === '/api/status') {
        const body: StatusResponse = { tick: host.tick, speed: host.sim.world.speed, players: host.sim.playerIds.length, online: sockets.size, cityName: host.sim.world.meta.cityName, version: '0.14.0' };
        return json(res, 200, body);
      }
      if (url.pathname === '/api/register' && req.method === 'POST') {
        const body = (await readBody(req)) as Partial<RegisterRequest>;
        const background = typeof body.background === 'string' && body.background in BACKGROUNDS ? (body.background as BackgroundId) : null;
        if (!background) return json(res, 400, { error: 'Unbekannter Hintergrund.' });
        const result = accounts.register(String(body.name ?? ''), String(body.password ?? ''), background);
        if (!result.ok) return json(res, 400, { error: result.error });
        const joined = host.join({ id: result.user.id, name: result.user.name, background, difficulty: options.difficulty });
        if (!joined.ok) return json(res, 500, { error: joined.error });
        broadcastPresence();
        const response: AuthResponse = { token: result.token, playerId: result.user.id, name: result.user.name };
        log(`Registriert: ${result.user.name} (${result.user.id})`);
        return json(res, 200, response);
      }
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const body = (await readBody(req)) as Partial<LoginRequest>;
        const result = accounts.login(String(body.name ?? ''), String(body.password ?? ''));
        if (!result.ok) return json(res, 401, { error: result.error });
        host.join({ id: result.user.id, name: result.user.name, background: result.user.background, difficulty: options.difficulty });
        const response: AuthResponse = { token: result.token, playerId: result.user.id, name: result.user.name };
        return json(res, 200, response);
      }
      if (url.pathname === '/api/me') {
        const user = accounts.authenticate(req.headers.authorization?.replace(/^Bearer\s+/i, ''));
        if (!user) return json(res, 401, { error: 'Nicht angemeldet.' });
        return json(res, 200, { playerId: user.id, name: user.name });
      }
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Unbekannter Endpunkt.' });
      // Static client
      if (options.staticDir) {
        const rel = url.pathname === '/' ? '/index.html' : url.pathname;
        const file = normalize(join(options.staticDir, rel));
        if (file.startsWith(resolve(options.staticDir)) && existsSync(file) && statSync(file).isFile()) {
          res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
          return res.end(readFileSync(file));
        }
        const index = join(options.staticDir, 'index.html');
        if (existsSync(index)) {
          res.writeHead(200, { 'Content-Type': MIME['.html']! });
          return res.end(readFileSync(index));
        }
      }
      res.writeHead(404);
      res.end('Not found');
    } catch (err) {
      json(res, 400, { error: (err as Error).message });
    }
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const user = accounts.authenticate(url.searchParams.get('token'));
    if (!user) {
      send(ws, { t: 'error', message: 'Anmeldung ungültig oder abgelaufen.' });
      ws.close(4001, 'unauthorized');
      return;
    }
    host.join({ id: user.id, name: user.name, background: user.background, difficulty: options.difficulty });
    sockets.set(ws, { playerId: user.id, name: user.name });
    const snap = host.snapshot();
    send(ws, { t: 'welcome', playerId: user.id, tick: snap.tick, speed: host.sim.world.speed, seq: snap.seq, snapshot: snap.snapshot, players: presence() });
    broadcastPresence();
    log(`Verbunden: ${user.name}`);
    ws.on('message', (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return send(ws, { t: 'error', message: 'Ungültige Nachricht.' });
      }
      if (message.t === 'cmd') {
        const result = host.apply(user.id, message.command);
        send(ws, { t: 'result', requestId: message.requestId, result });
      } else if (message.t === 'resync') {
        const s = host.snapshot();
        send(ws, { t: 'snapshot', tick: s.tick, seq: s.seq, snapshot: s.snapshot });
      } else if (message.t === 'ping') {
        send(ws, { t: 'tick', tick: host.tick });
      }
    });
    ws.on('close', () => {
      sockets.delete(ws);
      broadcastPresence();
      log(`Getrennt: ${user.name}`);
    });
  });

  host.start();
  await new Promise<void>((resolvePromise) => httpServer.listen(options.port, resolvePromise));
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  log(`Neon Dynasty Server läuft auf http://localhost:${port}`);
  return {
    port,
    host,
    accounts,
    close: () =>
      new Promise<void>((resolvePromise) => {
        host.stop();
        for (const ws of sockets.keys()) ws.close(1001, 'server shutdown');
        wss.close();
        httpServer.close(() => resolvePromise());
      }),
  };
}
