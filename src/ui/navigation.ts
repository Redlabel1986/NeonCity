import type { Panel } from './store/gameStore';

export interface RailEntry {
  id: Panel;
  label: string;
  key?: string;
  /** Phase in which the panel becomes functional. */
  phase: number;
}

export const RAIL_ENTRIES: RailEntry[] = [
  { id: 'city', label: 'Stadt', key: 'C', phase: 1 },
  { id: 'build', label: 'Bauen', key: 'B', phase: 1 },
  { id: 'business', label: 'Unternehmen', key: 'U', phase: 1 },
  { id: 'realestate', label: 'Immobilien', key: 'I', phase: 1 },
  { id: 'staff', label: 'Personal', key: 'P', phase: 1 },
  { id: 'finance', label: 'Finanzen', key: 'F', phase: 1 },
  { id: 'research', label: 'Forschung', key: 'R', phase: 1 },
  { id: 'factions', label: 'Fraktionen', key: 'K', phase: 1 },
  { id: 'politics', label: 'Politik', key: 'O', phase: 1 },
  { id: 'underworld', label: 'Unterwelt', key: 'X', phase: 1 },
  { id: 'stats', label: 'Statistik', key: 'T', phase: 1 },
];
