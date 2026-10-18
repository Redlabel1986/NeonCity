/**
 * Zustand store: reactive UI state + actions that bridge to the simulation.
 * No game rules live here; everything goes through Simulation.apply().
 */

import { create } from 'zustand';
import { createNewGame, Simulation, type Command, type NewGameOptions, type Speed } from '../../sim/engine';
import { LOCAL_PLAYER_ID, type Facing, type GameState, type WorldState } from '../../sim/state';
import { checkPlacement, type PlacementCheck } from '../../sim/systems/construction';
import type { DashboardTab } from '../../render/interior/layouts';
import type { LogLevel } from '../../sim/core/events';
import { session, pendingGroundRefresh } from '../session';
import { startLoop, stopLoop } from '../loop';
import { AUTOSAVE_SLOT, QUICK_SLOT, createManualSave, loadSave, saveToSlot, exportToText, importFromText, downloadTextFile, pickTextFile } from '../../persistence/saveService';
import { getDatabase } from '../../persistence/db';
import { tickToDate, formatDate } from '../../sim/core/clock';
import { audio } from '../audio';
import { OnlineClient } from '../../net/client';
import { cloudDownload, cloudSession, cloudUpload, type CloudSession } from '../../net/cloud';
import { collectEvents, emptyReport, ticksForElapsed, type CatchUpReport } from '../../sim/catchup';
import { REGIONS, type RegionId } from '../../sim/data/regions';
import { isRegionUnlocked, regionCentre } from '../../sim/systems/progression';
import { serialize, deserialize } from '../../persistence/serializer';
import type { OnlinePlayer } from '../../net/protocol';

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
  | 'casino'
  | 'map'
  | 'dashboard';

export type Dialog = 'saves' | 'settings' | 'help' | 'career' | 'catchup' | 'levelup' | null;

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
  casino: string;
  map: string;
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
  casino: 'j',
  map: 'g',
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
  /** Fly into the building and show its interior while managing it. */
  interiorView: boolean;
  /** Upload the save to the cloud account automatically. */
  cloudSync: boolean;
  /** Offline progress: simulate the real time that passed, up to this many game days (0 = off). */
  offlineProgressDays: number;
}

/** Connection to the shared online world (null = local single-player game). */
export interface OnlineState {
  connected: boolean;
  url: string;
  playerId: string;
  name: string;
  players: OnlinePlayer[];
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
  /** Active dashboard tab (shared with the interior view's clickable zones). */
  dashboardTab: DashboardTab;
  /** Building whose interior is shown; null = city map. */
  interiorBuildingId: number | null;
  /** Camera zoom to return to when leaving the interior. */
  interiorReturnZoom: number;
  /** Zone of a city building interior whose detail card is open. */
  interiorZone: { label: string; status: string; details: string[] } | null;
  selectedTile: { x: number; y: number } | null;
  hoverTile: { x: number; y: number } | null;
  placementDefId: string | null;
  placementCheck: PlacementCheck | null;
  /** Requested entrance edge while placing; null = automatic (first road-side edge). */
  placementFacing: Facing | null;
  /** Touch placement: tile chosen for preview, waiting for confirmation. */
  placementPending: { x: number; y: number } | null;
  /** Phone layout: which auxiliary sheet is open. */
  mobileSheet: 'more' | 'dock' | null;
  toasts: Toast[];
  settings: Settings;
  busy: string | null;
  online: OnlineState | null;
  /** Cloud-save account of this device (null = not logged in). */
  cloud: CloudSession | null;
  /** Real time of the last successful cloud upload (drives UI refresh). */
  cloudSavedAt: number;
  /** Map (region) currently shown. */
  activeMap: RegionId | null;
  /** Progress of a running catch-up simulation. */
  catchUp: { done: number; total: number } | null;
  /** Report of the last catch-up, shown in the 'catchup' dialog. */
  catchUpReport: CatchUpReport | null;

