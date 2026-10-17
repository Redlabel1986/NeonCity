/**
 * Zustand store: reactive UI state + actions that bridge to the simulation.
 * No game rules live here; everything goes through Simulation.apply().
 */

import { create } from 'zustand';
import { createNewGame, Simulation, type Command, type NewGameOptions, type Speed } from '../../sim/engine';
import type { GameState } from '../../sim/state';
import { checkPlacement, type PlacementCheck } from '../../sim/systems/construction';
import type { LogLevel } from '../../sim/core/events';
import { session, pendingGroundRefresh } from '../session';
import { startLoop, stopLoop } from '../loop';
import { AUTOSAVE_SLOT, QUICK_SLOT, createManualSave, loadSave, saveToSlot, exportToText, importFromText, downloadTextFile, pickTextFile } from '../../persistence/saveService';
import { getDatabase } from '../../persistence/db';
import { tickToDate, formatDate } from '../../sim/core/clock';
import { audio } from '../audio';

export function applyAudioSettings(settings: Settings): void {
  audio.setSettings({
    master: settings.audioEnabled ? settings.volumeMaster : 0,
    ambient: settings.volumeAmbient,
    ui: settings.volumeUi,
    music: settings.volumeMusic,
  });
}

export type Panel =
  | 'city'
  | 'build'
  | 'business'
  | 'realestate'
  | 'staff'
  | 'finance'
  | 'research'
  | 'factions'
  | 'politics'
  | 'underworld'
  | 'stats'
  | 'dashboard';

export type Dialog = 'saves' | 'settings' | 'help' | 'career' | null;

export interface KeyBindings {
  pause: string;
  speed1: string;
  speed2: string;
  speed3: string;
  build: string;
  business: string;
  finance: string;
  city: string;
  stats: string;
  staff: string;
  realestate: string;
  underworld: string;
  factions: string;
  politics: string;
  research: string;
  help: string;
}

export const DEFAULT_KEYBINDINGS: KeyBindings = {
  pause: ' ',
  speed1: '1',
  speed2: '2',
  speed3: '3',
  build: 'b',
  business: 'u',
  finance: 'f',
  city: 'c',
  stats: 't',
  staff: 'p',
  realestate: 'i',
  underworld: 'x',
  factions: 'k',
  politics: 'o',
  research: 'r',
  help: 'h',
};

export interface Settings {
  effects: boolean;
  reducedMotion: boolean;
  traffic: boolean;
  highContrast: boolean;
  audioEnabled: boolean;
  volumeMaster: number;
  volumeAmbient: number;
  volumeUi: number;
  volumeMusic: number;
  keybindings: KeyBindings;
  uiScale: number;
  autosave: boolean;
  showMinimap: boolean;
}

export interface Toast {
  id: number;
  level: LogLevel;
  message: string;
  createdAt: number;
}

export interface GameStore {
  screen: 'menu' | 'game';
  /** Incremented whenever the simulation advanced or changed; components subscribe to this. */
  tick: number;
  /** Incremented when buildings were added or removed. */
  structureVersion: number;
  saveName: string;
  panel: Panel | null;
  dialog: Dialog;
  /** Tab the bottom dock should show next (set by other components). */
  dockTabRequest: 'log' | 'tasks' | 'warnings' | 'decisions' | null;
  selectedBuildingId: number | null;
  dashboardBuildingId: number | null;
  selectedTile: { x: number; y: number } | null;
  hoverTile: { x: number; y: number } | null;
  placementDefId: string | null;
  placementCheck: PlacementCheck | null;
  toasts: Toast[];
  settings: Settings;
  busy: string | null;

