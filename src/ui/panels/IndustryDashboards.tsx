import { useState } from 'react';
import { useGameStore, useSimState } from '../store/gameStore';
import type { Building, IndustryState, ResearchLabState } from '../../sim/state';
import { BUILDING_DEFINITIONS } from '../../sim/data/buildings';
import { INGREDIENTS } from '../../sim/data/ingredients';
import { PRODUCTION } from '../../sim/data/production';
import { RESEARCH } from '../../sim/data/research';
import { factoryCapacity } from '../../sim/systems/industry';
import { labOutput } from '../../sim/systems/research';
import { stockOf, storageCapacity, totalUnits } from '../../sim/systems/inventory';
import { credits, integer, signedCredits } from '../format';
import { Kpi } from './KindDashboards';
import { Meter, Row } from '../components/Inspector';

export function LabOverview({ b, biz }: { b: Building; biz: ResearchLabState }) {
  const state = useSimState();
  const setPanel = useGameStore((s) => s.setPanel);
  if (!state) return null;
  const node = biz.activeNodeId ? RESEARCH[biz.activeNodeId] : null;
  const last = biz.history[biz.history.length - 1];
  return (
    <div className="space-y-4">
      <div className="num grid grid-cols-3 gap-2 text-center">
        <Kpi label="Punkte / Tag" value={labOutput(biz).toFixed(1)} />
        <Kpi label="Forscher / Techniker" value={`${biz.employees.filter((e) => e.role === 'researcher').length} / ${biz.employees.filter((e) => e.role === 'technician').length}`} />
        <Kpi label="Erforscht" value={String(state.research.unlocked.length)} sub={`${credits(state.research.lifetimeSpent)} investiert`} />
      </div>
      {node ? (
        <div className="text-xs">
          <Meter label={`Aktuell: ${node.name}`} value={((state.research.progress[node.id] ?? 0) / node.points) * 100} color="var(--color-acid)" />
          <p className="mt-1 text-muted">{node.effect}</p>
        </div>
      ) : (
        <p className="text-xs text-amber">Kein Forschungsziel gesetzt.</p>
      )}
      <button type="button" className="btn btn-primary" onClick={() => setPanel('research')}>
        Forschungsbaum öffnen
      </button>
      {last && (
        <dl className="num text-xs">
          <Row label="Gestern: Punkte" value={integer(last.points)} />
          <Row label="Gestern: Kosten" value={credits(last.costs)} />
        </dl>
      )}
      <p className="text-xs text-muted">{b.label}: Forscher liefern Punkte (4 + Fähigkeit/8 je Tag), Techniker steigern sie um 15 % je Person (max. 50 %).</p>
    </div>
  );
}

