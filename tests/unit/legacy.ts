/**
 * Test helper: turns a current (v12+) save file into the pre-v12 single-player
 * shape, so migration tests can start from realistic old files.
 */
import type { SaveFile } from '../../src/persistence/serializer';

export function toLegacy<T extends { state: unknown }>(input: T): T {
  const file = input as unknown as SaveFile;
  const state = JSON.parse(JSON.stringify(file.state)) as Record<string, unknown>;
  const players = state.players as Record<string, Record<string, unknown>>;
  const slice = players.player!;
  const sharedFactions = state.factions as { id: string; influence: number }[];
  const ownFactions = slice.factions as Record<string, Record<string, unknown>>;
  const sharedPolitics = state.politics as Record<string, unknown>;
  const legacy: Record<string, unknown> = {
    ...state,
    player: slice.player,
    ledger: slice.ledger,
    log: slice.log,
    nextLogId: slice.nextLogId,
    tasks: slice.tasks,
    undoStack: slice.undoStack,
    underworld: { ...(slice.underworld as Record<string, unknown>), rivals: state.rivals },
    factions: sharedFactions.map((f) => ({ ...f, ...ownFactions[f.id] })),
    politics: { ...sharedPolitics, ...(slice.politics as Record<string, unknown>) },
    decisions: slice.decisions,
    corporate: slice.corporate,
    research: slice.research,
  };
  delete legacy.players;
  delete legacy.playerOrder;
  delete legacy.rivals;
  for (const b of Object.values(legacy.buildings as Record<string, Record<string, unknown>>)) if (b.owner !== 'city') b.owner = 'player';
  return { ...file, state: legacy as unknown as SaveFile['state'] } as unknown as T;
}
