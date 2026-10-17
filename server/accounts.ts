/**
 * Accounts: user names, salted scrypt password hashes and session tokens,
 * kept in a JSON file next to the world. No external database needed.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BackgroundId } from '../src/sim/data/difficulty';

export interface UserRecord {
  id: string;
  name: string;
  salt: string;
  hash: string;
  background: BackgroundId;
  createdAt: number;
}

interface SessionRecord {
  token: string;
  userId: string;
  expiresAt: number;
}

interface AccountsFile {
  nextId: number;
  users: UserRecord[];
  sessions: SessionRecord[];
}

const SESSION_DAYS = 30;
const NAME_RE = /^[\p{L}\p{N} _.-]{2,24}$/u;

export class Accounts {
  private readonly file: string;
  private data: AccountsFile = { nextId: 1, users: [], sessions: [] };

  constructor(file: string) {
    this.file = file;
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as AccountsFile;
      if (Array.isArray(parsed.users) && Array.isArray(parsed.sessions) && typeof parsed.nextId === 'number') this.data = parsed;
    }
  }

  get userCount(): number {
    return this.data.users.length;
  }

  list(): readonly UserRecord[] {
    return this.data.users;
  }

  byId(id: string): UserRecord | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  register(name: string, password: string, background: BackgroundId): { ok: true; user: UserRecord; token: string } | { ok: false; error: string } {
    const trimmed = name.trim();
    if (!NAME_RE.test(trimmed)) return { ok: false, error: 'Der Name braucht 2 bis 24 Zeichen (Buchstaben, Ziffern, Leerzeichen, _ . -).' };
    if (password.length < 6) return { ok: false, error: 'Das Passwort braucht mindestens 6 Zeichen.' };
    if (this.data.users.some((u) => u.name.toLowerCase() === trimmed.toLowerCase())) return { ok: false, error: 'Dieser Name ist bereits vergeben.' };
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 32).toString('hex');
    const user: UserRecord = { id: `u${this.data.nextId++}`, name: trimmed, salt, hash, background, createdAt: Date.now() };
    this.data.users.push(user);
    const token = this.createSession(user.id);
    this.save();
    return { ok: true, user, token };
  }

  login(name: string, password: string): { ok: true; user: UserRecord; token: string } | { ok: false; error: string } {
    const user = this.data.users.find((u) => u.name.toLowerCase() === name.trim().toLowerCase());
    if (!user) return { ok: false, error: 'Unbekannter Name oder falsches Passwort.' };
    const hash = scryptSync(password, user.salt, 32);
    const stored = Buffer.from(user.hash, 'hex');
    if (hash.length !== stored.length || !timingSafeEqual(hash, stored)) return { ok: false, error: 'Unbekannter Name oder falsches Passwort.' };
    const token = this.createSession(user.id);
    this.save();
    return { ok: true, user, token };
  }

  /** User for a session token, or null when unknown or expired. */
  authenticate(token: string | undefined | null): UserRecord | null {
    if (!token) return null;
    const now = Date.now();
    const session = this.data.sessions.find((s) => s.token === token);
    if (!session || session.expiresAt < now) return null;
    return this.byId(session.userId) ?? null;
  }

  logout(token: string): void {
    this.data.sessions = this.data.sessions.filter((s) => s.token !== token);
    this.save();
  }

  private createSession(userId: string): string {
    const now = Date.now();
    this.data.sessions = this.data.sessions.filter((s) => s.expiresAt >= now);
    const token = randomBytes(24).toString('hex');
    this.data.sessions.push({ token, userId, expiresAt: now + SESSION_DAYS * 86400000 });
    return token;
  }

  save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data), 'utf8');
    renameSync(tmp, this.file);
  }
}
