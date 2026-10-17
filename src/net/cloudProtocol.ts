/**
 * Cloud saves: one single-player save per account, so a game started on
 * the phone continues on the PC and back. Served either by the Node game
 * server (`/api/cloud/*`, files in its data directory) or by the Vercel
 * function in `api/cloud/[action].ts` (Vercel Blob, private store).
 */

export interface CloudMeta {
  /** Real time of the upload (ms since epoch). */
  savedAt: number;
  /** Game tick of the save. */
  tick: number;
  /** Save name shown in the UI. */
  name: string;
  /** Device the upload came from ("Handy", "PC", browser name). */
  device: string;
  /** Save format version. */
  version: number;
  /** Player name inside the save. */
  playerName: string;
  balance: number;
  /** Size of the save in bytes. */
  bytes: number;
}

export interface CloudAuthResponse {
  token: string;
  name: string;
  /** Expiry of the token (ms since epoch). */
  expiresAt: number;
}

export interface CloudMetaResponse {
  meta: CloudMeta | null;
}

export interface CloudSaveResponse {
  meta: CloudMeta;
  data: string;
}

export interface CloudPutRequest {
  data: string;
  name: string;
  device: string;
}

/** Largest accepted save upload (a 96×96 world is around 1.1 MB). */
export const CLOUD_MAX_BYTES = 8 * 1024 * 1024;