  newGame: (options: NewGameOptions) => void;
  loadFromState: (state: GameState, name: string) => void;
  quitToMenu: () => Promise<void>;
  dispatch: (command: Command) => boolean;
  setSpeed: (speed: Speed) => void;
  togglePause: () => void;
  setPanel: (panel: Panel | null) => void;
  setDialog: (dialog: Dialog) => void;
  requestDockTab: (tab: 'log' | 'tasks' | 'warnings' | 'decisions' | null) => void;
  selectBuilding: (id: number | null) => void;
  selectTile: (tile: { x: number; y: number } | null) => void;
  startPlacement: (defId: string) => void;
  cancelPlacement: () => void;
  setHover: (tile: { x: number; y: number } | null) => void;
  handleTileClick: (x: number, y: number, button: number) => void;
  notify: (level: LogLevel, message: string) => void;
  dismissToast: (id: number) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  bumpTick: () => void;
  bumpStructure: () => void;
  focusBuilding: (id: number) => void;
  openDashboard: (id: number) => void;

  saveManual: (name: string) => Promise<void>;
  quickSave: () => Promise<void>;
  autosave: () => Promise<void>;
  loadSlot: (id: number) => Promise<void>;
  exportSave: () => void;
  importSave: () => Promise<void>;
}

const SETTINGS_KEY = 'neon-dynasty.settings';

function loadSettings(): Settings {
  const defaults: Settings = {
    effects: true,
    traffic: true,
    highContrast: typeof window !== 'undefined' && window.matchMedia?.('(prefers-contrast: more)').matches,
    audioEnabled: true,
    volumeMaster: 0.6,
    volumeAmbient: 0.7,
    volumeUi: 0.6,
    volumeMusic: 0.4,
    keybindings: { ...DEFAULT_KEYBINDINGS },
    reducedMotion: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    uiScale: 1,
    autosave: true,
    showMinimap: true,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...defaults, ...parsed, keybindings: { ...DEFAULT_KEYBINDINGS, ...(parsed.keybindings ?? {}) } };
  } catch {
    return defaults;
  }
}

let toastId = 1;

