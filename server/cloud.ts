/**
 * Cloud-save service: accounts (scrypt), HMAC tokens carrying a per-user
 * epoch (a password change signs other devices out), one save per user,
 * password change and deletion of save or account. Storage is pluggable: files for the Node server, Vercel
 * Blob for the serverless deployment, memory for tests.
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { validateSaveFile } from '../src/persistence/serializer';
import { CLOUD_MAX_BYTES, type CloudAuthResponse, type CloudMeta } from '../src/net/cloudProtocol';

export interface CloudUser {
  id: string;
  name: string;
  salt: string;
  hash: string;
  createdAt: number;
  /** Bumped on every password change; tokens carry it, so older tokens stop working. */
  tokenEpoch?: number;
  passwordChangedAt?: number;
}

export interface CloudSaveRecord {
  meta: CloudMeta;
  data: string;
}

export interface CloudStore {
  readUser(key: string): Promise<CloudUser | null>;
  writeUser(key: string, user: CloudUser): Promise<void>;
  readSave(userId: string): Promise<CloudSaveRecord | null>;
  writeSave(userId: string, record: CloudSaveRecord): Promise<void>;
  deleteUser(key: string): Promise<void>;
  deleteSave(userId: string): Promise<void>;
}

export type CloudResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const TOKEN_DAYS = 90;
const NAME_RE = /^[\p{L}\p{N} _.-]{2,24}$/u;
const MIN_PASSWORD = 6;

export interface CloudAccountInfo {
  name: string;
  createdAt: number;
  passwordChangedAt: number | null;
  /** Token expiry of the current session (ms since epoch). */
  expiresAt: number;
}

export class CloudService {
  private readonly store: CloudStore;
  private readonly secret: string;

  constructor(store: CloudStore, secret: string) {
    if (!secret || secret.length < 16) throw new Error('CLOUD_SECRET muss mindestens 16 Zeichen haben.');
    this.store = store;
    this.secret = secret;
  }

  /** Users are addressed by a keyed hash of the lower-cased name (no name list needed). */
  private userKey(name: string): string {
    return createHmac('sha256', this.secret).update(`user:${name.trim().toLowerCase()}`).digest('hex');
  }

  async register(name: string, password: string): Promise<CloudResult<CloudAuthResponse>> {
    const trimmed = name.trim();
    if (!NAME_RE.test(trimmed)) return { ok: false, status: 400, error: 'Der Name braucht 2 bis 24 Zeichen (Buchstaben, Ziffern, Leerzeichen, _ . -).' };
    if (password.length < MIN_PASSWORD) return { ok: false, status: 400, error: `Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.` };
    const key = this.userKey(trimmed);
    if (await this.store.readUser(key)) return { ok: false, status: 400, error: 'Dieser Name ist bereits vergeben. Melde dich an.' };
    const salt = randomBytes(16).toString('hex');
    const user: CloudUser = { id: randomBytes(12).toString('hex'), name: trimmed, salt, hash: scryptSync(password, salt, 32).toString('hex'), createdAt: Date.now() };
    await this.store.writeUser(key, user);
    return { ok: true, value: this.issue(user) };
  }

  private passwordMatches(user: CloudUser, password: string): boolean {
    const hash = scryptSync(password, user.salt, 32);
    const stored = Buffer.from(user.hash, 'hex');
    return hash.length === stored.length && timingSafeEqual(hash, stored);
  }

  async login(name: string, password: string): Promise<CloudResult<CloudAuthResponse>> {
    const user = await this.store.readUser(this.userKey(name));
    if (!user || !this.passwordMatches(user, password)) return { ok: false, status: 401, error: 'Unbekannter Name oder falsches Passwort.' };
    return { ok: true, value: this.issue(user) };
  }

  /** Token = userId.expiry.name.epoch.signature; the signature is checked without any session storage. */
  private issue(user: CloudUser): CloudAuthResponse {
    const expiresAt = Date.now() + TOKEN_DAYS * 86400000;
    const payload = `${user.id}.${expiresAt}.${encodeURIComponent(user.name)}.${user.tokenEpoch ?? 0}`;
    const signature = createHmac('sha256', this.secret).update(payload).digest('hex');
    return { token: `${payload}.${signature}`, name: user.name, expiresAt };
  }

