import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloudService, FileCloudStore, MemoryCloudStore, handleCloudRequest } from '../../server/cloud';
import { startServer, type RunningServer } from '../../server/index';
import { createNewGame, Simulation } from '../../src/sim/engine';
import { serialize } from '../../src/persistence/serializer';
import { checkPlacement } from '../../src/sim/systems/construction';
import type { CloudAuthResponse, CloudMeta } from '../../src/net/cloudProtocol';

const SECRET = 'test-secret-with-enough-length';

function sampleSave(): { text: string; tick: number } {
  const sim = new Simulation(createNewGame({ progression: false, seed: 'cloud', playerName: 'Wolke', difficulty: 'standard', background: 'restaurateur', citySize: 32 }));
  const { grid } = sim.state;
  outer: for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++)
      if (checkPlacement(sim.state, 'food_stand', x, y).ok) {
        sim.apply({ type: 'placeBuilding', defId: 'food_stand', x, y });
        break outer;
      }
  sim.run(600);
  return { text: serialize(sim.world, 'Wolkenspiel'), tick: sim.world.tick };
}

describe('Cloud saves: service', () => {
  it('registers, logs in, signs tokens and rejects bad credentials or expired tokens', async () => {
    const service = new CloudService(new MemoryCloudStore(), SECRET);
    expect(() => new CloudService(new MemoryCloudStore(), 'short')).toThrow();
    const bad = await service.register('x', 'geheim1');
    expect(bad.ok).toBe(false);
    const reg = await service.register('Ada', 'geheim1');
    expect(reg.ok).toBe(true);
    const token = reg.ok ? reg.value.token : '';
    expect(service.verify(token)?.name).toBe('Ada');
    expect(service.verify(`${token}x`)).toBeNull();
    expect(service.verify('a.b.c.d')).toBeNull();
    const dupe = await service.register('ada', 'geheim1');
    expect(dupe.ok).toBe(false);
    const wrong = await service.login('Ada', 'falsch!');
    expect(wrong.ok).toBe(false);
    const login = await service.login('ada', 'geheim1');
    expect(login.ok && service.verify(login.value.token)?.userId).toBe(service.verify(token)?.userId);
    // Tokens signed with another secret are refused.
    const other = new CloudService(new MemoryCloudStore(), 'another-secret-with-length');
    expect(other.verify(token)).toBeNull();
  });

  it('changes the password (signing other devices out), deletes the save and deletes the account', async () => {
    const store = new MemoryCloudStore();
    const service = new CloudService(store, SECRET);
    const reg = await service.register('Eve', 'geheim1');
    const phoneToken = reg.ok ? reg.value.token : '';
    const phone = await service.authenticate(phoneToken);
    expect(phone?.user.name).toBe('Eve');
    const { text } = sampleSave();
    expect((await service.save(phone!.user.id, text, 'Spiel', 'Handy')).ok).toBe(true);
    // Wrong current password, too short or unchanged new password are refused.
    expect((await service.changePassword(phone!.user, 'falsch!', 'neues-pw')).ok).toBe(false);
    expect((await service.changePassword(phone!.user, 'geheim1', 'kurz')).ok).toBe(false);
    expect((await service.changePassword(phone!.user, 'geheim1', 'geheim1')).ok).toBe(false);
    const changed = await service.changePassword(phone!.user, 'geheim1', 'neues-pw');
    expect(changed.ok).toBe(true);
    const pcToken = changed.ok ? changed.value.token : '';
    // The old token still has a valid signature but a stale epoch: signed out everywhere else.
    expect(service.verify(phoneToken)).not.toBeNull();
    expect(await service.authenticate(phoneToken)).toBeNull();
    const pc = await service.authenticate(pcToken);
    expect(pc?.user.id).toBe(phone!.user.id);
    expect((await service.login('eve', 'geheim1')).ok).toBe(false);
    expect((await service.login('eve', 'neues-pw')).ok).toBe(true);
    expect(service.account(pc!.user, pc!.expiresAt).passwordChangedAt).not.toBeNull();
    // Delete the save only: account stays.
    await service.deleteSave(pc!.user.id);
    expect(await service.meta(pc!.user.id)).toBeNull();
    expect(await service.authenticate(pcToken)).not.toBeNull();
    // Delete the account: needs the password, then login and tokens fail.
    expect((await service.deleteAccount(pc!.user, 'geheim1')).ok).toBe(false);
    expect((await service.deleteAccount(pc!.user, 'neues-pw')).ok).toBe(true);
    expect(await service.authenticate(pcToken)).toBeNull();
    expect((await service.login('eve', 'neues-pw')).ok).toBe(false);
    expect(store.users.size).toBe(0);
    expect(store.saves.size).toBe(0);
    // The name is free again.
    expect((await service.register('Eve', 'geheim1')).ok).toBe(true);
  });

  it('stores one validated save per user and refuses garbage or oversized uploads', async () => {
    const service = new CloudService(new MemoryCloudStore(), SECRET);
    const reg = await service.register('Bo', 'geheim2');
    const userId = service.verify(reg.ok ? reg.value.token : '')!.userId;
    expect(await service.meta(userId)).toBeNull();
    const garbage = await service.save(userId, '{"hello":1}', 'x', 'PC');
    expect(garbage.ok).toBe(false);
    const huge = await service.save(userId, 'x'.repeat(9 * 1024 * 1024), 'x', 'PC');
    expect(huge.ok && 'status' in huge).toBe(false);
    expect(!huge.ok && huge.status).toBe(413);
    const { text, tick } = sampleSave();
    const saved = await service.save(userId, text, 'Wolkenspiel', 'Handy · Chrome');
    expect(saved.ok).toBe(true);
    const meta = saved.ok ? saved.value : (null as unknown as CloudMeta);
    expect(meta.tick).toBe(tick);
    expect(meta.playerName).toBe('Wolke');
    expect(meta.device).toBe('Handy · Chrome');
    expect(meta.bytes).toBe(Buffer.byteLength(text));
    const loaded = await service.load(userId);
    expect(loaded?.data).toBe(text);
    expect((await service.meta(userId))?.tick).toBe(tick);
    // HTTP layer: auth required, PUT then GET.
    const unauth = await handleCloudRequest(service, 'meta', 'GET', undefined, null);
    expect(unauth.status).toBe(401);
    const put = await handleCloudRequest(service, 'save', 'PUT', `Bearer ${reg.ok ? reg.value.token : ''}`, { data: text, name: 'Wolkenspiel', device: 'PC' });
    expect(put.status).toBe(200);
    const get = await handleCloudRequest(service, 'save', 'GET', `Bearer ${reg.ok ? reg.value.token : ''}`, null);
    expect(get.status).toBe(200);
    expect((get.body as { data: string }).data).toBe(text);
    expect((await handleCloudRequest(service, 'nope', 'GET', `Bearer ${reg.ok ? reg.value.token : ''}`, null)).status).toBe(404);
  });

  it('persists users and saves as files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'neon-cloud-'));
    try {
      const a = new CloudService(new FileCloudStore(dir), SECRET);
      const reg = await a.register('Cy', 'geheim3');
      const token = reg.ok ? reg.value.token : '';
      const { text } = sampleSave();
      expect((await a.save(a.verify(token)!.userId, text, 'n', 'PC')).ok).toBe(true);
      // A fresh service over the same directory sees the account and the save.
      const b = new CloudService(new FileCloudStore(dir), SECRET);
      const login = await b.login('Cy', 'geheim3');
      expect(login.ok).toBe(true);
      expect((await b.load(b.verify(login.ok ? login.value.token : '')!.userId))?.data).toBe(text);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Cloud saves: game server endpoints', () => {
  let server: RunningServer;
  let dataDir: string;
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'neon-cloud-srv-'));
    server = await startServer({ port: 0, dataDir, seed: 'cloud-srv', citySize: 32, difficulty: 'standard', speed: 1, autosaveSeconds: 60, staticDir: null, log: () => {} });
  }, 60000);
  afterAll(async () => {
    await server.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('serves register, login, meta and save over HTTP', async () => {
    const base = `http://localhost:${server.port}`;
    const call = async (path: string, method: string, body?: unknown, token?: string) => {
      const res = await fetch(`${base}/api/cloud/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, data: (await res.json()) as Record<string, unknown> };
    };
    const reg = await call('register', 'POST', { name: 'Dee', password: 'geheim4' });
    expect(reg.status).toBe(200);
    const token = (reg.data as unknown as CloudAuthResponse).token;
    expect((await call('meta', 'GET', undefined, token)).data).toEqual({ meta: null });
    expect((await call('save', 'GET', undefined, token)).status).toBe(404);
    const { text, tick } = sampleSave();
    const put = await call('save', 'PUT', { data: text, name: 'Wolkenspiel', device: 'Handy' }, token);
    expect(put.status).toBe(200);
    expect(((put.data as { meta: CloudMeta }).meta).tick).toBe(tick);
    const got = await call('save', 'GET', undefined, token);
    expect(got.status).toBe(200);
    expect((got.data as { data: string }).data).toBe(text);
    expect((await call('meta', 'GET', undefined, 'bad')).status).toBe(401);
    const login = await call('login', 'POST', { name: 'dee', password: 'geheim4' });
    expect(login.status).toBe(200);

    // Account management over HTTP: info, password change, delete save, delete account.
    const info = await call('account', 'GET', undefined, token);
    expect(info.status).toBe(200);
    expect((info.data as { account: { name: string } }).account.name).toBe('Dee');
    expect((await call('password', 'POST', { current: 'falsch', next: 'geheim5' }, token)).status).toBe(401);
    const pw = await call('password', 'POST', { current: 'geheim4', next: 'geheim5' }, token);
    expect(pw.status).toBe(200);
    const token2 = (pw.data as unknown as CloudAuthResponse).token;
    expect((await call('meta', 'GET', undefined, token)).status).toBe(401); // old token signed out
    expect((await call('meta', 'GET', undefined, token2)).status).toBe(200);
    expect((await call('save', 'DELETE', {}, token2)).status).toBe(200);
    expect((await call('save', 'GET', undefined, token2)).status).toBe(404);
    expect((await call('account', 'DELETE', { password: 'geheim4' }, token2)).status).toBe(401);
    expect((await call('account', 'DELETE', { password: 'geheim5' }, token2)).status).toBe(200);
    expect((await call('meta', 'GET', undefined, token2)).status).toBe(401);
    expect((await call('login', 'POST', { name: 'dee', password: 'geheim5' })).status).toBe(401);
  });
});
