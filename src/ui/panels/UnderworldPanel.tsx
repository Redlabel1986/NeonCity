import { useState } from 'react';
import { useGameStore, useSimState } from '../store/gameStore';
import { CREW_ROLE_LABELS, OPERATIONS, WANTED_LEVELS } from '../../sim/data/underworld';
import { FOUNDING_COST, MAX_CREW, successChance, wantedLevel } from '../../sim/systems/underworld';
import { BACKGROUNDS } from '../../sim/data/difficulty';
import { isResidential } from '../../sim/systems/property';
import { credits, duration, integer, percent } from '../format';
import { Meter, Row } from '../components/Inspector';
import { tickToDate } from '../../sim/core/clock';

type Tab = 'overview' | 'crew' | 'operations' | 'territory' | 'rivals';

export function UnderworldPanel() {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const [name, setName] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  if (!state) return null;
  const uw = state.underworld;
  const level = wantedLevel(state);
  const wanted = WANTED_LEVELS[level]!;
  if (!uw.org) {
    return (
      <div className="text-sm">
        <p className="text-muted">
          Du hast keine kriminelle Organisation. Eine Gründung kostet {credits(Math.round(FOUNDING_COST * (BACKGROUNDS[state.player.background].perks?.foundingCost ?? 1)))}. Danach wirbst du Leute an, baust Gebietskontrolle auf, startest Operationen
          und wäschst Schwarzgeld über deine legalen Betriebe. Jede Aktion erhöht die Aufmerksamkeit der Polizei.
        </p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            dispatch({ type: 'foundOrganisation', name });
          }}
        >
          <input className="input" placeholder="Name der Organisation" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} aria-label="Name der Organisation" />
          <button type="submit" className="btn btn-primary">
            Gründen
          </button>
        </form>
        <div className="mt-4">
          <p className="panel-title">Familien der Stadt</p>
          <ul className="mt-1 text-xs">
            {uw.rivals.map((f, i) => (
              <li key={i} className="flex justify-between border-t border-line/40 py-1">
                <span className="text-white">{f.name}</span>
                <span className="num text-muted">
                  Stärke {Math.round(f.strength)} · Gebiete {Object.entries(f.control).filter(([, c]) => c > 0).map(([d]) => state.districts[Number(d)]?.name).join(', ') || '–'}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-4 text-xs text-muted">Fahndungsstatus: {wanted.name}. {wanted.description}</p>
      </div>
    );
  }
  const org = uw.org;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Übersicht' },
    { id: 'crew', label: `Leute (${org.members.length})` },
    { id: 'operations', label: `Operationen (${org.operations.length})` },
    { id: 'territory', label: 'Territorium' },
    { id: 'rivals', label: 'Rivalen' },
  ];
  return (
    <div className="text-sm">
      <div className="mb-3 flex flex-wrap gap-1 border-b border-line pb-2" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`btn btn-ghost px-2 py-1 ${tab === t.id ? 'border-b-cyan text-white' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'crew' && <CrewTab />}
      {tab === 'operations' && <OperationsTab />}
      {tab === 'territory' && <TerritoryTab />}
      {tab === 'rivals' && <RivalsTab />}
    </div>
  );
}

function Overview() {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const [bribeAmount, setBribeAmount] = useState(2000);
  const org = state?.underworld.org;
  if (!state || !org) return null;
  const uw = state.underworld;
  const level = wantedLevel(state);
  const wanted = WANTED_LEVELS[level]!;
  const day = tickToDate(state.tick).day;
  const jailed = org.members.filter((m) => m.jailed).length;
  const legalRevenue = Object.values(state.buildings).reduce((s, b) => s + (b.owner === 'player' && b.business ? (b.business.history[b.business.history.length - 1]?.revenue ?? 0) : 0), 0);
  return (
    <div className="space-y-4">
      <div className="num grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-sm border border-line px-2 py-1.5">
          <span className="block text-muted">Schwarzgeld</span>
          <span className="block font-medium text-amber">{credits(state.ledger.dirtyBalance)}</span>
        </div>
        <div className="rounded-sm border border-line px-2 py-1.5">
          <span className="block text-muted">Gewaschen gesamt</span>
          <span className="block font-medium text-white">{credits(org.lifetimeLaundered)}</span>
        </div>
        <div className="rounded-sm border border-line px-2 py-1.5">
          <span className="block text-muted">Leute (im Knast)</span>
          <span className="block font-medium text-white">
            {org.members.length} ({jailed})
          </span>
        </div>
      </div>
      <div>
        <Meter label={`Polizeiaufmerksamkeit · ${wanted.name}`} value={uw.heat} color={level >= 4 ? 'var(--color-blood)' : level >= 2 ? 'var(--color-amber)' : 'var(--color-cyan)'} />
        <p className="mt-1 text-xs text-muted">{wanted.description}</p>
        {uw.lockdownUntilDay > day && <p className="text-xs text-blood">Stadtweite Operation bis Tag {uw.lockdownUntilDay + 1}.</p>}
      </div>
      <label className="block text-xs">
        <span className="flex justify-between">
          <span className="text-muted">Geldwäsche: Anteil der legalen Umsätze</span>
          <span className="num text-white">{Math.round(org.launderingRate * 100)} %</span>
        </span>
        <input type="range" min={0} max={0.4} step={0.01} value={org.launderingRate} onChange={(e) => dispatch({ type: 'setLaunderingRate', rate: Number(e.target.value) })} className="w-full accent-[#ffb020]" aria-label="Geldwäscheanteil" />
        <span className="block text-muted">
          Kapazität ≈ {credits(legalRevenue * org.launderingRate * (level >= 3 ? 0.5 : 1) * (level >= 5 ? 0 : 1))} pro Tag (20 % Gebühr). Höherer Anteil erhöht die Aufmerksamkeit.
        </span>
      </label>
      <div>
        <p className="panel-title">Bestechung</p>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <input type="number" min={500} step={500} className="input w-28" value={bribeAmount} onChange={(e) => setBribeAmount(Number(e.target.value))} aria-label="Bestechungssumme" />
          <button type="button" className="btn" onClick={() => dispatch({ type: 'bribe', amount: bribeAmount })}>
            Zahlen (legale Credits)
          </button>
          <span className="text-muted">Senkt die Aufmerksamkeit, mit abnehmender Wirkung.</span>
        </div>
      </div>
      <dl className="text-xs">
        <Row label="Schwarzgeld heute" value={credits(org.todayDirtyIncome)} />
        <Row label="Tägliche Anteile der Leute" value={credits(org.members.filter((m) => !m.jailed).reduce((s, m) => s + m.cut, 0))} />
        <Row label="Gegründet" value={`Tag ${tickToDate(org.foundedTick).day + 1}`} />
      </dl>
    </div>
  );
}

function CrewTab() {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const org = state?.underworld.org;
  if (!state || !org) return null;
  return (
    <div className="space-y-4">
      <div>
        <p className="panel-title">
          Mitglieder ({org.members.length} / {MAX_CREW})
        </p>
        <ul className="mt-1 space-y-1">
          {org.members.map((m) => (
            <li key={m.id} className="rounded-sm border border-line p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-medium text-white">{m.name}</span> <span className="text-muted">{CREW_ROLE_LABELS[m.role]}</span>
                  {m.jailed && <span className="ml-2 text-blood">im Knast ({duration(Math.max(0, m.busyUntilTick - state.tick))})</span>}
                  {!m.jailed && m.busyUntilTick > state.tick && <span className="ml-2 text-amber">im Einsatz</span>}
                </span>
                <button type="button" className="btn px-2 py-0.5" onClick={() => dispatch({ type: 'dismissCrew', memberId: m.id })}>
                  Entlassen
                </button>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-3">
                <Meter label="Fähigkeit" value={m.skill} color="var(--color-cyan)" />
                <Meter label="Loyalität" value={m.loyalty} color={m.loyalty < 30 ? 'var(--color-blood)' : 'var(--color-acid)'} />
                <Meter label="Ambition" value={m.ambition} color="var(--color-magenta)" />
              </div>
              <p className="num mt-1 text-muted">Anteil {credits(m.cut)}/Tag</p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="panel-title">Kandidaten</p>
        <ul className="mt-1 space-y-1">
          {org.candidates.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-sm border border-line p-2 text-xs">
              <span>
                <span className="font-medium text-white">{c.name}</span> <span className="text-muted">{CREW_ROLE_LABELS[c.role]}</span>
                <span className="num block text-muted">
                  Fähigkeit {c.skill} · will {credits(c.cut)}/Tag
                </span>
              </span>
              <button type="button" className="btn btn-primary px-2 py-0.5" onClick={() => dispatch({ type: 'recruitCrew', candidateId: c.id })}>
                Anwerben
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function OperationsTab() {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const [districtId, setDistrictId] = useState(0);
  const [frontId, setFrontId] = useState<number | ''>('');
  const org = state?.underworld.org;
  if (!state || !org) return null;
  const fronts = Object.values(state.buildings).filter((b) => b.owner === 'player' && b.property && !isResidential(b) && b.districtId === districtId);
  return (
    <div className="space-y-4">
      {org.operations.length > 0 && (
        <div>
          <p className="panel-title">Laufend</p>
          <ul className="mt-1 space-y-1 text-xs">
            {org.operations.map((op) => {
              const def = OPERATIONS[op.operationId]!;
              return (
                <li key={op.id} className="flex items-center justify-between gap-2 rounded-sm border border-line p-2">
                  <span>
                    <span className="text-white">{def.name}</span> in {state.districts[op.districtId]!.name}
                    <span className="num block text-muted">
                      {def.kind === 'standing' ? 'täglich' : `noch ${duration(Math.max(0, op.endsTick - state.tick))}`} · Erfolgschance {percent(successChance(state, op) * 100)} · {op.memberIds.length} Leute
                    </span>
                  </span>
                  <button type="button" className="btn px-2 py-0.5" onClick={() => dispatch({ type: 'cancelOperation', operationId: op.id })}>
                    Abbrechen
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div>
        <p className="panel-title">Neue Operation</p>
        <label className="mt-1 block text-xs">
          <span className="text-muted">Bezirk</span>
          <select className="input mt-0.5" value={districtId} onChange={(e) => setDistrictId(Number(e.target.value))} aria-label="Bezirk">
            {state.districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · Kontrolle {Math.round(org.control[d.id] ?? 0)} % · Polizei {Math.round(d.stats.policePresence)} %
              </option>
            ))}
          </select>
        </label>
        {fronts.length > 0 && (
          <label className="mt-1 block text-xs">
            <span className="text-muted">Fassade für Casino (eigene Gewerbeimmobilie)</span>
            <select className="input mt-0.5" value={frontId} onChange={(e) => setFrontId(e.target.value === '' ? '' : Number(e.target.value))} aria-label="Fassade">
              <option value="">–</option>
              {fronts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <ul className="mt-2 space-y-1">
          {Object.values(OPERATIONS).map((def) => (
            <li key={def.id} className="rounded-sm border border-line p-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-medium text-white">{def.name}</span> <span className="text-muted">{def.kind === 'standing' ? 'laufend' : `${def.hours} h`}</span>
                  <p className="text-muted">{def.description}</p>
                  <p className="num text-muted">
                    Crew: {Object.entries(def.crew).map(([r, n]) => `${n} × ${r === 'any' ? 'beliebig' : CREW_ROLE_LABELS[r as keyof typeof CREW_ROLE_LABELS]}`).join(', ')} · Ertrag ≈ {def.payout > 0 ? credits(def.payout) : def.id === 'protection' ? 'Schutzgeld' : '–'} · Risiko {percent(def.risk * 100)} · Aufmerksamkeit +{def.heat}
                    {def.minControl > 0 && ` · ab ${def.minControl} % Kontrolle`}
                  </p>
                </div>
                <button type="button" className="btn btn-primary shrink-0 px-2 py-0.5" onClick={() => dispatch({ type: 'startOperation', operationId: def.id, districtId, frontBuildingId: frontId === '' ? undefined : frontId })}>
                  Starten
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TerritoryTab() {
  const state = useSimState();
  const org = state?.underworld.org;
  if (!state || !org) return null;
  return (
    <div className="text-xs">
      <p className="text-muted">Kontrolle verfällt ohne Präsenz um 1,2 Punkte pro Tag. Schutzgeld braucht 30 %, Schwarzmarkt 40 %.</p>
      <ul className="mt-2 space-y-1">
        {state.districts.map((d) => {
          const ours = org.control[d.id] ?? 0;
          const rivals = state.underworld.rivals.filter((f) => (f.control[d.id] ?? 0) > 0);
          return (
            <li key={d.id} className="rounded-sm border border-line p-2">
              <div className="flex justify-between">
                <span className="text-white">{d.name}</span>
                <span className="num text-muted">
                  Kriminalität {Math.round(d.stats.crime)} · Polizei {Math.round(d.stats.policePresence)} · Korruption {Math.round(d.stats.corruption)}
                </span>
              </div>
              <Meter label="Deine Kontrolle" value={ours} color="var(--color-magenta)" />
              {rivals.map((f) => (
                <Meter key={f.name} label={f.name} value={f.control[d.id] ?? 0} color="var(--color-blood)" />
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RivalsTab() {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const [tribute, setTribute] = useState(2000);
  if (!state) return null;
  const day = tickToDate(state.tick).day;
  return (
    <div className="space-y-2 text-xs">
      <p className="text-muted">Familien kämpfen um Bezirke, in denen ihr beide Kontrolle habt. Tribut in Schwarzgeld kauft Waffenstillstand.</p>
      <div className="flex items-center gap-2">
        <input type="number" min={1000} step={500} className="input w-28" value={tribute} onChange={(e) => setTribute(Number(e.target.value))} aria-label="Tribut" />
        <span className="text-muted">Tribut (Schwarzgeld) · 3 Tage Frieden je 1.000 ¢</span>
      </div>
      {state.underworld.rivals.map((f, i) => (
        <div key={i} className="rounded-sm border border-line p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-white">{f.name}</span>
            <button type="button" className="btn px-2 py-0.5" onClick={() => dispatch({ type: 'negotiateTruce', familyIndex: i, tribute })}>
              Tribut zahlen
            </button>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-3">
            <Meter label="Stärke" value={f.strength} color="var(--color-blood)" />
            <Meter label="Beziehung" value={f.relation + 100} color={f.relation < 0 ? 'var(--color-amber)' : 'var(--color-acid)'} />
          </div>
          <p className="num mt-1 text-muted">
            {f.truceUntilDay > day ? `Waffenstillstand bis Tag ${f.truceUntilDay + 1}` : 'Kein Waffenstillstand'} · Gebiete:{' '}
            {Object.entries(f.control)
              .filter(([, c]) => c > 0)
              .map(([d, c]) => `${state.districts[Number(d)]?.name} ${integer(c)} %`)
              .join(', ') || '–'}
          </p>
        </div>
      ))}
    </div>
  );
}
