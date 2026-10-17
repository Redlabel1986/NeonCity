/**
 * Vercel function for cloud saves: /api/cloud/register | login | meta | save | account | password.
 * Storage: a Vercel Blob store (BLOB_READ_WRITE_TOKEN is injected once the
 * store is connected to the project); private stores are preferred, public
 * ones work too. CLOUD_SECRET signs tokens and must be set in the project's
 * environment variables. Every failure is answered as JSON with a message
 * (and logged), never as a bare 500.
 */

import { del, get, put } from '@vercel/blob';
import { CloudService, handleCloudRequest } from '../../server/cloud';
import { BlobCloudStore, type BlobAccess } from '../../server/blobStore';

let service: CloudService | null = null;

function getService(): CloudService | { error: string } {
  if (service) return service;
  const secret = process.env.CLOUD_SECRET;
  if (!secret || secret.length < 16) return { error: 'Cloud-Spielstände sind auf diesem Server nicht eingerichtet (CLOUD_SECRET fehlt oder ist kürzer als 16 Zeichen).' };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { error: 'Cloud-Spielstände sind auf diesem Server nicht eingerichtet (Blob-Speicher nicht verbunden, BLOB_READ_WRITE_TOKEN fehlt).' };
  const access: BlobAccess = process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
  const store = new BlobCloudStore({ get, put, del }, access, (m) => console.warn(`[cloud] ${m}`));
  service = new CloudService(store, secret);
  return service;
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' };

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cloud] Fehler:', err);
    return Response.json({ error: `Cloud-Server-Fehler: ${message}` }, { status: 500, headers: CORS });
  }
}