  /** Checks signature and expiry only (no storage access). */
  verify(token: string | null | undefined): { userId: string; name: string; epoch: number; expiresAt: number } | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 5) return null;
    const [userId, expiry, encodedName, epoch, signature] = parts as [string, string, string, string, string];
    const payload = `${userId}.${expiry}.${encodedName}.${epoch}`;
    const expected = createHmac('sha256', this.secret).update(payload).digest('hex');
    if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
    if (Number(expiry) < Date.now()) return null;
    return { userId, name: decodeURIComponent(encodedName), epoch: Number(epoch), expiresAt: Number(expiry) };
  }

  /**
   * Full check for authenticated requests: signature, expiry and the user's
   * current token epoch, so a password change signs every other device out.
   */
  async authenticate(token: string | null | undefined): Promise<{ user: CloudUser; expiresAt: number } | null> {
    const claim = this.verify(token);
    if (!claim) return null;
    const user = await this.store.readUser(this.userKey(claim.name));
    if (!user || user.id !== claim.userId || (user.tokenEpoch ?? 0) !== claim.epoch) return null;
    return { user, expiresAt: claim.expiresAt };
  }

  account(user: CloudUser, expiresAt: number): CloudAccountInfo {
    return { name: user.name, createdAt: user.createdAt, passwordChangedAt: user.passwordChangedAt ?? null, expiresAt };
  }

  /** Sets a new password after checking the current one; returns a fresh token (all older tokens expire). */
  async changePassword(user: CloudUser, current: string, next: string): Promise<CloudResult<CloudAuthResponse>> {
    if (!this.passwordMatches(user, current)) return { ok: false, status: 401, error: 'Das aktuelle Passwort ist falsch.' };
    if (next.length < MIN_PASSWORD) return { ok: false, status: 400, error: `Das neue Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.` };
    if (next === current) return { ok: false, status: 400, error: 'Das neue Passwort ist dasselbe wie das alte.' };
    const salt = randomBytes(16).toString('hex');
    const updated: CloudUser = { ...user, salt, hash: scryptSync(next, salt, 32).toString('hex'), tokenEpoch: (user.tokenEpoch ?? 0) + 1, passwordChangedAt: Date.now() };
    await this.store.writeUser(this.userKey(user.name), updated);
    return { ok: true, value: this.issue(updated) };
  }

  async deleteSave(userId: string): Promise<void> {
    await this.store.deleteSave(userId);
  }

  /** Deletes the save and the account after checking the password. */
  async deleteAccount(user: CloudUser, password: string): Promise<CloudResult<true>> {
    if (!this.passwordMatches(user, password)) return { ok: false, status: 401, error: 'Das Passwort ist falsch.' };
    await this.store.deleteSave(user.id);
    await this.store.deleteUser(this.userKey(user.name));
    return { ok: true, value: true };
  }

  async meta(userId: string): Promise<CloudMeta | null> {
    const record = await this.store.readSave(userId);
    return record?.meta ?? null;
  }

  async load(userId: string): Promise<CloudSaveRecord | null> {
    return this.store.readSave(userId);
  }

  /** Validates the uploaded save before storing it; returns the stored meta. */
  async save(userId: string, data: string, name: string, device: string): Promise<CloudResult<CloudMeta>> {
    if (typeof data !== 'string' || data.length === 0) return { ok: false, status: 400, error: 'Kein Spielstand übermittelt.' };
    const bytes = Buffer.byteLength(data, 'utf8');
    if (bytes > CLOUD_MAX_BYTES) return { ok: false, status: 413, error: `Der Spielstand ist zu groß (${Math.round(bytes / 1024)} KB, erlaubt ${Math.round(CLOUD_MAX_BYTES / 1024)} KB).` };
    let file;
    try {
      file = validateSaveFile(JSON.parse(data));
    } catch (err) {
      return { ok: false, status: 400, error: `Der Spielstand ist ungültig: ${(err as Error).message}` };
    }
    const state = file.state as unknown as { tick: number; players?: Record<string, { player: { name: string }; ledger: { balance: number } }>; playerOrder?: string[]; player?: { name: string }; ledger?: { balance: number } };
    const first = state.playerOrder?.[0];
    const slice = first ? state.players?.[first] : undefined;
    const meta: CloudMeta = {
      savedAt: Date.now(),
      tick: state.tick,
      name: String(name ?? file.name).slice(0, 60),
      device: String(device ?? 'Unbekannt').slice(0, 40),
      version: file.version,
      playerName: slice?.player.name ?? state.player?.name ?? 'Unbekannt',
      balance: slice?.ledger.balance ?? state.ledger?.balance ?? 0,
      bytes,
    };
    await this.store.writeSave(userId, { meta, data });
    return { ok: true, value: meta };
  }
}

/** Files under <dir>/users/<key>.json and <dir>/saves/<userId>.json (atomic writes). */
export class FileCloudStore implements CloudStore {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  private read<T>(file: string): T | null {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  }

