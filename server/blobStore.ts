/**
 * CloudStore on Vercel Blob. The SDK functions are injected so the store
 * can be unit tested without the network. Works with a private store
 * (preferred) and falls back to public access when the store was created
 * as public: the first failing private call switches the mode.
 */

import type { CloudSaveRecord, CloudStore, CloudUser } from './cloud';

export type BlobAccess = 'private' | 'public';

export interface BlobApi {
  get: (pathname: string, options: { access: BlobAccess; useCache?: boolean }) => Promise<{ statusCode: number; stream: ReadableStream<Uint8Array> | null } | null>;
  put: (pathname: string, body: string, options: { access: BlobAccess; addRandomSuffix: boolean; allowOverwrite: boolean; contentType: string }) => Promise<unknown>;
  del: (pathname: string) => Promise<void>;
}

export class BlobCloudStore implements CloudStore {
  private readonly api: BlobApi;
  private access: BlobAccess;
  /** Set once a call has succeeded in the current mode; no more fallbacks after that. */
  private confirmed = false;
  readonly log: (message: string) => void;

  constructor(api: BlobApi, access: BlobAccess = 'private', log: (message: string) => void = () => {}) {
    this.api = api;
    this.access = access;
    this.log = log;
  }

  get mode(): BlobAccess {
    return this.access;
  }

  /** Runs `fn` in the current access mode; on failure in an unconfirmed mode, retries once in the other mode. */
  private async withAccess<T>(fn: (access: BlobAccess) => Promise<T>): Promise<T> {
    try {
      const result = await fn(this.access);
      this.confirmed = true;
      return result;
    } catch (err) {
      if (this.confirmed) throw err;
      const other: BlobAccess = this.access === 'private' ? 'public' : 'private';
      this.log(`Blob-Zugriff als ${this.access} fehlgeschlagen (${(err as Error).message}); versuche ${other}.`);
      const result = await fn(other);
      this.access = other;
      this.confirmed = true;
      return result;
    }
  }

  private async readJson<T>(pathname: string): Promise<T | null> {
    return this.withAccess(async (access) => {
      const result = await this.api.get(pathname, { access, useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const text = await new Response(result.stream).text();
      return JSON.parse(text) as T;
    });
  }

  private writeJson(pathname: string, value: unknown): Promise<void> {
    return this.withAccess(async (access) => {
      await this.api.put(pathname, JSON.stringify(value), { access, addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
    });
  }

  private async remove(pathname: string): Promise<void> {
    try {
      await this.api.del(pathname);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) return;
      throw err;
    }
  }

  readUser(key: string): Promise<CloudUser | null> {
    return this.readJson<CloudUser>(`cloud/users/${key}.json`);
  }

  writeUser(key: string, user: CloudUser): Promise<void> {
    return this.writeJson(`cloud/users/${key}.json`, user);
  }

  readSave(userId: string): Promise<CloudSaveRecord | null> {
    return this.readJson<CloudSaveRecord>(`cloud/saves/${userId}.json`);
  }

  writeSave(userId: string, record: CloudSaveRecord): Promise<void> {
    return this.writeJson(`cloud/saves/${userId}.json`, record);
  }

  deleteUser(key: string): Promise<void> {
    return this.remove(`cloud/users/${key}.json`);
  }

  deleteSave(userId: string): Promise<void> {
    return this.remove(`cloud/saves/${userId}.json`);
  }
}