  newGame: (options: NewGameOptions) => void;
  loadFromState: (state: WorldState, name: string, playerId?: string) => void;
  connectOnline: (auth: { url: string; token: string; playerId: string; name: string }) => Promise<void>;
  setCloud: (session: CloudSession | null) => void;
  /** Shows another map, if the player has unlocked it. */
  switchMap: (region: RegionId) => boolean;
  /** Simulates the real time since `since` (ms) at the game's speed, capped by the setting; shows the report. */
  catchUpFrom: (since: number) => Promise<void>;
  /** Uploads the current world to the cloud account; throws on failure. */
  cloudUploadNow: () => Promise<void>;
  /** Downloads the cloud save and starts it. */
  cloudLoad: () => Promise<void>;
  /** Automatic upload after local autosaves (throttled, errors become a toast). */
  cloudAutoUpload: () => Promise<void>;
  disconnectOnline: () => void;
  quitToMenu: () => Promise<void>;
  dispatch: (command: Command) => boolean;
  setSpeed: (speed: Speed) => void;
  togglePause: () => void;
  setPanel: (panel: Panel | null) => void;
  /** Closes the panel; with keepPlacement the running placement survives (mobile build flow). */
  closePanel: (keepPlacement: boolean) => void;
  setMobileSheet: (sheet: 'more' | 'dock' | null) => void;
  /** Places the building at the tile chosen by touch. */
  confirmPlacement: () => void;
  setDialog: (dialog: Dialog) => void;
  requestDockTab: (tab: 'log' | 'tasks' | 'warnings' | 'decisions' | null) => void;
  selectBuilding: (id: number | null) => void;
  selectTile: (tile: { x: number; y: number } | null) => void;
  startPlacement: (defId: string) => void;
  cancelPlacement: () => void;
  /** Rotates the pending placement by a quarter turn. */
  rotatePlacement: (delta: 1 | -1) => void;
  setHover: (tile: { x: number; y: number } | null) => void;
  handleTileClick: (x: number, y: number, button: number, pointerType?: string) => void;
  placeAt: (x: number, y: number) => void;
  notify: (level: LogLevel, message: string) => void;
  dismissToast: (id: number) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  bumpTick: () => void;
  bumpStructure: () => void;
  focusBuilding: (id: number) => void;
  openDashboard: (id: number) => void;
  setDashboardTab: (tab: DashboardTab) => void;
  enterInterior: (id: number) => void;
  leaveInterior: () => void;
  showInteriorZone: (zone: { label: string; status: string; details?: string[] } | null) => void;

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
    interiorView: true,
    cloudSync: true,
    offlineProgressDays: 30,
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
  dashboardTab: 'overview',
  interiorBuildingId: null,
  interiorReturnZoom: 1,
  interiorZone: null,
  selectedTile: null,
  hoverTile: null,
  placementDefId: null,
  placementCheck: null,
  placementFacing: null,
  placementPending: null,
  mobileSheet: null,
  toasts: [],
  settings: loadSettings(),
  busy: null,
  online: null,
  cloud: cloudSession(),
  cloudSavedAt: 0,
  catchUp: null,
  catchUpReport: null,
  activeMap: null,

  newGame: (options) => {
    const world = createNewGame(options);
    get().loadFromState(world, `${options.playerName.trim() || 'Unbekannt'} – Nova Eclipse`);
    const me = world.players[LOCAL_PLAYER_ID]!.player;
    const home = world.districts[me.homeDistrictId]!;
    get().notify('info', `Willkommen in ${home.name}, ${me.name}. Deine Miete beträgt ${me.apartmentRent} ¢ pro Tag.${world.players[LOCAL_PLAYER_ID]!.progression.enabled ? ' Sammle Erfahrung, um die nächste Region zu öffnen (Weltkarte: G).' : ''}`);
  },

  loadFromState: (state, name, playerId) => {
    stopLoop();
    session.sim = new Simulation(state, playerId);
    set({
      screen: 'game',
      saveName: name,
      panel: null,
      dialog: null,
      selectedBuildingId: null,
      dashboardBuildingId: null,
      interiorBuildingId: null,
      selectedTile: null,
      placementDefId: null,
      placementCheck: null,
      tick: get().tick + 1,
      structureVersion: get().structureVersion + 1,
    });
    startLoop();
  },

