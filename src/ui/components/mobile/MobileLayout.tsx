import { useEffect, type ReactNode } from 'react';
import { useGameStore, useSimState } from '../../store/gameStore';
import { session } from '../../session';
import { RAIL_ENTRIES } from '../../navigation';
import { usePanelView } from '../../panels/PanelHost';
import { Inspector } from '../Inspector';
import { BottomDock } from '../BottomDock';
import { InteriorCanvas } from '../InteriorCanvas';
import { credits, signedCredits } from '../../format';
import { formatClock, tickToDate } from '../../../sim/core/clock';
import { SPEEDS, type Speed } from '../../../sim/engine';
import { BUILDING_DEFINITIONS } from '../../../sim/data/buildings';
import { PLACEMENT_ERROR_TEXT } from '../../../sim/systems/construction';
import { FACING_LABELS } from '../../../sim/state';
import { CRISES } from '../../../sim/data/crises';
import type { Panel } from '../../store/gameStore';

const NAV: { id: Panel; label: string; icon: string }[] = [
  { id: 'city', label: 'Stadt', icon: '◫' },
  { id: 'build', label: 'Bauen', icon: '⌂' },
  { id: 'business', label: 'Betriebe', icon: '▦' },
  { id: 'finance', label: 'Finanzen', icon: '¢' },
];

const MORE_ENTRIES = RAIL_ENTRIES.filter((e) => !NAV.some((n) => n.id === e.id));

/** Phone layout: compact top bar, map, sheets for panels and a bottom navigation. */
export function MobileLayout() {
  const panel = useGameStore((s) => s.panel);
  const closePanel = useGameStore((s) => s.closePanel);
  const selectedBuildingId = useGameStore((s) => s.selectedBuildingId);
  const selectedTile = useGameStore((s) => s.selectedTile);
  const selectBuilding = useGameStore((s) => s.selectBuilding);
  const mobileSheet = useGameStore((s) => s.mobileSheet);
  const setMobileSheet = useGameStore((s) => s.setMobileSheet);
  const placementDefId = useGameStore((s) => s.placementDefId);
  const interiorBuildingId = useGameStore((s) => s.interiorBuildingId);
  const view = usePanelView();

  // Starting a placement from the build sheet: hide the sheet so the map is free for tapping.
  useEffect(() => {
    if (placementDefId && panel === 'build') closePanel(true);
  }, [placementDefId, panel, closePanel]);

  const inspector = !panel && !mobileSheet && (selectedBuildingId !== null || selectedTile !== null);
  const sheetHeight = panel === 'dashboard' || inspector ? 'half' : 'full';

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col" data-testid="mobile-layout">
      <MobileTopBar />
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-x-0 top-0" style={{ height: view || inspector ? '44%' : '100%' }}>
          {interiorBuildingId !== null && <InteriorCanvas key={interiorBuildingId} buildingId={interiorBuildingId} />}
        </div>
        {placementDefId && <PlacementBar />}
      </div>
      {view && (
        <MobileSheet title={view.title} height={sheetHeight} onClose={() => closePanel(false)} label={view.title}>
          {view.content}
        </MobileSheet>
      )}
      {!view && inspector && (
        <MobileSheet height="half" onClose={() => selectBuilding(null)} raw hideClose label="Auswahl">
          <Inspector />
        </MobileSheet>
      )}
      {!view && !inspector && mobileSheet === 'more' && (
        <MobileSheet title="Mehr" height="full" onClose={() => setMobileSheet(null)} label="Mehr">
          <MoreSheet />
        </MobileSheet>
      )}
      {!view && !inspector && mobileSheet === 'dock' && (
        <MobileSheet title="Ereignisse und Aufgaben" height="full" onClose={() => setMobileSheet(null)} label="Ereignisse und Aufgaben" raw>
          <BottomDock embedded />
        </MobileSheet>
      )}
      <MobileNav />
    </div>
  );
}

