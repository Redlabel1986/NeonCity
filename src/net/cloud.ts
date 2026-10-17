/**
 * Browser side of the cloud saves: account token in localStorage, upload
 * and download of the single-player save through /api/cloud/*.
 */

import type { CloudAccountResponse, CloudAuthResponse, CloudMeta, CloudMetaResponse, CloudPasswordRequest, CloudPutRequest, CloudSaveResponse } from './cloudProtocol';

const STORAGE_KEY = 'neon-dynasty.cloud';
/** Developer override of the cloud base URL (used by the e2e tests against the preview build). */
const SERVER_OVERRIDE_KEY = 'neon-dynasty.cloudServer';

export interface CloudSession {
  token: string;
  name: string;
  expiresAt: number;
}

export function cloudSession(): CloudSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as CloudSession;
    if (!session.token || session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function storeSession(session: CloudSession | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function cloudBaseUrl(): string {
  try {
    const override = localStorage.getItem(SERVER_OVERRIDE_KEY);
    if (override) return override.replace(/\/$/, '');
  } catch {
    /* ignore */
  }
  const env = import.meta.env.VITE_ONLINE_SERVER as string | undefined;
  return (env ?? '').replace(/\/$/, '');
}

/** Short description of this device for the "saved on" line. */
export function deviceName(): string {
  const ua = navigator.userAgent;
  const phone = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 0 && window.innerWidth < 900);
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${phone ? 'Handy' : 'PC'} · ${browser}`;
}

async function request<T>(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown, token?: string): Promise<T> {
  const response = await fetch(`${cloudBaseUrl()}/api/cloud/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Cloud antwortet mit ${response.status}.`);
  return data;
}

export async function cloudRegister(name: string, password: string): Promise<CloudSession> {
  const auth = await request<CloudAuthResponse>('register', 'POST', { name, password });
  const session = { token: auth.token, name: auth.name, expiresAt: auth.expiresAt };
  storeSession(session);
  return session;
}

export async function cloudLogin(name: string, password: string): Promise<CloudSession> {
  const auth = await request<CloudAuthResponse>('login', 'POST', { name, password });
  const session = { token: auth.token, name: auth.name, expiresAt: auth.expiresAt };
  storeSession(session);
  return session;
}

export function cloudLogout(): void {
  storeSession(null);
}

export async function cloudMeta(session: CloudSession): Promise<CloudMeta | null> {
  return (await request<CloudMetaResponse>('meta', 'GET', undefined, session.token)).meta;
}

export async function cloudDownload(session: CloudSession): Promise<CloudSaveResponse> {
  return request<CloudSaveResponse>('save', 'GET', undefined, session.token);
}

export async function cloudUpload(session: CloudSession, data: string, name: string): Promise<CloudMeta> {
  const body: CloudPutRequest = { data, name, device: deviceName() };
  return (await request<{ meta: CloudMeta }>('save', 'PUT', body, session.token)).meta;
}

export async function cloudAccount(session: CloudSession): Promise<CloudAccountResponse> {
  return request<CloudAccountResponse>('account', 'GET', undefined, session.token);
}

/** Changes the password; the server issues a fresh token and signs every other device out. */
export async function cloudChangePassword(session: CloudSession, current: string, next: string): Promise<CloudSession> {
  const body: CloudPasswordRequest = { current, next };
  const auth = await request<CloudAuthResponse>('password', 'POST', body, session.token);
  const renewed = { token: auth.token, name: auth.name, expiresAt: auth.expiresAt };
  storeSession(renewed);
  return renewed;
}

export async function cloudDeleteSave(session: CloudSession): Promise<void> {
  await request<{ ok: true }>('save', 'DELETE', {}, session.token);
}

/** Deletes save and account; the local session is cleared afterwards. */
export async function cloudDeleteAccount(session: CloudSession, password: string): Promise<void> {
  await request<{ ok: true }>('account', 'DELETE', { password }, session.token);
  storeSession(null);
}