export const useGameStore = create<GameStore>((set, get) => ({
  screen: 'menu',
  tick: 0,
  structureVersion: 0,
  saveName: '',
  panel: null,
  dialog: null,
  dockTabRequest: null,
  selectedBuildingId: null,
  dashboardBuildingId: null,
  selectedTile: null,
  hoverTile: null,
  placementDefId: null,
  placementCheck: null,
  toasts: [],
  settings: loadSettings(),
  busy: null,

  newGame: (options) => {
    const state = createNewGame(options);
    get().loadFromState(state, `${options.playerName.trim() || 'Unbekannt'} – Nova Eclipse`);
    get().notify('info', `Willkommen in Nova Eclipse, ${state.player.name}. Deine Miete beträgt ${state.player.apartmentRent} ¢ pro Tag.`);
  },

  loadFromState: (state, name) => {
    stopLoop();
    session.sim = new Simulation(state);
    set({
      screen: 'game',
      saveName: name,
      panel: null,
      dialog: null,
      selectedBuildingId: null,
      dashboardBuildingId: null,
      selectedTile: null,
      placementDefId: null,
      placementCheck: null,
      tick: get().tick + 1,
      structureVersion: get().structureVersion + 1,
    });
    startLoop();
  },

  quitToMenu: async () => {
    const sim = session.sim;
    if (sim && get().settings.autosave) {
      try {
        await saveToSlot(sim.state, AUTOSAVE_SLOT, get().saveName);
      } catch (err) {
        console.error(err);
      }
    }
    stopLoop();
    session.sim = null;
    set({ screen: 'menu', panel: null, dialog: null, selectedBuildingId: null, placementDefId: null, placementCheck: null, toasts: [] });
  },

  dispatch: (command) => {
    const sim = session.sim;
    if (!sim) return false;
    if (command.type === 'demolish' || command.type === 'undoPlacement') {
      const id = command.type === 'demolish' ? command.buildingId : sim.state.undoStack[sim.state.undoStack.length - 1]?.buildingId;
      const b = id !== undefined ? sim.state.buildings[id] : undefined;
      if (b) pendingGroundRefresh.push([b.x, b.y, b.w, b.h]);
      if (b && get().selectedBuildingId === b.id) get().selectBuilding(null);
    }
    const result = sim.apply(command);
    if (!result.ok) {
      get().notify('danger', result.error);
      return false;
    }
    if (command.type === 'placeBuilding' || command.type === 'undoPlacement' || command.type === 'demolish') {
      get().bumpStructure();
    }
    get().bumpTick();
    return true;
  },

  setSpeed: (speed) => {
    get().dispatch({ type: 'setSpeed', speed });
  },

  togglePause: () => {
    const sim = session.sim;
    if (!sim) return;
    const speed = sim.state.speed === 0 ? 1 : 0;
    get().dispatch({ type: 'setSpeed', speed });
  },

  setPanel: (panel) => {
    const current = get().panel;
    const next = current === panel ? null : panel;
    set({ panel: next });
    if (next !== 'build' && get().placementDefId) get().cancelPlacement();
  },

  setDialog: (dialog) => set({ dialog }),
  requestDockTab: (tab) => set({ dockTabRequest: tab }),

  selectBuilding: (id) => {
    set({ selectedBuildingId: id, selectedTile: null });
    const sim = session.sim;
    const r = session.renderer;
    if (!sim || !r) return;
    const b = id !== null ? sim.state.buildings[id] : undefined;
    r.setSelection(b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null);
  },

  selectTile: (tile) => {
    set({ selectedTile: tile, selectedBuildingId: null });
    session.renderer?.setSelection(tile ? { x: tile.x, y: tile.y, w: 1, h: 1 } : null);
  },

  startPlacement: (defId) => {
    set({ placementDefId: defId, placementCheck: null, panel: 'build' });
    const hover = get().hoverTile;
    if (hover) get().setHover(hover);
  },

  cancelPlacement: () => {
    set({ placementDefId: null, placementCheck: null });
    session.renderer?.setGhost(null, null);
  },

  setHover: (tile) => {
    const r = session.renderer;
    const sim = session.sim;
    set({ hoverTile: tile });
    if (!r || !sim) return;
    const defId = get().placementDefId;
    if (defId && tile) {
      const check = checkPlacement(sim.state, defId, tile.x, tile.y);
      set({ placementCheck: check });
      r.setGhost({ defId, x: tile.x, y: tile.y, tiles: check.tiles, ok: check.ok }, sim.state);
      r.setHover(null);
    } else {
      if (defId) {
        set({ placementCheck: null });
        r.setGhost(null, null);
      }
      r.setHover(tile);
    }
  },

  handleTileClick: (x, y, button) => {
    const sim = session.sim;
    if (!sim) return;
    const defId = get().placementDefId;
    if (button === 2) {
      if (defId) get().cancelPlacement();
      else get().selectBuilding(null);
      return;
    }
    if (x < 0) {
      get().selectBuilding(null);
      return;
    }
    if (defId) {
      const ok = get().dispatch({ type: 'placeBuilding', defId, x, y });
      if (ok) {
        const placed = Object.values(sim.state.buildings).find((b) => b.owner === 'player' && b.x === x && b.y === y);
        get().notify('success', `${placed?.label ?? 'Gebäude'} platziert.`);
        // Keep placing while shift is held is a later refinement; for now leave placement mode.
        get().cancelPlacement();
        if (placed) get().selectBuilding(placed.id);
      }
      return;
    }
    const occupant = sim.state.grid.occupantAt(x, y);
    if (occupant) get().selectBuilding(occupant);
    else get().selectTile({ x, y });
  },

  notify: (level, message) => {
    const toast: Toast = { id: toastId++, level, message, createdAt: Date.now() };
    set((s) => ({ toasts: [...s.toasts.slice(-4), toast] }));
    audio.click(level === 'danger' ? 'error' : level === 'success' ? 'success' : 'notify');
    const ttl = level === 'danger' ? 7000 : 4500;
    setTimeout(() => get().dismissToast(toast.id), ttl);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
    session.renderer?.setSettings({ effects: settings.effects, reducedMotion: settings.reducedMotion, traffic: settings.traffic });
    applyAudioSettings(settings);
    document.documentElement.classList.toggle('high-contrast', settings.highContrast);
  },

  bumpTick: () => set((s) => ({ tick: s.tick + 1 })),
  bumpStructure: () => set((s) => ({ structureVersion: s.structureVersion + 1, tick: s.tick + 1 })),

  openDashboard: (id) => {
    set({ dashboardBuildingId: id, panel: 'dashboard' });
    get().selectBuilding(id);
  },

  focusBuilding: (id) => {
    const sim = session.sim;
    const b = sim?.state.buildings[id];
    if (!b) return;
    session.renderer?.focusTile(b.x, b.y, Math.max(session.renderer.zoom, 1.2));
    get().selectBuilding(id);
  },

  saveManual: async (name) => {
    const sim = session.sim;
    if (!sim) return;
    set({ busy: 'Speichern…' });
    try {
      await createManualSave(sim.state, name.trim() || get().saveName);
      get().notify('success', `Spielstand „${name.trim() || get().saveName}“ gespeichert.`);
    } catch (err) {
      get().notify('danger', `Speichern fehlgeschlagen: ${(err as Error).message}`);
    } finally {
      set({ busy: null });
    }
  },

  quickSave: async () => {
    const sim = session.sim;
    if (!sim) return;
    try {
      await saveToSlot(sim.state, QUICK_SLOT, `Schnellspeicherung – ${formatDate(tickToDate(sim.state.tick))}`);
      get().notify('success', 'Schnellspeicherung angelegt (F5). Laden mit F9.');
    } catch (err) {
      get().notify('danger', `Speichern fehlgeschlagen: ${(err as Error).message}`);
    }
  },

  autosave: async () => {
    const sim = session.sim;
    if (!sim || !get().settings.autosave) return;
    try {
      await saveToSlot(sim.state, AUTOSAVE_SLOT, `Autosave – ${get().saveName}`);
    } catch (err) {
      console.error('autosave failed', err);
    }
  },

  loadSlot: async (id) => {
    set({ busy: 'Laden…' });
    try {
      const { state, name, repaired } = await loadSave(id);
      get().loadFromState(state, name);
      if (repaired.length > 0) get().notify('warning', `Spielstand repariert: ${repaired.join(', ')}.`);
      else get().notify('info', `Spielstand „${name}“ geladen.`);
    } catch (err) {
      get().notify('danger', `Laden fehlgeschlagen: ${(err as Error).message}`);
    } finally {
      set({ busy: null });
    }
  },

  exportSave: () => {
    const sim = session.sim;
    if (!sim) return;
    const date = tickToDate(sim.state.tick);
    const file = `neon-dynasty-${sim.state.player.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-tag${date.day + 1}.json`;
    downloadTextFile(file, exportToText(sim.state, get().saveName));
    get().notify('success', `Spielstand als ${file} exportiert.`);
  },

  importSave: async () => {
    const text = await pickTextFile();
    if (text === null) return;
    try {
      const { state, name, repaired } = importFromText(text);
      get().loadFromState(state, name);
      if (repaired.length > 0) get().notify('warning', `Importiert und repariert: ${repaired.join(', ')}.`);
      else get().notify('success', `Spielstand „${name}“ importiert.`);
    } catch (err) {
      get().notify('danger', `Import fehlgeschlagen: ${(err as Error).message}`);
    }
  },
}));

/** Quick load of the quick slot (F9). */
export async function quickLoad(): Promise<void> {
  const db = getDatabase();
  const record = await db.saves.where('slot').equals(QUICK_SLOT).first();
  if (!record?.id) {
    useGameStore.getState().notify('warning', 'Keine Schnellspeicherung vorhanden. Speichern mit F5.');
    return;
  }
  await useGameStore.getState().loadSlot(record.id);
}

/** Subscribes a component to simulation progress and returns the live state. */
export function useSimState(): GameState | null {
  useGameStore((s) => s.tick);
  return session.sim?.state ?? null;
}
