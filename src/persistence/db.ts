/**
 * IndexedDB storage via Dexie. Saves are stored as serialized JSON strings
 * together with metadata for listing.
 */

import Dexie, { type EntityTable } from 'dexie';

export interface SaveRecord {
  id?: number;
  slot: string; // 'autosave' | 'quick' | 'manual-<n>'
  name: string;
  version: number;
  seed: number;
  tick: number;
  balance: number;
  playerName: string;
  createdAt: number;
  updatedAt: number;
  data: string;
}

export interface SettingsRecord {
  key: string;
  value: unknown;
}

export class NeonDatabase extends Dexie {
  saves!: EntityTable<SaveRecord, 'id'>;
  settings!: EntityTable<SettingsRecord, 'key'>;

  constructor(name = 'neon-dynasty') {
    super(name);
    this.version(1).stores({
      saves: '++id, slot, updatedAt',
      settings: 'key',
    });
  }
}

let instance: NeonDatabase | null = null;

export function getDatabase(): NeonDatabase {
  if (!instance) instance = new NeonDatabase();
  return instance;
}
