/**
 * Save service: slots in IndexedDB, export/import as files.
 * The UI calls this; the simulation never does.
 */

import { getDatabase, type SaveRecord } from './db';
import { deserialize, serialize, tryRepair, SaveValidationError } from './serializer';
import type { GameState } from '../sim/state';

export const AUTOSAVE_SLOT = 'autosave';
export const QUICK_SLOT = 'quick';

export interface SaveSummary {
  id: number;
  slot: string;
  name: string;
  playerName: string;
  tick: number;
  balance: number;
  updatedAt: number;
}

export async function listSaves(): Promise<SaveSummary[]> {
  const db = getDatabase();
  const records = await db.saves.orderBy('updatedAt').reverse().toArray();
  return records.map(toSummary);
}

export async function saveToSlot(state: GameState, slot: string, name: string): Promise<SaveSummary> {
  const db = getDatabase();
  const data = serialize(state, name);
  const now = Date.now();
  const existing = await db.saves.where('slot').equals(slot).first();
  const record: SaveRecord = {
    id: existing?.id,
    slot,
    name,
    version: state.version,
    seed: state.seed,
    tick: state.tick,
    balance: state.ledger.balance,
    playerName: state.player.name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    data,
  };
  const id = await db.saves.put(record);
  return toSummary({ ...record, id });
}

export async function createManualSave(state: GameState, name: string): Promise<SaveSummary> {
  const slot = `manual-${Date.now().toString(36)}`;
  return saveToSlot(state, slot, name);
}

export async function loadSave(id: number): Promise<{ state: GameState; name: string; repaired: string[] }> {
  const db = getDatabase();
  const record = await db.saves.get(id);
  if (!record) throw new SaveValidationError('Spielstand nicht gefunden.');
  return parseWithRepair(record.data);
}

export async function deleteSave(id: number): Promise<void> {
  await getDatabase().saves.delete(id);
}

export function exportToText(state: GameState, name: string): string {
  return serialize(state, name);
}

export function importFromText(text: string): { state: GameState; name: string; repaired: string[] } {
  if (text.length > 64 * 1024 * 1024) throw new SaveValidationError('Die Datei ist zu groß.');
  return parseWithRepair(text);
}

function parseWithRepair(text: string): { state: GameState; name: string; repaired: string[] } {
  try {
    const result = deserialize(text);
    return { state: result.state, name: result.name, repaired: [] };
  } catch (err) {
    if (!(err instanceof SaveValidationError)) throw err;
    const repaired = tryRepair(text);
    if (repaired) return { state: repaired.state, name: repaired.name, repaired: repaired.repaired };
    throw err;
  }
}

function toSummary(r: SaveRecord): SaveSummary {
  return {
    id: r.id!,
    slot: r.slot,
    name: r.name,
    playerName: r.playerName,
    tick: r.tick,
    balance: r.balance,
    updatedAt: r.updatedAt,
  };
}

/** Browser helpers for file download / upload. */
export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickTextFile(accept = '.json,application/json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve(await file.text());
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
