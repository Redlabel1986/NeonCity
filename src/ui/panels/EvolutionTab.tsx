import { useState } from 'react';
import { useGameStore, useSimState } from '../store/gameStore';
import type { Building } from '../../sim/state';
import { stageOf, treeOf, type EvolutionTree, type Feature, type Stage } from '../../sim/data/evolution';
import { RECIPES } from '../../sim/data/recipes';
import { UPGRADES } from '../../sim/data/upgrades';
import { ROLE_LABELS } from '../../sim/systems/staff';
import { checkEvolution, franchiseFee, maxFranchises, MAX_STARS } from '../../sim/systems/evolution';
import { credits, duration, percent } from '../format';

export const FEATURE_LABELS: Record<Feature, string> = {
  delivery: 'Lieferdienst',
  reservations: 'Reservierungen',
  critics: 'Restaurantkritiker und Sterne',
  franchise: 'Franchise-Verträge',
  automation: 'Automatisierung',
  nightlife: 'Nachtgeschäft',
  vip: 'VIP-Gäste',
  wellness: 'Wellness',
  casino: 'Spielbank',
  conference: 'Konferenzen',
  driverless: 'Fahrerlose Fahrzeuge',
  air: 'Flugtaxis',
  armored: 'Gesicherte Transporte',
  dispatch: 'Zentrale Disposition',
  group: 'Unternehmensgruppe',
};

const COL = 172;
const ROW = 64;
const NODE_W = 150;
const NODE_H = 46;

/** Places each stage on a column (its level) and a row: the first successor keeps the row, siblings get new rows. */
function layoutTree(tree: EvolutionTree): Map<string, { col: number; row: number }> {
  const pos = new Map<string, { col: number; row: number }>();
  let nextRow = 0;
  const visit = (id: string, row: number): void => {
    if (pos.has(id)) return;
    const stage = tree.stages[id]!;
    pos.set(id, { col: stage.level - 1, row });
    stage.next.forEach((n, i) => {
      if (pos.has(n)) return;
      if (i === 0) visit(n, row);
      else {
        nextRow += 1;
        visit(n, nextRow);
      }
    });
  };
  visit(tree.initialStageId, 0);
  for (const id of Object.keys(tree.stages)) if (!pos.has(id)) visit(id, ++nextRow);
  return pos;
}

