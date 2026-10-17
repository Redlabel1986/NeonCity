import { useState } from 'react';
import { useGameStore, useSimState } from '../store/gameStore';
import { COUNCIL_SEATS, FACTIONS, LAWS } from '../../sim/data/factions';
import { councilSupport, lawValue } from '../../sim/systems/politics';
import { credits, percent } from '../format';
import { Meter, Row } from '../components/Inspector';
import { tickToDate } from '../../sim/core/clock';

export function PoliticsPanel() {
  const state = useSimState();
  const dispatch = useGameStore((s) => s.dispatch);
  const [initiativeDistrict, setInitiativeDistrict] = useState(0);
  if (!state) return null;
  const pol = state.politics;
  const day = tickToDate(state.tick).day;
  const progress = pol.council.progress_bloc ?? 0;
  const social = pol.council.social_alliance ?? 0;
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="panel-title">Stadtrat ({COUNCIL_SEATS} Sitze)</p>
        <div className="mt-1 flex h-3 overflow-hidden rounded-sm border border-line" role="img" aria-label={`Fortschrittsblock ${progress} Sitze, Soziale Allianz ${social} Sitze`}>
          <span style={{ width: `${(progress / COUNCIL_SEATS) * 100}%`, background: 'var(--color-cyan)' }} />
          <span style={{ width: `${(social / COUNCIL_SEATS) * 100}%`, background: 'var(--color-magenta)' }} />
        </div>
        <p className="num mt-1 text-xs text-muted">
          Fortschrittsblock {progress} · Soziale Allianz {social} · nächste Wahl Tag {pol.nextElectionDay + 1} (in {pol.nextElectionDay - day} Tagen)
        </p>
        <div className="mt-2 text-xs">
          <Meter label="Dein politischer Einfluss" value={pol.influence} color="var(--color-amber)" />
          <p className="mt-1 text-muted">Wächst mit Betrieben, Immobilien, Spenden an Parteien und guten Beziehungen zu Medien und Verwaltung. Ab 10 kannst du Anträge einbringen (2.000 ¢ Lobbyarbeit).</p>
        </div>
        <dl className="num mt-1 text-xs">
          <Row label="Steuern gezahlt" value={credits(pol.lifetimeTaxes)} />
          <Row label="Spenden gesamt" value={credits(pol.lifetimeDonations)} />
        </dl>
      </div>

      <div>
        <p className="panel-title">Gesetze</p>
        <ul className="mt-1 space-y-2">
          {Object.values(LAWS).map((law) => {
            const current = lawValue(state, law.id);
            const proposal = pol.proposals.find((p) => p.lawId === law.id);
            return (
              <li key={law.id} className="rounded-sm border border-line p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium text-white">{law.name}</span> <span className="text-muted">aktuell {law.options.find((o) => o.value === current)?.label}</span>
                    <p className="text-muted">{law.description}</p>
                  </div>
                </div>
                {proposal ? (
                  <p className="mt-1 text-amber">
                    Antrag von {proposal.by === 'player' ? 'dir' : FACTIONS[proposal.by as keyof typeof FACTIONS]?.name}: {law.options.find((o) => o.value === proposal.value)?.label}, Abstimmung Tag {proposal.voteDay + 1}, Zustimmung ≈ {percent(councilSupport(state, law.id, proposal.value) * 100)}
                  </p>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {law.options
                      .filter((o) => o.value !== current)
                      .map((o) => (
                        <button key={o.value} type="button" className="btn px-2 py-0.5" onClick={() => dispatch({ type: 'proposeLaw', lawId: law.id, value: o.value })} title={`Zustimmung ≈ ${percent(councilSupport(state, law.id, o.value) * 100)}`}>
                          → {o.label} ({percent(councilSupport(state, law.id, o.value) * 100)})
                        </button>
                      ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <p className="panel-title">Bezirksinitiative</p>
        <p className="text-xs text-muted">Ab 15 Einfluss im Bezirk (Betriebe und Immobilien dort) kannst du für 6.000 ¢ Infrastruktur, Sicherheit oder Aufwertung finanzieren.</p>
        <select className="input mt-1" value={initiativeDistrict} onChange={(e) => setInitiativeDistrict(Number(e.target.value))} aria-label="Bezirk für Initiative">
          {state.districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · Einfluss {Math.round(pol.districtInfluence[d.id] ?? 0)}
              {(pol.initiativeCooldownDay[d.id] ?? 0) > day ? ` · läuft bis Tag ${(pol.initiativeCooldownDay[d.id] ?? 0) + 1}` : ''}
            </option>
          ))}
        </select>
        <div className="mt-1 flex flex-wrap gap-1 text-xs">
          <button type="button" className="btn px-2 py-0.5" onClick={() => dispatch({ type: 'districtInitiative', districtId: initiativeDistrict, kind: 'infrastructure' })}>
            Infrastruktur (+8 Infrastruktur, +6 Energie, +4 Verkehr)
          </button>
          <button type="button" className="btn px-2 py-0.5" onClick={() => dispatch({ type: 'districtInitiative', districtId: initiativeDistrict, kind: 'safety' })}>
            Sicherheit (+10 Polizei, −8 Kriminalität)
          </button>
          <button type="button" className="btn px-2 py-0.5" onClick={() => dispatch({ type: 'districtInitiative', districtId: initiativeDistrict, kind: 'beauty' })}>
            Aufwertung (+8 Attraktivität, −6 Verschmutzung)
          </button>
        </div>
      </div>
    </div>
  );
}