export function IndustryOverview({ b, biz }: { b: Building; biz: IndustryState }) {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const [newRecipe, setNewRecipe] = useState<string>('');
  if (!state) return null;
  const model = BUILDING_DEFINITIONS[b.defId]!.business!;
  if (model.kind !== 'industry') return null;
  const cap = factoryCapacity(state, b)!;
  const last = biz.history[biz.history.length - 1];
  const outputs = model.lines.map((l) => PRODUCTION[l]!.output);
  return (
    <div className="space-y-4">
      <div className="num grid grid-cols-4 gap-2 text-center">
        <Kpi label="Maschinen" value={`${integer(cap.machineUnits)} / Tag`} sub="Einheiten" />
        <Kpi label="Arbeit" value={`${cap.workerHours.toFixed(0)} h / Tag`} sub={`${biz.employees.filter((e) => e.role === 'worker').length} Arbeiter`} />
        <Kpi label="Lager" value={`${Math.round(totalUnits(biz))} / ${storageCapacity(b)}`} />
        <Kpi label="Gestern" value={last ? integer(last.produced) : '–'} sub={last ? `${signedCredits(last.revenue - last.costs)}` : undefined} />
      </div>
      <div>
        <p className="panel-title">Produktionslinien ({biz.lines.length} / {model.maxLines})</p>
        <ul className="mt-1 space-y-1 text-xs">
          {biz.lines.map((line) => {
            const recipe = PRODUCTION[line.recipeId]!;
            return (
              <li key={line.id} className="rounded-sm border border-line p-2">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <span className="text-white">{recipe.name}</span> <span className="text-muted">→ {INGREDIENTS[recipe.output]?.name}</span>
                    <span className="block text-muted">
                      Eingang je Einheit: {Object.entries(recipe.inputs).map(([i, u]) => `${u} ${INGREDIENTS[i]?.name}`).join(', ')} · Energie {recipe.energyPerUnit} ¢ · Arbeit {recipe.laborPerUnit} h
                    </span>
                  </span>
                  <button type="button" className="btn px-2 py-0.5" onClick={() => dispatch({ type: 'removeLine', buildingId: b.id, lineId: line.id })}>
                    Entfernen
                  </button>
                </div>
                <label className="mt-1 block">
                  <span className="flex justify-between text-muted">
                    <span>Ziel pro Tag</span>
                    <span className="num text-white">{line.targetPerDay}</span>
                  </span>
                  <input type="range" min={0} max={600} step={10} value={line.targetPerDay} onChange={(e) => dispatch({ type: 'setLine', buildingId: b.id, lineId: line.id, recipeId: line.recipeId, targetPerDay: Number(e.target.value) })} className="w-full accent-[#ff8a1f]" aria-label={`Ziel ${recipe.name}`} />
                </label>
              </li>
            );
          })}
        </ul>
        {biz.lines.length < model.maxLines && (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <select className="input w-auto py-0" value={newRecipe} onChange={(e) => setNewRecipe(e.target.value)} aria-label="Neue Linie">
              <option value="">Linie wählen…</option>
              {model.lines.map((id) => (
                <option key={id} value={id}>
                  {PRODUCTION[id]!.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn px-2 py-0.5" disabled={!newRecipe} onClick={() => dispatch({ type: 'setLine', buildingId: b.id, lineId: null, recipeId: newRecipe, targetPerDay: 100 })}>
              Linie hinzufügen
            </button>
          </div>
        )}
      </div>
      <div>
        <p className="panel-title">Bestände</p>
        <dl className="num mt-1 text-xs">
          {[...new Set([...Object.keys(model.startingStock), ...outputs])].map((id) => (
            <Row key={id} label={INGREDIENTS[id]?.name ?? id} value={`${stockOf(biz, id).toFixed(0)} Einheiten`} />
          ))}
        </dl>
        <label className="mt-2 flex items-center gap-2 text-xs">
          <input type="checkbox" className="accent-[#19e6ff]" checked={biz.sellSurplus} onChange={(e) => dispatch({ type: 'setSurplusPolicy', buildingId: b.id, sellSurplus: e.target.checked })} />
          Überschuss nachts an den Großmarkt verkaufen (85 % des Basispreises × Marktindex). Eigene Betriebe werden zuerst beliefert.
        </label>
        <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
          {outputs.map((id) => (
            <label key={id} className="block">
              <span className="text-muted">Reserve {INGREDIENTS[id]?.name}</span>
              <input type="number" min={0} className="input mt-0.5 px-1 py-0.5" value={biz.reserve[id] ?? 0} onChange={(e) => dispatch({ type: 'setSurplusPolicy', buildingId: b.id, sellSurplus: biz.sellSurplus, reserve: { [id]: Number(e.target.value) } })} aria-label={`Reserve ${INGREDIENTS[id]?.name}`} />
            </label>
          ))}
        </div>
      </div>
      {last && (
        <dl className="num text-xs">
          <Row label="Gestern: produziert" value={`${integer(last.produced)} Einheiten`} />
          <Row label="Gestern: Großhandelsumsatz" value={credits(last.revenue)} />
          <Row label="Gestern: intern an eigene Betriebe" value={`${integer(last.internal ?? 0)} Einheiten (zu Herstellkosten, kein Umsatz)`} />
          <Row label="Gestern: Kosten (Löhne, Energie, Einkauf, Betrieb)" value={credits(last.costs)} />
          <Row label="Verschmutzung im Bezirk" value={String(Math.round(state.districts[b.districtId]!.stats.pollution))} />
        </dl>
      )}
    </div>
  );
}
