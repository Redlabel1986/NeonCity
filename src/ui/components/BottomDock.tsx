import { useEffect, useState } from 'react';
import { useGameStore, useSimState } from '../store/gameStore';
import { TASK_DEFINITIONS } from '../../sim/systems/tasks';
import { BUILDING_DEFINITIONS } from '../../sim/data/buildings';
import { formatClock, tickToDate } from '../../sim/core/clock';
import { credits, duration } from '../format';

type Tab = 'log' | 'tasks' | 'warnings' | 'decisions';

export function BottomDock({ embedded = false }: { embedded?: boolean } = {}) {
  const state = useSimState();
  const [tab, setTab] = useState<Tab>('tasks');
  const [collapsed, setCollapsed] = useState(false);
  const requested = useGameStore((s) => s.dockTabRequest);
  const requestDockTab = useGameStore((s) => s.requestDockTab);
  useEffect(() => {
    if (!requested) return;
    setTab(requested);
    setCollapsed(false);
    requestDockTab(null);
  }, [requested, requestDockTab]);
  const placementDefId = useGameStore((s) => s.placementDefId);
  const placementCheck = useGameStore((s) => s.placementCheck);
  const cancelPlacement = useGameStore((s) => s.cancelPlacement);
  const dispatch = useGameStore((s) => s.dispatch);
  const focusBuilding = useGameStore((s) => s.focusBuilding);
  if (!state) return null;

  const warnings = collectWarnings(state);
  const openTasks = state.tasks.filter((t) => t.completedTick === null).length;
  const decisions = state.decisions.pending;
  const activeTab: Tab = tab === 'decisions' && decisions.length === 0 ? 'tasks' : tab;
  const def = placementDefId ? BUILDING_DEFINITIONS[placementDefId] : null;

  return (
    <footer className={embedded ? 'flex h-full flex-col' : 'panel pointer-events-auto shrink-0 border-x-0 border-b-0'} aria-label="Ereignisse, Aufgaben und Bauwerkzeuge">
      <div className="flex flex-wrap items-center gap-1 px-2 pt-1 text-xs">
        <TabButton active={tab === 'log'} onClick={() => setTab('log')}>
          Ereignisse
        </TabButton>
        <TabButton active={tab === 'tasks'} onClick={() => setTab('tasks')}>
          Aufgaben {openTasks > 0 && <span className="ml-1 text-cyan">{openTasks}</span>}
        </TabButton>
        <TabButton active={tab === 'warnings'} onClick={() => setTab('warnings')}>
          Warnungen {warnings.length > 0 && <span className="ml-1 text-amber">{warnings.length}</span>}
        </TabButton>
        {decisions.length > 0 && (
          <TabButton active={activeTab === 'decisions'} onClick={() => setTab('decisions')}>
            Entscheidungen <span className="pulse ml-1 text-magenta">{decisions.length}</span>
          </TabButton>
        )}
        <div className="ml-4 flex items-center gap-2">
          {def ? (
            <>
              <span className="text-text">
                Platzierung: <strong>{def.name}</strong>
              </span>
              <span className={placementCheck?.ok ? 'text-acid' : placementCheck ? 'text-blood' : 'text-muted'}>
                {placementCheck?.quote
                  ? `${credits(placementCheck.quote.total)} · ${duration(placementCheck.quote.buildTime)}`
                  : 'Bewege die Maus über ein freies Grundstück an einer Straße.'}
              </span>
              <button type="button" className="btn px-2 py-0.5" onClick={cancelPlacement}>
                Abbrechen (Esc)
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn px-2 py-0.5"
              disabled={state.undoStack.length === 0}
              onClick={() => dispatch({ type: 'undoPlacement' })}
              title="Letzte Baustelle rückgängig machen (Strg+Z)"
            >
              Rückgängig
            </button>
          )}
        </div>
        {!embedded && (
          <button type="button" className="btn btn-ghost ml-auto px-2 py-0.5" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
            {collapsed ? 'Aufklappen' : 'Einklappen'}
          </button>
        )}
      </div>
      {(embedded || !collapsed) && (
        <div className={`scroll px-3 py-2 text-sm ${embedded ? 'min-h-0 flex-1' : 'h-32'}`}>
          {activeTab === 'log' && (
            <ul className="space-y-0.5">
              {state.log.length === 0 && <li className="text-muted">Noch keine Ereignisse. Die Stadt wartet auf deinen ersten Zug.</li>}
              {[...state.log].reverse().map((entry) => (
                <li key={entry.id} data-level={entry.level} className="log-entry flex gap-3">
                  <span className="num shrink-0 text-muted">
                    T{tickToDate(entry.tick).day + 1} {formatClock(tickToDate(entry.tick))}
                  </span>
                  {entry.buildingId !== undefined && state.buildings[entry.buildingId] ? (
                    <button type="button" className="text-left hover:underline" onClick={() => focusBuilding(entry.buildingId!)}>
                      {entry.message}
                    </button>
                  ) : (
                    <span>{entry.message}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {activeTab === 'tasks' && (
            <ul className="grid gap-x-6 gap-y-1 md:grid-cols-2">
              {TASK_DEFINITIONS.map((t) => {
                const done = state.tasks.find((s) => s.id === t.id)?.completedTick !== null;
                return (
                  <li key={t.id} className={`flex gap-2 ${done ? 'text-muted line-through' : ''}`}>
                    <span aria-hidden className={done ? 'text-acid' : 'text-cyan'}>
                      {done ? '✓' : '○'}
                    </span>
                    <span>
                      <span className={done ? '' : 'text-white'}>{t.title}</span>
                      {!done && <span className="block text-xs text-muted no-underline">{t.hint}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {activeTab === 'decisions' && (
            <ul className="space-y-2">
              {decisions.map((d) => (
                <li key={d.id} className="rounded-sm border border-magenta/40 bg-magenta/5 p-2">
                  <p className="font-medium text-white">{d.title}</p>
                  <p className="text-xs text-text/90">{d.text}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {d.options.map((o) => (
                      <button key={o.id} type="button" className="btn px-2 py-0.5 text-xs" title={o.hint} onClick={() => dispatch({ type: 'resolveDecision', decisionId: d.id, optionId: o.id })}>
                        {o.label}
                      </button>
                    ))}
                    <span className="self-center text-xs text-muted">bis Tag {d.expiresDay + 1}, sonst gilt die letzte Option</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {activeTab === 'warnings' && (
            <ul className="space-y-1">
              {warnings.length === 0 && <li className="text-muted">Keine Warnungen. Alles läuft.</li>}
              {warnings.map((w, i) => (
                <li key={i} className="flex gap-2 text-amber">
                  <span aria-hidden>▲</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </footer>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`btn btn-ghost px-2 py-0.5 ${active ? 'border-b-cyan text-white' : ''}`} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

function collectWarnings(state: NonNullable<ReturnType<typeof useSimState>>): string[] {
  const out: string[] = [];
  const dailyFixed = state.player.apartmentRent + Object.values(state.buildings).reduce((sum, b) => {
    if (b.owner !== state.playerId || b.status !== 'operational') return sum;
    const def = BUILDING_DEFINITIONS[b.defId];
    const wages = b.business ? b.business.employees.reduce((w, e) => w + e.wage, 0) : 0;
    return sum + (def?.upkeepPerDay ?? 0) + wages;
  }, 0);
  if (state.ledger.balance < 0) out.push(`Konto überzogen (${credits(state.ledger.balance)}). Seit ${state.ledger.daysInDebt} Tag(en) in den roten Zahlen.`);
  else if (state.ledger.balance < dailyFixed * 3) out.push(`Reserven reichen für weniger als drei Tage Fixkosten (${credits(dailyFixed)} pro Tag).`);
  for (const b of Object.values(state.buildings)) {
    if (b.owner !== state.playerId || !b.business || b.status !== 'operational') continue;
    const last = b.business.history[b.business.history.length - 1];
    if (last && last.revenue - last.costs < 0) out.push(`${b.label} hat gestern Verlust gemacht (${credits(last.revenue - last.costs)}).`);
    if (b.business.reputation < 25) out.push(`${b.label}: Der Ruf ist schlecht. Senke Preise, bessere Zutaten (Lieferant), Küchenausbau oder Hygiene helfen.`);
  }
  return out;
}