export function EvolutionTab({ b }: { b: Building }) {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const tree = treeOf(b.defId);
  const current = stageOf(b);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!state || !tree || !current) return <p className="text-sm text-muted">Dieser Betrieb hat keinen Entwicklungsbaum.</p>;
  const pos = layoutTree(tree);
  const rows = Math.max(...[...pos.values()].map((p) => p.row)) + 1;
  const visited = new Set<string>([tree.initialStageId, ...(b.stageHistory ?? []), current.id]);
  const selected = tree.stages[selectedId ?? ''] ?? (current.next[0] ? tree.stages[current.next[0]] : current) ?? current;
  const running = b.stageUpgrade;
  const check = selected.id !== current.id ? checkEvolution(state, b, selected.id) : null;
  const stars = b.stars ?? 0;

  const nodeClass = (s: Stage): { fill: string; stroke: string; text: string } => {
    if (s.id === current.id) return { fill: 'rgba(255,43,214,0.18)', stroke: '#ff2bd6', text: '#fff' };
    if (running?.toStageId === s.id) return { fill: 'rgba(255,176,32,0.18)', stroke: '#ffb020', text: '#fff' };
    if (visited.has(s.id)) return { fill: 'rgba(140,255,58,0.08)', stroke: 'rgba(140,255,58,0.5)', text: '#9aa' };
    if (current.next.includes(s.id)) return { fill: 'rgba(25,230,255,0.12)', stroke: '#19e6ff', text: '#fff' };
    return { fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.18)', text: '#777' };
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <p>
          <span className="text-muted">Aktuelle Stufe:</span> <span className="text-white">{current.name}</span> <span className="text-muted">(Stufe {current.level}{current.specialization ? `, ${current.specialization}` : ''})</span>
        </p>
        {current.features.includes('critics') && (
          <p className="text-amber" data-testid="stars">
            {'★'.repeat(stars)}
            {'☆'.repeat(MAX_STARS - stars)} {stars === 0 ? 'noch kein Stern' : `${stars} Stern${stars > 1 ? 'e' : ''}`}
          </p>
        )}
      </div>
      {running && (
        <div className="rounded-sm border border-amber/50 bg-amber/10 p-2 text-xs">
          Ausbau zu <span className="text-white">{tree.stages[running.toStageId]?.name}</span> läuft, noch {duration(Math.max(0, running.readyTick - state.tick))}. Kapazität −20 % solange.
          <button type="button" className="btn ml-2 px-2 py-0.5" onClick={() => dispatch({ type: 'cancelEvolution', buildingId: b.id })}>
            Abbrechen (70 % zurück)
          </button>
        </div>
      )}
      <div className="scroll overflow-x-auto rounded-sm border border-line bg-black/20" data-testid="evolution-tree">
        <svg width={6 * COL + 20} height={rows * ROW + 20} role="group" aria-label="Entwicklungsbaum">
          {Object.values(tree.stages).map((s) =>
            s.next.map((n) => {
              const a = pos.get(s.id)!;
              const c = pos.get(n)!;
              const x1 = 10 + a.col * COL + NODE_W;
              const y1 = 10 + a.row * ROW + NODE_H / 2;
              const x2 = 10 + c.col * COL;
              const y2 = 10 + c.row * ROW + NODE_H / 2;
              const active = visited.has(s.id) && (visited.has(n) || current.next.includes(n));
              return <path key={`${s.id}-${n}`} d={`M${x1},${y1} C${x1 + 30},${y1} ${x2 - 30},${y2} ${x2},${y2}`} fill="none" stroke={active ? 'rgba(25,230,255,0.6)' : 'rgba(255,255,255,0.14)'} strokeWidth={1.5} />;
            }),
          )}
          {Object.values(tree.stages).map((s) => {
            const p = pos.get(s.id)!;
            const x = 10 + p.col * COL;
            const y = 10 + p.row * ROW;
            const c = nodeClass(s);
            return (
              <g key={s.id} transform={`translate(${x},${y})`} className="cursor-pointer" onClick={() => setSelectedId(s.id)} role="button" aria-label={`${s.name}, Stufe ${s.level}`} aria-pressed={selected.id === s.id}>
                <rect width={NODE_W} height={NODE_H} rx={4} fill={c.fill} stroke={selected.id === s.id ? '#fff' : c.stroke} strokeWidth={selected.id === s.id ? 2 : 1.2} />
                <text x={8} y={18} fill={c.text} fontSize={11} fontWeight={600}>
                  {s.name.length > 24 ? `${s.name.slice(0, 23)}…` : s.name}
                </text>
                <text x={8} y={34} fill="#8a8aa0" fontSize={10}>
                  Stufe {s.level}
                  {s.specialization ? ` · ${s.specialization}` : ''}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <StageDetails stage={selected} current={current.id === selected.id} check={check} b={b} />
      {current.features.includes('franchise') && (
        <div className="rounded-sm border border-line p-3 text-xs">
          <p className="panel-title">Franchise</p>
          <p className="mt-1 text-muted">
            {b.franchises ?? 0} von {maxFranchises(b)} Verträgen · {credits(franchiseFee(b))} Lizenzgebühr je Vertrag und Tag. Franchisenehmer brauchen eine Marke mit Ruf 60; fällt der Ruf unter 55, schaden sie ihm.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn" onClick={() => dispatch({ type: 'grantFranchise', buildingId: b.id })} disabled={(b.franchises ?? 0) >= maxFranchises(b)}>
              Vertrag vergeben
            </button>
            <button type="button" className="btn" onClick={() => dispatch({ type: 'revokeFranchise', buildingId: b.id })} disabled={!b.franchises}>
              Vertrag beenden
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StageDetails({ stage, current, check, b }: { stage: Stage; current: boolean; check: ReturnType<typeof checkEvolution> | null; b: Building }) {
  const dispatch = useGameStore((s) => s.dispatch);
  const fx = stage.effects;
  const unlocks = stage.unlocks;
  return (
    <div className="rounded-sm border border-line p-3 text-xs" data-testid="stage-details">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium text-white">{stage.name}</h4>
        <span className="text-muted">Stufe {stage.level}{stage.specialization ? ` · ${stage.specialization}` : ''}</span>
      </div>
      <p className="mt-1 text-text/80">{stage.description}</p>
      <dl className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
        <dt className="text-muted">Kapazität</dt>
        <dd className="text-right">×{fx.capacity.toFixed(2)}</dd>
        <dt className="text-muted">Durchsatz</dt>
        <dd className="text-right">×{fx.throughput.toFixed(2)}</dd>
        <dt className="text-muted">Anziehung</dt>
        <dd className="text-right">×{fx.draw.toFixed(2)}</dd>
        <dt className="text-muted">Qualität</dt>
        <dd className="text-right">+{fx.quality}</dd>
        <dt className="text-muted">Preisniveau</dt>
        <dd className="text-right">{percent(fx.price * 100)}</dd>
        <dt className="text-muted">Betriebskosten</dt>
        <dd className="text-right">×{fx.upkeep.toFixed(1)}</dd>
        <dt className="text-muted">Lohnerwartung</dt>
        <dd className="text-right">×{fx.wage.toFixed(2)}</dd>
        {fx.hours && (
          <>
            <dt className="text-muted">Öffnungszeiten</dt>
            <dd className="text-right">
              {fx.hours.open}–{fx.hours.close} Uhr
            </dd>
          </>
        )}
        {fx.extraPerStay > 0 && (
          <>
            <dt className="text-muted">Zusatzumsatz je Nacht</dt>
            <dd className="text-right">{credits(fx.extraPerStay)}</dd>
          </>
        )}
      </dl>
      {stage.features.length > 0 && <p className="mt-2">Mechaniken: {stage.features.map((f) => FEATURE_LABELS[f]).join(', ')}</p>}
      {(unlocks.recipes?.length || unlocks.roles?.length || unlocks.upgrades?.length) ? (
        <p className="mt-1 text-muted">
          Schaltet frei:{' '}
          {[...(unlocks.recipes ?? []).map((r) => RECIPES[r]?.name ?? r), ...(unlocks.roles ?? []).map((r) => `Rolle ${ROLE_LABELS[r]}`), ...(unlocks.upgrades ?? []).map((u) => `Raum ${UPGRADES[u]?.name ?? u}`)].join(', ')}
        </p>
      ) : null}
      <p className="mt-1 text-acid">+ {stage.pros}</p>
      <p className="text-amber">− {stage.cons}</p>
      {!current && check && (
        <div className="mt-2 border-t border-line pt-2">
          <p className="num">
            Kosten {credits(check.cost)} · Dauer {check.minutes === 0 ? 'sofort' : duration(check.minutes)}
          </p>
          {check.unmet.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-blood" data-testid="stage-unmet">
              {check.unmet.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-primary mt-2" disabled={!check.ok} onClick={() => dispatch({ type: 'startEvolution', buildingId: b.id, stageId: stage.id })}>
            Ausbau starten
          </button>
        </div>
      )}
      {current && <p className="mt-2 text-muted">Das ist die aktuelle Stufe.</p>}
    </div>
  );
}