  connectOnline: async (auth) => {
    get().disconnectOnline();
    const client = new OnlineClient(auth.url, auth.token, {
      onWorld: (world, playerId) => {
        if (get().screen !== 'game' || !session.sim) {
          get().loadFromState(world, `Online – ${world.meta.cityName}`, playerId);
          return;
        }
        // Resync: swap the world underneath the running UI.
        const sim = new Simulation(world, playerId);
        session.sim = sim;
        session.renderer?.loadWorld(sim.state);
        get().bumpStructure();
      },
      onPresence: (players) => set((s) => (s.online ? { online: { ...s.online, players } } : {})),
      onDisconnect: (reason) => {
        get().notify('danger', `Verbindung zum Server getrennt: ${reason}`);
        set((s) => (s.online ? { online: { ...s.online, connected: false } } : {}));
      },
      onNotice: (level, message) => get().notify(level, message),
      onBuildingRemoved: (x, y, w, h) => pendingGroundRefresh.push([x, y, w, h]),
    });
    session.online = client;
    set({ online: { connected: false, url: auth.url, playerId: auth.playerId, name: auth.name, players: [] } });
    try {
      await client.connect();
    } catch (err) {
      session.online = null;
      set({ online: null });
      throw err;
    }
    set((s) => (s.online ? { online: { ...s.online, connected: true, players: client.players } } : {}));
    get().notify('success', `Online in ${session.sim?.world.meta.cityName ?? 'Nova Eclipse'}: ${client.players.filter((p) => p.online).length} Spieler verbunden.`);
  },

  setCloud: (session) => set({ cloud: session }),

  switchMap: (region) => {
    const sim = session.sim;
    const renderer = session.renderer;
    if (!sim || !renderer) return false;
    if (!isRegionUnlocked(sim.state, region)) {
      get().notify('warning', `${REGIONS[region].name} ist noch gesperrt (ab Level ${REGIONS[region].requiredLevel}).`);
      return false;
    }
    if (get().interiorBuildingId !== null) get().leaveInterior();
    get().cancelPlacement();
    get().selectBuilding(null);
    renderer.setActiveMap(sim.state, region);
    const c = regionCentre(sim.state, region);
    renderer.focusTile(c.x, c.y, 0.9);
    set({ activeMap: region });
    get().bumpStructure();
    return true;
  },

