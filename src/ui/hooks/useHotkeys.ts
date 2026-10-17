import { useEffect } from 'react';
import { useGameStore, quickLoad, type KeyBindings, type Panel } from '../store/gameStore';
import { session } from '../session';

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

const PANEL_BINDINGS: Partial<Record<keyof KeyBindings, Panel>> = {
  build: 'build',
  business: 'business',
  finance: 'finance',
  city: 'city',
  stats: 'stats',
  staff: 'staff',
  realestate: 'realestate',
  underworld: 'underworld',
  factions: 'factions',
  politics: 'politics',
  research: 'research',
  casino: 'casino',
};

/** Global keyboard shortcuts for the game screen, using the configurable bindings. */
export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const store = useGameStore.getState();
      if (e.key === 'F5') {
        e.preventDefault();
        void store.quickSave();
        return;
      }
      if (e.key === 'F9') {
        e.preventDefault();
        if (!store.online) void quickLoad();
        return;
      }
      if (e.key === 'Escape') {
        if (store.placementDefId) store.cancelPlacement();
        else if (store.dialog) store.setDialog(null);
        else if (store.interiorBuildingId !== null) store.setPanel('dashboard');
        else if (store.panel) store.setPanel(store.panel);
        else store.selectBuilding(null);
        return;
      }
      if (isTyping(e) || store.dialog === 'settings') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        store.dispatch({ type: 'undoPlacement' });
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const bindings = store.settings.keybindings;
      if (store.placementDefId && (key === 'q' || key === 'e')) {
        store.rotatePlacement(key === 'e' ? 1 : -1);
        return;
      }
      if (key === '0') {
        store.setSpeed(0);
        return;
      }
      if (key === 'home') {
        const sim = session.sim;
        if (sim) {
          const d = sim.state.districts[sim.state.player.homeDistrictId]!;
          session.renderer?.focusTile(d.cx, d.cy, 1);
        }
        return;
      }
      if (key === bindings.pause) {
        e.preventDefault();
        store.togglePause();
        return;
      }
      if (key === bindings.speed1) return store.setSpeed(1);
      if (key === bindings.speed2) return store.setSpeed(3);
      if (key === bindings.speed3) return store.setSpeed(8);
      if (key === bindings.help) return store.setDialog(store.dialog === 'help' ? null : 'help');
      for (const [id, panel] of Object.entries(PANEL_BINDINGS) as [keyof KeyBindings, Panel][]) {
        if (key === bindings[id]) {
          store.setPanel(panel);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