  private write(file: string, value: unknown): void {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(value), 'utf8');
    renameSync(tmp, file);
  }

  async readUser(key: string): Promise<CloudUser | null> {
    return this.read<CloudUser>(join(this.dir, 'users', `${key}.json`));
  }

  async writeUser(key: string, user: CloudUser): Promise<void> {
    this.write(join(this.dir, 'users', `${key}.json`), user);
  }

  async readSave(userId: string): Promise<CloudSaveRecord | null> {
    return this.read<CloudSaveRecord>(join(this.dir, 'saves', `${userId}.json`));
  }

  async writeSave(userId: string, record: CloudSaveRecord): Promise<void> {
    this.write(join(this.dir, 'saves', `${userId}.json`), record);
  }

  async deleteUser(key: string): Promise<void> {
    const file = join(this.dir, 'users', `${key}.json`);
    if (existsSync(file)) unlinkSync(file);
  }

  async deleteSave(userId: string): Promise<void> {
    const file = join(this.dir, 'saves', `${userId}.json`);
    if (existsSync(file)) unlinkSync(file);
  }
}

export class MemoryCloudStore implements CloudStore {
  readonly users = new Map<string, CloudUser>();
  readonly saves = new Map<string, CloudSaveRecord>();

  async readUser(key: string): Promise<CloudUser | null> {
    return this.users.get(key) ?? null;
  }

  async writeUser(key: string, user: CloudUser): Promise<void> {
    this.users.set(key, user);
  }

  async readSave(userId: string): Promise<CloudSaveRecord | null> {
    return this.saves.get(userId) ?? null;
  }

  async writeSave(userId: string, record: CloudSaveRecord): Promise<void> {
    this.saves.set(userId, record);
  }

  async deleteUser(key: string): Promise<void> {
    this.users.delete(key);
  }

  async deleteSave(userId: string): Promise<void> {
    this.saves.delete(userId);
  }
}

/** Reads or creates the HMAC secret for a file-based deployment. */
export function loadOrCreateSecret(file: string): string {
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(32).toString('hex');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, secret, 'utf8');
  return secret;
}

/** Shared HTTP handling for both deployments: returns status + JSON body. */
export async function handleCloudRequest(service: CloudService, action: string, method: string, authorization: string | null | undefined, body: unknown): Promise<{ status: number; body: unknown }> {
  const json = (status: number, value: unknown): { status: number; body: unknown } => ({ status, body: value });
  const input = (body ?? {}) as Record<string, unknown>;
  if (action === 'register' && method === 'POST') {
    const r = await service.register(String(input.name ?? ''), String(input.password ?? ''));
    return r.ok ? json(200, r.value) : json(r.status, { error: r.error });
  }
  if (action === 'login' && method === 'POST') {
    const r = await service.login(String(input.name ?? ''), String(input.password ?? ''));
    return r.ok ? json(200, r.value) : json(r.status, { error: r.error });
  }
  const auth = await service.authenticate(authorization?.replace(/^Bearer\s+/i, ''));
  if (!auth) return json(401, { error: 'Nicht angemeldet oder Anmeldung abgelaufen. Bitte neu anmelden.' });
  const userId = auth.user.id;
  if (action === 'meta' && method === 'GET') return json(200, { meta: await service.meta(userId) });
  if (action === 'account' && method === 'GET') return json(200, { account: service.account(auth.user, auth.expiresAt), meta: await service.meta(userId) });
  if (action === 'password' && method === 'POST') {
    const r = await service.changePassword(auth.user, String(input.current ?? ''), String(input.next ?? ''));
    return r.ok ? json(200, r.value) : json(r.status, { error: r.error });
  }
  if (action === 'save' && method === 'GET') {
    const record = await service.load(userId);
    return record ? json(200, record) : json(404, { error: 'Noch kein Cloud-Spielstand vorhanden.' });
  }
  if (action === 'save' && method === 'PUT') {
    const r = await service.save(userId, String(input.data ?? ''), String(input.name ?? ''), String(input.device ?? ''));
    return r.ok ? json(200, { meta: r.value }) : json(r.status, { error: r.error });
  }
  if (action === 'save' && method === 'DELETE') {
    await service.deleteSave(userId);
    return json(200, { ok: true });
  }
  if (action === 'account' && method === 'DELETE') {
    const r = await service.deleteAccount(auth.user, String(input.password ?? ''));
    return r.ok ? json(200, { ok: true }) : json(r.status, { error: r.error });
  }
  return json(404, { error: 'Unbekannter Cloud-Endpunkt.' });
}