function MobileTopBar() {
  const state = useSimState();
  const setSpeed = useGameStore((s) => s.setSpeed);
  const online = useGameStore((s) => s.online);
  if (!state) return null;
  const date = tickToDate(state.tick);
  const net = state.ledger.todayIncome - state.ledger.todayExpenses;
  const next: Speed = SPEEDS[(SPEEDS.indexOf(state.speed as Speed) + 1) % SPEEDS.length]!;
  const speedLabel = state.speed === 0 ? '⏸' : `${state.speed}×`;
  return (
    <header className="panel pointer-events-auto flex h-12 shrink-0 items-center gap-3 border-x-0 border-t-0 px-3 text-sm" role="banner" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="num min-w-0 flex-1">
        <div className={`truncate font-semibold ${state.ledger.balance < 0 ? 'text-blood' : 'text-white'}`}>{credits(state.ledger.balance)}</div>
        <div className={`truncate text-[0.7rem] ${net > 0 ? 'text-acid' : net < 0 ? 'text-blood' : 'text-muted'}`}>{signedCredits(net)} heute</div>
      </div>
      <div className="num text-right text-xs leading-tight">
        <div className="text-white">{formatClock(date)}</div>
        <div className="text-muted">Tag {date.day + 1}</div>
      </div>
      {state.crisis.active && (
        <span className="rounded-sm border border-blood/60 bg-blood/15 px-1.5 py-0.5 text-[0.65rem] text-blood" title={CRISES[state.crisis.active.id]?.name}>
          Krise
        </span>
      )}
      {state.player.wantedLevel >= 2 && (
        <span className={`rounded-sm border px-1.5 py-0.5 text-[0.65rem] ${state.player.wantedLevel >= 4 ? 'border-blood/60 text-blood' : 'border-amber/60 text-amber'}`} title="Fahndungsstufe">
          Fahndung {state.player.wantedLevel}
        </span>
      )}
      {online ? (
        <span className={`rounded-sm border px-2 py-1 text-xs ${online.connected ? 'border-cyan/60 text-cyan' : 'border-blood/60 text-blood'}`} data-testid="online-badge">
          {online.connected ? `Online ${state.speed}×` : 'getrennt'}
        </span>
      ) : (
        <button type="button" className="btn min-w-12 px-3 py-1" onClick={() => setSpeed(next)} aria-label={`Geschwindigkeit ${speedLabel}, tippen für ${next === 0 ? 'Pause' : `${next}-fach`}`}>
          {speedLabel}
        </button>
      )}
    </header>
  );
}

function MobileNav() {
  const panel = useGameStore((s) => s.panel);
  const setPanel = useGameStore((s) => s.setPanel);
  const mobileSheet = useGameStore((s) => s.mobileSheet);
  const setMobileSheet = useGameStore((s) => s.setMobileSheet);
  const state = useSimState();
  const decisions = state?.decisions.pending.length ?? 0;
  const open = (id: Panel): void => {
    setMobileSheet(null);
    setPanel(id);
  };
  return (
    <nav className="mobile-nav panel pointer-events-auto flex shrink-0 items-stretch border-x-0 border-b-0" aria-label="Hauptnavigation">
      {NAV.map((n) => (
        <button key={n.id} type="button" className="mobile-tab" aria-pressed={panel === n.id} onClick={() => open(n.id)}>
          <span aria-hidden className="text-lg leading-none">
            {n.icon}
          </span>
          <span>{n.label}</span>
        </button>
      ))}
      <button type="button" className="mobile-tab" aria-pressed={mobileSheet === 'more'} onClick={() => (mobileSheet === 'more' ? setMobileSheet(null) : setMobileSheet('more'))}>
        <span aria-hidden className="text-lg leading-none">
          ≡
        </span>
        <span>
          Mehr
          {decisions > 0 && <span className="pulse ml-1 text-magenta">{decisions}</span>}
        </span>
      </button>
    </nav>
  );
}

function MobileSheet({ title, height, onClose, children, raw, label, hideClose }: { title?: string; height: 'half' | 'full'; onClose: () => void; children: ReactNode; raw?: boolean; label: string; hideClose?: boolean }) {
  return (
    <section className={`sheet-in panel pointer-events-auto absolute inset-x-0 z-20 flex flex-col border-x-0 ${height === 'half' ? 'top-[44%]' : 'top-12'}`} style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom))' }} aria-label={label} data-testid="mobile-sheet">
      {!raw && (
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <h2 className="text-sm font-medium text-white">{title}</h2>
          <button type="button" className="btn btn-ghost px-3 py-1" aria-label="Schließen" onClick={onClose}>
            ×
          </button>
        </div>
      )}
      {raw && !hideClose && (
        <button type="button" className="btn btn-ghost absolute right-2 top-2 z-10 px-3 py-1" aria-label="Schließen" onClick={onClose}>
          ×
        </button>
      )}
      <div className={`scroll min-h-0 flex-1 ${raw ? '' : 'p-4'}`}>{children}</div>
    </section>
  );
}

