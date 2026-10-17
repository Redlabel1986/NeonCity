/**
 * Vercel function for cloud saves: /api/cloud/register | login | meta | save | account | password.
 * Storage: a private Vercel Blob store (BLOB_READ_WRITE_TOKEN is injected
 * once the store is connected to the project). CLOUD_SECRET signs tokens
 * and must be set in the project's environment variables.
 */

import { del, get, put } from '@vercel/blob';
import { CloudService, handleCloudRequest, type CloudSaveRecord, type CloudStore, type CloudUser } from '../../server/cloud';

class BlobCloudStore implements CloudStore {
  private async readJson<T>(pathname: string): Promise<T | null> {
    try {
      const result = await get(pathname, { access: 'private' });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const text = await new Response(result.stream).text();
      return JSON.parse(text) as T;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) return null;
      throw err;
    }
  }

  private async writeJson(pathname: string, value: unknown): Promise<void> {
    await put(pathname, JSON.stringify(value), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
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

  private async remove(pathname: string): Promise<void> {
    try {
      await del(pathname);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) return;
      throw err;
    }
  }

  deleteUser(key: string): Promise<void> {
    return this.remove(`cloud/users/${key}.json`);
  }

  deleteSave(userId: string): Promise<void> {
    return this.remove(`cloud/saves/${userId}.json`);
  }
}

let service: CloudService | null = null;

function getService(): CloudService | { error: string } {
  if (service) return service;
  const secret = process.env.CLOUD_SECRET;
  if (!secret || secret.length < 16) return { error: 'Cloud-Spielstände sind auf diesem Server nicht eingerichtet (CLOUD_SECRET fehlt).' };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { error: 'Cloud-Spielstände sind auf diesem Server nicht eingerichtet (Blob-Speicher fehlt).' };
  service = new CloudService(new BlobCloudStore(), secret);
  return service;
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' };

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  const action = url.pathname.split('/').filter(Boolean).pop() ?? '';
  const svc = getService();
  if ('error' in svc) return Response.json({ error: svc.error }, { status: 503, headers: CORS });
  let body: unknown = null;
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return Response.json({ error: 'Ungültiges JSON.' }, { status: 400, headers: CORS });
    }
  }
  const result = await handleCloudRequest(svc, action, request.method, request.headers.get('authorization'), body);
  return Response.json(result.body, { status: result.status, headers: CORS });
}