  catchUpFrom: async (since) => {
    const sim = session.sim;
    if (!sim || get().online || session.catchingUp) return;
    const elapsedMs = Date.now() - since;
    const { ticks, capped } = ticksForElapsed(elapsedMs, sim.world.speed, get().settings.offlineProgressDays);
    if (ticks < 30) return; // less than a quarter game hour: not worth a report
    session.catchingUp = true;
    const report = emptyReport(elapsedMs, sim.world.tick, sim.state.ledger.balance, capped);
    set({ catchUp: { done: 0, total: ticks }, busy: 'Die Stadt lief weiter … 0 %' });
    try {
      // Keep the UI responsive: simulate in slices and yield between them.
      const slice = 240;
      let done = 0;
      while (done < ticks) {
        const n = Math.min(slice, ticks - done);
        sim.run(n);
        collectEvents(report, sim.drainEvents());
        done += n;
        set({ catchUp: { done, total: ticks }, busy: `Die Stadt lief weiter … ${Math.round((done / ticks) * 100)} %` });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      report.ticks = done;
      report.endTick = sim.world.tick;
      report.endBalance = sim.state.ledger.balance;
      session.renderer?.syncBuildings(sim.state);
      set({ catchUpReport: report, dialog: 'catchup' });
      get().bumpStructure();
    } finally {
      session.catchingUp = false;
      set({ catchUp: null, busy: null });
    }
  },

  cloudUploadNow: async () => {
    const sim = session.sim;
    const cloud = get().cloud;
    if (!sim || !cloud) throw new Error('Nicht bei der Cloud angemeldet.');
    if (get().online) throw new Error('Online-Welten speichert der Server; Cloud-Spielstände gelten für das Einzelspiel.');
    const meta = await cloudUpload(cloud, serialize(sim.world, get().saveName), get().saveName);
    set({ cloudSavedAt: meta.savedAt });
    get().notify('success', `In die Cloud gespeichert (Tag ${tickToDate(meta.tick).day + 1}).`);
  },

  cloudLoad: async () => {
    const cloud = get().cloud;
    if (!cloud) throw new Error('Nicht bei der Cloud angemeldet.');
    set({ busy: 'Lade aus der Cloud…' });
    try {
      const record = await cloudDownload(cloud);
      const parsed = deserialize(record.data);
      if (get().online) get().disconnectOnline();
      get().loadFromState(parsed.state, parsed.name);
      set({ cloudSavedAt: record.meta.savedAt, busy: null });
      get().notify('success', `Cloud-Spielstand geladen: Tag ${tickToDate(parsed.state.tick).day + 1}, zuletzt gespeichert auf ${record.meta.device}.`);
      await get().catchUpFrom(record.meta.savedAt);
    } finally {
      set({ busy: null });
    }
  },

  cloudAutoUpload: async () => {
    const sim = session.sim;
    const cloud = get().cloud;
    if (!sim || !cloud || !get().settings.cloudSync || get().online) return;
    if (Date.now() - get().cloudSavedAt < 20000) return;
    try {
      const meta = await cloudUpload(cloud, serialize(sim.world, get().saveName), get().saveName);
      set({ cloudSavedAt: meta.savedAt });
    } catch (err) {
      get().notify('warning', `Cloud-Upload fehlgeschlagen: ${(err as Error).message}`);
    }
  },

  disconnectOnline: () => {
    session.online?.close();
    session.online = null;
    if (get().online) set({ online: null });
  },

  quitToMenu: async () => {
    const sim = session.sim;
    if (get().online) get().disconnectOnline();
    else if (sim && get().settings.autosave) {
      await get().cloudAutoUpload();
      try {
        await saveToSlot(sim.world, AUTOSAVE_SLOT, get().saveName);
      } catch (err) {
        console.error(err);
      }
    }
    stopLoop();
    session.sim = null;
    set({ screen: 'menu', panel: null, dialog: null, selectedBuildingId: null, interiorBuildingId: null, placementDefId: null, placementCheck: null, toasts: [] });
  },

  dispatch: (command) => {
    const sim = session.sim;
    if (!sim) return false;
    const online = session.online;
    if (online && get().online) {
      if (command.type === 'setSpeed') {
        get().notify('info', 'Online läuft die Zeit für alle gleich; Geschwindigkeit und Pause setzt der Server.');
        return false;
      }
      void online.send(command).then((result) => {
        if (!result.ok) get().notify('danger', result.error);
      });
      return true;
    }
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
    if (next !== 'dashboard' && get().interiorBuildingId !== null) get().leaveInterior();
  },

  closePanel: (keepPlacement) => {
    set({ panel: null });
    if (!keepPlacement && get().placementDefId) get().cancelPlacement();
    if (get().panel !== 'dashboard' && get().interiorBuildingId !== null) get().leaveInterior();
  },

  setMobileSheet: (sheet) => {
    set({ mobileSheet: sheet });
    if (sheet && get().panel) get().closePanel(false);
  },

  confirmPlacement: () => {
    const pending = get().placementPending;
    const defId = get().placementDefId;
    if (!pending || !defId) return;
    get().placeAt(pending.x, pending.y);
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
    set({ placementDefId: defId, placementCheck: null, placementFacing: null, placementPending: null, panel: 'build', mobileSheet: null });
    const hover = get().hoverTile;
    if (hover) get().setHover(hover);
  },

  cancelPlacement: () => {
    set({ placementDefId: null, placementCheck: null, placementFacing: null, placementPending: null });
    session.renderer?.setGhost(null, null);
  },

  rotatePlacement: (delta) => {
    if (!get().placementDefId) return;
    const current = get().placementFacing ?? get().placementCheck?.facing ?? 0;
    const next = (((current + delta) % 4) + 4) % 4 as Facing;
    set({ placementFacing: next });
    const hover = get().hoverTile;
    if (hover) get().setHover(hover);
  },

  setHover: (tile) => {
    const r = session.renderer;
    const sim = session.sim;
    set({ hoverTile: tile });
    if (!r || !sim) return;
    const defId = get().placementDefId;
    if (defId && !tile && get().placementPending) return; // keep the touch preview until confirmed or cancelled
    if (defId && tile) {
      const check = checkPlacement(sim.state, defId, tile.x, tile.y, get().placementFacing ?? undefined);
      set({ placementCheck: check });
      r.setGhost({ defId, x: tile.x, y: tile.y, facing: check.facing, tiles: check.tiles, ok: check.ok }, sim.state);
      r.setHover(null);
    } else {
      if (defId) {
        set({ placementCheck: null });
        r.setGhost(null, null);
      }
      r.setHover(tile);
    }
  },

  placeAt: (x, y) => {
    const sim = session.sim;
    const defId = get().placementDefId;
    if (!sim || !defId) return;
    const ok = get().dispatch({ type: 'placeBuilding', defId, x, y, facing: get().placementFacing ?? undefined });
    if (ok) {
      const placed = Object.values(sim.state.buildings).find((b) => b.owner === sim.state.playerId && b.x === x && b.y === y);
      get().notify('success', `${placed?.label ?? 'Gebäude'} platziert.`);
      get().cancelPlacement();
      if (placed) get().selectBuilding(placed.id);
    }
  },

  handleTileClick: (x, y, button, pointerType = 'mouse') => {
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
      if (pointerType === 'touch') {
        // Touch has no hover: first tap previews, the placement bar confirms.
        get().setHover({ x, y });
        set({ placementPending: { x, y } });
        return;
      }
      get().placeAt(x, y);
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
    set({ dashboardBuildingId: id, panel: 'dashboard', dashboardTab: 'overview' });
    get().selectBuilding(id);
    const b = session.sim?.state.buildings[id];
    if (get().settings.interiorView && b?.business && b.status === 'operational') get().enterInterior(id);
  },

  setDashboardTab: (tab) => set({ dashboardTab: tab }),

  enterInterior: (id) => {
    const sim = session.sim;
    const r = session.renderer;
    const b = sim?.state.buildings[id];
    if (!b) return;
    const returnZoom = get().interiorBuildingId === null ? (r?.zoom ?? 1) : get().interiorReturnZoom;
    set({ interiorBuildingId: id, interiorReturnZoom: returnZoom, interiorZone: null });
    r?.flyTo(b.x + (b.w - 1) / 2, b.y + (b.h - 1) / 2, 2.6, 0.55);
  },

  leaveInterior: () => {
    const id = get().interiorBuildingId;
    if (id === null) return;
    const b = session.sim?.state.buildings[id];
    set({ interiorBuildingId: null, interiorZone: null });
    if (b) session.renderer?.flyTo(b.x + (b.w - 1) / 2, b.y + (b.h - 1) / 2, Math.min(get().interiorReturnZoom, 1.6), 0.45);
  },

  showInteriorZone: (zone) => set({ interiorZone: zone ? { label: zone.label, status: zone.status, details: zone.details ?? [] } : null }),

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
    if (get().online) {
      get().notify('info', 'Online speichert der Server die Welt automatisch.');
      return;
    }
    set({ busy: 'Speichern…' });
    try {
      await createManualSave(sim.world, name.trim() || get().saveName);
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
    if (get().online) {
      get().notify('info', 'Online speichert der Server die Welt automatisch.');
      return;
    }
    try {
      await saveToSlot(sim.world, QUICK_SLOT, `Schnellspeicherung – ${formatDate(tickToDate(sim.state.tick))}`);
      get().notify('success', 'Schnellspeicherung angelegt (F5). Laden mit F9.');
    } catch (err) {
      get().notify('danger', `Speichern fehlgeschlagen: ${(err as Error).message}`);
    }
  },

  autosave: async () => {
    const sim = session.sim;
    if (!sim || !get().settings.autosave) return;
    if (get().online) return;
    try {
      await saveToSlot(sim.world, AUTOSAVE_SLOT, `Autosave – ${get().saveName}`);
    } catch (err) {
      console.error('autosave failed', err);
    }
    void get().cloudAutoUpload();
  },

  loadSlot: async (id) => {
    if (get().online) {
      get().notify('warning', 'Online kann kein lokaler Spielstand geladen werden. Zurück ins Hauptmenü, um offline zu spielen.');
      return;
    }
    set({ busy: 'Laden…' });
    try {
      const { state, name, repaired, savedAt } = await loadSave(id);
      get().loadFromState(state, name);
      if (repaired.length > 0) get().notify('warning', `Spielstand repariert: ${repaired.join(', ')}.`);
      else get().notify('info', `Spielstand „${name}“ geladen.`);
      set({ busy: null });
      await get().catchUpFrom(savedAt);
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
    downloadTextFile(file, exportToText(sim.world, get().saveName));
    get().notify('success', `Spielstand als ${file} exportiert.`);
  },

  importSave: async () => {
    const text = await pickTextFile();
    if (text === null) return;
    try {
      const { state, name, repaired, savedAt } = importFromText(text);
      get().loadFromState(state, name);
      if (repaired.length > 0) get().notify('warning', `Importiert und repariert: ${repaired.join(', ')}.`);
      else get().notify('success', `Spielstand „${name}“ importiert.`);
      await get().catchUpFrom(savedAt);
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