function MoreSheet() {
  const setPanel = useGameStore((s) => s.setPanel);
  const setMobileSheet = useGameStore((s) => s.setMobileSheet);
  const setDialog = useGameStore((s) => s.setDialog);
  const quitToMenu = useGameStore((s) => s.quitToMenu);
  const state = useSimState();
  const openPanel = (id: Panel): void => {
    setMobileSheet(null);
    setPanel(id);
  };
  const warnings = state ? state.decisions.pending.length : 0;
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-2">
        {MORE_ENTRIES.map((e) => (
          <button key={e.id} type="button" className="btn justify-start py-3" onClick={() => openPanel(e.id)}>
            {e.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn justify-start py-3" onClick={() => setMobileSheet('dock')}>
          Ereignisse & Aufgaben
          {warnings > 0 && <span className="pulse ml-2 text-magenta">{warnings}</span>}
        </button>
        <button type="button" className="btn justify-start py-3" onClick={() => setDialog('saves')}>
          Spielstände
        </button>
        <button type="button" className="btn justify-start py-3" onClick={() => setDialog('settings')}>
          Einstellungen
        </button>
        <button type="button" className="btn justify-start py-3" onClick={() => setDialog('help')}>
          Hilfe
        </button>
      </div>
      <button type="button" className="btn w-full py-3" onClick={() => void quitToMenu()}>
        Hauptmenü
      </button>
    </div>
  );
}

/** Two-step touch placement: tap a tile to preview, then confirm. */
function PlacementBar() {
  const placementDefId = useGameStore((s) => s.placementDefId);
  const placementCheck = useGameStore((s) => s.placementCheck);
  const placementPending = useGameStore((s) => s.placementPending);
  const placementFacing = useGameStore((s) => s.placementFacing);
  const rotatePlacement = useGameStore((s) => s.rotatePlacement);
  const confirmPlacement = useGameStore((s) => s.confirmPlacement);
  const cancelPlacement = useGameStore((s) => s.cancelPlacement);
  const def = placementDefId ? BUILDING_DEFINITIONS[placementDefId] : null;
  if (!def) return null;
  const facing = placementFacing ?? placementCheck?.facing ?? 0;
  const status = !placementPending
    ? 'Tippe auf ein freies Grundstück an einer Straße.'
    : placementCheck?.ok && placementCheck.quote
      ? `${credits(placementCheck.quote.total)} · Eingang ${FACING_LABELS[facing]}`
      : PLACEMENT_ERROR_TEXT[placementCheck?.error ?? 'tile_occupied'];
  return (
    <div className="panel pointer-events-auto absolute inset-x-2 bottom-2 z-20 p-3 text-sm" data-testid="placement-bar">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-white">{def.name}</span>
        <div className="flex gap-1">
          <button type="button" className="btn px-3 py-1" onClick={() => rotatePlacement(-1)} aria-label="Gebäude nach links drehen">
            ⟲
          </button>
          <button type="button" className="btn px-3 py-1" onClick={() => rotatePlacement(1)} aria-label="Gebäude nach rechts drehen">
            ⟳
          </button>
        </div>
      </div>
      <p className={`num mt-1 text-xs ${placementCheck?.ok ? 'text-acid' : placementPending ? 'text-amber' : 'text-muted'}`}>{status}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" className="btn btn-primary flex-1" disabled={!placementPending || !placementCheck?.ok} onClick={confirmPlacement}>
          Hier bauen
        </button>
        <button type="button" className="btn" onClick={cancelPlacement}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

export function focusSelected(): void {
  const sim = session.sim;
  const id = useGameStore.getState().selectedBuildingId;
  const b = id !== null ? sim?.state.buildings[id] : undefined;
  if (b) session.renderer?.focusTile(b.x, b.y, Math.max(session.renderer.zoom, 1.4));
}
