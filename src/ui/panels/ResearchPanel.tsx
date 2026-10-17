import { useState } from 'react';
import { useGameStore, useSimState } from '../store/gameStore';
import { RESEARCH, RESEARCH_TREES, type ResearchTree } from '../../sim/data/research';
import { canResearch, labOutput } from '../../sim/systems/research';
import { credits, integer } from '../format';
import { Meter } from '../components/Inspector';
import { DIFFICULTIES } from '../../sim/data/difficulty';

export function ResearchPanel() {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const setPanel = useGameStore((s) => s.setPanel);
  const [tree, setTree] = useState<ResearchTree | 'all'>('all');
  const [chosenLab, setChosenLab] = useState<number | null>(null);
  if (!state) return null;
  const labs = Object.values(state.buildings).filter((b) => b.owner === state.playerId && b.business?.kind === 'lab' && b.status === 'operational');
  const labId = labs.some((b) => b.id === chosenLab) ? chosenLab : (labs[0]?.id ?? null);
  const costFactor = DIFFICULTIES[state.player.difficulty].costMultiplier;
  const nodes = Object.values(RESEARCH).filter((n) => tree === 'all' || n.tree === tree);
  return (
    <div className="space-y-3 text-sm">
      {labs.length === 0 ? (
        <div className="rounded-sm border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
          Forschung braucht ein Forschungslabor mit Forschern.{' '}
          <button type="button" className="underline" onClick={() => setPanel('build')}>
            Zum Baumenü
          </button>
        </div>
      ) : (
        <ul className="text-xs">
          {labs.length > 1 && (
            <li className="mb-1">
              <label className="flex items-center gap-2">
                <span className="text-muted">Forschen mit</span>
                <select className="input w-auto py-0" value={labId ?? ''} onChange={(e) => setChosenLab(Number(e.target.value))} aria-label="Labor auswählen">
                  {labs.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          )}
          {labs.map((b) => {
            const biz = b.business!;
            if (biz.kind !== 'lab') return null;
            const node = biz.activeNodeId ? RESEARCH[biz.activeNodeId] : null;
            return (
              <li key={b.id} className="rounded-sm border border-line p-2">
                <span className="text-white">{b.label}</span> <span className="num text-muted">· {labOutput(biz).toFixed(1)} Punkte/Tag · {biz.employees.filter((e) => e.role === 'researcher').length} Forscher</span>
                {node ? (
                  <Meter label={`Forscht: ${node.name}`} value={((state.research.progress[node.id] ?? 0) / node.points) * 100} color="var(--color-acid)" />
                ) : (
                  <span className="block text-amber">Kein Forschungsziel. Wähle unten eine Technologie.</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-1 text-xs">
        <button type="button" className={`btn px-2 py-0.5 ${tree === 'all' ? 'border-cyan text-white' : ''}`} onClick={() => setTree('all')}>
          Alle
        </button>
        {(Object.keys(RESEARCH_TREES) as ResearchTree[]).map((t) => (
          <button key={t} type="button" className={`btn px-2 py-0.5 ${tree === t ? 'border-cyan text-white' : ''}`} onClick={() => setTree(t)}>
            {RESEARCH_TREES[t]}
          </button>
        ))}
      </div>
      <ul className="space-y-1">
        {nodes.map((n) => {
          const done = state.research.unlocked.includes(n.id);
          const check = canResearch(state, n.id);
          const progress = state.research.progress[n.id] ?? 0;
          const inProgress = labs.some((b) => b.business?.kind === 'lab' && b.business.activeNodeId === n.id);
          return (
            <li key={n.id} className={`rounded-sm border p-2 text-xs ${done ? 'border-acid/40' : 'border-line'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-medium text-white">{n.name}</span> <span className="text-muted">{RESEARCH_TREES[n.tree]}</span>
                  <p className="text-muted">{n.description}</p>
                  <p className="text-acid">{n.effect}</p>
                  <p className="num text-muted">
                    {credits(Math.round(n.cost * costFactor))} · {integer(n.points)} Punkte{n.requires.length > 0 && ` · braucht ${n.requires.map((r) => RESEARCH[r]?.name).join(', ')}`}
                  </p>
                  {progress > 0 && !done && <Meter label="Fortschritt" value={(progress / n.points) * 100} color="var(--color-acid)" />}
                </div>
                {done ? (
                  <span className="shrink-0 text-acid">erforscht</span>
                ) : inProgress ? (
                  <span className="shrink-0 text-amber">läuft</span>
                ) : (
                  <button type="button" className="btn btn-primary shrink-0 px-2 py-0.5" disabled={!check.ok || labId === null} title={check.ok ? '' : check.error} onClick={() => labId !== null && dispatch({ type: 'startResearch', buildingId: labId, nodeId: n.id })}>
                    Erforschen
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
